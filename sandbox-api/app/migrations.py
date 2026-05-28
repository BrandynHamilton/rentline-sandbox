"""
app/migrations.py — idempotent schema migrations for sandbox-api.

Runs all ALTER TABLE statements needed to bring an existing database up to date
with the current ORM models. Safe to run on every boot — each migration checks
whether the column already exists before adding it.

Usage (manual):
  uv run python -c "from app.migrations import run; run()"
  # or inside docker:
  docker compose exec sandbox-api uv run python -c "from app.migrations import run; run()"
"""

from app.core.database import engine
from app.core.logging import logger
from sqlalchemy import text, inspect


def column_exists(conn, table: str, column: str) -> bool:
    result = conn.execute(text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in result)


def add_column(conn, table: str, column: str, definition: str) -> None:
    if column_exists(conn, table, column):
        logger.info(f"  skip  {table}.{column} (already exists)")
    else:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        conn.commit()
        logger.info(f"  added {table}.{column}")


MIGRATIONS = [
    # Bot player fields on sandbox_players (added with bot feature)
    ("sandbox_players", "is_bot",           "BOOLEAN NOT NULL DEFAULT 0"),
    ("sandbox_players", "bot_strategy",     "VARCHAR"),
    ("sandbox_players", "bot_personality",  "VARCHAR"),

    # Autonomous mode fields on sandbox_games (added with autonomous mode feature)
    ("sandbox_games",   "auto_advance",                 "BOOLEAN NOT NULL DEFAULT 0"),
    ("sandbox_games",   "auto_advance_delay_seconds",   "INTEGER NOT NULL DEFAULT 30"),
]


def run():
    logger.info("Running sandbox-api schema migrations...")
    with engine.connect() as conn:
        for table, column, definition in MIGRATIONS:
            add_column(conn, table, column, definition)
    logger.info("Migrations complete.")


if __name__ == "__main__":
    run()
