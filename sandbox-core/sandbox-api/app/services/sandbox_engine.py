"""
SandboxEngine — the turn-advance state machine.

Called by POST /api/sandbox/games/{id}/advance-turn (host only).

Turn phases (in order):
  0. MACRO_EVENTS   — game-level events: recession, disaster, policy, etc.
  1. RENT_COLLECT   — distribute rent to token holders; create real ledger entries
  2. RANDOM_EVENTS  — seeded per-property RNG: vacancy, lease renewal, capex, drift
  3. MARKET_MOVE    — apply price drift; optionally re-fetch rwa-issuer-sim AVM
  4. DEBT_SERVICE   — collect mortgage payments; trigger forced sale on default
  5. DISTRIBUTE     — credit usdc_balance for each player with yield this turn
  6. TRADE_WINDOW   — set game.status = "trading"; check for game-end

MACRO EVENT CATALOGUE
─────────────────────
Macro events fire at the game level — they affect ALL properties (or a scoped subset)
for their duration_turns. They are rolled once per turn using a game-seeded RNG.

  RECESSION           price_delta=-5%/turn, rent_delta=-8%/turn, vacancy+15%  (2-4 turns)
  HOUSING_BOOM        price_delta=+6%/turn, rent_delta=+5%/turn               (2-3 turns)
  NATURAL_DISASTER    price_delta=-20% instant, vacancy+40%, rent=0           (1 turn shock)
  POLICY_CHANGE       rent_delta=±10%, price_delta=±5% (direction random)     (3 turns)
  TAX_HIKE            monthly_expense_per_token = $50-150                     (permanent)
  INTEREST_RATE_RISE  rate_adjustment=+1.5%, ARM and new mortgages affected   (3-6 turns)
  INTEREST_RATE_CUT   rate_adjustment=-1.0%, ARM rates drop, refi encouraged  (3-6 turns)
  RENT_CONTROL        rent_delta capped at 0% for duration (no increases)     (4 turns)
  INSURANCE_CRISIS    monthly_expense_per_token = $100-300                    (2-3 turns)

Only one macro event fires per turn (the highest-impact one that rolled). Probabilities are
intentionally low to make macro events rare and impactful rather than routine noise.

DEBT SERVICE
────────────
Phase 4 collects monthly_payment from each player's usdc_balance for every active mortgage.
ARM rates are adjusted based on the macro rate_adjustment active this turn.
Amortizing mortgages reduce current_balance each turn (principal paydown).
If usdc_balance < monthly_payment: turns_in_arrears++.
  Grace period = 1 turn (configurable via game.debt_service_default_penalty).
  After grace: forced sale at current_price × (1 - game.debt_service_default_penalty).
  Forced sale proceeds repay mortgage; remainder (or shortfall) applied to player balance.

RNG DESIGN
──────────
Per-property events: seeded on sha256(game_id:turn:property_id) — deterministic per position.
Macro events: seeded on sha256(game_id:turn:"macro") — one roll per turn, independent of
property order. Both are reproducible for debugging.
"""

import hashlib
import math
import random
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.models.sandbox import (
    SandboxFedDecision,
    SandboxGame,
    SandboxGameProperty,
    SandboxHolding,
    SandboxMacroEvent,
    SandboxMortgage,
    SandboxPlayer,
    SandboxTransaction,
    SandboxTurnEvent,
)


# ─── Grade tables ────────────────────────────────────────────────────────────

GRADE_ORDER = ["A", "B", "C", "D", "F"]

# Per-grade multipliers applied on top of property_type base weights
_GRADE_PROFILE: dict[str, dict] = {
    "A": {
        "appreciation_prob_add": +0.13,   # base + 0.13
        "rent_mult":              1.30,
        "capex_prob":             0.02,
        "vacancy_prob":           0.03,
        "depreciation_range":     (0.005, 0.015),
        "appreciation_range":     (0.025, 0.060),
    },
    "B": {
        "appreciation_prob_add": +0.06,
        "rent_mult":              1.10,
        "capex_prob":             0.04,
        "vacancy_prob":           0.05,
        "depreciation_range":     (0.008, 0.025),
        "appreciation_range":     (0.020, 0.050),
    },
    "C": {
        "appreciation_prob_add":  0.00,   # baseline — unchanged from type weights
        "rent_mult":              1.00,
        "capex_prob":             0.06,
        "vacancy_prob":           0.08,
        "depreciation_range":     (0.010, 0.040),
        "appreciation_range":     (0.020, 0.050),
    },
    "D": {
        "appreciation_prob_add": -0.12,
        "rent_mult":              0.80,
        "capex_prob":             0.10,
        "vacancy_prob":           0.14,
        "depreciation_range":     (0.015, 0.055),
        "appreciation_range":     (0.015, 0.035),
    },
    "F": {
        "appreciation_prob_add": -0.27,
        "rent_mult":              0.60,
        "capex_prob":             0.16,
        "vacancy_prob":           0.22,
        "depreciation_range":     (0.020, 0.080),
        "appreciation_range":     (0.010, 0.025),
    },
}

def _grade_profile(grade: str) -> dict:
    return _GRADE_PROFILE.get(grade or "C", _GRADE_PROFILE["C"])

def _cap_rate_to_grade(cap_rate: float | None) -> str:
    """Seed a property grade from its cap rate at game creation."""
    if cap_rate is None:
        return "C"
    if cap_rate < 0.050:
        return "A"
    if cap_rate < 0.070:
        return "B"
    if cap_rate < 0.085:
        return "C"
    if cap_rate < 0.100:
        return "D"
    return "F"


# ─── Per-property event weights ──────────────────────────────────────────────

_WEIGHTS: dict[str, dict[str, float]] = {
    "residential": {
        "vacancy": 0.08,
        "lease_renewal": 0.15,
        "capex": 0.05,
        "appreciation": 0.72,
    },
    "commercial": {
        "vacancy": 0.05,
        "lease_renewal": 0.10,
        "capex": 0.08,
        "appreciation": 0.77,
    },
}
_DEFAULT_WEIGHTS = _WEIGHTS["residential"]

_APPRECIATION_RANGE = (0.02, 0.05)
_DEPRECIATION_RANGE = (0.01, 0.04)
_LEASE_RENEWAL_RANGE = (0.02, 0.08)
_CAPEX_FLAT_RANGE = (500.0, 3000.0)

# ─── Macro event catalogue ───────────────────────────────────────────────────
# Each entry: (macro_type, probability_per_turn, duration_range, effects_dict, templates)
# effects_dict keys match SandboxMacroEvent columns.

_FED_HIKE_STATEMENTS = [
    "Fed raises rates {bps}bps — borrowing costs increase across the board.",
    "FOMC hikes {bps}bps: 'Inflation remains a concern.' Mortgage rates rise.",
    "Federal Reserve raises the funds rate by {bps}bps. Markets reprice debt.",
    "Surprise hike: Fed lifts rates {bps}bps amid strong employment data.",
    "FOMC meeting: +{bps}bps. Chair cites persistent core inflation pressures.",
]

_FED_CUT_STATEMENTS = [
    "Fed cuts rates {bps}bps — mortgage costs ease, refi window opens.",
    "FOMC cuts {bps}bps: 'Supporting growth amid softening conditions.'",
    "Federal Reserve delivers {bps}bps cut. Borrowing costs fall.",
    "Dovish pivot: Fed reduces rates {bps}bps. ARM holders benefit immediately.",
    "FOMC meeting: -{bps}bps. Chair signals further cuts if data warrants.",
]

_FED_HOLD_STATEMENTS = [
    "Fed holds rates steady — 'wait and see' stance continues.",
    "FOMC holds: no change to the funds rate this meeting.",
    "Federal Reserve pauses — markets had expected a move. Rates unchanged.",
    "Hold decision: Fed 'monitoring incoming data' before next move.",
    "FOMC meeting: rates unchanged. Chair: 'We remain data-dependent.'",
]

