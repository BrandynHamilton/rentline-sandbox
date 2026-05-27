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


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CreateGameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    display_name: str = Field(..., min_length=1, max_length=40,
                               description="Your display name in this game")
    max_turns: int | None = Field(None, ge=3, le=50)
    starting_balance_usdc: float | None = Field(None, gt=0)
    property_ids: list[str] | None = None
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
    # Fed rate cycle
    fed_meeting_interval: int = Field(6, ge=0, le=20,
                                       description="Turns between Fed meetings. 0 = disabled.")
    fed_rate_current: float = Field(0.055, ge=0.0, le=0.25)
    fed_mortgage_spread: float = Field(0.020, ge=0.0, le=0.10)
    fed_hike_prob: float = Field(0.30, ge=0.0, le=1.0)
    fed_cut_prob: float = Field(0.25, ge=0.0, le=1.0)
    fed_move_magnitude_min: float = Field(0.0025, ge=0.0, le=0.02)
    fed_move_magnitude_max: float = Field(0.0050, ge=0.0, le=0.05)


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


# ---------------------------------------------------------------------------
# Game lifecycle
# ---------------------------------------------------------------------------

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
            ltv_limit=body.ltv_limit,
            default_rate_type=body.default_rate_type,
            amortizing=body.amortizing,
            base_mortgage_rate=body.base_mortgage_rate,
            arm_spread=body.arm_spread,
            arm_cap=body.arm_cap,
            closing_cost_pct=body.closing_cost_pct,
            heloc_spread=body.heloc_spread,
            debt_service_default_penalty=body.debt_service_default_penalty,
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
        game = advance_turn(db, game)
    except ValueError as e:
        raise _service_error(e)
    except Exception as e:
        logger.error(f"advance_turn failed for game {game_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Turn advance failed — try again")

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
    db: Session = Depends(get_db),
):
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


@router.get("/games/{game_id}/debt/{player_id}")
async def get_debt_summary(
    game_id: str,
    player_id: str,
    db: Session = Depends(get_db),
):
    """All mortgages (active and historical) for a player in a game."""
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


# ---------------------------------------------------------------------------
# Response serialisation helpers
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
