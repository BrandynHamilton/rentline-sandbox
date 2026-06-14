"""
Sandbox API routes.

Game lifecycle:
  POST   /api/sandbox/games                            create game
  GET    /api/sandbox/games                            list active games
  GET    /api/sandbox/games/{id}                       full game state
  POST   /api/sandbox/games/{id}/join                  join via body {invite_code}
  DELETE /api/sandbox/games/{id}/leave                 leave before start
  POST   /api/sandbox/games/{id}/ready                 toggle ready
  POST   /api/sandbox/games/{id}/advance-turn          host only
  GET    /api/sandbox/games/{id}/feed                  event stream
  GET    /api/sandbox/games/{id}/leaderboard           in-game ranking

Portfolio:
  GET    /api/sandbox/games/{id}/portfolio/{player_id}

Trading:
  POST   /api/sandbox/games/{id}/trade

Property pool:
  GET    /api/sandbox/properties                       public pool
  GET    /api/sandbox/properties/{id}                  detail + price history
  POST   /api/sandbox/properties/sync                  admin only

Admin:
  POST   /api/sandbox/games/{id}/mint-tusdc            admin only

Leaderboard:
  GET    /api/sandbox/leaderboard                      all-time

All routes require Clerk auth except GET endpoints which allow the optional user.
Admin routes additionally require is_admin_request().
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db, is_admin_request
from app.core.logging import logger
from app.services import sandbox_service
from app.services.sandbox_engine import advance_turn
from app.services import sandbox_bot

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clerk_id(request: Request) -> str:
    uid = getattr(request.state, "clerk_user_id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid


def _optional_clerk_id(request: Request) -> str | None:
    return getattr(request.state, "clerk_user_id", None)


def _service_error(e: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))


def _require_self_or_admin(request: Request, db, game_id: str, player_id: str) -> None:
    """
    Enforce that the caller is either the player they're reading about, or an admin.
    Prevents opponents from reading each other's private portfolio/debt/action data.
    Bot players (is_bot=True) are readable by any authenticated player in the same game.
    """
    if is_admin_request(request):
        return
    from app.models.sandbox import SandboxPlayer
    caller_uid = _optional_clerk_id(request)
    if not caller_uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    player = db.get(SandboxPlayer, player_id)
    if not player or player.game_id != game_id:
        raise HTTPException(status_code=404, detail="Player not found")
    # Bot players are readable by anyone in the game
    if getattr(player, "is_bot", False):
        return
    if player.clerk_user_id != caller_uid:
        raise HTTPException(status_code=403, detail="You can only view your own data")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CreateGameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    display_name: str = Field(..., min_length=1, max_length=40,
                               description="Your display name in this game")
    max_turns: int | None = Field(None, ge=1, le=1200,
        description="Max turns. Monthly: 12=1yr, 120=10yr, 1200=100yr. Yearly: 100=100yr.")
    starting_balance_usdc: float | None = Field(None, gt=0)
    property_ids: list[str] | None = None
    turn_duration: Literal["month", "year"] = Field(
        "month",
        description="Each turn represents a month or a year. Affects descriptions only — mechanics are identical."
    )
    turn_duration_seconds: int = Field(
        1800, ge=0, le=86400,
        description="Wall-clock seconds players have to act before turn auto-advances. 0 = no deadline (manual only). Default 1800 = 30 minutes."
    )
    # Debt / mortgage game rules
    ltv_limit: float = Field(0.70, ge=0.1, le=0.95)
    default_rate_type: Literal["fixed", "arm"] = "fixed"
    amortizing: bool = False
    base_mortgage_rate: float | None = Field(None, ge=0.01, le=0.30)
    arm_spread: float = Field(0.005, ge=0, le=0.05)
    arm_cap: float = Field(0.03, ge=0, le=0.10)
    closing_cost_pct: float = Field(0.02, ge=0, le=0.10)
    heloc_spread: float = Field(0.02, ge=0, le=0.10)
    debt_service_default_penalty: float = Field(0.10, ge=0.0, le=0.50)
    judgment_on_shortfall: bool = Field(
        False,
        description=(
            "When True, any deficiency remaining after a player sells a mortgaged property "
            "for less than the loan balance is recorded as a persistent judgment lien that "
            "reduces their NAV for the rest of the game. Default False (shortfall absorbed)."
        )
    )
    # Improvement / PACE config
    upgrade_cost_pct: float = Field(0.08, ge=0.01, le=0.30,
        description="Cost per grade step as % of property price (default 8%)")
    improvement_value_add_pct: float = Field(0.05, ge=0.0, le=0.20,
        description="One-time price bump per grade step on improvement (default 5%)")
    pace_spread: float = Field(0.015, ge=0.0, le=0.10,
        description="PACE lien rate = base_mortgage_rate + pace_spread (default +1.5%)")
    # Fed rate cycle
    fed_meeting_interval: int = Field(6, ge=0, le=20,
                                       description="Turns between Fed meetings. 0 = disabled.")
    fed_rate_current: float = Field(0.055, ge=0.0, le=0.25)
    fed_mortgage_spread: float = Field(0.020, ge=0.0, le=0.10)
    fed_hike_prob: float = Field(0.30, ge=0.0, le=1.0)
    fed_cut_prob: float = Field(0.25, ge=0.0, le=1.0)
    fed_move_magnitude_min: float = Field(0.0025, ge=0.0, le=0.02)
    fed_move_magnitude_max: float = Field(0.0050, ge=0.0, le=0.05)
    # Autonomous mode — can be enabled at creation time
    auto_advance: bool = Field(False, description="Start autonomous mode immediately after game creation")
    auto_advance_delay_seconds: int = Field(
        30, ge=5, le=3600,
        description="Seconds between automatic turn advances when auto_advance=True (5–3600)"
    )
    # Bot players to add at game creation
    bots: list["BotSpec"] | None = Field(
        None,
        description="Optional list of bot players to add immediately after game creation."
    )


class BotSpec(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=40)
    strategy: str = Field("balanced")
    personality: str | None = None


CreateGameRequest.model_rebuild()


class JoinGameRequest(BaseModel):
    invite_code: str
    display_name: str = Field(..., min_length=1, max_length=40)
    wallet_address: str | None = None


class TradeRequest(BaseModel):
    property_id: str
    direction: Literal["buy", "sell"]
    tokens: float = Field(..., gt=0)


class MintRequest(BaseModel):
    player_id: str
    amount: float = Field(..., gt=0)


class OriginateMortgageRequest(BaseModel):
    property_id: str
    tokens_to_buy: float = Field(..., gt=0)
    rate_type: Literal["fixed", "arm"] | None = None


class RefiRequest(BaseModel):
    property_id: str
    cash_out_amount: float = Field(0.0, ge=0)
    new_rate_type: Literal["fixed", "arm"] | None = None


class HelocDrawRequest(BaseModel):
    property_id: str
    draw_amount: float = Field(..., gt=0)


class HelocRepayRequest(BaseModel):
    property_id: str
    repay_amount: float = Field(..., gt=0)


class PrepayPrincipalRequest(BaseModel):
    property_id: str
    amount: float = Field(..., gt=0, description="Amount to prepay against principal")
    mortgage_type: Literal["acquisition", "refi", "heloc", "first_lien", "pace", "mechanics_lien"] = Field(
        "first_lien",
        description=(
            "Which lien to target. 'first_lien' (default) targets whichever of "
            "'acquisition' or 'refi' is active. Use 'heloc' to prepay a HELOC draw, "
            "'pace' for a PACE lien, or 'mechanics_lien' to pay off a contractor lien."
        ),
    )


class ImprovePropertyRequest(BaseModel):
    property_id: str
    target_grade: Literal["A", "B", "C", "D"] = Field(
        ...,
        description="Target grade after improvement. Must be higher than the current grade.",
    )


class PaceLienRequest(BaseModel):
    property_id: str
    target_grade: Literal["A", "B", "C", "D"] = Field(
        ...,
        description="Target grade. PACE finances the full improvement cost — no cash required.",
    )


class AddBotRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=40)
    strategy: str = Field(
        "balanced",
        description="Bot investment strategy: aggressive | conservative | balanced | momentum | income"
    )
    personality: str | None = Field(
        None, max_length=80,
        description="Optional flavour name for the bot, e.g. 'Warren Buffett'"
    )


class AutonomousRequest(BaseModel):
    delay_seconds: int = Field(
        30, ge=5, le=3600,
        description="Seconds between automatic turn advances (5–3600, default 30)"
    )


class DelegateRequest(BaseModel):
    agent_delegate: bool = Field(
        ...,
        description="True = opt in to agent delegation; False = opt out"
    )
    delegate_strategy: str | None = Field(
        None,
        description=(
            "Bot strategy to use when acting as your delegate. "
            "One of: aggressive | conservative | balanced | momentum | income. "
            "Defaults to 'balanced' if not set."
        ),
    )


# ---------------------------------------------------------------------------
# Game lifecycle
# ---------------------------------------------------------------------------

# ── Presets (static path must be registered before /games/{game_id}) ─────────

_GAME_PRESETS: dict[str, dict] = {
    "quick": {
        "description": "Fast 6-turn game with 5 properties and high Fed volatility.",
        "max_turns": 6,
        "fed_meeting_interval": 2,
        "fed_hike_prob": 0.45,
        "fed_cut_prob": 0.35,
        "fed_move_magnitude_max": 0.0100,
    },
    "standard": {
        "description": "Default 12-turn game with all properties and balanced settings.",
        "max_turns": 12,
    },
    "leveraged": {
        "description": "12-turn game with ARM-default mortgages, 80% LTV, and amortizing loans.",
        "max_turns": 12,
        "default_rate_type": "arm",
        "ltv_limit": 0.80,
        "amortizing": True,
    },
    "distressed": {
        "description": "12-turn game with only D/F grade properties, judgment liens enabled.",
        "max_turns": 12,
        "judgment_on_shortfall": True,
    },
    "long_run": {
        "description": "120-turn (10-year monthly) simulation with conservative Fed settings.",
        "max_turns": 120,
        "turn_duration": "month",
        "fed_meeting_interval": 6,
        "turn_duration_seconds": 300,
    },
}


class PresetGameRequest(BaseModel):
    preset: str = Field(..., description=f"Preset name. Options: {', '.join(_GAME_PRESETS)}")
    name: str = Field(..., min_length=1, max_length=80)
    display_name: str = Field(..., min_length=1, max_length=40)
    starting_balance_usdc: float | None = Field(None, gt=0)
    bots: list["BotSpec"] | None = None


@router.post("/games/from-preset", status_code=201)
async def create_game_from_preset(
    body: PresetGameRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Create a game from a named preset. Presets are opinionated configurations
    that can be further customised via the optional override fields.

    Available presets: quick, standard, leveraged, distressed, long_run
    """
    if body.preset not in _GAME_PRESETS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown preset {body.preset!r}. Available: {', '.join(_GAME_PRESETS)}"
        )
    preset = dict(_GAME_PRESETS[body.preset])
    preset.pop("description", None)

    property_ids: list[str] | None = None
    if body.preset == "distressed":
        from app.models.sandbox import SandboxProperty
        from app.services.sandbox_engine import _cap_rate_to_grade
        df_props = [
            p for p in db.query(SandboxProperty).filter(SandboxProperty.is_active == True).all()
            if (getattr(p, "initial_grade", None) or _cap_rate_to_grade(p.cap_rate)) in ("D", "F")
        ]
        if df_props:
            property_ids = [p.id for p in df_props]

    clerk_user_id = _clerk_id(request)
    try:
        game = sandbox_service.create_game(
            db=db,
            clerk_user_id=clerk_user_id,
            display_name=body.display_name,
            name=body.name,
            starting_balance_usdc=body.starting_balance_usdc,
            property_ids=property_ids,
            **preset,
        )
    except ValueError as e:
        raise _service_error(e)

    if body.bots:
        from app.services.sandbox_bot import add_bot
        for bot_spec in body.bots:
            add_bot(db, game, display_name=bot_spec.display_name,
                    strategy=bot_spec.strategy, personality=bot_spec.personality)
        db.refresh(game)

    return {**_game_response(db, game), "preset": body.preset}