_FED_WARNING_STATEMENTS = [
    "Fed meeting next turn — analysts divided on hike vs hold.",
    "FOMC meeting scheduled: markets pricing in {hike_prob:.0%} chance of hike.",
    "Fed decision next turn. Watch mortgage rates.",
    "Central bank meeting imminent — rate move possible.",
    "Upcoming Fed meeting: economists forecast {cut_prob:.0%} probability of cut.",
]

_MACRO_CATALOGUE = [
    {
        "macro_type": "RECESSION",
        "prob": 0.06,
        "duration": (2, 4),
        "scope": "all",
        "effects": {"price_delta_pct": -0.05, "rent_delta_pct": -0.08, "vacancy_probability_add": 0.15},
        "headlines": [
            "Economic recession: property values contracting across all markets.",
            "Recession hits — vacancies rising, rents under pressure.",
            "Macro downturn: expect falling AVM and reduced rental income.",
        ],
    },
    {
        "macro_type": "HOUSING_BOOM",
        "prob": 0.05,
        "duration": (2, 3),
        "scope": "all",
        "effects": {"price_delta_pct": 0.06, "rent_delta_pct": 0.05},
        "headlines": [
            "Housing boom: demand surging, prices accelerating.",
            "Bull market in real estate — rents and values climbing fast.",
        ],
    },
    {
        "macro_type": "NATURAL_DISASTER",
        "prob": 0.03,
        "duration": (1, 1),
        "scope": "type",         # targets one property_type randomly
        "effects": {"price_delta_pct": -0.20, "rent_delta_pct": -1.0, "vacancy_probability_add": 0.40},
        "headlines": [
            "Severe storm damages {type} properties — values drop sharply.",
            "Natural disaster strikes: {type} sector takes a major hit.",
            "Flooding/fire event: {type} properties vacant and repriced.",
        ],
    },
    {
        "macro_type": "POLICY_CHANGE",
        "prob": 0.08,
        "duration": (3, 3),
        "scope": "all",
        "effects": {},            # direction randomised at roll time
        "headlines": [
            "New zoning regulations passed — mixed signals for landlords.",
            "Government housing policy shift: rents and valuations adjusting.",
            "Regulatory change: expect turbulence in rental markets.",
        ],
    },
    {
        "macro_type": "TAX_HIKE",
        "prob": 0.07,
        "duration": (99, 99),     # permanent for game duration
        "scope": "all",
        "effects": {},             # monthly_expense randomised at roll time
        "headlines": [
            "City council raises property taxes — monthly holding costs increase.",
            "Property tax hike passed: all landlords face higher expenses.",
            "Tax assessment increases reduce net yield across the board.",
        ],
    },
    {
        "macro_type": "INTEREST_RATE_RISE",
        "prob": 0.07,
        "duration": (3, 6),
        "scope": "all",
        "effects": {"rate_adjustment": 0.015},
        "headlines": [
            "Central bank raises rates — ARM mortgages and new loans cost more.",
            "Rate hike announced: borrowing costs rise across all debt instruments.",
        ],
    },
    {
        "macro_type": "INTEREST_RATE_CUT",
        "prob": 0.06,
        "duration": (3, 6),
        "scope": "all",
        "effects": {"rate_adjustment": -0.010},
        "headlines": [
            "Central bank cuts rates — refinancing activity picks up.",
            "Rate cut: ARMs adjust down, refi window opens.",
        ],
    },
    {
        "macro_type": "RENT_CONTROL",
        "prob": 0.05,
        "duration": (4, 4),
        "scope": "type",
        "effects": {"rent_delta_pct": 0.0},   # no delta but blocks increases
        "headlines": [
            "Rent control ordinance passed for {type} properties — no rent increases for 4 turns.",
            "City freezes rents on {type} units: lease renewals capped at 0%.",
        ],
    },
    {
        "macro_type": "INSURANCE_CRISIS",
        "prob": 0.05,
        "duration": (2, 3),
        "scope": "all",
        "effects": {},             # monthly_expense randomised at roll time
        "headlines": [
            "Insurance market crisis: premiums spiking for all property types.",
            "Carriers pulling out of market — insurance costs surge.",
        ],
    },
    # ── New events ────────────────────────────────────────────────────────────
    {
        "macro_type": "GENTRIFICATION",
        "prob": 0.04,
        "duration": (3, 3),
        "scope": "type",
        "effects": {"price_delta_pct": 0.10, "rent_delta_pct": 0.15},
        "headlines": [
            "Gentrification wave hits {type} neighbourhood — values and rents surging.",
            "Rapid redevelopment pushing {type} prices up across the board.",
        ],
    },
    {
        "macro_type": "ZONING_CHANGE",
        "prob": 0.05,
        "duration": (2, 2),
        "scope": "type",
        "effects": {"rent_delta_pct": -0.10, "price_delta_pct": -0.05},
        "headlines": [
            "Zoning reclassification hits {type} properties — rents and values under pressure.",
            "New zoning ordinance restricts {type} use: rents fall, buyers retreat.",
        ],
    },
    {
        "macro_type": "PROPERTY_BUBBLE",
        "prob": 0.03,
        "duration": (2, 2),
        "scope": "all",
        "effects": {"price_delta_pct": 0.08},
        "headlines": [
            "Property bubble inflating — prices surging but fundamentals look stretched.",
            "Speculative frenzy drives prices up across all markets. Caution advised.",
        ],
    },
    {
        "macro_type": "BUBBLE_BURST",
        "prob": 0.02,
        "duration": (2, 3),
        "scope": "all",
        "effects": {"price_delta_pct": -0.12, "vacancy_probability_add": 0.20},
        "headlines": [
            "Bubble burst — property values in freefall, vacancy spiking.",
            "Market correction hits hard: prices plunging across all sectors.",
        ],
    },
    {
        "macro_type": "TENANT_STRIKE",
        "prob": 0.04,
        "duration": (1, 2),
        "scope": "type",
        "effects": {"rent_delta_pct": -1.0},  # -100% = no rent collected
        "headlines": [
            "Tenant strike hits {type} properties — no rent collected this turn.",
            "Organised tenant action: {type} landlords receive zero rent.",
        ],
    },
    {
        "macro_type": "EMINENT_DOMAIN",
        "prob": 0.02,
        "duration": (1, 1),
        "scope": "all",
        "effects": {},             # handled specially in _create_macro_event
        "headlines": [
            "Eminent domain seizure — one property acquired by government at 110% market value.",
            "Government exercises eminent domain: forced buyout at premium, mortgage cleared.",
        ],
    },
]


# ─── Public entry point ───────────────────────────────────────────────────────

