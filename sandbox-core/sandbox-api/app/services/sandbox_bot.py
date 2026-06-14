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
        "You are an aggressive real estate investor. Maximise leverage and returns. "
        "Use originate_mortgage to buy properties at max LTV. Deploy all available cash each turn. "
        "Accept high default risk. Concentrate in 1-2 high-value properties. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
    ),
    "conservative": (
        "You are a conservative real estate investor. Preserve capital and avoid default risk. "
        "Keep 3+ months of debt service in cash at all times. Buy tokens all-cash, avoid mortgages. "
        "Diversify across 3+ properties. Sell if LTV exceeds 50%. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
    ),
    "balanced": (
        "You are a balanced real estate investor. Mix income and growth. "
        "Use moderate leverage (50-60% LTV). Diversify across 2-3 properties. "
        "Rebalance if one holding exceeds 50% of portfolio. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
    ),
    "momentum": (
        "You are a momentum investor. Chase appreciating assets. "
        "Buy properties that appreciated last turn, sell those that depreciated. "
        "Use moderate leverage. React quickly to macro events. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
    ),
    "income": (
        "You are a yield-focused investor. Maximise rental income. "
        "Buy properties with highest cap rate. Hold long-term, avoid selling. "
        "Keep leverage low so debt service never threatens yield. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
    ),
    "value_add": (
        "You are a value-add investor. Buy distressed (Grade D/F), improve, refinance. "
        "Step 1: originate_mortgage on a D/F property. "
        "Step 2: pace_lien with target_grade='C' to upgrade it. "
        "Step 3: refi_mortgage with cash_out_amount>0 to extract equity. Repeat. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
    ),
    "conservative": (
        "You are a conservative real estate investor. Preserve capital and avoid default risk. "
        "Keep 3+ months of debt service in cash at all times. Buy tokens all-cash, avoid mortgages. "
        "Diversify across 3+ properties. Sell if LTV exceeds 50%. "
        "Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, "
        "heloc_draw, heloc_repay, pace_lien, improve_property, pass."
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

    Also used for agent-delegated human players (is_bot may be False).
    """
    if not bot.is_bot and not bot.agent_delegate:
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


def run_delegated_players(db: Session, game: SandboxGame) -> None:
    """
    Run agent delegation for any human players who:
      1. Have agent_delegate=True, AND
      2. Have not acted this turn (last_action_turn < game.current_turn)

    Uses the player's delegate_strategy (defaulting to 'balanced') as the bot
    persona. Called before advance_turn() so delegated actions are counted in
    the current trade window.
    """
    delegated = [
        p for p in game.players
        if not p.is_bot
        and p.agent_delegate
        and p.last_action_turn < game.current_turn
    ]
    for player in delegated:
        # Temporarily apply the delegate strategy so _llm_decide picks it up
        original_strategy = player.bot_strategy
        original_personality = player.bot_personality
        player.bot_strategy = player.delegate_strategy or "balanced"
        player.bot_personality = f"{player.display_name} (delegated)"
        try:
            logger.info(
                f"Agent delegation: acting for {player.display_name} "
                f"(strategy={player.bot_strategy}) in game {game.id} turn {game.current_turn}"
            )
            run_bot_turn(db, game, player)
        finally:
            player.bot_strategy = original_strategy
            player.bot_personality = original_personality


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
            "property_id": gp.property_id,
            "name": prop.name if prop else gp.property_id,
            "grade": getattr(gp, "grade", "C"),
            "price": round(gp.current_price_usd, 2),
            "rent": round(gp.current_rent_usd, 2),
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
                "tokens": round(h.tokens_held, 4),
                "value": round(h.tokens_held * current_price, 2),
                "pnl": round(
                    h.tokens_held * (current_price - (h.avg_purchase_price_usd or current_price)), 2
                ),
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

    # Recent feed events — last 2 turns only, capped at 8 lines to keep context small
    recent_events = sandbox_service.get_feed(
        db, game.id, turn=None, skip=0, limit=20
    )
    feed_summary = [
        f"[T{e.turn}] {e.event_type}: {e.description[:80]}"
        for e in recent_events
        if e.turn >= game.current_turn - 1
    ][:8]

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


def _strip_json_fences(text: str) -> str:
    """Extract the first valid JSON object from model output.
    Handles markdown fences, extra prefixes, and the {\"{ double-open pattern
    that some models emit (e.g. {\"reasoning\":... wrapped in an extra {\"})."""
    text = text.strip()
    # Strip markdown fences
    if text.startswith("```"):
        text = text[text.index("\n") + 1:] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:text.rfind("```")]
    text = text.strip()
    # Find the start of the real JSON object — look for {"reasoning" or {"actions"
    # to skip any spurious prefix characters the model added
    for key in ('"reasoning"', '"actions"'):
        idx = text.find(key)
        if idx > 0:
            # Walk back to find the opening {
            brace = text.rfind("{", 0, idx)
            if brace != -1:
                text = text[brace:]
                break
    # Final fallback: outermost { ... }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]
    return text


def _llm_decide(bot: SandboxPlayer, context: dict[str, Any]) -> list[dict]:
    """Call OpenAI to decide what actions the bot takes this turn."""
    strategy = bot.bot_strategy or _DEFAULT_STRATEGY
    personality = bot.bot_personality or bot.display_name
    system_prompt = _STRATEGY_PROMPTS.get(strategy, _STRATEGY_PROMPTS[_DEFAULT_STRATEGY])

    # Slim context — only what the LLM needs, nothing extra
    slim = {
        "turn": context["game"]["current_turn"],
        "turns_left": context["game"]["turns_remaining"],
        "cash": context["bot"]["usdc_balance"],
        "nav": context["bot"]["nav"],
        "fed_rate": context["game"]["fed_rate_current"],
        "mortgage_rate": context["game"]["base_mortgage_rate"],
        "properties": context["properties"][:5],           # cap at 5
        "holdings": list(context["holdings"].values())[:5] if isinstance(context["holdings"], dict) else context["holdings"][:5],
        "mortgages": [
            {k: m[k] for k in ("property_id", "mortgage_type", "current_balance", "monthly_payment", "turns_in_arrears") if k in m}
            for m in context["mortgages"]
        ],
        "macros": context.get("macros", [])[:3],           # cap at 3
    }

    debt_service = sum(m.get("monthly_payment", 0) for m in context["mortgages"])

    user_message = (
        f"You are {personality}, a real estate investor.\n"
        f"GAME STATE: {json.dumps(slim, separators=(',', ':'))}\n"
        f"Keep cash > ${debt_service:,.0f} for debt service. Max 3 actions.\n"
        f"Valid actions: buy_tokens, sell_tokens, originate_mortgage, refi_mortgage, heloc_draw, heloc_repay, pace_lien, improve_property, pass.\n"
        f"Respond with COMPACT JSON (no whitespace): "
        f'{{"reasoning":"1 sentence","actions":[{{"action":"buy_tokens","property_id":"...","tokens":0}}]}}'
    )

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
                    "max_tokens": 1000,
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

            logger.debug(f"Bot {bot.display_name} raw response: {repr(content[:200])}")

            parsed = json.loads(_strip_json_fences(content))
            reasoning = parsed.get("reasoning", "")
            if reasoning:
                logger.info(f"Bot {bot.display_name} reasoning: {reasoning}")
            return parsed.get("actions", [])

    except Exception as e:
        logger.warning(f"LLM call failed for bot {bot.display_name}: {e} — falling back to random")
        if content:
            logger.warning(f"Bot {bot.display_name} failed content: {repr(content[:300])}")
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

    # Value-add strategy: target D/F properties for PACE improvement
    strategy = context.get("bot", {}).get("strategy", "balanced")
    if strategy == "value_add" and len(actions) < 3:
        distressed = [p for p in props if p.get("grade") in ("D", "F")]
        if distressed:
            target = distressed[0]
            pid = target["property_id"]
            in_holdings = holdings.get(pid, {})
            if not in_holdings or in_holdings.get("tokens_held", 0) <= 0:
                # Buy it with a mortgage first
                actions.append({
                    "action": "originate_mortgage",
                    "property_id": pid,
                    "tokens_to_buy": round(balance * 0.25 / target["price"], 4)
                    if target["price"] > 0 else 0,
                })
            else:
                # Already own it — PACE improve to C
                actions.append({
                    "action": "pace_lien",
                    "property_id": pid,
                    "target_grade": "C",
                })
        return actions or [{"action": "pass"}]

    # Buy a random property with ~20-40% of available cash
    if balance > 500 and len(actions) < 3:
        random.shuffle(props)
        for prop in props[:2]:
            spend = round(balance * random.uniform(0.15, 0.35), 2)
            tokens = round(spend / prop["price"], 4) if prop["price"] > 0 else 0
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

            elif act == "pace_lien":
                target_grade = action.get("target_grade", "C")
                if prop_id and target_grade:
                    sandbox_service.originate_pace_lien(
                        db, game.id, bot.clerk_user_id, prop_id, target_grade
                    )

            elif act == "improve_property":
                target_grade = action.get("target_grade", "C")
                if prop_id and target_grade:
                    sandbox_service.improve_property(
                        db, game.id, bot.clerk_user_id, prop_id, target_grade
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
