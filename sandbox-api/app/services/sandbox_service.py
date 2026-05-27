"""
sandbox_service.py — all business logic outside the turn engine.

  create_game()          create a new game room, seed game_properties
  get_game()             fetch full game state
  join_game()            add a player via invite_code
  leave_game()           remove a player before game starts
  mark_ready()           player flags ready for next turn
  execute_trade()        BUY or SELL fractional tokens
  originate_mortgage()   acquisition loan at time of purchase
  refi_mortgage()        replace existing first lien; optional cash-out
  draw_heloc()           draw from a home equity line of credit
  repay_heloc()          repay drawn HELOC balance
  get_debt_summary()     all active mortgages for a player in a game
  get_portfolio()        player holdings with current P&L + leverage metrics
  get_leaderboard()      all-time or in-game ranking by NAV
  list_active_games()    lobby listing
  sync_property_pool()   admin: pull properties from rwa-issuer-sim
  mint_tusdc()           admin: allocate starting balance to a player
  list_pool_properties() public property pool
  get_property_detail()  property + per-turn price history
  get_fed_history()      Fed decision history for a game
"""

import math
import uuid
from datetime import datetime
from typing import Literal

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.models.sandbox import (
    SandboxFedDecision,
    SandboxGame,
    SandboxGameProperty,
    SandboxHolding,
    SandboxMortgage,
    SandboxPlayer,
    SandboxProperty,
    SandboxTransaction,
    SandboxTurnEvent,
)
from app.services.sandbox_engine import _compute_nav


# ---------------------------------------------------------------------------
# Game lifecycle
# ---------------------------------------------------------------------------

def create_game(
    db: Session,
    clerk_user_id: str,
    display_name: str,
    name: str,
    max_turns: int | None = None,
    starting_balance_usdc: float | None = None,
    property_ids: list[str] | None = None,
    # Debt / mortgage config
    ltv_limit: float = 0.70,
    default_rate_type: str = "fixed",
    amortizing: bool = False,
    base_mortgage_rate: float | None = None,      # if None, derived from Fed rate + spread
    arm_spread: float = 0.005,
    arm_cap: float = 0.03,
    closing_cost_pct: float = 0.02,
    heloc_spread: float = 0.02,
    debt_service_default_penalty: float = 0.10,
    # Fed rate cycle config
    fed_meeting_interval: int = 6,
    fed_rate_current: float = 0.055,
    fed_mortgage_spread: float = 0.020,
    fed_hike_prob: float = 0.30,
    fed_cut_prob: float = 0.25,
    fed_move_magnitude_min: float = 0.0025,
    fed_move_magnitude_max: float = 0.0050,
) -> SandboxGame:
    """
    Create a new game room. The creator becomes the host player.
    If property_ids is None, uses all active pool properties.
    Raises ValueError if no active properties exist in the pool.
    """
    max_turns = max_turns or settings.SANDBOX_DEFAULT_MAX_TURNS
    starting_balance = starting_balance_usdc or settings.SANDBOX_STARTING_BALANCE_USDC

    # Derive base_mortgage_rate from Fed rate if not explicitly set
    effective_mortgage_rate = (
        base_mortgage_rate if base_mortgage_rate is not None
        else round(fed_rate_current + fed_mortgage_spread, 5)
    )

    # Resolve property pool
    if property_ids:
        props = (
            db.query(SandboxProperty)
            .filter(SandboxProperty.id.in_(property_ids), SandboxProperty.is_active == True)
            .all()
        )
    else:
        props = db.query(SandboxProperty).filter(SandboxProperty.is_active == True).all()

    if not props:
        raise ValueError(
            "No active properties in the sandbox pool. "
            "Run POST /api/sandbox/properties/sync to populate the pool first."
        )

    game = SandboxGame(
        id=str(uuid.uuid4()),
        name=name,
        status="lobby",
        current_turn=0,
        max_turns=max_turns,
        starting_balance_usdc=starting_balance,
        # Debt config
        ltv_limit=ltv_limit,
        default_rate_type=default_rate_type,
        amortizing=amortizing,
        base_mortgage_rate=effective_mortgage_rate,
        arm_spread=arm_spread,
        arm_cap=arm_cap,
        closing_cost_pct=closing_cost_pct,
        heloc_spread=heloc_spread,
        debt_service_default_penalty=debt_service_default_penalty,
        # Fed config
        fed_meeting_interval=fed_meeting_interval,
        fed_rate_current=fed_rate_current,
        fed_mortgage_spread=fed_mortgage_spread,
        fed_hike_prob=fed_hike_prob,
        fed_cut_prob=fed_cut_prob,
        fed_move_magnitude_min=fed_move_magnitude_min,
        fed_move_magnitude_max=fed_move_magnitude_max,
        invite_code=_generate_invite_code(),
        created_by=clerk_user_id,
    )
    db.add(game)
    db.flush()  # get game.id

    # Seed game_properties from pool
    for prop in props:
        db.add(SandboxGameProperty(
            id=str(uuid.uuid4()),
            game_id=game.id,
            property_id=prop.id,
            current_price_usd=prop.initial_price_usd,
            current_rent_usd=prop.monthly_rent_usd,
            turn_added=0,
        ))

    # Add host as first player
    host = SandboxPlayer(
        id=str(uuid.uuid4()),
        game_id=game.id,
        clerk_user_id=clerk_user_id,
        display_name=display_name,
        usdc_balance=starting_balance,
        is_host=True,
        is_ready=False,
    )
    db.add(host)
    db.commit()
    db.refresh(game)

    logger.info(f"SandboxGame created: id={game.id} invite={game.invite_code} host={clerk_user_id}")
    return game