def advance_turn(db: Session, game: SandboxGame) -> SandboxGame:
    """
    Advance the game by one turn. Mutates game.current_turn and game.status.
    Returns the updated SandboxGame.
    Raises ValueError if game is not in a valid state for advancing.
    """
    if game.status not in ("lobby", "trading"):
        raise ValueError(
            f"Cannot advance turn: game {game.id} is in status={game.status!r}. "
            f"Must be 'lobby' (turn 0) or 'trading'."
        )

    game.status = "advancing"
    game.updated_at = datetime.utcnow()
    if game.current_turn == 0:
        game.started_at = datetime.utcnow()
    db.commit()

    try:
        turn = game.current_turn + 1

        _emit_event(db, game.id, turn, "TURN_START",
                    description=f"Turn {turn} of {game.max_turns} begins.")

        # Phase -1 — Fed meeting (scheduled, predictable interval)
        _phase_fed_meeting(db, game, turn)

        # Phase 0 — Macro events
        active_macros = _phase_macro_events(db, game, turn)

        # Phase 1 — Rent collection (respects macro vacancy boost + rent_control)
        phase1_totals = _phase_rent_collect(db, game, turn, active_macros)

        # Phase 2 — Per-property random events (modified by active macros)
        drift_map = _phase_random_events(db, game, turn, active_macros)

        # Phase 3 — Market move
        _phase_market_move(db, game, turn, drift_map, active_macros)

        # Phase 4 — Debt service (ARM adjustments, payments, defaults)
        _phase_debt_service(db, game, turn, active_macros)

        # Phase 5 — Distribute yield
        _phase_distribute(db, game, turn, phase1_totals)

        # Phase 6 — Trade window / game end
        _phase_trade_window(db, game, turn)

        game.current_turn = turn
        game.updated_at = datetime.utcnow()
        db.commit()

        try:
            from app.core.ws_manager import broadcast_sync
            broadcast_sync("sandbox.turn_advanced", {
                "game_id": game.id,
                "turn": turn,
                "status": game.status,
            })
        except Exception as e:
            logger.warning(f"SandboxEngine WS broadcast failed (non-fatal): {e}")

        logger.info(f"SandboxEngine: game={game.id} turn={turn} complete, status={game.status}")
        return game

    except Exception as exc:
        game.status = "trading"
        game.updated_at = datetime.utcnow()
        db.commit()
        logger.error(f"SandboxEngine: game={game.id} turn advance failed: {exc}", exc_info=True)
        raise


# ─── Phase -1 — FED MEETING ──────────────────────────────────────────────────

def _phase_fed_meeting(db: Session, game: SandboxGame, turn: int) -> None:
    """
    Scheduled Federal Reserve rate decisions.

    Schedule: Fed meetings occur every game.fed_meeting_interval turns.
    Meetings are at turns: interval, 2×interval, 3×interval, ...
    e.g. with interval=6: turns 6, 12, 18, 24 ...

    Warning: the turn BEFORE each meeting, emit a "Fed meeting next turn" event
    so players can react (refi, pay down HELOC, etc.) before the rate changes.

    On meeting turn:
      Roll RNG seeded on (game_id, turn, "fed"):
        P(hike) = game.fed_hike_prob
        P(cut)  = game.fed_cut_prob
        P(hold) = 1 - hike - cut
      Magnitude: uniform(fed_move_magnitude_min, fed_move_magnitude_max)
      rounded to nearest 25bps.

    Effects:
      1. game.fed_rate_current updated immediately
      2. game.base_mortgage_rate = fed_rate_current + fed_mortgage_spread
         → all NEW mortgage originations use this rate
      3. All active ARM mortgages in this game have current_rate adjusted
         by the same delta (clamped to ±arm_cap from origination_rate)
      4. SandboxFedDecision row created
      5. FOMC_DECISION turn event emitted (macro_event_id = None, type = "FOMC_DECISION")
    """
    interval = game.fed_meeting_interval
    if interval <= 0:
        return  # Fed meetings disabled for this game

    # Warning turn: one turn before a meeting
    if (turn + 1) % interval == 0:
        rng_warn = _make_rng(game.id, turn, "fed_warning")
        stmt = rng_warn.choice(_FED_WARNING_STATEMENTS)
        stmt = stmt.format(
            hike_prob=game.fed_hike_prob,
            cut_prob=game.fed_cut_prob,
        )
        _emit_event(
            db, game.id, turn, "FED_WARNING",
            description=f"[FOMC PREVIEW — Turn {turn + 1}] {stmt}",
        )
        db.commit()
        return  # nothing else happens on warning turns

    # Meeting turn
    if turn % interval != 0:
        return

    rng = _make_rng(game.id, turn, "fed")
    roll = rng.random()

    rate_before = game.fed_rate_current
    mortgage_rate_before = game.base_mortgage_rate

    if roll < game.fed_hike_prob:
        outcome = "hike"
        raw_magnitude = rng.uniform(game.fed_move_magnitude_min, game.fed_move_magnitude_max)
        # Round to nearest 25bps
        magnitude = round(round(raw_magnitude / 0.0025) * 0.0025, 4)
        delta = +magnitude
        bps = int(round(magnitude * 10000))
        stmt = rng.choice(_FED_HIKE_STATEMENTS).format(bps=bps)

    elif roll < game.fed_hike_prob + game.fed_cut_prob:
        outcome = "cut"
        raw_magnitude = rng.uniform(game.fed_move_magnitude_min, game.fed_move_magnitude_max)
        magnitude = round(round(raw_magnitude / 0.0025) * 0.0025, 4)
        delta = -magnitude
        bps = int(round(magnitude * 10000))
        stmt = rng.choice(_FED_CUT_STATEMENTS).format(bps=bps)

    else:
        outcome = "hold"
        delta = 0.0
        bps = 0
        stmt = rng.choice(_FED_HOLD_STATEMENTS)

    # Update game-level rates
    rate_after = max(0.0, round(rate_before + delta, 5))
    game.fed_rate_current = rate_after
    # Recompute base_mortgage_rate from Fed rate + spread
    game.base_mortgage_rate = round(rate_after + game.fed_mortgage_spread, 5)
    mortgage_rate_after = game.base_mortgage_rate
    game.updated_at = datetime.utcnow()

    # Adjust all active ARM mortgages in this game
    arm_mortgages = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game.id,
            SandboxMortgage.rate_type == "arm",
            SandboxMortgage.status == "active",
        )
        .all()
    )
    arm_count = 0
    for mtg in arm_mortgages:
        if delta == 0.0:
            continue
        old_rate = mtg.current_rate
        new_rate = mtg.current_rate + delta
        # Clamp to origination_rate ± arm_cap
        new_rate = max(
            mtg.origination_rate - game.arm_cap,
            min(mtg.origination_rate + game.arm_cap, new_rate),
        )
        new_rate = max(0.001, round(new_rate, 5))
        mtg.current_rate = new_rate
        mtg.updated_at = datetime.utcnow()
        arm_count += 1

    # Record decision
    decision = SandboxFedDecision(
        id=str(uuid.uuid4()),
        game_id=game.id,
        turn=turn,
        outcome=outcome,
        rate_before=rate_before,
        rate_after=rate_after,
        mortgage_rate_before=mortgage_rate_before,
        mortgage_rate_after=mortgage_rate_after,
        move_bps=bps if outcome == "hike" else (-bps if outcome == "cut" else 0),
        statement=stmt,
    )
    db.add(decision)

    # Emit event
    arm_note = f" | {arm_count} ARM(s) adjusted." if arm_count > 0 else ""
    rate_note = (
        f" Fed funds: {rate_before*100:.2f}% → {rate_after*100:.2f}%."
        f" New mortgage rate: {mortgage_rate_before*100:.2f}% → {mortgage_rate_after*100:.2f}%."
    )
    _emit_event(
        db, game.id, turn, "FOMC_DECISION",
        description=f"[FOMC DECISION — {outcome.upper()}] {stmt}{rate_note}{arm_note}",
        delta_pct=delta,
    )

    db.commit()
    logger.info(
        f"SandboxEngine: Fed {outcome} {bps}bps in game {game.id} turn {turn} "
        f"({rate_before*100:.2f}%→{rate_after*100:.2f}%), {arm_count} ARMs adjusted"
    )


# ─── Phase 0 — MACRO EVENTS ──────────────────────────────────────────────────

