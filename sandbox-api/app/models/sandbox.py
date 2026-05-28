"""
Sandbox models — all tables in one file for clarity.

  SandboxGame           — one row per game room
  SandboxPlayer         — one row per player per game
  SandboxProperty       — curated pool (admin-managed, sourced from rwa-issuer-sim)
  SandboxGameProperty   — per-game price/rent state that drifts each turn
  SandboxHolding        — player token ownership inside a game
  SandboxMortgage       — debt position: acquisition loan, refi, or HELOC draw
  SandboxTransaction    — full financial audit trail
  SandboxTurnEvent      — narrative feed events (vacancy, appreciation, capex, etc.)
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey,
    Integer, Numeric, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ---------------------------------------------------------------------------
# SandboxGame
# ---------------------------------------------------------------------------

class SandboxGame(Base):
    """
    A game room. Lifecycle:
      lobby → trading → advancing → completed

    - lobby:     players joining, host configures
    - trading:   turn trade window open, players buy/sell
    - advancing: engine running advance_turn() (brief, ~seconds)
    - completed: final NAV computed, leaderboard frozen
    """
    __tablename__ = "sandbox_games"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="lobby", nullable=False)
    current_turn: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_turns: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    starting_balance_usdc: Mapped[float] = mapped_column(Float, default=100_000.0, nullable=False)

    # Debt / mortgage game rules — configurable per game at creation
    ltv_limit: Mapped[float] = mapped_column(Float, default=0.70, nullable=False)
    # Maximum loan-to-value for acquisition and refi. e.g. 0.70 = 70%.
    default_rate_type: Mapped[str] = mapped_column(String, default="fixed", nullable=False)
    # "fixed" | "arm" — default for new mortgages in this game
    amortizing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # False = interest-only; True = amortizing (principal pays down each turn)
    base_mortgage_rate: Mapped[float] = mapped_column(Float, default=0.065, nullable=False)
    # Annual rate as decimal (0.065 = 6.5%). Monthly cost = balance * rate / 12.
    arm_spread: Mapped[float] = mapped_column(Float, default=0.005, nullable=False)
    # ARM adjustment magnitude per turn (±0.5% default). Tied to AVM drift direction.
    arm_cap: Mapped[float] = mapped_column(Float, default=0.03, nullable=False)
    # Max ARM movement from origination rate in either direction (3% default).
    closing_cost_pct: Mapped[float] = mapped_column(Float, default=0.02, nullable=False)
    # Closing cost as % of loan amount for acquisitions and refis (2% default).
    heloc_spread: Mapped[float] = mapped_column(Float, default=0.02, nullable=False)
    # HELOC rate = base_mortgage_rate + heloc_spread (more expensive than first lien).
    debt_service_default_penalty: Mapped[float] = mapped_column(Float, default=0.10, nullable=False)
    # Forced-sale haircut when player can't make debt service (10% = sell at 90% of current price).

    # Fed rate cycle — predictable schedule, random outcome
    fed_meeting_interval: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    # Turns between Fed meetings (default 6 = every 6 months; real life ≈ every 6-7 weeks).
    # Set to 0 to disable Fed meetings entirely.
    fed_rate_current: Mapped[float] = mapped_column(Float, default=0.055, nullable=False)
    # Current Fed funds rate (as decimal). Used as the base for mortgage rate pricing.
    # New mortgage origination rate = fed_rate_current + mortgage_spread.
    fed_mortgage_spread: Mapped[float] = mapped_column(Float, default=0.020, nullable=False)
    # Spread over Fed funds rate for new mortgage originations (200bps default).
    # base_mortgage_rate is derived: fed_rate_current + fed_mortgage_spread.
    fed_hike_prob: Mapped[float] = mapped_column(Float, default=0.30, nullable=False)
    # Probability of a rate hike at each Fed meeting.
    fed_cut_prob: Mapped[float] = mapped_column(Float, default=0.25, nullable=False)
    # Probability of a rate cut. Hold = 1 - hike_prob - cut_prob.
    fed_move_magnitude_min: Mapped[float] = mapped_column(Float, default=0.0025, nullable=False)
    # Minimum rate move per meeting (25bps default).
    fed_move_magnitude_max: Mapped[float] = mapped_column(Float, default=0.0050, nullable=False)
    # Maximum rate move per meeting (50bps default).

    invite_code: Mapped[str] = mapped_column(String, unique=True, nullable=False,
                                              default=lambda: str(uuid.uuid4())[:8].upper())
    created_by: Mapped[str] = mapped_column(String, nullable=False)   # Clerk user ID
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow,
                                                  onupdate=datetime.utcnow)

    # Autonomous mode — game advances turns automatically without host input
    auto_advance: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # When True, the background runner will advance this game each turn automatically.
    auto_advance_delay_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    # Seconds to wait between turns in autonomous mode (default: 30s).
    # Minimum 5s to avoid hammering the engine. Set to 0 to advance as fast as possible.

    # Relationships
    players: Mapped[list["SandboxPlayer"]] = relationship(
        "SandboxPlayer", back_populates="game", cascade="all, delete-orphan"
    )
    game_properties: Mapped[list["SandboxGameProperty"]] = relationship(
        "SandboxGameProperty", back_populates="game", cascade="all, delete-orphan"
    )
    mortgages: Mapped[list["SandboxMortgage"]] = relationship(
        "SandboxMortgage", back_populates="game", cascade="all, delete-orphan"
    )
    transactions: Mapped[list["SandboxTransaction"]] = relationship(
        "SandboxTransaction", back_populates="game", cascade="all, delete-orphan"
    )
    turn_events: Mapped[list["SandboxTurnEvent"]] = relationship(
        "SandboxTurnEvent", back_populates="game", cascade="all, delete-orphan"
    )
    macro_events: Mapped[list["SandboxMacroEvent"]] = relationship(
        "SandboxMacroEvent", back_populates="game", cascade="all, delete-orphan"
    )
    fed_decisions: Mapped[list["SandboxFedDecision"]] = relationship(
        "SandboxFedDecision", back_populates="game", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# SandboxPlayer
# ---------------------------------------------------------------------------

class SandboxPlayer(Base):
    """One row per player per game. UNIQUE(game_id, clerk_user_id)."""
    __tablename__ = "sandbox_players"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_games.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    clerk_user_id: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    usdc_balance: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    wallet_address: Mapped[str | None] = mapped_column(String, nullable=True)
    is_ready: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_host: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Bot player fields — null for human players
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # True = this player is an LLM-driven bot, not a real Clerk user
    bot_strategy: Mapped[str | None] = mapped_column(String, nullable=True)
    # "aggressive" | "conservative" | "balanced" | "momentum" | "income"
    # Controls the system prompt persona given to the LLM
    bot_personality: Mapped[str | None] = mapped_column(String, nullable=True)
    # Free-text name/flavour for the bot's character, e.g. "Gordon Gecko", "Warren Buffett"

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="players")
    holdings: Mapped[list["SandboxHolding"]] = relationship(
        "SandboxHolding", back_populates="player", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# SandboxProperty
# ---------------------------------------------------------------------------

class SandboxProperty(Base):
    """
    Admin-curated pool of properties available for games.
    Sourced from rwa-issuer-sim via POST /api/sandbox/properties/sync.
    geo_id is a soft FK to rwa-issuer-sim's properties table.
    token_address is the EVM address of PropertyToken on Arbitrum Sepolia / Orbit chain.
    """
    __tablename__ = "sandbox_properties"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    geo_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    display_address: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    property_type: Mapped[str | None] = mapped_column(String, nullable=True)  # residential | commercial
    token_address: Mapped[str | None] = mapped_column(String, nullable=True)  # EVM address
    total_supply: Mapped[float | None] = mapped_column(Float, nullable=True)
    initial_price_usd: Mapped[float] = mapped_column(Float, nullable=False)    # per token
    monthly_rent_usd: Mapped[float] = mapped_column(Float, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    cap_rate: Mapped[float | None] = mapped_column(Float, nullable=True)       # e.g. 0.065
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_avm_sync: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow,
                                                  onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# SandboxGameProperty
# ---------------------------------------------------------------------------

class SandboxGameProperty(Base):
    """
    Per-game snapshot of a property's price and rent, which drift each turn
    via MARKET_MOVE / RANDOM_EVENTS phases. Seeded from SandboxProperty at
    game start. UNIQUE(game_id, property_id).
    """
    __tablename__ = "sandbox_game_properties"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_games.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    property_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_properties.id"),
                                              nullable=False)
    current_price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    current_rent_usd: Mapped[float] = mapped_column(Float, nullable=False)
    turn_added: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow,
                                                  onupdate=datetime.utcnow)

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="game_properties")
    sandbox_property: Mapped["SandboxProperty"] = relationship("SandboxProperty")


# ---------------------------------------------------------------------------
# SandboxHolding
# ---------------------------------------------------------------------------

class SandboxHolding(Base):
    """
    A player's fractional token position in a property within a game.
    UNIQUE(game_id, player_id, property_id).
    avg_purchase_price is the weighted average cost basis (USD per token).
    """
    __tablename__ = "sandbox_holdings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_games.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    player_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_players.id", ondelete="CASCADE"),
                                            nullable=False)
    property_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_properties.id"),
                                              nullable=False)
    tokens_held: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    avg_purchase_price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_rent_received_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow,
                                                  onupdate=datetime.utcnow)

    # Relationships
    player: Mapped["SandboxPlayer"] = relationship("SandboxPlayer", back_populates="holdings")
    sandbox_property: Mapped["SandboxProperty"] = relationship("SandboxProperty")


# ---------------------------------------------------------------------------
# SandboxTransaction
# ---------------------------------------------------------------------------

class SandboxTransaction(Base):
    """
    Full financial audit trail. One row per atomic money movement.

    type values:
      BUY             player purchases tokens from the pool
      SELL            player sells tokens back to the pool
      RENT_RECEIVED   player receives rent yield (per property per turn)
      DISTRIBUTE      turn-end aggregate yield credit
      MINT_TUSDC      admin mints tUSDC to player on game join
    """
    __tablename__ = "sandbox_transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_games.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    player_id: Mapped[str | None] = mapped_column(String, ForeignKey("sandbox_players.id"),
                                                   nullable=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    property_id: Mapped[str | None] = mapped_column(String, ForeignKey("sandbox_properties.id"),
                                                     nullable=True)
    amount_usdc: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_per_token_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # Soft reference to a Rentline PaymentEvent — no FK constraint (different DB/repo)
    rentline_payment_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="transactions")


# ---------------------------------------------------------------------------
# SandboxTurnEvent
# ---------------------------------------------------------------------------

class SandboxTurnEvent(Base):
    """
    Narrative events emitted by the engine each turn. Powers the game feed.

    event_type values:
      RENT_COLLECTED   rent paid out to token holders
      VACANCY          property vacant — no rent this turn
      LEASE_RENEWAL    rent adjusted up/down for N turns
      CAPEX_HIT        one-time cost deducted from holders
      APPRECIATION     AVM value drifted up
      DEPRECIATION     AVM value drifted down
      MACRO_EVENT      game-level macro event triggered (see SandboxMacroEvent)
      DEBT_SERVICE     mortgage payment collected from player
      MORTGAGE_DEFAULT forced sale triggered by missed debt service
      ARM_ADJUSTMENT   ARM rate changed this turn
      TURN_START       synthetic event: turn number marker
      TURN_END         synthetic event: turn summary with aggregate stats
    """
    __tablename__ = "sandbox_turn_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(String, ForeignKey("sandbox_games.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    property_id: Mapped[str | None] = mapped_column(String, ForeignKey("sandbox_properties.id"),
                                                     nullable=True)
    player_id: Mapped[str | None] = mapped_column(String, ForeignKey("sandbox_players.id"),
                                                   nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    delta_usdc: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    delta_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    macro_event_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("sandbox_macro_events.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="turn_events")


# ---------------------------------------------------------------------------
# SandboxMortgage
# ---------------------------------------------------------------------------

class SandboxMortgage(Base):
    """
    A debt position held by a player against a property within a game.

    mortgage_type:
      "acquisition"  — taken out at time of purchase (reduces cash needed)
      "refi"         — replaces an existing acquisition mortgage; can cash-out equity
      "heloc"        — revolving home equity line of credit (separate from first lien)
      "heloan"       — fixed-amount home equity loan (lump-sum second lien)

    rate_type:
      "fixed"  — rate stays at origination_rate for the life of the loan
      "arm"    — rate adjusts ±arm_spread each turn based on AVM drift direction,
                 capped at origination_rate ± game.arm_cap

    amortizing (mirrors game setting, can be overridden per mortgage):
      False — interest-only: monthly_payment = balance * current_rate / 12
      True  — amortizing: standard PMT formula, principal pays down each turn

    status:
      "active"          — payments being collected each turn
      "paid_off"        — balance reached 0 (player paid down or sold)
      "defaulted"       — player couldn't make payment; forced sale executed
      "foreclosed"      — alias for defaulted, used when LTV breached
    """
    __tablename__ = "sandbox_mortgages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(
        String, ForeignKey("sandbox_games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[str] = mapped_column(
        String, ForeignKey("sandbox_players.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[str] = mapped_column(
        String, ForeignKey("sandbox_properties.id"), nullable=False
    )

    mortgage_type: Mapped[str] = mapped_column(String, nullable=False)
    # acquisition | refi | heloc | heloan

    # Loan economics
    original_balance: Mapped[float] = mapped_column(Float, nullable=False)
    current_balance: Mapped[float] = mapped_column(Float, nullable=False)
    origination_rate: Mapped[float] = mapped_column(Float, nullable=False)
    # Annual rate at origination (e.g. 0.065 = 6.5%)
    current_rate: Mapped[float] = mapped_column(Float, nullable=False)
    # Tracks ARM adjustments; equals origination_rate for fixed
    rate_type: Mapped[str] = mapped_column(String, nullable=False, default="fixed")
    amortizing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monthly_payment: Mapped[float] = mapped_column(Float, nullable=False)
    # Recomputed each turn for ARM/amortizing. Fixed IO: balance * rate / 12.

    # HELOC-specific: revolving draw state
    credit_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Max drawable balance for HELOC. None for non-HELOC types.
    drawn_balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Current outstanding draw for HELOC. Payments reduce this.

    # Origination metadata
    origination_turn: Mapped[int] = mapped_column(Integer, nullable=False)
    origination_price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    # Property price at time of origination — used for LTV calcs
    closing_cost_paid: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Refi linkage: points to the mortgage it replaced, if any
    replaces_mortgage_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # Lifecycle
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    # active | paid_off | defaulted | foreclosed
    turns_in_arrears: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Grace period counter — defaults after game.grace_turns_before_default

    paid_off_turn: Mapped[int | None] = mapped_column(Integer, nullable=True)
    defaulted_turn: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_interest_paid: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_principal_paid: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="mortgages")
    player: Mapped["SandboxPlayer"] = relationship("SandboxPlayer")
    sandbox_property: Mapped["SandboxProperty"] = relationship("SandboxProperty")


# ---------------------------------------------------------------------------
# SandboxMacroEvent
# ---------------------------------------------------------------------------

class SandboxMacroEvent(Base):
    """
    Game-level macro events that affect the entire property pool for one or more turns.
    Distinct from per-property SandboxTurnEvents.

    macro_type:
      RECESSION          — broad AVM compression + vacancy spike across all properties
      NATURAL_DISASTER   — targeted property destruction (subset by city/state or random)
      POLICY_CHANGE      — zoning / regulatory change: affects rent or resale value
      TAX_HIKE           — property tax increase: monthly expense deducted from yield
      INTEREST_RATE_RISE — central bank hike: ARM rates adjust up, new mortgage rates rise
      INTEREST_RATE_CUT  — central bank cut: ARM rates adjust down, refi activity rises
      HOUSING_BOOM       — across-the-board appreciation surge (counter to recession)
      RENT_CONTROL       — cap on rent increases for N turns in affected markets
      INSURANCE_CRISIS   — insurance cost spike: deducted from all holders' yield

    scope:
      "all"        — affects every property in the game
      "city"       — affects properties matching affected_city
      "state"      — affects properties matching affected_state
      "type"       — affects properties matching affected_property_type

    status:
      "active"   — currently in effect (duration_turns > 0)
      "expired"  — duration exhausted
    """
    __tablename__ = "sandbox_macro_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(
        String, ForeignKey("sandbox_games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    turn_triggered: Mapped[int] = mapped_column(Integer, nullable=False)

    macro_type: Mapped[str] = mapped_column(String, nullable=False)
    # RECESSION | NATURAL_DISASTER | POLICY_CHANGE | TAX_HIKE |
    # INTEREST_RATE_RISE | INTEREST_RATE_CUT | HOUSING_BOOM |
    # RENT_CONTROL | INSURANCE_CRISIS

    headline: Mapped[str] = mapped_column(String, nullable=False)
    # e.g. "Recession hits — property values contract across all markets"
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Full narrative for the game feed

    # Scope targeting
    scope: Mapped[str] = mapped_column(String, default="all", nullable=False)
    affected_city: Mapped[str | None] = mapped_column(String, nullable=True)
    affected_state: Mapped[str | None] = mapped_column(String, nullable=True)
    affected_property_type: Mapped[str | None] = mapped_column(String, nullable=True)

    # Mechanical effects (applied each turn while active)
    price_delta_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Per-turn price adjustment as decimal (e.g. -0.05 = -5%/turn while active)
    rent_delta_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Per-turn rent adjustment (e.g. -0.10 = -10% rent during event)
    vacancy_probability_add: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Added to per-property vacancy roll probability while active
    rate_adjustment: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # ARM and new mortgage rate adjustment while active (e.g. +0.02 = +2%)
    monthly_expense_per_token: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Flat USD deducted from each token-holder's yield per turn (tax hike, insurance)

    # Duration
    duration_turns: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # How many turns the event lasts (1 = single turn; -1 = permanent until game end)
    turns_remaining: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    # active | expired

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="macro_events")


# ---------------------------------------------------------------------------
# SandboxFedDecision
# ---------------------------------------------------------------------------

class SandboxFedDecision(Base):
    """
    One row per Fed meeting that occurred during a game.
    Fed meetings are scheduled at predictable turn intervals (game.fed_meeting_interval)
    but the outcome (hike/cut/hold) and magnitude are determined by RNG at meeting time.

    outcome: "hike" | "cut" | "hold"
    rate_before / rate_after: fed_rate_current before and after this decision
    mortgage_rate_before / mortgage_rate_after: derived = fed_rate + spread
    """
    __tablename__ = "sandbox_fed_decisions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(
        String, ForeignKey("sandbox_games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    outcome: Mapped[str] = mapped_column(String, nullable=False)   # hike | cut | hold
    rate_before: Mapped[float] = mapped_column(Float, nullable=False)
    rate_after: Mapped[float] = mapped_column(Float, nullable=False)
    mortgage_rate_before: Mapped[float] = mapped_column(Float, nullable=False)
    mortgage_rate_after: Mapped[float] = mapped_column(Float, nullable=False)
    move_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    # Basis points moved (positive = hike, negative = cut, 0 = hold)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    # Flavour text headline for the game feed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    game: Mapped["SandboxGame"] = relationship("SandboxGame", back_populates="fed_decisions")