def get_game(db: Session, game_id: str) -> SandboxGame | None:
    return db.query(SandboxGame).filter(SandboxGame.id == game_id).first()


def list_active_games(db: Session) -> list[SandboxGame]:
    return (
        db.query(SandboxGame)
        .filter(SandboxGame.status.in_(["lobby", "trading", "advancing"]))
        .order_by(SandboxGame.created_at.desc())
        .all()
    )


def join_game(
    db: Session,
    invite_code: str,
    clerk_user_id: str,
    display_name: str,
    wallet_address: str | None = None,
) -> tuple[SandboxGame, SandboxPlayer]:
    """
    Join via invite code. Raises ValueError on:
    - invalid code
    - game not in lobby
    - player already joined
    - max players exceeded
    """
    game = db.query(SandboxGame).filter(SandboxGame.invite_code == invite_code).first()
    if not game:
        raise ValueError(f"No game found with invite code {invite_code!r}")
    if game.status != "lobby":
        raise ValueError(f"Game {game.id} is no longer accepting players (status={game.status!r})")

    existing = (
        db.query(SandboxPlayer)
        .filter(SandboxPlayer.game_id == game.id, SandboxPlayer.clerk_user_id == clerk_user_id)
        .first()
    )
    if existing:
        raise ValueError("You have already joined this game")

    player_count = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).count()
    if player_count >= settings.SANDBOX_MAX_PLAYERS:
        raise ValueError(f"Game is full ({settings.SANDBOX_MAX_PLAYERS} players max)")

    player = SandboxPlayer(
        id=str(uuid.uuid4()),
        game_id=game.id,
        clerk_user_id=clerk_user_id,
        display_name=display_name,
        usdc_balance=game.starting_balance_usdc,
        wallet_address=wallet_address,
        is_host=False,
        is_ready=False,
    )
    db.add(player)
    db.commit()
    db.refresh(player)

    _ws_broadcast("sandbox.player_joined", {"game_id": game.id, "player_id": player.id,
                                              "display_name": display_name})
    return game, player


def leave_game(db: Session, game_id: str, clerk_user_id: str) -> None:
    """Remove a player. Only valid before game starts (lobby status)."""
    game = _require_game(db, game_id)
    if game.status != "lobby":
        raise ValueError("Cannot leave a game that has already started")

    player = _require_player(db, game_id, clerk_user_id)
    if player.is_host:
        # Host leaving dissolves the game
        db.delete(game)
    else:
        db.delete(player)
    db.commit()


def mark_ready(db: Session, game_id: str, clerk_user_id: str) -> SandboxPlayer:
    """Toggle player ready state. Returns updated player."""
    _require_game(db, game_id)
    player = _require_player(db, game_id, clerk_user_id)
    player.is_ready = not player.is_ready
    db.commit()
    db.refresh(player)
    _ws_broadcast("sandbox.player_ready", {"game_id": game_id, "player_id": player.id,
                                            "is_ready": player.is_ready})
    return player


# ---------------------------------------------------------------------------
# Trading
# ---------------------------------------------------------------------------