def _phase_macro_events(
    db: Session,
    game: SandboxGame,
    turn: int,
) -> list[SandboxMacroEvent]:
    """
    Roll for a new macro event this turn (max 1 new event per turn).
    Also tick duration on existing active macros (decrement turns_remaining).
    Returns list of currently active SandboxMacroEvent rows after processing.
    """
    rng = _make_rng(game.id, turn, "macro")

    # Promote pending rate macros to active (they were announced last turn)
    pending_rate = (
        db.query(SandboxMacroEvent)
        .filter(
            SandboxMacroEvent.game_id == game.id,
            SandboxMacroEvent.status == "pending",
        )
        .all()
    )
    for evt in pending_rate:
        evt.status = "active"
        _emit_event(
            db, game.id, turn, "MACRO_EVENT",
            description=(
                f"[{evt.macro_type} NOW IN EFFECT] {evt.headline} — "
                f"ARM rates adjusting this turn."
            ),
        )

    # Tick existing active events
    existing_active = (
        db.query(SandboxMacroEvent)
        .filter(
            SandboxMacroEvent.game_id == game.id,
            SandboxMacroEvent.status == "active",
        )
        .all()
    )
    for evt in existing_active:
        if evt.duration_turns != 99:  # 99 = permanent
            evt.turns_remaining -= 1
            if evt.turns_remaining <= 0:
                evt.status = "expired"
                _emit_event(
                    db, game.id, turn, "MACRO_EVENT",
                    description=f"[EVENT ENDED] {evt.headline}",
                )

    # Roll for a new event — only one new macro per turn
    # Shuffle catalogue so order doesn't bias probability when multiple roll
    shuffled = list(_MACRO_CATALOGUE)
    rng.shuffle(shuffled)

    new_macro: SandboxMacroEvent | None = None
    for entry in shuffled:
        if rng.random() < entry["prob"]:
            new_macro = _create_macro_event(db, game, turn, entry, rng)
            break  # only one per turn

    db.commit()

    # Return all currently active (including the one just created)
    return (
        db.query(SandboxMacroEvent)
        .filter(
            SandboxMacroEvent.game_id == game.id,
            SandboxMacroEvent.status == "active",
        )
        .all()
    )


def _create_macro_event(
    db: Session,
    game: SandboxGame,
    turn: int,
    entry: dict,
    rng: random.Random,
) -> SandboxMacroEvent:
    """Instantiate a macro event from a catalogue entry."""
    macro_type = entry["macro_type"]
    dur_min, dur_max = entry["duration"]
    duration = rng.randint(dur_min, dur_max)
    effects = dict(entry["effects"])  # copy so we can mutate

    # Randomise effects for variable-magnitude events
    if macro_type == "POLICY_CHANGE":
        direction = 1 if rng.random() > 0.5 else -1
        effects["price_delta_pct"] = direction * rng.uniform(0.03, 0.07)
        effects["rent_delta_pct"] = direction * rng.uniform(0.05, 0.12)

    elif macro_type == "TAX_HIKE":
        effects["monthly_expense_per_token"] = round(rng.uniform(50, 150), 2)

    elif macro_type == "INSURANCE_CRISIS":
        effects["monthly_expense_per_token"] = round(rng.uniform(100, 300), 2)

    elif macro_type == "EMINENT_DOMAIN":
        # Pick one random property and execute a forced buyout at 110% value
        game_props = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game.id)
            .all()
        )
        if game_props:
            target_gp = rng.choice(game_props)
            buyout_price = round(target_gp.current_price_usd * 1.10, 2)
            # Pay out all token holders at 110%
            holdings = (
                db.query(SandboxHolding)
                .filter(SandboxHolding.game_id == game.id,
                        SandboxHolding.property_id == target_gp.property_id,
                        SandboxHolding.tokens_held > 0)
                .all()
            )
            for h in holdings:
                holder = db.get(SandboxPlayer, h.player_id)
                if not holder:
                    continue
                proceeds = round(h.tokens_held * buyout_price, 2)
                # Pay off their mortgage on this property first
                mtgs = (
                    db.query(SandboxMortgage)
                    .filter(SandboxMortgage.game_id == game.id,
                            SandboxMortgage.player_id == h.player_id,
                            SandboxMortgage.property_id == target_gp.property_id,
                            SandboxMortgage.status == "active")
                    .all()
                )
                for m in mtgs:
                    proceeds = max(0.0, round(proceeds - m.current_balance, 2))
                    m.status = "paid_off"
                    m.paid_off_turn = turn
                holder.usdc_balance = round(holder.usdc_balance + proceeds, 2)
                h.tokens_held = 0.0
                h.updated_at = datetime.utcnow()
            prop_name = _prop_name(db, target_gp.property_id)
            _emit_event(
                db, game.id, turn, "EMINENT_DOMAIN",
                description=(
                    f"EMINENT DOMAIN: {prop_name} seized by government at "
                    f"${buyout_price:,.2f}/token (110% market value). "
                    f"All mortgages cleared. Token holders paid out."
                ),
                property_id=target_gp.property_id,
                delta_usdc=buyout_price,
            )
            db.commit()
        # Eminent domain fires immediately and is done — create a brief record and return
        macro = SandboxMacroEvent(
            id=str(uuid.uuid4()),
            game_id=game.id,
            turn_triggered=turn,
            macro_type=macro_type,
            headline=rng.choice(entry["headlines"]),
            description="Government eminent domain seizure executed.",
            scope="all",
            duration_turns=1,
            turns_remaining=0,
            status="expired",
        )
        db.add(macro)
        logger.info(f"SandboxEngine: EMINENT_DOMAIN executed in game {game.id} turn {turn}")
        return macro

    elif macro_type == "GENTRIFICATION":
        # Immediately upgrade D/F properties in the affected type by one grade
        game_props = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game.id)
            .all()
        )
        # We don't know affected_type yet — handle after scope resolution below
        effects["_gentrification_pending"] = True

    # Determine scope / targeting
    scope = entry.get("scope", "all")
    affected_type: str | None = None
    if scope == "type":
        game_props = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game.id)
            .all()
        )
        types = list({
            gp.sandbox_property.property_type
            for gp in game_props
            if gp.sandbox_property and gp.sandbox_property.property_type
        })
        affected_type = rng.choice(types) if types else None

    # Pick headline
    headline_tmpl = rng.choice(entry["headlines"])
    headline = headline_tmpl.replace("{type}", affected_type or "all property")

    description = (
        f"{headline} "
        f"[Duration: {'permanent' if duration == 99 else f'{duration} turn(s)'}]"
    )

    # Gentrification: upgrade D/F properties of affected_type by one grade
    if effects.pop("_gentrification_pending", False):
        game_props_all = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game.id)
            .all()
        )
        upgraded = 0
        for gp in game_props_all:
            prop = gp.sandbox_property
            if affected_type and prop and prop.property_type != affected_type:
                continue
            current = getattr(gp, "grade", "C") or "C"
            if current in ("D", "F"):
                idx = GRADE_ORDER.index(current)
                gp.grade = GRADE_ORDER[max(0, idx - 1)]
                gp.updated_at = datetime.utcnow()
                upgraded += 1
        if upgraded:
            description += f" {upgraded} distressed properties upgraded one grade."

    _RATE_MACRO_TYPES = {"INTEREST_RATE_RISE", "INTEREST_RATE_CUT"}
    initial_status = "pending" if macro_type in _RATE_MACRO_TYPES else "active"

    macro = SandboxMacroEvent(
        id=str(uuid.uuid4()),
        game_id=game.id,
        turn_triggered=turn,
        macro_type=macro_type,
        headline=headline,
        description=description,
        scope=scope,
        affected_property_type=affected_type,
        price_delta_pct=effects.get("price_delta_pct", 0.0),
        rent_delta_pct=effects.get("rent_delta_pct", 0.0),
        vacancy_probability_add=effects.get("vacancy_probability_add", 0.0),
        rate_adjustment=effects.get("rate_adjustment", 0.0),
        monthly_expense_per_token=effects.get("monthly_expense_per_token", 0.0),
        duration_turns=duration,
        turns_remaining=duration,
        status=initial_status,
    )
    db.add(macro)

    if initial_status == "pending":
        feed_description = (
            f"[{macro_type} WARNING — takes effect next turn] {description} "
            f"ARM holders: consider refinancing to fixed before next turn."
        )
    else:
        feed_description = f"[{macro_type}] {description}"

    _emit_event(
        db, game.id, turn, "MACRO_EVENT",
        description=feed_description,
        delta_pct=effects.get("price_delta_pct", 0.0),
        macro_event_id=macro.id,
    )

    logger.info(f"SandboxEngine: macro event {macro_type} triggered in game {game.id} turn {turn}")
    return macro


