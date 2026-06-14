"""
sandbox_runner.py — Autonomous game runner.

Runs a single asyncio background loop (started at API startup) that periodically
polls the database for games with `auto_advance=True` and status `trading`,
and advances them when one of two conditions is met:

  1. ALL human players have marked ready  → advance immediately
  2. turn_duration_seconds has elapsed since the trading window opened
     → advance anyway (idle players are skipped; bots act first)

For all-bot games (no human players), condition 1 fires on every tick once
bots have taken their actions, making the game advance as fast as
auto_advance_delay_seconds allows.

Usage:
  # In main.py startup:
  from app.services.sandbox_runner import start_runner
  asyncio.create_task(start_runner())

  # Via API route (sets auto_advance=True on the game):
  POST /api/sandbox/games/{id}/autonomous        { "delay_seconds": 30 }
  DELETE /api/sandbox/games/{id}/autonomous      (stop)
"""

from __future__ import annotations

import asyncio
from datetime import datetime

from app.core.logging import logger

# Minimum delay between turns to avoid hammering the engine
_MIN_DELAY_SECONDS = 5
# How often the runner polls the DB for new autonomous games (even if none are active)
_POLL_INTERVAL_SECONDS = 5


async def start_runner() -> None:
    """
    Long-running asyncio task. Call once at application startup.
    Polls every _POLL_INTERVAL_SECONDS for games ready to advance.
    """
    logger.info("Autonomous game runner started")
    while True:
        try:
            await _tick()
        except Exception as e:
            logger.error(f"Autonomous runner tick failed: {e}", exc_info=True)
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


async def _tick() -> None:
    """
    One poll cycle. Finds all autonomous games ready to advance and advances them.
    Each game is advanced in its own thread so a slow LLM call doesn't block others.
    """
    from app.core.database import SessionLocal
    from app.models.sandbox import SandboxGame

    db = SessionLocal()
    try:
        games = (
            db.query(SandboxGame)
            .filter(
                SandboxGame.auto_advance == True,
                SandboxGame.status.in_(["lobby", "trading"]),
            )
            .all()
        )
        game_ids = [g.id for g in games]
    finally:
        db.close()

    if not game_ids:
        return

    tasks = [asyncio.create_task(_advance_game(game_id)) for game_id in game_ids]
    await asyncio.gather(*tasks, return_exceptions=True)


async def _advance_game(game_id: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _advance_game_sync, game_id)


def _should_advance(game, players: list) -> tuple[bool, str]:
    """
    Determine whether the game should advance this tick.

    Returns (should_advance, reason).

    Two triggers:
    1. All non-bot human players have marked is_ready=True → advance immediately.
    2. turn_duration_seconds > 0 and deadline has elapsed since turn_started_at.

    For all-bot games (no human players) trigger 1 fires as soon as bots have acted,
    which is every tick. The minimum floor is _MIN_DELAY_SECONDS regardless.
    """
    now = datetime.utcnow()

    # Minimum elapsed guard regardless of trigger
    last_update = game.updated_at or game.created_at
    elapsed_since_update = (now - last_update).total_seconds()
    if elapsed_since_update < _MIN_DELAY_SECONDS:
        return False, "min_delay_not_reached"

    human_players = [p for p in players if not getattr(p, "is_bot", False)]

    # Trigger 1: all ready (human or bot)
    if human_players:
        all_ready = all(p.is_ready for p in human_players)
        if all_ready:
            return True, "all_players_ready"

    # Check if all non-ready human players have agent_delegate enabled
    # If so, treat as all-bot (use auto_advance_delay_seconds)
    non_ready_humans = [p for p in human_players if not p.is_ready]
    all_delegated = non_ready_humans and all(
        getattr(p, "agent_delegate", False) for p in non_ready_humans
    )
    if all_delegated:
        delay = max(_MIN_DELAY_SECONDS, game.auto_advance_delay_seconds)
        if elapsed_since_update >= delay:
            return True, f"delegated_delay_{delay}s"
        return False, "delegated_delay_not_reached"

    # Pure all-bot game: no human players at all
    if not human_players:
        # All-bot game: use auto_advance_delay_seconds as the clock
        delay = max(_MIN_DELAY_SECONDS, game.auto_advance_delay_seconds)
        if elapsed_since_update >= delay:
            return True, f"all_bot_delay_{delay}s"
        return False, "bot_delay_not_reached"

    # Trigger 2: deadline elapsed
    deadline_seconds = getattr(game, "turn_duration_seconds", 1800)
    if deadline_seconds > 0:
        turn_start = getattr(game, "turn_started_at", None) or last_update
        elapsed_since_turn = (now - turn_start).total_seconds()
        if elapsed_since_turn >= deadline_seconds:
            return True, f"deadline_elapsed_{elapsed_since_turn:.0f}s"

    return False, "waiting_for_players"