def execute_trade(
    db: Session,
    game_id: str,
    clerk_user_id: str,
    property_id: str,
    direction: Literal["buy", "sell"],
    tokens: float,
) -> SandboxTransaction:
    """
    Execute a BUY or SELL of fractional tokens.

    BUY:  deduct tokens * current_price from usdc_balance; increase tokens_held
    SELL: increase usdc_balance by tokens * current_price; decrease tokens_held

    Raises ValueError on:
    - game not in trading status
    - player not in game
    - insufficient balance (buy) or tokens (sell)
    - property not in game pool
    - non-positive token amount
    """
    game = _require_game(db, game_id)
    if game.status != "trading":
        raise ValueError(f"Trading is not open (game status={game.status!r})")

    player = _require_player(db, game_id, clerk_user_id)

    if tokens <= 0:
        raise ValueError("Token amount must be positive")

    gp = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game_id,
                SandboxGameProperty.property_id == property_id)
        .first()
    )
    if not gp:
        raise ValueError(f"Property {property_id!r} is not in game {game_id!r}")

    price = gp.current_price_usd
    cost = round(tokens * price, 2)

    # Get or create holding
    holding = (
        db.query(SandboxHolding)
        .filter(SandboxHolding.game_id == game_id,
                SandboxHolding.player_id == player.id,
                SandboxHolding.property_id == property_id)
        .first()
    )

    if direction == "buy":
        if player.usdc_balance < cost:
            raise ValueError(
                f"Insufficient balance: have ${player.usdc_balance:,.2f}, need ${cost:,.2f}"
            )
        player.usdc_balance = round(player.usdc_balance - cost, 2)
        if holding:
            # Update weighted average cost basis
            total_tokens = holding.tokens_held + tokens
            holding.avg_purchase_price_usd = round(
                (holding.tokens_held * (holding.avg_purchase_price_usd or price) + tokens * price)
                / total_tokens, 4
            )
            holding.tokens_held = round(total_tokens, 6)
            holding.updated_at = datetime.utcnow()
        else:
            holding = SandboxHolding(
                id=str(uuid.uuid4()),
                game_id=game_id,
                player_id=player.id,
                property_id=property_id,
                tokens_held=round(tokens, 6),
                avg_purchase_price_usd=round(price, 4),
                total_rent_received_usd=0.0,
            )
            db.add(holding)
        tx_type = "BUY"

    else:  # sell
        if not holding or holding.tokens_held < tokens:
            have = holding.tokens_held if holding else 0.0
            raise ValueError(
                f"Insufficient tokens: have {have:.4f}, trying to sell {tokens:.4f}"
            )
        holding.tokens_held = round(holding.tokens_held - tokens, 6)
        holding.updated_at = datetime.utcnow()
        player.usdc_balance = round(player.usdc_balance + cost, 2)
        tx_type = "SELL"

    tx = SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=game.current_turn,
        player_id=player.id,
        type=tx_type,
        property_id=property_id,
        amount_usdc=cost,
        tokens=tokens,
        price_per_token_usd=price,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    _ws_broadcast("sandbox.trade", {
        "game_id": game_id,
        "player_id": player.id,
        "type": tx_type,
        "property_id": property_id,
        "tokens": tokens,
        "amount_usdc": cost,
        "price_per_token_usd": price,
    })
    return tx


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

def get_portfolio(db: Session, game_id: str, player_id: str) -> dict:
    """
    Return holdings with current value, P&L, and total NAV.
    """
    game = _require_game(db, game_id)
    player = db.get(SandboxPlayer, player_id)
    if not player or player.game_id != game_id:
        raise ValueError(f"Player {player_id!r} not found in game {game_id!r}")

    holdings_data = []
    holdings = (
        db.query(SandboxHolding)
        .filter(SandboxHolding.game_id == game_id, SandboxHolding.player_id == player_id)
        .all()
    )

    for h in holdings:
        if h.tokens_held <= 0:
            continue
        gp = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game_id,
                    SandboxGameProperty.property_id == h.property_id)
            .first()
        )
        if not gp:
            continue
        current_price = gp.current_price_usd
        current_value = round(h.tokens_held * current_price, 2)
        cost_basis = round(h.tokens_held * (h.avg_purchase_price_usd or current_price), 2)
        unrealized_pnl = round(current_value - cost_basis, 2)
        holdings_data.append({
            "property_id": h.property_id,
            "property_name": gp.sandbox_property.name if gp.sandbox_property else None,
            "tokens_held": h.tokens_held,
            "avg_purchase_price_usd": h.avg_purchase_price_usd,
            "current_price_usd": current_price,
            "current_value_usd": current_value,
            "cost_basis_usd": cost_basis,
            "unrealized_pnl_usd": unrealized_pnl,
            "total_rent_received_usd": h.total_rent_received_usd,
        })

    nav = _compute_nav(db, game_id, player)
    total_debt = sum(
        m.current_balance for m in
        db.query(SandboxMortgage).filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player_id,
            SandboxMortgage.status == "active",
        ).all()
    )
    gross_asset_value = round(nav + total_debt, 2)
    leverage_ratio = round(total_debt / gross_asset_value, 4) if gross_asset_value > 0 else 0.0

    return {
        "player_id": player_id,
        "display_name": player.display_name,
        "usdc_balance": player.usdc_balance,
        "holdings": holdings_data,
        "nav": nav,
        "gross_asset_value": gross_asset_value,
        "total_debt": total_debt,
        "leverage_ratio": leverage_ratio,
    }


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------