def _macro_effects_for_property(
    active_macros: list[SandboxMacroEvent],
    prop_type: str | None,
) -> dict:
    """
    Aggregate macro effects applicable to a given property type.
    Returns: {price_delta_pct, rent_delta_pct, vacancy_add, monthly_expense}
    """
    price_delta = 0.0
    rent_delta = 0.0
    vacancy_add = 0.0
    monthly_expense = 0.0

    for macro in active_macros:
        if macro.scope == "all":
            pass  # applies universally
        elif macro.scope == "type" and macro.affected_property_type != prop_type:
            continue
        elif macro.scope == "city" or macro.scope == "state":
            continue  # city/state scoping handled elsewhere (no city on property yet)

        price_delta += macro.price_delta_pct
        rent_delta += macro.rent_delta_pct
        vacancy_add += macro.vacancy_probability_add
        monthly_expense += macro.monthly_expense_per_token

    return {
        "price_delta_pct": price_delta,
        "rent_delta_pct": rent_delta,
        "vacancy_add": vacancy_add,
        "monthly_expense": monthly_expense,
    }


def _macro_rate_adjustment(active_macros: list[SandboxMacroEvent]) -> float:
    """Sum of all active macro rate adjustments."""
    return sum(m.rate_adjustment for m in active_macros)


# ─── Phase 1 — RENT COLLECT ──────────────────────────────────────────────────

def _phase_rent_collect(
    db: Session,
    game: SandboxGame,
    turn: int,
    active_macros: list[SandboxMacroEvent],
) -> dict[str, dict[str, float]]:
    """Distribute rent to holders. Returns {player_id: {property_id: amount}}."""
    totals: dict[str, dict[str, float]] = {}

    game_props = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game.id)
        .all()
    )

    for gp in game_props:
        prop = gp.sandbox_property
        if not prop:
            continue

        macro_fx = _macro_effects_for_property(active_macros, prop.property_type)

        # Check vacancy from previous turn's Phase 2
        vacancy = (
            db.query(SandboxTurnEvent)
            .filter(
                SandboxTurnEvent.game_id == game.id,
                SandboxTurnEvent.turn == turn - 1,
                SandboxTurnEvent.event_type == "VACANCY",
                SandboxTurnEvent.property_id == prop.id,
            )
            .first()
        )
        if vacancy or macro_fx["rent_delta_pct"] <= -1.0:
            _emit_event(db, game.id, turn, "RENT_COLLECTED",
                        description=f"{prop.name} — vacant/disaster this turn, no rent.",
                        property_id=prop.id)
            continue

        # Apply macro rent delta + grade rent multiplier
        base_rent = gp.current_rent_usd
        gp_grade = getattr(gp, "grade", "C") or "C"
        grade_rent_mult = _grade_profile(gp_grade)["rent_mult"]
        effective_rent = max(0.0, round(base_rent * grade_rent_mult * (1 + macro_fx["rent_delta_pct"]), 2))

        holdings = (
            db.query(SandboxHolding)
            .filter(
                SandboxHolding.game_id == game.id,
                SandboxHolding.property_id == prop.id,
                SandboxHolding.tokens_held > 0,
            )
            .all()
        )
        total_tokens = sum(h.tokens_held for h in holdings)
        if total_tokens <= 0:
            continue

        for holding in holdings:
            share = holding.tokens_held / total_tokens
            rent_share = round(effective_rent * share, 2)

            # Deduct macro monthly expense (tax hike, insurance)
            expense = round(macro_fx["monthly_expense"] * holding.tokens_held, 2)
            net_rent = max(0.0, rent_share - expense)

            if net_rent <= 0:
                continue

            holding.total_rent_received_usd += net_rent
            holding.updated_at = datetime.utcnow()
            totals.setdefault(holding.player_id, {})[prop.id] = (
                totals.get(holding.player_id, {}).get(prop.id, 0.0) + net_rent
            )

            rent_tx = SandboxTransaction(
                id=str(uuid.uuid4()),
                game_id=game.id,
                turn=turn,
                player_id=holding.player_id,
                type="RENT_RECEIVED",
                property_id=prop.id,
                amount_usdc=net_rent,
                tokens=holding.tokens_held,
                price_per_token_usd=gp.current_price_usd,
            )
            db.add(rent_tx)
            rentline_payment_id = _record_rentline_ledger(
                db, game, holding.player_id, prop.geo_id, net_rent,
                f"Sandbox rent: {prop.name} turn={turn}"
            )
            if rentline_payment_id:
                rent_tx.rentline_payment_id = rentline_payment_id

        _emit_event(
            db, game.id, turn, "RENT_COLLECTED",
            description=(
                f"{prop.name} — ${effective_rent:,.2f} rent collected "
                f"({len(holdings)} holder(s))"
                + (f" [macro expense -${macro_fx['monthly_expense']:.0f}/token]"
                   if macro_fx["monthly_expense"] > 0 else "")
            ),
            property_id=prop.id,
            delta_usdc=effective_rent,
        )

    db.commit()
    return totals


# ─── Phase 2 — RANDOM EVENTS ─────────────────────────────────────────────────

