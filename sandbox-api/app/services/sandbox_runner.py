"""
sandbox_runner.py — Autonomous game runner.

Runs a single asyncio background loop (started at API startup) that periodically
polls the database for games with `auto_advance=True` and status `trading`,
advances them one turn, runs all bot players, then waits `auto_advance_delay_seconds`
before the next tick.

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
        # Find all active autonomous games
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

    # Advance each game concurrently (but each in its own sync thread)
    tasks = [asyncio.create_task(_advance_game(game_id)) for game_id in game_ids]
    await asyncio.gather(*tasks, return_exceptions=True)


async def _advance_game(game_id: str) -> None:
    """
    Advance a single game by one turn (runs in an asyncio executor so the sync
    SQLAlchemy calls don't block the event loop).
    """
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _advance_game_sync, game_id)


def _advance_game_sync(game_id: str) -> None:
    """
    Synchronous turn advance for one game. Checks the delay timer, runs
    advance_turn(), runs all bots, then sleeps the remainder of the delay.
    """
    import time
    from app.core.database import SessionLocal
    from app.models.sandbox import SandboxGame
    from app.services.sandbox_engine import advance_turn
    from app.services.sandbox_bot import run_all_bots

    db = SessionLocal()
    try:
        game = db.get(SandboxGame, game_id)
        if not game:
            return
        if not game.auto_advance:
            return
        if game.status not in ("lobby", "trading"):
            # Game completed or paused — disable auto_advance
            if game.status == "completed":
                game.auto_advance = False
                db.commit()
            return

        delay = max(_MIN_DELAY_SECONDS, game.auto_advance_delay_seconds)

        # Check if enough time has passed since last turn advance
        last_update = game.updated_at or game.created_at
        elapsed = (datetime.utcnow() - last_update).total_seconds()
        if elapsed < delay:
            return   # Not time yet

        logger.info(
            f"Autonomous runner: advancing game {game_id} "
            f"(turn {game.current_turn} → {game.current_turn + 1}, "
            f"delay={delay}s, elapsed={elapsed:.1f}s)"
        )

        game = advance_turn(db, game)
        run_all_bots(db, game)

        # If game just completed, disable auto_advance
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
    turns automatically at the specified interval.

    Can be called while the game is in lobby (will advance from turn 0) or
    trading status. The game must not be completed.
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
        f"(delay={delay_seconds}s, current status={game.status!r})"
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