def get_game_leaderboard(db: Session, game_id: str) -> list[dict]:
    """Ranked player list by current NAV for a specific game."""
    game = _require_game(db, game_id)
    players = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game_id).all()

    rows = []
    for p in players:
        nav = _compute_nav(db, game_id, p)
        rows.append({
            "player_id": p.id,
            "display_name": p.display_name,
            "clerk_user_id": p.clerk_user_id,
            "usdc_balance": p.usdc_balance,
            "nav": nav,
            "is_host": p.is_host,
        })

    rows.sort(key=lambda r: r["nav"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def get_global_leaderboard(db: Session, limit: int = 50) -> list[dict]:
    """
    All-time leaderboard: highest NAV ever achieved per player across all completed games.
    Scans completed games only.
    """
    completed_games = (
        db.query(SandboxGame)
        .filter(SandboxGame.status == "completed")
        .all()
    )

    best: dict[str, dict] = {}
    for game in completed_games:
        players = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).all()
        for p in players:
            nav = _compute_nav(db, game.id, p)
            key = p.clerk_user_id
            if key not in best or nav > best[key]["nav"]:
                best[key] = {
                    "clerk_user_id": p.clerk_user_id,
                    "display_name": p.display_name,
                    "nav": nav,
                    "game_id": game.id,
                    "game_name": game.name,
                    "turns": game.current_turn,
                }

    rows = sorted(best.values(), key=lambda r: r["nav"], reverse=True)[:limit]
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------

def get_feed(
    db: Session,
    game_id: str,
    turn: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[SandboxTurnEvent]:
    _require_game(db, game_id)
    q = db.query(SandboxTurnEvent).filter(SandboxTurnEvent.game_id == game_id)
    if turn is not None:
        q = q.filter(SandboxTurnEvent.turn == turn)
    return q.order_by(SandboxTurnEvent.created_at.desc()).offset(skip).limit(limit).all()


# ---------------------------------------------------------------------------
# Property pool admin
# ---------------------------------------------------------------------------

def list_pool_properties(db: Session, active_only: bool = True) -> list[SandboxProperty]:
    q = db.query(SandboxProperty)
    if active_only:
        q = q.filter(SandboxProperty.is_active == True)
    return q.order_by(SandboxProperty.name).all()


def get_property_detail(db: Session, property_id: str) -> dict:
    """Property info + per-turn price history across all games."""
    prop = db.get(SandboxProperty, property_id)
    if not prop:
        raise ValueError(f"Property {property_id!r} not found")

    # Price history: latest current_price per game per turn (from game_properties + turn events)
    game_props = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.property_id == property_id)
        .all()
    )
    price_snapshots = [
        {
            "game_id": gp.game_id,
            "current_price_usd": gp.current_price_usd,
            "current_rent_usd": gp.current_rent_usd,
        }
        for gp in game_props
    ]

    return {
        "id": prop.id,
        "geo_id": prop.geo_id,
        "name": prop.name,
        "display_address": prop.display_address,
        "city": prop.city,
        "state": prop.state,
        "property_type": prop.property_type,
        "token_address": prop.token_address,
        "total_supply": prop.total_supply,
        "initial_price_usd": prop.initial_price_usd,
        "monthly_rent_usd": prop.monthly_rent_usd,
        "cap_rate": prop.cap_rate,
        "image_url": prop.image_url,
        "is_active": prop.is_active,
        "last_avm_sync": prop.last_avm_sync.isoformat() if prop.last_avm_sync else None,
        "price_snapshots": price_snapshots,
    }


def sync_property_pool(db: Session) -> dict:
    """
    Admin: pull properties from rwa-issuer-sim and upsert into the sandbox pool.
    Returns {"created": int, "updated": int, "skipped": int}.
    """
    if not settings.RWA_ISSUER_URL:
        raise ValueError("RWA_ISSUER_URL is not configured")

    try:
        resp = httpx.get(
            f"{settings.RWA_ISSUER_URL}/api/v1/properties",
            params={"is_active": True},
            timeout=10.0,
        )
        resp.raise_for_status()
        properties = resp.json()
    except Exception as e:
        raise ValueError(f"Failed to fetch properties from rwa-issuer-sim: {e}") from e

    created = updated = skipped = 0
    now = datetime.utcnow()

    for p in properties:
        geo_id = p.get("geo_id") or p.get("id")
        if not geo_id:
            skipped += 1
            continue

        price = float(p.get("avm_value_usd") or p.get("estimated_value") or p.get("price") or 0)
        rent = float(p.get("monthly_rent_usd") or p.get("estimated_rent") or 0)
        if price <= 0 or rent <= 0:
            skipped += 1
            continue

        existing = db.query(SandboxProperty).filter(SandboxProperty.geo_id == geo_id).first()
        if existing:
            existing.initial_price_usd = price
            existing.monthly_rent_usd = rent
            existing.name = p.get("name") or p.get("address") or geo_id
            existing.display_address = p.get("address") or p.get("display_address")
            existing.city = p.get("city")
            existing.state = p.get("state")
            existing.property_type = p.get("property_type") or "residential"
            existing.token_address = p.get("token_address") or p.get("contract_address")
            existing.total_supply = float(p.get("total_supply") or 1_000_000)
            existing.cap_rate = float(p.get("cap_rate") or 0)
            existing.image_url = p.get("image_url")
            existing.last_avm_sync = now
            existing.updated_at = now
            updated += 1
        else:
            db.add(SandboxProperty(
                id=str(uuid.uuid4()),
                geo_id=geo_id,
                name=p.get("name") or p.get("address") or geo_id,
                display_address=p.get("address") or p.get("display_address"),
                city=p.get("city"),
                state=p.get("state"),
                property_type=p.get("property_type") or "residential",
                token_address=p.get("token_address") or p.get("contract_address"),
                total_supply=float(p.get("total_supply") or 1_000_000),
                initial_price_usd=price,
                monthly_rent_usd=rent,
                cap_rate=float(p.get("cap_rate") or 0),
                image_url=p.get("image_url"),
                is_active=True,
                last_avm_sync=now,
            ))
            created += 1

    db.commit()
    logger.info(f"Property pool sync: created={created} updated={updated} skipped={skipped}")
    return {"created": created, "updated": updated, "skipped": skipped}