def _phase_random_events(
    db: Session,
    game: SandboxGame,
    turn: int,
    active_macros: list[SandboxMacroEvent],
) -> dict[str, float]:
    """
    Per-property random events. Returns drift_map {game_property_id: price_factor}.
    Macro effects modify probabilities and override drift where applicable.
    """
    drift_map: dict[str, float] = {}

    game_props = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game.id)
        .all()
    )

    for gp in game_props:
        prop = gp.sandbox_property
        if not prop:
            continue

        macro_fx = _macro_effects_for_property(active_macros, prop.property_type)
        base_weights = _WEIGHTS.get(prop.property_type or "residential", _DEFAULT_WEIGHTS)
        gp_grade = getattr(gp, "grade", "C") or "C"
        gprofile = _grade_profile(gp_grade)

        # Merge grade adjustments into effective weights
        eff_vacancy = min(0.95, gprofile["vacancy_prob"] + macro_fx["vacancy_add"])
        eff_capex = gprofile["capex_prob"]
        eff_appreciation = min(0.95, base_weights["appreciation"]
                               + gprofile["appreciation_prob_add"])

        rng = _make_rng(game.id, turn, prop.id)
        price_factor = 1.0

        # Vacancy
        if rng.random() < eff_vacancy:
            _emit_event(db, game.id, turn, "VACANCY",
                        description=f"{prop.name} [Grade {gp_grade}] — vacancy event: no rent next turn.",
                        property_id=prop.id)

        # Lease renewal (blocked by RENT_CONTROL macro)
        rent_control_active = any(
            m.macro_type == "RENT_CONTROL"
            and (m.scope == "all" or m.affected_property_type == prop.property_type)
            for m in active_macros
        )
        if rng.random() < base_weights["lease_renewal"] and not rent_control_active:
            direction = 1 if rng.random() > 0.35 else -1
            magnitude = rng.uniform(*_LEASE_RENEWAL_RANGE) * direction
            old_rent = gp.current_rent_usd
            new_rent = max(0.0, round(old_rent * (1 + magnitude), 2))
            gp.current_rent_usd = new_rent
            sign = "+" if magnitude > 0 else ""
            _emit_event(
                db, game.id, turn, "LEASE_RENEWAL",
                description=f"{prop.name} — lease renewed {sign}{magnitude*100:.1f}% (${old_rent:,.0f}→${new_rent:,.0f}/mo).",
                property_id=prop.id, delta_pct=magnitude,
            )
        elif rent_control_active and rng.random() < base_weights["lease_renewal"]:
            _emit_event(
                db, game.id, turn, "LEASE_RENEWAL",
                description=f"{prop.name} — rent control in effect: lease renewal capped at 0%.",
                property_id=prop.id,
            )

        # CapEx — grade-adjusted probability
        if rng.random() < eff_capex:
            capex = round(rng.uniform(*_CAPEX_FLAT_RANGE), 2)
            holdings = (
                db.query(SandboxHolding)
                .filter(SandboxHolding.game_id == game.id,
                        SandboxHolding.property_id == prop.id,
                        SandboxHolding.tokens_held > 0)
                .all()
            )
            total_tokens = sum(h.tokens_held for h in holdings)
            if total_tokens > 0:
                for h in holdings:
                    player = db.get(SandboxPlayer, h.player_id)
                    if player:
                        deduction = round(capex * h.tokens_held / total_tokens, 2)
                        player.usdc_balance = max(0.0, player.usdc_balance - deduction)
            _emit_event(db, game.id, turn, "CAPEX_HIT",
                        description=f"{prop.name} [Grade {gp_grade}] — capex: ${capex:,.0f} deducted from holders.",
                        property_id=prop.id, delta_usdc=-capex)

        # Appreciation / Depreciation — macro overrides if present, else grade-adjusted
        macro_price_delta = macro_fx["price_delta_pct"]
        if macro_price_delta != 0.0:
            price_factor = 1.0 + macro_price_delta
            event_type = "APPRECIATION" if macro_price_delta > 0 else "DEPRECIATION"
            _emit_event(
                db, game.id, turn, event_type,
                description=f"{prop.name} — macro-driven {'gain' if macro_price_delta > 0 else 'loss'} {macro_price_delta*100:+.1f}%.",
                property_id=prop.id, delta_pct=macro_price_delta,
            )
        elif rng.random() < eff_appreciation:
            magnitude = rng.uniform(*gprofile["appreciation_range"])
            price_factor = 1.0 + magnitude
            _emit_event(db, game.id, turn, "APPRECIATION",
                        description=f"{prop.name} [Grade {gp_grade}] — AVM up +{magnitude*100:.1f}%.",
                        property_id=prop.id, delta_pct=magnitude)
        else:
            magnitude = rng.uniform(*gprofile["depreciation_range"])
            price_factor = 1.0 - magnitude
            _emit_event(db, game.id, turn, "DEPRECIATION",
                        description=f"{prop.name} [Grade {gp_grade}] — AVM down -{magnitude*100:.1f}%.",
                        property_id=prop.id, delta_pct=-magnitude)

        drift_map[gp.id] = price_factor

        # ── Mechanics lien / price dispute ────────────────────────────────────
        # If the property was flagged "at risk" (mechanics_lien_amount == -1),
        # roll for a MECHANICS_LIEN event this turn.
        mechanics_lien_amount = getattr(gp, "mechanics_lien_amount", 0.0) or 0.0
        if mechanics_lien_amount == -1.0:
            # 60% chance the contractor files a lien
            if rng.random() < 0.60:
                lien_amount = round(rng.uniform(0.03, 0.10) * gp.current_price_usd, 2)
                gp.mechanics_lien_amount = lien_amount
                _emit_event(
                    db, game.id, turn, "MECHANICS_LIEN",
                    description=(
                        f"{prop.name} [Grade {gp_grade}] — MECHANICS LIEN FILED: "
                        f"contractor dispute for ${lien_amount:,.2f}. "
                        f"Refi and PACE blocked until resolved. "
                        f"Pay via prepay-principal with mortgage_type='mechanics_lien'."
                    ),
                    property_id=prop.id,
                    delta_usdc=-lien_amount,
                )
                # 40% chance of a price dispute reducing value 5–15%
                if rng.random() < 0.40:
                    dispute_pct = rng.uniform(0.05, 0.15)
                    old_price = gp.current_price_usd
                    gp.current_price_usd = max(1.0, round(old_price * (1 - dispute_pct), 2))
                    # Override whatever drift_map had
                    drift_map[gp.id] = gp.current_price_usd / old_price if old_price > 0 else 1.0
                    _emit_event(
                        db, game.id, turn, "PRICE_DISPUTE",
                        description=(
                            f"{prop.name} — PRICE DISPUTE: appraiser won't certify value "
                            f"while lien is active. AVM reduced -{dispute_pct*100:.0f}% "
                            f"(${old_price:,.0f}→${gp.current_price_usd:,.0f})."
                        ),
                        property_id=prop.id,
                        delta_pct=-dispute_pct,
                    )
            else:
                # Lien risk resolved without filing
                gp.mechanics_lien_amount = 0.0
                _emit_event(
                    db, game.id, turn, "MECHANICS_LIEN",
                    description=f"{prop.name} — contractor dispute resolved without lien filing.",
                    property_id=prop.id,
                )

    db.commit()
    return drift_map


# ─── Phase 3 — MARKET MOVE ───────────────────────────────────────────────────

def _phase_market_move(
    db: Session,
    game: SandboxGame,
    turn: int,
    drift_map: dict[str, float],
    active_macros: list[SandboxMacroEvent],
) -> None:
    game_props = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game.id)
        .all()
    )
    for gp in game_props:
        factor = drift_map.get(gp.id, 1.0)
        gp.current_price_usd = max(1.0, round(gp.current_price_usd * factor, 2))
        gp.updated_at = datetime.utcnow()
        _maybe_resync_avm(db, gp)
    db.commit()