def _advance_game_sync(game_id: str) -> None:
    """
    Synchronous turn advance for one game. Checks advance conditions, runs
    advance_turn(), then runs all bots.
    """
    from app.core.database import SessionLocal
    from app.models.sandbox import SandboxGame, SandboxPlayer
    from app.services.sandbox_engine import advance_turn
    from app.services.sandbox_bot import run_all_bots, run_delegated_players

    db = SessionLocal()
    try:
        game = db.get(SandboxGame, game_id)
        if not game or not game.auto_advance:
            return
        if game.status not in ("lobby", "trading"):
            if game.status == "completed":
                game.auto_advance = False
                db.commit()
            return

        players = (
            db.query(SandboxPlayer)
            .filter(SandboxPlayer.game_id == game_id)
            .all()
        )

        should, reason = _should_advance(game, players)
        if not should:
            return

        logger.info(
            f"Autonomous runner: advancing game {game_id} "
            f"turn {game.current_turn} → {game.current_turn + 1} "
            f"(reason={reason})"
        )

        # Run agent delegation for idle human players before advancing
        if game.status == "trading":
            run_delegated_players(db, game)

        game = advance_turn(db, game)
        run_all_bots(db, game)

        if game.status == "completed":
            game.auto_advance = False
            db.commit()
            logger.info(f"Autonomous runner: game {game_id} completed — auto_advance disabled")

    except Exception as e:
        logger.error(f"Autonomous runner failed for game {game_id}: {e}", exc_info=True)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Service helpers — called by routes to enable/disable autonomous mode
# ---------------------------------------------------------------------------

def enable_autonomous(
    db,
    game_id: str,
    delay_seconds: int = 30,
) -> "SandboxGame":
    """
    Enable autonomous mode for a game. The background runner will start advancing
    turns automatically based on ready-checks and the turn_duration_seconds deadline.

    delay_seconds is used as the all-bot turn interval when no human players are present.
    """
    from app.models.sandbox import SandboxGame

    game = db.get(SandboxGame, game_id)
    if not game:
        raise ValueError(f"Game {game_id!r} not found")
    if game.status == "completed":
        raise ValueError("Game is already completed")

    delay_seconds = max(_MIN_DELAY_SECONDS, delay_seconds)
    game.auto_advance = True
    game.auto_advance_delay_seconds = delay_seconds
    db.commit()
    db.refresh(game)
    logger.info(
        f"Autonomous mode enabled for game {game_id} "
        f"(bot_delay={delay_seconds}s, turn_window={getattr(game, 'turn_duration_seconds', 1800)}s)"
    )
    return game


def disable_autonomous(db, game_id: str) -> "SandboxGame":
    """Disable autonomous mode for a game."""
    from app.models.sandbox import SandboxGame

    game = db.get(SandboxGame, game_id)
    if not game:
        raise ValueError(f"Game {game_id!r} not found")

    game.auto_advance = False
    db.commit()
    db.refresh(game)
    logger.info(f"Autonomous mode disabled for game {game_id}")
    return game