def mint_tusdc(db: Session, game_id: str, player_id: str, amount: float) -> SandboxPlayer:
    """Admin: allocate additional tUSDC to a player. Creates MINT_TUSDC transaction."""
    game = _require_game(db, game_id)
    player = db.get(SandboxPlayer, player_id)
    if not player or player.game_id != game_id:
        raise ValueError(f"Player {player_id!r} not in game {game_id!r}")

    player.usdc_balance = round(player.usdc_balance + amount, 2)
    db.add(SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=game.current_turn,
        player_id=player_id,
        type="MINT_TUSDC",
        amount_usdc=amount,
    ))
    db.commit()
    db.refresh(player)
    return player


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def get_fed_history(db: Session, game_id: str) -> list[dict]:
    _require_game(db, game_id)
    decisions = (
        db.query(SandboxFedDecision)
        .filter(SandboxFedDecision.game_id == game_id)
        .order_by(SandboxFedDecision.turn)
        .all()
    )
    return [
        {
            "id": d.id,
            "turn": d.turn,
            "outcome": d.outcome,
            "move_bps": d.move_bps,
            "rate_before": d.rate_before,
            "rate_after": d.rate_after,
            "mortgage_rate_before": d.mortgage_rate_before,
            "mortgage_rate_after": d.mortgage_rate_after,
            "statement": d.statement,
            "created_at": d.created_at.isoformat(),
        }
        for d in decisions
    ]


# ---------------------------------------------------------------------------
# Mortgage — origination
# ---------------------------------------------------------------------------

def originate_mortgage(
    db: Session,
    game_id: str,
    clerk_user_id: str,
    property_id: str,
    tokens_to_buy: float,
    rate_type: str | None = None,
) -> tuple[SandboxMortgage, SandboxTransaction]:
    """
    Originate an acquisition mortgage at time of purchase.

    The player must have enough cash for the down payment:
      purchase_price = tokens_to_buy × current_price
      max_loan       = purchase_price × game.ltv_limit
      down_payment   = purchase_price - max_loan
      closing_costs  = max_loan × game.closing_cost_pct

    Cash required = down_payment + closing_costs
    Mortgage balance = max_loan

    Executes the BUY trade simultaneously.
    Raises ValueError if player has insufficient cash or property not in game.
    """
    game = _require_game(db, game_id)
    if game.status != "trading":
        raise ValueError(f"Trading is not open (game status={game.status!r})")

    player = _require_player(db, game_id, clerk_user_id)

    gp = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game_id,
                SandboxGameProperty.property_id == property_id)
        .first()
    )
    if not gp:
        raise ValueError(f"Property {property_id!r} not in game {game_id!r}")

    if tokens_to_buy <= 0:
        raise ValueError("tokens_to_buy must be positive")

    current_price = gp.current_price_usd
    purchase_price = round(tokens_to_buy * current_price, 2)
    max_loan = round(purchase_price * game.ltv_limit, 2)
    down_payment = round(purchase_price - max_loan, 2)
    closing_costs = round(max_loan * game.closing_cost_pct, 2)
    cash_needed = round(down_payment + closing_costs, 2)

    if player.usdc_balance < cash_needed:
        raise ValueError(
            f"Insufficient cash: need ${cash_needed:,.2f} "
            f"(${down_payment:,.2f} down + ${closing_costs:,.2f} closing costs), "
            f"have ${player.usdc_balance:,.2f}"
        )

    # Check no existing active acquisition mortgage on this property for this player
    existing = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player.id,
            SandboxMortgage.property_id == property_id,
            SandboxMortgage.mortgage_type == "acquisition",
            SandboxMortgage.status == "active",
        )
        .first()
    )
    if existing:
        raise ValueError(
            "You already have an active acquisition mortgage on this property. "
            "Refi or pay it off first."
        )

    effective_rate_type = rate_type or game.default_rate_type
    origination_rate = game.base_mortgage_rate
    if effective_rate_type == "arm":
        # ARM starts at base rate; adjusts with Fed/macro
        origination_rate = game.base_mortgage_rate
    monthly_payment = _compute_monthly_payment(
        balance=max_loan,
        annual_rate=origination_rate,
        amortizing=game.amortizing,
    )

    # Deduct cash from player
    player.usdc_balance = round(player.usdc_balance - cash_needed, 2)

    # Execute the BUY — update holding
    holding = (
        db.query(SandboxHolding)
        .filter(SandboxHolding.game_id == game_id,
                SandboxHolding.player_id == player.id,
                SandboxHolding.property_id == property_id)
        .first()
    )
    if holding:
        total_tokens = holding.tokens_held + tokens_to_buy
        holding.avg_purchase_price_usd = round(
            (holding.tokens_held * (holding.avg_purchase_price_usd or current_price)
             + tokens_to_buy * down_payment / tokens_to_buy) / total_tokens, 4
        )
        holding.tokens_held = round(total_tokens, 6)
        holding.updated_at = datetime.utcnow()
    else:
        holding = SandboxHolding(
            id=str(uuid.uuid4()),
            game_id=game_id,
            player_id=player.id,
            property_id=property_id,
            tokens_held=round(tokens_to_buy, 6),
            avg_purchase_price_usd=round(down_payment / tokens_to_buy, 4),
        )
        db.add(holding)

    # Create mortgage
    mtg = SandboxMortgage(
        id=str(uuid.uuid4()),
        game_id=game_id,
        player_id=player.id,
        property_id=property_id,
        mortgage_type="acquisition",
        original_balance=max_loan,
        current_balance=max_loan,
        origination_rate=origination_rate,
        current_rate=origination_rate,
        rate_type=effective_rate_type,
        amortizing=game.amortizing,
        monthly_payment=monthly_payment,
        origination_turn=game.current_turn,
        origination_price_usd=current_price,
        closing_cost_paid=closing_costs,
    )
    db.add(mtg)

    tx = SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=game.current_turn,
        player_id=player.id,
        type="BUY_LEVERAGED",
        property_id=property_id,
        amount_usdc=cash_needed,
        tokens=tokens_to_buy,
        price_per_token_usd=current_price,
    )
    db.add(tx)
    db.commit()
    db.refresh(mtg)

    _ws_broadcast("sandbox.mortgage_originated", {
        "game_id": game_id, "player_id": player.id,
        "property_id": property_id, "balance": max_loan,
        "rate": origination_rate, "rate_type": effective_rate_type,
    })
    return mtg, tx


