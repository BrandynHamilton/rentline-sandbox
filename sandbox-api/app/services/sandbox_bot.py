"""
sandbox_bot.py — LLM-driven bot player decision engine.

Each bot player is a SandboxPlayer with is_bot=True. After every advance_turn,
run_bot_turn() is called for each bot in the game. The bot receives a full
snapshot of the game state and its own portfolio, then decides what actions
to take during the trade window.

Bot strategies (system prompt personas):
  aggressive   — high leverage, momentum, concentrated bets
  conservative — low leverage, income focus, diversification
  balanced     — moderate leverage, mixed approach
  momentum     — chases recent price trends, quick to rotate
  income       — maximises rental yield, avoids capital risk

If OPENAI_API_KEY is not set, bots fall back to a lightweight random strategy
so the game remains playable without an LLM.
"""

from __future__ import annotations

import json
import random
import uuid
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.models.sandbox import (
    SandboxGame,
    SandboxGameProperty,
    SandboxHolding,
    SandboxMortgage,
    SandboxPlayer,
)
from app.services import sandbox_service
from app.services.sandbox_engine import _compute_nav


# ---------------------------------------------------------------------------
# Strategy system prompts
# ---------------------------------------------------------------------------

_STRATEGY_PROMPTS: dict[str, str] = {
    "aggressive": (
        "You are an aggressive real estate investor. You maximise leverage, take concentrated "
        "positions in high-upside properties, and are willing to accept significant default risk "
        "in pursuit of outsized NAV growth. Use acquisition mortgages and HELOCs aggressively. "
        "Buy on dips. Don't be scared of debt."
    ),
    "conservative": (
        "You are a conservative real estate investor. You prioritise capital preservation and "
        "stable income. Keep leverage low (below 50% LTV), diversify across multiple properties, "
        "hold enough cash to cover 3+ turns of debt service, and avoid properties in recession. "
        "Never over-extend."
    ),
    "balanced": (
        "You are a balanced real estate investor. You combine income and growth, use moderate "
        "leverage (60-70% LTV), hold a diversified portfolio, and rebalance when macro conditions "
        "shift. You are opportunistic but not reckless."
    ),
    "momentum": (
        "You are a momentum trader in real estate tokens. You buy properties that have appreciated "
        "recently and rotate out of those that have declined. Watch the feed closely for housing "
        "booms and Fed cuts — those are buy signals. Recessions and rate hikes are sell signals. "
        "Move quickly, take profits."
    ),
    "income": (
        "You are a yield-focused real estate investor. You exclusively buy properties with the "
        "highest cap rates and monthly rent per token. You hold positions long-term to collect "
        "rent, avoid speculative appreciation plays, and keep leverage conservative so debt "
        "service never threatens your yield."
    ),
}

_DEFAULT_STRATEGY = "balanced"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_bot_turn(db: Session, game: SandboxGame, bot: SandboxPlayer) -> None:
    """
    Execute one bot player's turn. Called after advance_turn completes and
    the game is back in 'trading' status.

    Attempts LLM-driven decisions if OPENAI_API_KEY is configured, otherwise
    falls back to the random strategy.
    """
    if not bot.is_bot:
        return

    try:
        context = _build_context(db, game, bot)
        if settings.OPENAI_API_KEY:
            actions = _llm_decide(bot, context)
        else:
            actions = _random_decide(db, game, bot, context)

        _execute_actions(db, game, bot, actions)

        # Mark bot ready after acting
        bot.is_ready = True
        db.commit()

    except Exception as e:
        logger.warning(f"Bot {bot.display_name} ({bot.id}) turn failed: {e}", exc_info=True)
        # Never let a bot crash the game — silently skip and mark ready
        try:
            bot.is_ready = True
            db.commit()
        except Exception:
            pass


def run_all_bots(db: Session, game: SandboxGame) -> None:
    """Run all bot players in a game after a turn advance. Call after advance_turn()."""
    bots = [p for p in game.players if p.is_bot]
    for bot in bots:
        run_bot_turn(db, game, bot)


# ---------------------------------------------------------------------------
# Context builder — gives the LLM everything it needs
# ---------------------------------------------------------------------------