def _maybe_resync_avm(db: Session, gp: SandboxGameProperty) -> None:
    prop = gp.sandbox_property
    if not prop or not settings.RWA_ISSUER_URL or not prop.geo_id:
        return
    if prop.last_avm_sync:
        age_hours = (datetime.utcnow() - prop.last_avm_sync).total_seconds() / 3600
        if age_hours < 24:
            return
    try:
        import httpx
        resp = httpx.get(f"{settings.RWA_ISSUER_URL}/metadata/{prop.geo_id}", timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            # rwa-issuer-sim /metadata/{geo_id} response shape:
            # { "geoId": "geo-132473", "value": 1649000, "property": { ... } }
            avm = data.get("value")
            if avm and float(avm) > 0:
                gp.current_price_usd = round((gp.current_price_usd + float(avm)) / 2, 2)
            prop.last_avm_sync = datetime.utcnow()
            prop.updated_at = datetime.utcnow()
    except Exception as e:
        logger.debug(f"rwa-issuer-sim AVM sync failed for {prop.geo_id} (non-fatal): {e}")


# ─── Phase 4 — DEBT SERVICE ──────────────────────────────────────────────────

def _phase_debt_service(
    db: Session,
    game: SandboxGame,
    turn: int,
    active_macros: list[SandboxMacroEvent],
) -> None:
    """
    Collect mortgage payments from all players with active mortgages.
    ARM rates are adjusted based on active macro rate adjustments.
    Amortizing mortgages reduce principal.
    Missed payments increment turns_in_arrears; after 1 grace turn → forced sale.
    """
    rate_adj = _macro_rate_adjustment(active_macros)

    mortgages = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game.id,
            SandboxMortgage.status == "active",
        )
        .all()
    )

    for mtg in mortgages:
        player = db.get(SandboxPlayer, mtg.player_id)
        if not player:
            continue

        # ARM rate adjustment
        if mtg.rate_type == "arm" and rate_adj != 0.0:
            old_rate = mtg.current_rate
            new_rate = mtg.current_rate + rate_adj
            # Clamp to origination_rate ± game.arm_cap
            arm_cap = game.arm_cap
            new_rate = max(
                mtg.origination_rate - arm_cap,
                min(mtg.origination_rate + arm_cap, new_rate),
            )
            new_rate = max(0.001, new_rate)  # floor at 0.1%
            if abs(new_rate - old_rate) > 0.0001:
                mtg.current_rate = round(new_rate, 5)
                direction = "up" if new_rate > old_rate else "down"
                _emit_event(
                    db, game.id, turn, "ARM_ADJUSTMENT",
                    description=(
                        f"{mtg.mortgage_type.upper()} on {_prop_name(db, mtg.property_id)}: "
                        f"ARM rate adjusted {direction} "
                        f"{old_rate*100:.2f}% → {new_rate*100:.2f}%"
                    ),
                    player_id=mtg.player_id,
                    property_id=mtg.property_id,
                    delta_pct=new_rate - old_rate,
                )

        # Recompute monthly payment
        balance = mtg.current_balance
        monthly_rate = mtg.current_rate / 12.0

        if mtg.amortizing and balance > 0 and monthly_rate > 0:
            # Standard amortization PMT — fixed remaining term of max 30yr (360 turns)
            # We don't track term explicitly; use simplified: fixed origination payment
            # Recalculate from original balance and origination rate for stability
            orig_monthly = mtg.origination_rate / 12.0
            n = 360  # 30-year term in turns/months
            if orig_monthly > 0:
                pmt = mtg.original_balance * (orig_monthly * (1 + orig_monthly) ** n) / ((1 + orig_monthly) ** n - 1)
            else:
                pmt = mtg.original_balance / n
            mtg.monthly_payment = round(pmt, 2)
        else:
            # Interest-only
            mtg.monthly_payment = round(balance * monthly_rate, 2)

        payment_due = mtg.monthly_payment

        if player.usdc_balance >= payment_due:
            # Collect payment
            player.usdc_balance = round(player.usdc_balance - payment_due, 2)
            mtg.turns_in_arrears = 0

            if mtg.amortizing:
                interest_portion = round(balance * monthly_rate, 2)
                principal_portion = round(payment_due - interest_portion, 2)
                mtg.total_interest_paid += interest_portion
                mtg.total_principal_paid += principal_portion
                mtg.current_balance = max(0.0, round(balance - principal_portion, 2))
            else:
                mtg.total_interest_paid += payment_due

            if mtg.current_balance <= 0.01:
                mtg.status = "paid_off"
                mtg.paid_off_turn = turn
                _emit_event(
                    db, game.id, turn, "DEBT_SERVICE",
                    description=f"{_prop_name(db, mtg.property_id)}: mortgage paid off!",
                    player_id=mtg.player_id, property_id=mtg.property_id,
                    delta_usdc=-payment_due,
                )
            else:
                _emit_event(
                    db, game.id, turn, "DEBT_SERVICE",
                    description=(
                        f"{_prop_name(db, mtg.property_id)}: ${payment_due:,.2f} debt service paid "
                        f"(balance ${mtg.current_balance:,.2f})"
                    ),
                    player_id=mtg.player_id, property_id=mtg.property_id,
                    delta_usdc=-payment_due,
                )
            db.add(SandboxTransaction(
                id=str(uuid.uuid4()),
                game_id=game.id,
                turn=turn,
                player_id=mtg.player_id,
                type="DEBT_SERVICE",
                property_id=mtg.property_id,
                amount_usdc=-payment_due,
            ))

        else:
            # Missed payment
            mtg.turns_in_arrears += 1
            grace_turns = 1  # hardcoded grace period of 1 turn

            if mtg.turns_in_arrears > grace_turns:
                # Trigger forced sale
                _execute_forced_sale(db, game, turn, mtg, player)
            else:
                _emit_event(
                    db, game.id, turn, "DEBT_SERVICE",
                    description=(
                        f"WARNING: {_prop_name(db, mtg.property_id)}: "
                        f"missed payment of ${payment_due:,.2f} "
                        f"(grace turn {mtg.turns_in_arrears}/{grace_turns})"
                    ),
                    player_id=mtg.player_id, property_id=mtg.property_id,
                    delta_usdc=0.0,
                )

        mtg.updated_at = datetime.utcnow()

    db.commit()


def _execute_forced_sale(
    db: Session,
    game: SandboxGame,
    turn: int,
    mtg: SandboxMortgage,
    player: SandboxPlayer,
) -> None:
    """
    Forced sale on mortgage default.
    Sell at current_price × (1 - default_penalty).
    Proceeds repay mortgage balance. Surplus to player, shortfall absorbed (bad debt).
    Also closes any HELOC on the same property for this player.
    """
    gp = (
        db.query(SandboxGameProperty)
        .filter(
            SandboxGameProperty.game_id == game.id,
            SandboxGameProperty.property_id == mtg.property_id,
        )
        .first()
    )
    if not gp:
        mtg.status = "defaulted"
        mtg.defaulted_turn = turn
        return

    holding = (
        db.query(SandboxHolding)
        .filter(
            SandboxHolding.game_id == game.id,
            SandboxHolding.player_id == mtg.player_id,
            SandboxHolding.property_id == mtg.property_id,
        )
        .first()
    )

    penalty = game.debt_service_default_penalty
    sale_price_per_token = round(gp.current_price_usd * (1 - penalty), 2)
    tokens_held = holding.tokens_held if holding else 0.0
    gross_proceeds = round(tokens_held * sale_price_per_token, 2)

    # Repay all active debt on this property for this player
    all_debt = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game.id,
            SandboxMortgage.player_id == mtg.player_id,
            SandboxMortgage.property_id == mtg.property_id,
            SandboxMortgage.status == "active",
        )
        .all()
    )
    total_debt = sum(m.current_balance for m in all_debt)
    net_to_player = round(gross_proceeds - total_debt, 2)

    if net_to_player > 0:
        player.usdc_balance = round(player.usdc_balance + net_to_player, 2)
    else:
        # Shortfall — forced sale didn't fully cover the debt
        shortfall = abs(net_to_player)
        if getattr(game, "judgment_on_shortfall", False):
            player.judgment_balance = round(
                (getattr(player, "judgment_balance", 0.0) or 0.0) + shortfall, 2
            )
            logger.info(
                f"Judgment lien (forced sale): player={player.id} "
                f"property={mtg.property_id} shortfall=${shortfall:,.2f}"
            )
        # else: shortfall absorbed silently (original behaviour)

    # Clear holding
    if holding:
        holding.tokens_held = 0.0
        holding.updated_at = datetime.utcnow()

    # Mark all debt on this property as defaulted
    for m in all_debt:
        m.status = "defaulted"
        m.defaulted_turn = turn

    prop_name = _prop_name(db, mtg.property_id)
    _emit_event(
        db, game.id, turn, "MORTGAGE_DEFAULT",
        description=(
            f"DEFAULT: {prop_name} forced sale — "
            f"{tokens_held:.2f} tokens sold at ${sale_price_per_token:,.2f} "
            f"(gross ${gross_proceeds:,.2f}, debt ${total_debt:,.2f}, "
            f"net {'surplus' if net_to_player >= 0 else 'shortfall'} "
            f"${abs(net_to_player):,.2f})"
        ),
        player_id=mtg.player_id,
        property_id=mtg.property_id,
        delta_usdc=net_to_player,
    )

    db.add(SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game.id,
        turn=turn,
        player_id=mtg.player_id,
        type="FORCED_SALE",
        property_id=mtg.property_id,
        amount_usdc=gross_proceeds,
        tokens=tokens_held,
        price_per_token_usd=sale_price_per_token,
    ))


# ─── Phase 5 — DISTRIBUTE ────────────────────────────────────────────────────