# ---------------------------------------------------------------------------
# Mortgage — refinance
# ---------------------------------------------------------------------------

def refi_mortgage(
    db: Session,
    game_id: str,
    clerk_user_id: str,
    property_id: str,
    cash_out_amount: float = 0.0,
    new_rate_type: str | None = None,
) -> SandboxMortgage:
    """
    Refinance the existing first lien on a property.

    New loan amount = existing_balance + cash_out_amount
    Must not exceed: current_price × game.ltv_limit
    Closing costs = new_loan × game.closing_cost_pct (deducted from cash-out or balance)

    cash_out > 0: player receives net cash (cash_out - closing_costs) to usdc_balance
    cash_out = 0: rate-and-term refi — just reset rate, no cash to player

    Old mortgage is marked "paid_off"; new mortgage created at current base_mortgage_rate.
    """
    game = _require_game(db, game_id)
    if game.status != "trading":
        raise ValueError(f"Trading is not open (game status={game.status!r})")

    player = _require_player(db, game_id, clerk_user_id)

    existing = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player.id,
            SandboxMortgage.property_id == property_id,
            SandboxMortgage.mortgage_type.in_(["acquisition", "refi"]),
            SandboxMortgage.status == "active",
        )
        .first()
    )
    if not existing:
        raise ValueError(
            "No active first-lien mortgage on this property to refinance. "
            "Originate an acquisition mortgage first."
        )

    gp = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game_id,
                SandboxGameProperty.property_id == property_id)
        .first()
    )
    if not gp:
        raise ValueError(f"Property {property_id!r} not in game {game_id!r}")

    current_price = gp.current_price_usd
    max_loan = round(current_price * game.ltv_limit, 2)
    new_balance = round(existing.current_balance + cash_out_amount, 2)

    if new_balance > max_loan:
        available_cash_out = round(max_loan - existing.current_balance, 2)
        raise ValueError(
            f"Refi exceeds LTV limit ({game.ltv_limit*100:.0f}%). "
            f"Max new balance: ${max_loan:,.2f}. "
            f"Available cash-out: ${max_available:.2f}"
            .replace("max_available", str(max(0.0, available_cash_out)))
        )

    closing_costs = round(new_balance * game.closing_cost_pct, 2)
    net_cash_to_player = round(cash_out_amount - closing_costs, 2)

    # If net is negative (closing costs exceed cash-out), deduct from player balance
    if net_cash_to_player < 0 and player.usdc_balance < abs(net_cash_to_player):
        raise ValueError(
            f"Insufficient cash for closing costs: need ${abs(net_cash_to_player):,.2f}, "
            f"have ${player.usdc_balance:,.2f}"
        )

    effective_rate_type = new_rate_type or game.default_rate_type
    new_rate = game.base_mortgage_rate
    monthly_payment = _compute_monthly_payment(new_balance, new_rate, game.amortizing)

    # Retire old mortgage
    existing.status = "paid_off"
    existing.paid_off_turn = game.current_turn
    existing.updated_at = datetime.utcnow()

    # New refi mortgage
    new_mtg = SandboxMortgage(
        id=str(uuid.uuid4()),
        game_id=game_id,
        player_id=player.id,
        property_id=property_id,
        mortgage_type="refi",
        original_balance=new_balance,
        current_balance=new_balance,
        origination_rate=new_rate,
        current_rate=new_rate,
        rate_type=effective_rate_type,
        amortizing=game.amortizing,
        monthly_payment=monthly_payment,
        origination_turn=game.current_turn,
        origination_price_usd=current_price,
        closing_cost_paid=closing_costs,
        replaces_mortgage_id=existing.id,
    )
    db.add(new_mtg)

    # Apply cash to player
    player.usdc_balance = round(player.usdc_balance + net_cash_to_player, 2)

    tx_type = "CASH_OUT_REFI" if cash_out_amount > 0 else "RATE_TERM_REFI"
    db.add(SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=game.current_turn,
        player_id=player.id,
        type=tx_type,
        property_id=property_id,
        amount_usdc=net_cash_to_player,
    ))
    db.commit()
    db.refresh(new_mtg)

    _ws_broadcast("sandbox.mortgage_refi", {
        "game_id": game_id, "player_id": player.id,
        "property_id": property_id, "new_balance": new_balance,
        "net_cash": net_cash_to_player, "new_rate": new_rate,
    })
    return new_mtg