def _build_context(db: Session, game: SandboxGame, bot: SandboxPlayer) -> dict[str, Any]:
    """Build a structured snapshot of game state for the bot."""

    # Current property prices and rents
    game_props = (
        db.query(SandboxGameProperty)
        .filter(SandboxGameProperty.game_id == game.id)
        .all()
    )
    properties = []
    for gp in game_props:
        prop = gp.sandbox_property
        properties.append({
            "game_property_id": gp.id,
            "property_id": gp.property_id,
            "name": prop.name if prop else gp.property_id,
            "city": prop.city if prop else None,
            "state": prop.state if prop else None,
            "property_type": prop.property_type if prop else None,
            "current_price_usd": round(gp.current_price_usd, 2),
            "current_rent_usd": round(gp.current_rent_usd, 2),
            "cap_rate": round(gp.current_rent_usd * 12 / gp.current_price_usd, 4)
                        if gp.current_price_usd > 0 else 0,
        })

    # Bot's holdings
    holdings = (
        db.query(SandboxHolding)
        .filter(SandboxHolding.game_id == game.id, SandboxHolding.player_id == bot.id)
        .all()
    )
    holdings_data = []
    for h in holdings:
        if h.tokens_held > 0:
            gp = next((p for p in game_props if p.property_id == h.property_id), None)
            current_price = gp.current_price_usd if gp else 0
            holdings_data.append({
                "property_id": h.property_id,
                "tokens_held": round(h.tokens_held, 4),
                "avg_purchase_price_usd": round(h.avg_purchase_price_usd or 0, 2),
                "current_price_usd": round(current_price, 2),
                "current_value_usd": round(h.tokens_held * current_price, 2),
                "unrealized_pnl_usd": round(
                    h.tokens_held * (current_price - (h.avg_purchase_price_usd or current_price)), 2
                ),
                "total_rent_received_usd": round(h.total_rent_received_usd, 2),
            })

    # Active mortgages
    mortgages = (
        db.query(SandboxMortgage)
        .filter(
            SandboxMortgage.game_id == game.id,
            SandboxMortgage.player_id == bot.id,
            SandboxMortgage.status == "active",
        )
        .all()
    )
    mortgages_data = [
        {
            "id": m.id,
            "property_id": m.property_id,
            "mortgage_type": m.mortgage_type,
            "current_balance": round(m.current_balance, 2),
            "current_rate": round(m.current_rate, 4),
            "rate_type": m.rate_type,
            "monthly_payment": round(m.monthly_payment, 2),
            "turns_in_arrears": m.turns_in_arrears,
            "credit_limit": round(m.credit_limit, 2) if m.credit_limit else None,
            "drawn_balance": round(m.drawn_balance, 2) if m.drawn_balance else None,
        }
        for m in mortgages
    ]

    # Recent feed events — last turn only, capped at 15 lines to keep context small
    recent_events = sandbox_service.get_feed(
        db, game.id, turn=None, skip=0, limit=20
    )
    feed_summary = [
        f"[T{e.turn}] {e.event_type}: {e.description[:120]}"
        for e in recent_events
        if e.turn >= game.current_turn - 1
    ][:15]

    # Active macro events
    from app.models.sandbox import SandboxMacroEvent
    active_macros = (
        db.query(SandboxMacroEvent)
        .filter(
            SandboxMacroEvent.game_id == game.id,
            SandboxMacroEvent.status == "active",
        )
        .all()
    )
    macro_summary = [
        f"{m.macro_type} ({m.turns_remaining} turns remaining): {m.headline}"
        for m in active_macros
    ]

    nav = _compute_nav(db, game.id, bot)
    total_debt = sum(m.current_balance for m in mortgages)
    gross_assets = bot.usdc_balance + sum(
        h.tokens_held * next(
            (gp.current_price_usd for gp in game_props if gp.property_id == h.property_id), 0
        )
        for h in holdings if h.tokens_held > 0
    )

    return {
        "game": {
            "id": game.id,
            "current_turn": game.current_turn,
            "max_turns": game.max_turns,
            "turns_remaining": game.max_turns - game.current_turn,
            "ltv_limit": game.ltv_limit,
            "base_mortgage_rate": round(game.base_mortgage_rate, 4),
            "fed_rate_current": round(game.fed_rate_current, 4),
            "fed_meeting_interval": game.fed_meeting_interval,
        },
        "bot": {
            "player_id": bot.id,
            "display_name": bot.display_name,
            "usdc_balance": round(bot.usdc_balance, 2),
            "nav": round(nav, 2),
            "gross_assets": round(gross_assets, 2),
            "total_debt": round(total_debt, 2),
            "leverage_ratio": round(gross_assets / nav, 3) if nav > 0 else 0,
        },
        "properties": properties,
        "holdings": holdings_data,
        "mortgages": mortgages_data,
        "active_macro_events": macro_summary,
        "recent_feed": feed_summary,
    }


# ---------------------------------------------------------------------------
# LLM decision path
# ---------------------------------------------------------------------------

_ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "reasoning": {
            "type": "string",
            "description": "1-2 sentence explanation of your decision this turn"
        },
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["buy_tokens", "sell_tokens", "originate_mortgage",
                                 "heloc_draw", "heloc_repay", "pass"]
                    },
                    "property_id": {"type": "string"},
                    "tokens": {"type": "number"},
                    "draw_amount": {"type": "number"},
                    "repay_amount": {"type": "number"},
                },
                "required": ["action"]
            },
            "maxItems": 4,
        }
    },
    "required": ["reasoning", "actions"]
}


def _llm_decide(bot: SandboxPlayer, context: dict[str, Any]) -> list[dict]:
    """Call OpenAI to decide what actions the bot takes this turn."""
    strategy = bot.bot_strategy or _DEFAULT_STRATEGY
    personality = bot.bot_personality or bot.display_name
    system_prompt = _STRATEGY_PROMPTS.get(strategy, _STRATEGY_PROMPTS[_DEFAULT_STRATEGY])

    user_message = f"""You are {personality}, a real estate investor in the Rentline Sandbox game.

GAME STATE (JSON):
{json.dumps(context, separators=(',', ':'))}

RULES:
- buy_tokens / sell_tokens: all-cash trades
- originate_mortgage: leveraged buy (down payment + closing costs, rest financed)
- heloc_draw / heloc_repay: equity line operations
- pass: do nothing
- Max 4 actions. Use property_id from the properties list.
- Keep enough cash for debt service: ${sum(m["monthly_payment"] for m in context["mortgages"]):,.0f}/turn

Output JSON: {{"reasoning": "1 sentence", "actions": [{{"action": "...", "property_id": "...", "tokens": 0}}]}}"""

    try:
        with httpx.Client(timeout=30) as client:
            base_url = settings.OPENAI_BASE_URL.rstrip("/")
            resp = client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.7,
                    "max_tokens": 1024,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            choice = data.get("choices", [{}])[0]
            finish_reason = choice.get("finish_reason", "unknown")
            content = choice.get("message", {}).get("content")

            if not content:
                logger.warning(
                    f"Bot {bot.display_name}: LLM returned empty content "
                    f"(finish_reason={finish_reason!r}) — falling back to random"
                )
                return _random_decide_actions(context)

            parsed = json.loads(content)
            reasoning = parsed.get("reasoning", "")
            if reasoning:
                logger.info(f"Bot {bot.display_name} reasoning: {reasoning}")
            return parsed.get("actions", [])

    except Exception as e:
        logger.warning(f"LLM call failed for bot {bot.display_name}: {e} — falling back to random")
        return _random_decide_actions(context)


# ---------------------------------------------------------------------------
# Random fallback strategy
# ---------------------------------------------------------------------------

def _random_decide(
    db: Session,
    game: SandboxGame,
    bot: SandboxPlayer,
    context: dict[str, Any],
) -> list[dict]:
    return _random_decide_actions(context)


def _random_decide_actions(context: dict[str, Any]) -> list[dict]:
    """Simple rule-based random strategy used when no LLM is available."""
    actions = []
    props = context["properties"]
    balance = context["bot"]["usdc_balance"]
    holdings = {h["property_id"]: h for h in context["holdings"]}
    mortgages_by_property = {m["property_id"]: m for m in context["mortgages"]}
    turns_remaining = context["game"]["turns_remaining"]

    if not props or balance <= 0:
        return [{"action": "pass"}]

    # End-game: start selling off
    if turns_remaining <= 2:
        for h in context["holdings"]:
            if h["tokens_held"] > 0:
                actions.append({
                    "action": "sell_tokens",
                    "property_id": h["property_id"],
                    "tokens": h["tokens_held"],
                })
        return actions or [{"action": "pass"}]

    # Repay HELOCs if in arrears
    for m in context["mortgages"]:
        if m["turns_in_arrears"] > 0 and m["mortgage_type"] == "heloc" and m.get("drawn_balance"):
            repay = min(m["drawn_balance"], balance * 0.5)
            if repay > 0:
                actions.append({
                    "action": "heloc_repay",
                    "property_id": m["property_id"],
                    "repay_amount": round(repay, 2),
                })
                balance -= repay

    # Buy a random property with ~20-40% of available cash
    if balance > 500 and len(actions) < 3:
        random.shuffle(props)
        for prop in props[:2]:
            spend = round(balance * random.uniform(0.15, 0.35), 2)
            tokens = round(spend / prop["current_price_usd"], 4) if prop["current_price_usd"] > 0 else 0
            if tokens > 0 and spend <= balance:
                actions.append({
                    "action": "buy_tokens",
                    "property_id": prop["property_id"],
                    "tokens": tokens,
                })
                balance -= spend
                break

    # Occasionally sell a holding (20% chance per holding)
    if len(actions) < 3:
        for pid, h in holdings.items():
            if h["tokens_held"] > 0 and random.random() < 0.20:
                sell_tokens = round(h["tokens_held"] * random.uniform(0.3, 0.7), 4)
                if sell_tokens > 0:
                    actions.append({
                        "action": "sell_tokens",
                        "property_id": pid,
                        "tokens": sell_tokens,
                    })
                    break

    return actions or [{"action": "pass"}]