@router.post("/games", status_code=201)
async def create_game(
    body: CreateGameRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    clerk_user_id = _clerk_id(request)
    try:
        game = sandbox_service.create_game(
            db=db,
            clerk_user_id=clerk_user_id,
            display_name=body.display_name,
            name=body.name,
            max_turns=body.max_turns,
            starting_balance_usdc=body.starting_balance_usdc,
            property_ids=body.property_ids,
            turn_duration=body.turn_duration,
            turn_duration_seconds=body.turn_duration_seconds,
            ltv_limit=body.ltv_limit,
            default_rate_type=body.default_rate_type,
            amortizing=body.amortizing,
            base_mortgage_rate=body.base_mortgage_rate,
            arm_spread=body.arm_spread,
            arm_cap=body.arm_cap,
            closing_cost_pct=body.closing_cost_pct,
            heloc_spread=body.heloc_spread,
            debt_service_default_penalty=body.debt_service_default_penalty,
            judgment_on_shortfall=body.judgment_on_shortfall,
            upgrade_cost_pct=body.upgrade_cost_pct,
            improvement_value_add_pct=body.improvement_value_add_pct,
            pace_spread=body.pace_spread,
            fed_meeting_interval=body.fed_meeting_interval,
            fed_rate_current=body.fed_rate_current,
            fed_mortgage_spread=body.fed_mortgage_spread,
            fed_hike_prob=body.fed_hike_prob,
            fed_cut_prob=body.fed_cut_prob,
            fed_move_magnitude_min=body.fed_move_magnitude_min,
            fed_move_magnitude_max=body.fed_move_magnitude_max,
        )
    except ValueError as e:
        raise _service_error(e)

    # Optionally seed bot players in the same request
    if body.bots:
        for spec in body.bots:
            try:
                sandbox_bot.add_bot(
                    db, game,
                    display_name=spec.display_name,
                    strategy=spec.strategy,
                    personality=spec.personality,
                )
            except ValueError as e:
                raise _service_error(e)

    # Optionally start autonomous mode immediately
    if body.auto_advance:
        from app.services.sandbox_runner import enable_autonomous
        try:
            game = enable_autonomous(db, game.id, delay_seconds=body.auto_advance_delay_seconds)
        except ValueError as e:
            raise _service_error(e)

    return _game_response(db, game)


@router.get("/games")
async def list_games(
    request: Request,
    db: Session = Depends(get_db),
):
    games = sandbox_service.list_active_games(db)
    return [_game_summary(g) for g in games]


@router.get("/games/{game_id}")
async def get_game(
    game_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return _game_response(db, game)


@router.post("/games/{game_id}/join", status_code=201)
async def join_game(
    game_id: str,
    body: JoinGameRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    clerk_user_id = _clerk_id(request)
    try:
        game, player = sandbox_service.join_game(
            db=db,
            invite_code=body.invite_code,
            clerk_user_id=clerk_user_id,
            display_name=body.display_name,
            wallet_address=body.wallet_address,
        )
    except ValueError as e:
        raise _service_error(e)
    return {"player_id": player.id, "game_id": game.id, "invite_code": game.invite_code}


@router.delete("/games/{game_id}/leave", status_code=204)
async def leave_game(
    game_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    clerk_user_id = _clerk_id(request)
    try:
        sandbox_service.leave_game(db, game_id, clerk_user_id)
    except ValueError as e:
        raise _service_error(e)


@router.post("/games/{game_id}/ready")
async def mark_ready(
    game_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    clerk_user_id = _clerk_id(request)
    try:
        player = sandbox_service.mark_ready(db, game_id, clerk_user_id)
    except ValueError as e:
        raise _service_error(e)
    return {"player_id": player.id, "is_ready": player.is_ready}


@router.post("/games/{game_id}/advance-turn")
async def advance_game_turn(
    game_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Host only. Advance the game by one turn (runs all 5 engine phases)."""
    clerk_user_id = _clerk_id(request)

    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Verify caller is the host
    from app.models.sandbox import SandboxPlayer
    host = (
        db.query(SandboxPlayer)
        .filter(
            SandboxPlayer.game_id == game_id,
            SandboxPlayer.clerk_user_id == clerk_user_id,
            SandboxPlayer.is_host == True,
        )
        .first()
    )
    if not host and not is_admin_request(request):
        raise HTTPException(status_code=403, detail="Only the game host can advance the turn")

    try:
        # Run agent delegation for idle human players before advancing
        if game.status == "trading":
            sandbox_bot.run_delegated_players(db, game)
        game = advance_turn(db, game)
    except ValueError as e:
        raise _service_error(e)
    except Exception as e:
        logger.error(f"advance_turn failed for game {game_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Turn advance failed — try again")

    # Run all bot players now that the trade window is open
    sandbox_bot.run_all_bots(db, game)

    return {
        "game_id": game.id,
        "current_turn": game.current_turn,
        "status": game.status,
        "max_turns": game.max_turns,
    }


@router.get("/games/{game_id}/feed")
async def get_feed(
    game_id: str,
    request: Request,
    db: Session = Depends(get_db),
    turn: int | None = Query(None, description="Filter by turn number"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        events = sandbox_service.get_feed(db, game_id, turn=turn, skip=skip, limit=limit)
    except ValueError as e:
        raise _service_error(e)
    return [_event_dict(e) for e in events]


@router.get("/games/{game_id}/leaderboard")
async def game_leaderboard(
    game_id: str,
    db: Session = Depends(get_db),
):
    try:
        rows = sandbox_service.get_game_leaderboard(db, game_id)
    except ValueError as e:
        raise _service_error(e)
    return rows


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

@router.get("/games/{game_id}/portfolio/{player_id}")
async def get_portfolio(
    game_id: str,
    player_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_self_or_admin(request, db, game_id, player_id)
    try:
        portfolio = sandbox_service.get_portfolio(db, game_id, player_id)
    except ValueError as e:
        raise _service_error(e)
    return portfolio


# ---------------------------------------------------------------------------
# Trading
# ---------------------------------------------------------------------------

@router.post("/games/{game_id}/trade", status_code=201)
async def trade(
    game_id: str,
    body: TradeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    clerk_user_id = _clerk_id(request)
    try:
        tx = sandbox_service.execute_trade(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            direction=body.direction,
            tokens=body.tokens,
        )
    except ValueError as e:
        raise _service_error(e)
    return {
        "transaction_id": tx.id,
        "type": tx.type,
        "property_id": tx.property_id,
        "tokens": tx.tokens,
        "amount_usdc": tx.amount_usdc,
        "price_per_token_usd": tx.price_per_token_usd,
        "turn": tx.turn,
    }


# ---------------------------------------------------------------------------
# Property pool
# ---------------------------------------------------------------------------

@router.get("/properties")
async def list_properties(
    db: Session = Depends(get_db),
    active_only: bool = Query(True),
):
    props = sandbox_service.list_pool_properties(db, active_only=active_only)
    return [_prop_summary(p) for p in props]


@router.post("/properties/sync")
async def sync_properties(
    request: Request,
    db: Session = Depends(get_db),
):
    """Admin only: pull property pool from rwa-issuer-sim."""
    if not is_admin_request(request):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        result = sandbox_service.sync_property_pool(db)
    except ValueError as e:
        raise _service_error(e)
    return result


@router.get("/properties/{property_id}")
async def get_property(
    property_id: str,
    db: Session = Depends(get_db),
):
    try:
        detail = sandbox_service.get_property_detail(db, property_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return detail


# ---------------------------------------------------------------------------
# Admin — mint tUSDC
# ---------------------------------------------------------------------------

@router.post("/games/{game_id}/mint-tusdc")
async def mint_tusdc(
    game_id: str,
    body: MintRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Admin only: allocate additional tUSDC to a player."""
    if not is_admin_request(request):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        player = sandbox_service.mint_tusdc(db, game_id, body.player_id, body.amount)
    except ValueError as e:
        raise _service_error(e)
    return {"player_id": player.id, "usdc_balance": player.usdc_balance}


# ---------------------------------------------------------------------------
# Bot players
# ---------------------------------------------------------------------------

@router.post("/games/{game_id}/bots", status_code=201)
async def add_bot(
    game_id: str,
    body: AddBotRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Add an LLM-driven bot player to a game (lobby status only).
    Requires admin key or the game host's Clerk session.
    """
    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Allow host or admin
    clerk_user_id = _optional_clerk_id(request)
    is_admin = is_admin_request(request)
    if not is_admin:
        if not clerk_user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        from app.models.sandbox import SandboxPlayer
        host = db.query(SandboxPlayer).filter(
            SandboxPlayer.game_id == game_id,
            SandboxPlayer.clerk_user_id == clerk_user_id,
            SandboxPlayer.is_host == True,
        ).first()
        if not host:
            raise HTTPException(status_code=403, detail="Only the game host can add bots")

    try:
        bot = sandbox_bot.add_bot(
            db, game,
            display_name=body.display_name,
            strategy=body.strategy,
            personality=body.personality,
        )
    except ValueError as e:
        raise _service_error(e)

    return {
        "player_id": bot.id,
        "display_name": bot.display_name,
        "strategy": bot.bot_strategy,
        "personality": bot.bot_personality,
        "is_bot": True,
    }


@router.delete("/games/{game_id}/bots/{bot_player_id}", status_code=204)
async def remove_bot(
    game_id: str,
    bot_player_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Remove a bot player from a game (lobby only). Host or admin."""
    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    clerk_user_id = _optional_clerk_id(request)
    is_admin = is_admin_request(request)
    if not is_admin:
        if not clerk_user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        from app.models.sandbox import SandboxPlayer
        host = db.query(SandboxPlayer).filter(
            SandboxPlayer.game_id == game_id,
            SandboxPlayer.clerk_user_id == clerk_user_id,
            SandboxPlayer.is_host == True,
        ).first()
        if not host:
            raise HTTPException(status_code=403, detail="Only the game host can remove bots")

    try:
        sandbox_bot.remove_bot(db, game_id, bot_player_id)
    except ValueError as e:
        raise _service_error(e)


# ---------------------------------------------------------------------------
# Autonomous mode
# ---------------------------------------------------------------------------

@router.post("/games/{game_id}/autonomous", status_code=200)
async def start_autonomous(
    game_id: str,
    body: AutonomousRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Enable autonomous mode. The game will advance turns automatically at the
    specified interval without requiring manual advance-turn calls.

    The caller must be the game host or an admin.
    All human players are immediately marked ready so the first turn advances
    without waiting.

    Typically used with all-bot games: create a game with bots, then call this
    to let it play to completion hands-free.
    """
    from app.services import sandbox_runner

    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    clerk_user_id = _optional_clerk_id(request)
    is_admin = is_admin_request(request)
    if not is_admin:
        if not clerk_user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        from app.models.sandbox import SandboxPlayer
        host = db.query(SandboxPlayer).filter(
            SandboxPlayer.game_id == game_id,
            SandboxPlayer.clerk_user_id == clerk_user_id,
            SandboxPlayer.is_host == True,
        ).first()
        if not host:
            raise HTTPException(status_code=403, detail="Only the game host can enable autonomous mode")

    try:
        game = sandbox_runner.enable_autonomous(db, game_id, delay_seconds=body.delay_seconds)
    except ValueError as e:
        raise _service_error(e)

    return {
        "game_id": game.id,
        "auto_advance": game.auto_advance,
        "auto_advance_delay_seconds": game.auto_advance_delay_seconds,
        "status": game.status,
        "current_turn": game.current_turn,
        "max_turns": game.max_turns,
        "message": (
            f"Autonomous mode enabled. Turns will advance every "
            f"{game.auto_advance_delay_seconds}s until turn {game.max_turns}."
        ),
    }


@router.delete("/games/{game_id}/autonomous", status_code=200)
async def stop_autonomous(
    game_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Disable autonomous mode. The game will pause and wait for manual advance-turn calls.
    """
    from app.services import sandbox_runner

    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    clerk_user_id = _optional_clerk_id(request)
    is_admin = is_admin_request(request)
    if not is_admin:
        if not clerk_user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        from app.models.sandbox import SandboxPlayer
        host = db.query(SandboxPlayer).filter(
            SandboxPlayer.game_id == game_id,
            SandboxPlayer.clerk_user_id == clerk_user_id,
            SandboxPlayer.is_host == True,
        ).first()
        if not host:
            raise HTTPException(status_code=403, detail="Only the game host can disable autonomous mode")

    try:
        game = sandbox_runner.disable_autonomous(db, game_id)
    except ValueError as e:
        raise _service_error(e)

    return {
        "game_id": game.id,
        "auto_advance": game.auto_advance,
        "status": game.status,
        "current_turn": game.current_turn,
        "message": "Autonomous mode disabled. Use advance-turn to continue manually.",
    }


@router.post("/games/{game_id}/delegate", status_code=200)
async def set_delegate(
    game_id: str,
    body: DelegateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Opt in (or out) of agent delegation for the calling player.

    When agent_delegate=True, an LLM agent will act on your behalf during any
    turn where you have not traded, taken out a mortgage, drawn/repaid a HELOC,
    or marked yourself ready before the turn advances.

    Delegation fires both in autonomous mode (before the timer-triggered advance)
    and when the host manually calls advance-turn.
    """
    from app.models.sandbox import SandboxPlayer

    clerk_user_id = _clerk_id(request)
    game = sandbox_service.get_game(db, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    player = (
        db.query(SandboxPlayer)
        .filter(
            SandboxPlayer.game_id == game_id,
            SandboxPlayer.clerk_user_id == clerk_user_id,
        )
        .first()
    )
    if not player:
        raise HTTPException(status_code=404, detail="You are not in this game")

    valid_strategies = ["aggressive", "conservative", "balanced", "momentum", "income"]
    if body.delegate_strategy and body.delegate_strategy not in valid_strategies:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid delegate_strategy. Choose from: {valid_strategies}"
        )

    player.agent_delegate = body.agent_delegate
    if body.delegate_strategy:
        player.delegate_strategy = body.delegate_strategy
    elif not player.delegate_strategy:
        player.delegate_strategy = "balanced"
    db.commit()
    db.refresh(player)

    return {
        "player_id": player.id,
        "agent_delegate": player.agent_delegate,
        "delegate_strategy": player.delegate_strategy,
        "message": (
            f"Agent delegation {'enabled' if player.agent_delegate else 'disabled'}. "
            + (f"Strategy: {player.delegate_strategy}." if player.agent_delegate else "")
        ),
    }


# ---------------------------------------------------------------------------
# Mortgage — originate, refi, HELOC
# ---------------------------------------------------------------------------

@router.post("/games/{game_id}/mortgage", status_code=201)
async def originate_mortgage(
    game_id: str,
    body: OriginateMortgageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Originate an acquisition mortgage. Executes the leveraged BUY simultaneously.
    Player pays down_payment + closing_costs in cash; rest is financed.
    """
    clerk_user_id = _clerk_id(request)
    try:
        mtg, tx = sandbox_service.originate_mortgage(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            tokens_to_buy=body.tokens_to_buy,
            rate_type=body.rate_type,
        )
    except ValueError as e:
        raise _service_error(e)
    return _mortgage_dict(mtg)


@router.post("/games/{game_id}/refi", status_code=201)
async def refi_mortgage(
    game_id: str,
    body: RefiRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Refinance the existing first lien on a property.
    cash_out_amount=0 → rate-and-term refi (reset rate, no cash).
    cash_out_amount>0 → cash-out refi (net proceeds after closing costs to player balance).
    """
    clerk_user_id = _clerk_id(request)
    try:
        mtg = sandbox_service.refi_mortgage(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            cash_out_amount=body.cash_out_amount,
            new_rate_type=body.new_rate_type,
        )
    except ValueError as e:
        raise _service_error(e)
    return _mortgage_dict(mtg)


@router.post("/games/{game_id}/heloc/draw", status_code=201)
async def draw_heloc(
    game_id: str,
    body: HelocDrawRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Draw from a HELOC. Opens a new HELOC if none exists for this player+property.
    Proceeds credited to player usdc_balance immediately.
    """
    clerk_user_id = _clerk_id(request)
    try:
        heloc = sandbox_service.draw_heloc(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            draw_amount=body.draw_amount,
        )
    except ValueError as e:
        raise _service_error(e)
    return _mortgage_dict(heloc)


@router.post("/games/{game_id}/heloc/repay")
async def repay_heloc(
    game_id: str,
    body: HelocRepayRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Repay drawn HELOC balance. Reduces interest cost for future turns."""
    clerk_user_id = _clerk_id(request)
    try:
        heloc = sandbox_service.repay_heloc(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            repay_amount=body.repay_amount,
        )
    except ValueError as e:
        raise _service_error(e)
    return _mortgage_dict(heloc)


@router.post("/games/{game_id}/prepay-principal")
async def prepay_principal(
    game_id: str,
    body: PrepayPrincipalRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Make a partial or full principal prepayment against an active mortgage.

    Reduces the loan balance immediately, recalculates the monthly payment,
    and marks the mortgage paid_off if the balance reaches zero.
    Works for interest-only and amortizing loans, and for HELOCs.
    """
    clerk_user_id = _clerk_id(request)
    try:
        mtg = sandbox_service.prepay_principal(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            amount=body.amount,
            mortgage_type=body.mortgage_type,
        )
    except ValueError as e:
        raise _service_error(e)
    return _mortgage_dict(mtg)


@router.post("/games/{game_id}/improve-property")
async def improve_property(
    game_id: str,
    body: ImprovePropertyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Fund a property grade upgrade out of pocket (cash-funded, no financing).

    Cost = steps × upgrade_cost_pct × current_price.
    Price bumps immediately. Rent improves next turn via grade multipliers.
    If cash after improvement is below 2× monthly debt service, a mechanics
    lien risk flag is set — the engine may trigger a MECHANICS_LIEN event next turn.
    """
    clerk_user_id = _clerk_id(request)
    try:
        result = sandbox_service.improve_property(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            target_grade=body.target_grade,
        )
    except ValueError as e:
        raise _service_error(e)
    return result


@router.post("/games/{game_id}/pace-lien")
async def originate_pace_lien(
    game_id: str,
    body: PaceLienRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Finance a property grade upgrade via a PACE lien (no down payment required).

    Loan amount = steps × upgrade_cost_pct × current_price.
    Rate = base_mortgage_rate + pace_spread.
    Grade and price improve immediately. Loan serviced via debt service each turn.
    Blocks refi until PACE lien is paid off or refinanced.
    """
    clerk_user_id = _clerk_id(request)
    try:
        mtg, summary = sandbox_service.originate_pace_lien(
            db=db,
            game_id=game_id,
            clerk_user_id=clerk_user_id,
            property_id=body.property_id,
            target_grade=body.target_grade,
        )
    except ValueError as e:
        raise _service_error(e)
    return {**_mortgage_dict(mtg), **summary}


@router.get("/games/{game_id}/debt/{player_id}")
async def get_debt_summary(
    game_id: str,
    player_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """All mortgages (active and historical) for a player in a game."""
    _require_self_or_admin(request, db, game_id, player_id)
    try:
        return sandbox_service.get_debt_summary(db, game_id, player_id)
    except ValueError as e:
        raise _service_error(e)


# ---------------------------------------------------------------------------
# Fed history
# ---------------------------------------------------------------------------

@router.get("/games/{game_id}/fed")
async def fed_history(
    game_id: str,
    db: Session = Depends(get_db),
):
    """FOMC decision history for the game — all rate moves, statements, and mortgage rate changes."""
    try:
        return sandbox_service.get_fed_history(db, game_id)
    except ValueError as e:
        raise _service_error(e)


# ---------------------------------------------------------------------------
# Global leaderboard
# ---------------------------------------------------------------------------

@router.get("/leaderboard")
async def global_leaderboard(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    return sandbox_service.get_global_leaderboard(db, limit=limit)


# ── Market summary ────────────────────────────────────────────────────────────

@router.get("/games/{game_id}/market-summary")
async def market_summary(
    game_id: str,
    db: Session = Depends(get_db),
):
    """All properties in a game with live cap rate, grade, price delta, and lien status."""
    try:
        return sandbox_service.get_market_summary(db, game_id)
    except ValueError as e:
        raise _service_error(e)


# ── Player action log ─────────────────────────────────────────────────────────

@router.get("/games/{game_id}/players/{player_id}/actions")
async def player_actions(
    game_id: str,
    player_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    turn: int | None = Query(None),
):
    """Human-readable transaction timeline for a player."""
    _require_self_or_admin(request, db, game_id, player_id)
    try:
        return sandbox_service.get_player_actions(db, game_id, player_id, limit=limit, turn=turn)
    except ValueError as e:
        raise _service_error(e)


# ── Spectator view (public, no auth) ─────────────────────────────────────────

@router.get("/games/{game_id}/spectate")
async def spectate(
    game_id: str,
    db: Session = Depends(get_db),
):
    """
    Public game snapshot — no authentication required.
    Returns leaderboard, recent feed, and property prices.
    """
    try:
        return sandbox_service.get_spectate(db, game_id)
    except ValueError as e:
        raise _service_error(e)






# ---------------------------------------------------------------------------

def _game_summary(game) -> dict:
    return {
        "id": game.id,
        "name": game.name,
        "status": game.status,
        "current_turn": game.current_turn,
        "max_turns": game.max_turns,
        "invite_code": game.invite_code,
        "player_count": len(game.players),
        "created_by": game.created_by,
        "started_at": game.started_at.isoformat() if game.started_at else None,
        "ended_at": game.ended_at.isoformat() if game.ended_at else None,
        "created_at": game.created_at.isoformat(),
        "auto_advance": getattr(game, "auto_advance", False),
        "auto_advance_delay_seconds": getattr(game, "auto_advance_delay_seconds", 30),
        "turn_duration": getattr(game, "turn_duration", "month"),
        "turn_duration_seconds": getattr(game, "turn_duration_seconds", 1800),
        "turn_started_at": game.turn_started_at.isoformat() if getattr(game, "turn_started_at", None) else None,
        "judgment_on_shortfall": getattr(game, "judgment_on_shortfall", False),
    }


def _game_response(db: Session, game) -> dict:
    from app.models.sandbox import SandboxPlayer, SandboxGameProperty
    players = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).all()
    game_props = db.query(SandboxGameProperty).filter(SandboxGameProperty.game_id == game.id).all()

    return {
        **_game_summary(game),
        "starting_balance_usdc": game.starting_balance_usdc,
        "players": [_player_dict(p) for p in players],
        "properties": [_game_prop_dict(gp) for gp in game_props],
    }


def _player_dict(p) -> dict:
    return {
        "id": p.id,
        "clerk_user_id": p.clerk_user_id,
        "display_name": p.display_name,
        "usdc_balance": p.usdc_balance,
        "wallet_address": p.wallet_address,
        "is_ready": p.is_ready,
        "is_host": p.is_host,
        "is_bot": getattr(p, "is_bot", False),
        "bot_strategy": getattr(p, "bot_strategy", None),
        "bot_personality": getattr(p, "bot_personality", None),
        "judgment_balance": getattr(p, "judgment_balance", 0.0),
        "joined_at": p.joined_at.isoformat(),
    }


def _game_prop_dict(gp) -> dict:
    prop = gp.sandbox_property
    return {
        "id": gp.id,
        "property_id": gp.property_id,
        "name": prop.name if prop else None,
        "display_address": prop.display_address if prop else None,
        "current_price_usd": gp.current_price_usd,
        "current_rent_usd": gp.current_rent_usd,
        "grade": getattr(gp, "grade", "C"),
        "mechanics_lien_amount": getattr(gp, "mechanics_lien_amount", 0.0),
        "cap_rate": prop.cap_rate if prop else None,
        "image_url": prop.image_url if prop else None,
        "token_address": prop.token_address if prop else None,
    }


def _prop_summary(p) -> dict:
    return {
        "id": p.id,
        "geo_id": p.geo_id,
        "name": p.name,
        "display_address": p.display_address,
        "city": p.city,
        "state": p.state,
        "property_type": p.property_type,
        "initial_price_usd": p.initial_price_usd,
        "monthly_rent_usd": p.monthly_rent_usd,
        "cap_rate": p.cap_rate,
        "image_url": p.image_url,
        "token_address": p.token_address,
        "is_active": p.is_active,
    }


def _event_dict(e) -> dict:
    return {
        "id": e.id,
        "turn": e.turn,
        "event_type": e.event_type,
        "property_id": e.property_id,
        "player_id": e.player_id,
        "description": e.description,
        "delta_usdc": e.delta_usdc,
        "delta_pct": e.delta_pct,
        "macro_event_id": getattr(e, "macro_event_id", None),
        "created_at": e.created_at.isoformat(),
    }


def _mortgage_dict(m) -> dict:
    return {
        "id": m.id,
        "mortgage_type": m.mortgage_type,
        "property_id": m.property_id,
        "status": m.status,
        "original_balance": m.original_balance,
        "current_balance": m.current_balance,
        "origination_rate": m.origination_rate,
        "current_rate": m.current_rate,
        "rate_type": m.rate_type,
        "amortizing": m.amortizing,
        "monthly_payment": m.monthly_payment,
        "credit_limit": m.credit_limit,
        "drawn_balance": m.drawn_balance,
        "closing_cost_paid": m.closing_cost_paid,
        "turns_in_arrears": m.turns_in_arrears,
        "origination_turn": m.origination_turn,
        "origination_price_usd": m.origination_price_usd,
        "total_interest_paid": m.total_interest_paid,
        "total_principal_paid": m.total_principal_paid,
    }