# ---------------------------------------------------------------------------
# HELOC — draw and repay
# ---------------------------------------------------------------------------

def draw_heloc(
    db: Session,
    game_id: str,
    clerk_user_id: str,
    property_id: str,
    draw_amount: float,
) -> SandboxMortgage:
    """
    Draw from a HELOC (home equity line of credit).

    If no active HELOC exists for this player+property, opens one with:
      credit_limit = (current_price × game.ltv_limit) - first_lien_balance
      rate = game.base_mortgage_rate + game.heloc_spread

    Subsequent draws on an existing HELOC just increase drawn_balance
    (up to credit_limit).

    Proceeds credited to player.usdc_balance immediately.
    """
    game = _require_game(db, game_id)
    if game.status != "trading":
        raise ValueError(f"Trading is not open (game status={game.status!r})")

    player = _require_player(db, game_id, clerk_user_id)

    if draw_amount <= 0:
        raise ValueError("draw_amount must be positive")

    gp = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game_id,
                SandboxGameProperty.property_id == property_id)
        .first()
    )
    if not gp:
        raise ValueError(f"Property {property_id!r} not in game {game_id!r}")

    # Check player has a holding
    holding = (
        db.query(SandboxHolding)
        .filter(SandboxHolding.game_id == game_id,
                SandboxHolding.player_id == player.id,
                SandboxHolding.property_id == property_id,
                SandboxHolding.tokens_held > 0)
        .first()
    )
    if not holding:
        raise ValueError("You must own tokens in this property to open a HELOC")

    current_price = gp.current_price_usd
    max_total_debt = round(current_price * game.ltv_limit, 2)

    # Sum existing active first-lien debt on this property
    first_lien = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player.id,
            SandboxMortgage.property_id == property_id,
            SandboxMortgage.mortgage_type.in_(["acquisition", "refi"]),
            SandboxMortgage.status == "active",
        )
        .first()
    )
    first_lien_balance = first_lien.current_balance if first_lien else 0.0
    available_equity = round(max_total_debt - first_lien_balance, 2)

    if available_equity <= 0:
        raise ValueError(
            f"No available equity for a HELOC. "
            f"Property value: ${current_price:,.2f}, LTV limit: {game.ltv_limit*100:.0f}%, "
            f"first-lien balance: ${first_lien_balance:,.2f}"
        )

    # Find or create HELOC
    heloc = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player.id,
            SandboxMortgage.property_id == property_id,
            SandboxMortgage.mortgage_type == "heloc",
            SandboxMortgage.status == "active",
        )
        .first()
    )

    heloc_rate = round(game.base_mortgage_rate + game.heloc_spread, 5)

    if heloc is None:
        # Open new HELOC
        credit_limit = available_equity
        if draw_amount > credit_limit:
            raise ValueError(
                f"Draw amount ${draw_amount:,.2f} exceeds available equity ${credit_limit:,.2f}"
            )
        heloc = SandboxMortgage(
            id=str(uuid.uuid4()),
            game_id=game_id,
            player_id=player.id,
            property_id=property_id,
            mortgage_type="heloc",
            original_balance=draw_amount,
            current_balance=draw_amount,
            origination_rate=heloc_rate,
            current_rate=heloc_rate,
            rate_type=game.default_rate_type,
            amortizing=False,  # HELOCs are always interest-only draws
            monthly_payment=round(draw_amount * heloc_rate / 12, 2),
            credit_limit=credit_limit,
            drawn_balance=draw_amount,
            origination_turn=game.current_turn,
            origination_price_usd=current_price,
            closing_cost_paid=0.0,  # HELOCs typically have no closing costs in game
        )
        db.add(heloc)
    else:
        # Draw on existing HELOC
        current_drawn = heloc.drawn_balance or 0.0
        new_drawn = round(current_drawn + draw_amount, 2)
        if new_drawn > (heloc.credit_limit or 0.0):
            remaining = round((heloc.credit_limit or 0.0) - current_drawn, 2)
            raise ValueError(
                f"Draw would exceed HELOC credit limit. "
                f"Available: ${remaining:,.2f}, requested: ${draw_amount:,.2f}"
            )
        heloc.drawn_balance = new_drawn
        heloc.current_balance = new_drawn
        heloc.monthly_payment = round(new_drawn * heloc.current_rate / 12, 2)
        heloc.updated_at = datetime.utcnow()

    player.usdc_balance = round(player.usdc_balance + draw_amount, 2)

    db.add(SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=game.current_turn,
        player_id=player.id,
        type="HELOC_DRAW",
        property_id=property_id,
        amount_usdc=draw_amount,
    ))
    db.commit()
    db.refresh(heloc)
    return heloc