# ---------------------------------------------------------------------------
# Action executor
# ---------------------------------------------------------------------------

def _execute_actions(
    db: Session,
    game: SandboxGame,
    bot: SandboxPlayer,
    actions: list[dict],
) -> None:
    """Execute the list of actions returned by the LLM or random strategy."""
    for action in actions[:4]:  # hard cap at 4 actions per turn
        act = action.get("action")
        if not act or act == "pass":
            continue

        prop_id = action.get("property_id")

        try:
            if act == "buy_tokens":
                tokens = float(action.get("tokens", 0))
                if tokens > 0 and prop_id:
                    sandbox_service.execute_trade(
                        db, game.id, bot.clerk_user_id, prop_id, "buy", tokens
                    )

            elif act == "sell_tokens":
                tokens = float(action.get("tokens", 0))
                if tokens > 0 and prop_id:
                    sandbox_service.execute_trade(
                        db, game.id, bot.clerk_user_id, prop_id, "sell", tokens
                    )

            elif act == "originate_mortgage":
                tokens = float(action.get("tokens", 0))
                if tokens > 0 and prop_id:
                    sandbox_service.originate_mortgage(
                        db, game.id, bot.clerk_user_id, prop_id, tokens
                    )

            elif act == "heloc_draw":
                amount = float(action.get("draw_amount", 0))
                if amount > 0 and prop_id:
                    sandbox_service.draw_heloc(
                        db, game.id, bot.clerk_user_id, prop_id, amount
                    )

            elif act == "heloc_repay":
                amount = float(action.get("repay_amount", 0))
                if amount > 0 and prop_id:
                    sandbox_service.repay_heloc(
                        db, game.id, bot.clerk_user_id, prop_id, amount
                    )

        except ValueError as e:
            logger.debug(f"Bot {bot.display_name} action {act!r} on {prop_id!r} rejected: {e}")
        except Exception as e:
            logger.warning(f"Bot {bot.display_name} action {act!r} error: {e}", exc_info=True)


# ---------------------------------------------------------------------------
# Bot management helpers (called by sandbox_service)
# ---------------------------------------------------------------------------

def add_bot(
    db: Session,
    game: SandboxGame,
    display_name: str,
    strategy: str = "balanced",
    personality: str | None = None,
) -> SandboxPlayer:
    """
    Add a bot player to a game. Only valid while the game is in lobby status.
    The bot gets a synthetic clerk_user_id prefixed with 'bot_' so it never
    collides with real Clerk user IDs.
    """
    from app.core.config import settings

    if game.status != "lobby":
        raise ValueError("Can only add bots while the game is in lobby status")

    from app.models.sandbox import SandboxPlayer
    player_count = db.query(SandboxPlayer).filter(SandboxPlayer.game_id == game.id).count()
    if player_count >= settings.SANDBOX_MAX_PLAYERS:
        raise ValueError(f"Game is full ({settings.SANDBOX_MAX_PLAYERS} players max)")

    valid_strategies = list(_STRATEGY_PROMPTS.keys())
    if strategy not in valid_strategies:
        raise ValueError(f"Invalid strategy {strategy!r}. Choose from: {valid_strategies}")

    bot_clerk_id = f"bot_{uuid.uuid4().hex[:16]}"
    bot = SandboxPlayer(
        id=str(uuid.uuid4()),
        game_id=game.id,
        clerk_user_id=bot_clerk_id,
        display_name=display_name or f"Bot ({strategy})",
        usdc_balance=game.starting_balance_usdc,
        is_host=False,
        is_ready=False,
        is_bot=True,
        bot_strategy=strategy,
        bot_personality=personality or display_name,
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


def remove_bot(db: Session, game_id: str, bot_player_id: str) -> None:
    """Remove a bot player from a game (lobby only)."""
    from app.models.sandbox import SandboxPlayer
    bot = db.query(SandboxPlayer).filter(
        SandboxPlayer.id == bot_player_id,
        SandboxPlayer.game_id == game_id,
        SandboxPlayer.is_bot == True,
    ).first()
    if not bot:
        raise ValueError("Bot player not found in this game")

    game = db.query(SandboxGame).filter(SandboxGame.id == game_id).first()
    if game and game.status != "lobby":
        raise ValueError("Can only remove bots while the game is in lobby status")

    db.delete(bot)
    db.commit()