def _phase_distribute(
    db: Session,
    game: SandboxGame,
    turn: int,
    phase1_totals: dict[str, dict[str, float]],
) -> None:
    total_rent_distributed = 0.0
    for player_id, prop_amounts in phase1_totals.items():
        total_yield = round(sum(prop_amounts.values()), 2)
        if total_yield <= 0:
            continue
        player = db.get(SandboxPlayer, player_id)
        if not player:
            continue
        player.usdc_balance = round(player.usdc_balance + total_yield, 2)
        total_rent_distributed += total_yield
        db.add(SandboxTransaction(
            id=str(uuid.uuid4()),
            game_id=game.id,
            turn=turn,
            player_id=player_id,
            type="DISTRIBUTE",
            amount_usdc=total_yield,
        ))

    # ── Turn summary event ────────────────────────────────────────────────────
    # Aggregate key metrics for the turn and emit a single summary event.
    # Collects: total rent, total debt service paid, NAV changes per player.
    debt_service_txs = (
        db.query(SandboxTransaction)
        .filter(
            SandboxTransaction.game_id == game.id,
            SandboxTransaction.turn == turn,
            SandboxTransaction.type == "DEBT_SERVICE",
        )
        .all()
    )
    total_debt_service = abs(sum(t.amount_usdc or 0 for t in debt_service_txs))

    players = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).all()
    nav_lines = []
    for p in players:
        nav = _compute_nav(db, game.id, p)
        nav_lines.append(f"{p.display_name} ${nav:,.0f}")

    _emit_event(
        db, game.id, turn, "TURN_SUMMARY",
        description=(
            f"Turn {turn} summary — "
            f"Rent collected: ${total_rent_distributed:,.2f} | "
            f"Debt service: ${total_debt_service:,.2f} | "
            f"NAVs: {' · '.join(nav_lines)}"
        ),
        delta_usdc=total_rent_distributed,
    )

    db.commit()


# ─── Phase 6 — TRADE WINDOW ──────────────────────────────────────────────────

def _phase_trade_window(db: Session, game: SandboxGame, turn: int) -> None:
    if turn >= game.max_turns:
        _finalize_game(db, game, turn)
        return
    players = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).all()
    for p in players:
        p.is_ready = False
    game.status = "trading"
    game.turn_started_at = datetime.utcnow()
    game.updated_at = datetime.utcnow()
    _emit_event(db, game.id, turn, "TURN_END",
                description=f"Turn {turn} complete. Trade window open.")
    db.commit()


def _finalize_game(db: Session, game: SandboxGame, turn: int) -> None:
    players = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).all()
    nav_lines = []
    for p in players:
        nav = _compute_nav(db, game.id, p)
        nav_lines.append(f"{p.display_name}: ${nav:,.2f}")
    _emit_event(db, game.id, turn, "TURN_END",
                description=f"Game over after {turn} turns. Final NAVs — {' | '.join(nav_lines)}")
    game.status = "completed"
    game.ended_at = datetime.utcnow()
    game.updated_at = datetime.utcnow()
    db.commit()
    try:
        from app.core.ws_manager import broadcast_sync
        broadcast_sync("sandbox.game_completed", {"game_id": game.id})
    except Exception:
        pass


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _compute_nav(db: Session, game_id: str, player: SandboxPlayer) -> float:
    nav = player.usdc_balance
    holdings = (
        db.query(SandboxHolding)
        .filter(SandboxHolding.game_id == game_id, SandboxHolding.player_id == player.id)
        .all()
    )
    for h in holdings:
        gp = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game_id,
                    SandboxGameProperty.property_id == h.property_id)
            .first()
        )
        if gp and h.tokens_held > 0:
            nav += h.tokens_held * gp.current_price_usd
    # Subtract outstanding mortgage balances (net equity)
    mortgages = (
        db.query(SandboxMortgage)
        .filter(SandboxMortgage.game_id == game_id,
                SandboxMortgage.player_id == player.id,
                SandboxMortgage.status == "active")
        .all()
    )
    nav -= sum(m.current_balance for m in mortgages)
    # Judgment liens (deficiency balances from underwater sales) also reduce NAV
    nav -= getattr(player, "judgment_balance", 0.0) or 0.0
    return round(nav, 2)


# ─── Investor tier system ─────────────────────────────────────────────────────

_INVESTOR_TIERS = [
    # (min_nav, tier_number, name, ltv_bonus, rate_discount_bps)
    (25_000_000, 4, "Real Estate Developer",  0.20, 100),
    ( 2_500_000, 3, "Institutional Investor", 0.15,  75),
    (   500_000, 2, "Professional Investor",  0.10,  50),
    (   100_000, 1, "Accredited Investor",    0.05,  25),
    (         0, 0, "Retail Investor",        0.00,   0),
]


def compute_tier(nav: float) -> dict:
    """
    Return the investor tier for a given NAV.
    Tier is purely dynamic — computed on the fly from current NAV, never stored.
    """
    for min_nav, tier_num, name, ltv_bonus, rate_discount_bps in _INVESTOR_TIERS:
        if nav >= min_nav:
            return {
                "tier": tier_num,
                "name": name,
                "nav": round(nav, 2),
                "ltv_bonus": ltv_bonus,
                "rate_discount_bps": rate_discount_bps,
                "rate_discount": round(rate_discount_bps / 10000, 4),
                "next_tier": _next_tier_info(tier_num),
            }
    return compute_tier(0)


def _next_tier_info(current_tier: int) -> dict | None:
    for min_nav, tier_num, name, ltv_bonus, rate_discount_bps in reversed(_INVESTOR_TIERS):
        if tier_num == current_tier + 1:
            return {"tier": tier_num, "name": name, "min_nav": min_nav}
    return None


def effective_ltv_limit(game_ltv: float, nav: float) -> float:
    """LTV limit after applying the player's tier bonus. Capped at 0.95."""
    tier = compute_tier(nav)
    return min(0.95, round(game_ltv + tier["ltv_bonus"], 4))


def effective_rate(base_rate: float, nav: float) -> float:
    """Mortgage rate after applying the player's tier discount. Floored at 0.5%."""
    tier = compute_tier(nav)
    return max(0.005, round(base_rate - tier["rate_discount"], 5))


def _emit_event(
    db: Session,
    game_id: str,
    turn: int,
    event_type: str,
    description: str,
    property_id: str | None = None,
    player_id: str | None = None,
    delta_usdc: float = 0.0,
    delta_pct: float = 0.0,
    macro_event_id: str | None = None,
) -> SandboxTurnEvent:
    event = SandboxTurnEvent(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=turn,
        event_type=event_type,
        property_id=property_id,
        player_id=player_id,
        description=description,
        delta_usdc=delta_usdc,
        delta_pct=delta_pct,
        macro_event_id=macro_event_id,
    )
    db.add(event)
    return event


def _make_rng(game_id: str, turn: int, key: str) -> random.Random:
    seed_int = int(hashlib.sha256(f"{game_id}:{turn}:{key}".encode()).hexdigest(), 16) % (2 ** 32)
    return random.Random(seed_int)


def _prop_name(db: Session, property_id: str) -> str:
    prop = db.get(__import__("app.models.sandbox", fromlist=["SandboxProperty"]).SandboxProperty, property_id)
    return prop.name if prop else property_id


def _record_rentline_ledger(
    db: Session, game: SandboxGame, player_id: str,
    property_ref: str, amount: float, description: str,
) -> str | None:
    """Bridge to Rentline backend ledger (non-fatal, optional). Returns payment_event_id or None."""
    from app.services.ledger_bridge import record_sandbox_ledger_entry
    return record_sandbox_ledger_entry(
        property_ref=property_ref,
        amount=amount,
        reference_id=f"sandbox:{game.id}",
        owner_clerk_id=game.created_by,
    )