def repay_heloc(
    db: Session,
    game_id: str,
    clerk_user_id: str,
    property_id: str,
    repay_amount: float,
) -> SandboxMortgage:
    """
    Repay drawn HELOC balance. Reduces drawn_balance and monthly interest cost.
    Full repayment sets status to paid_off.
    """
    game = _require_game(db, game_id)
    player = _require_player(db, game_id, clerk_user_id)

    if repay_amount <= 0:
        raise ValueError("repay_amount must be positive")

    heloc = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player.id,
            SandboxMortgage.property_id == property_id,
            SandboxMortgage.mortgage_type == "heloc",
            SandboxMortgage.status == "active",
        )
        .first()
    )
    if not heloc:
        raise ValueError(f"No active HELOC on property {property_id!r}")

    current_drawn = heloc.drawn_balance or 0.0
    actual_repayment = min(repay_amount, current_drawn)

    if player.usdc_balance < actual_repayment:
        raise ValueError(
            f"Insufficient balance: repayment ${actual_repayment:,.2f}, "
            f"available ${player.usdc_balance:,.2f}"
        )

    player.usdc_balance = round(player.usdc_balance - actual_repayment, 2)
    heloc.drawn_balance = round(current_drawn - actual_repayment, 2)
    heloc.current_balance = heloc.drawn_balance

    if heloc.current_balance <= 0.01:
        heloc.status = "paid_off"
        heloc.paid_off_turn = game.current_turn
        heloc.monthly_payment = 0.0
    else:
        heloc.monthly_payment = round(heloc.current_balance * heloc.current_rate / 12, 2)

    heloc.updated_at = datetime.utcnow()

    db.add(SandboxTransaction(
        id=str(uuid.uuid4()),
        game_id=game_id,
        turn=game.current_turn,
        player_id=player.id,
        type="HELOC_REPAY",
        property_id=property_id,
        amount_usdc=-actual_repayment,
    ))
    db.commit()
    db.refresh(heloc)
    return heloc


# ---------------------------------------------------------------------------
# Debt summary
# ---------------------------------------------------------------------------

def get_debt_summary(db: Session, game_id: str, player_id: str) -> list[dict]:
    """All active mortgages for a player in a game, with per-property context."""
    _require_game(db, game_id)
    mortgages = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game_id,
            SandboxMortgage.player_id == player_id,
        )
        .order_by(SandboxMortgage.created_at)
        .all()
    )

    result = []
    for m in mortgages:
        gp = (
            db.query(SandboxGameProperty)
            .filter(SandboxGameProperty.game_id == game_id,
                    SandboxGameProperty.property_id == m.property_id)
            .first()
        )
        current_price = gp.current_price_usd if gp else m.origination_price_usd
        prop = gp.sandbox_property if gp else None

        ltv_current = round(m.current_balance / current_price, 4) if current_price > 0 else None

        result.append({
            "id": m.id,
            "mortgage_type": m.mortgage_type,
            "property_id": m.property_id,
            "property_name": prop.name if prop else None,
            "status": m.status,
            "original_balance": m.original_balance,
            "current_balance": m.current_balance,
            "origination_rate": m.origination_rate,
            "current_rate": m.current_rate,
            "rate_type": m.rate_type,
            "amortizing": m.amortizing,
            "monthly_payment": m.monthly_payment,
            "ltv_at_origination": round(m.original_balance / m.origination_price_usd, 4)
                                  if m.origination_price_usd > 0 else None,
            "ltv_current": ltv_current,
            "credit_limit": m.credit_limit,
            "drawn_balance": m.drawn_balance,
            "turns_in_arrears": m.turns_in_arrears,
            "origination_turn": m.origination_turn,
            "total_interest_paid": m.total_interest_paid,
            "total_principal_paid": m.total_principal_paid,
            "closing_cost_paid": m.closing_cost_paid,
        })
    return result
    game = db.get(SandboxGame, game_id)
    if not game:
        raise ValueError(f"Game {game_id!r} not found")
    return game


def _require_player(db: Session, game_id: str, clerk_user_id: str) -> SandboxPlayer:
    player = (
        db.query(SandboxPlayer)
        .filter(SandboxPlayer.game_id == game_id,
                SandboxPlayer.clerk_user_id == clerk_user_id)
        .first()
    )
    if not player:
        raise ValueError(f"Player not found in game {game_id!r}")
    return player


def _generate_invite_code() -> str:
    import secrets
    import string
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _compute_monthly_payment(balance: float, annual_rate: float, amortizing: bool) -> float:
    """
    Standard monthly payment calculator.
    amortizing=False: interest-only = balance × annual_rate / 12
    amortizing=True: PMT formula over 360 months (30-year term)
    """
    monthly_rate = annual_rate / 12.0
    if not amortizing or monthly_rate <= 0:
        return round(balance * monthly_rate, 2)
    n = 360
    pmt = balance * (monthly_rate * (1 + monthly_rate) ** n) / ((1 + monthly_rate) ** n - 1)
    return round(pmt, 2)


def _ws_broadcast(event: str, data: dict) -> None:
    try:
        from app.core.ws_manager import broadcast_sync
        broadcast_sync(event, data)
    except Exception:
        pass
