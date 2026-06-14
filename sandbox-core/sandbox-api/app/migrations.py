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

    # Agent delegation fields on sandbox_players (added with delegation feature)
    ("sandbox_players", "agent_delegate",       "BOOLEAN NOT NULL DEFAULT 0"),
    ("sandbox_players", "delegate_strategy",    "VARCHAR"),
    ("sandbox_players", "last_action_turn",     "INTEGER NOT NULL DEFAULT 0"),

    # Judgment / deficiency lien support
    ("sandbox_games",   "judgment_on_shortfall",  "BOOLEAN NOT NULL DEFAULT 0"),
    ("sandbox_players", "judgment_balance",        "REAL NOT NULL DEFAULT 0"),

    # Property improvement / PACE config
    ("sandbox_games", "upgrade_cost_pct",            "REAL NOT NULL DEFAULT 0.08"),
    ("sandbox_games", "improvement_value_add_pct",   "REAL NOT NULL DEFAULT 0.05"),
    ("sandbox_games", "pace_spread",                 "REAL NOT NULL DEFAULT 0.015"),

    # Property grade + mechanics lien on game properties
    ("sandbox_game_properties", "grade",                  "VARCHAR NOT NULL DEFAULT 'C'"),
    ("sandbox_game_properties", "mechanics_lien_amount",  "REAL NOT NULL DEFAULT 0"),

    # Turn duration config
    ("sandbox_games", "turn_duration",         "VARCHAR NOT NULL DEFAULT 'month'"),
    ("sandbox_games", "turn_duration_seconds",  "INTEGER NOT NULL DEFAULT 1800"),
    ("sandbox_games", "turn_started_at",        "DATETIME"),

    # Holding acquisition turn for yield tracking
    ("sandbox_holdings", "acquired_turn", "INTEGER NOT NULL DEFAULT 0"),

    # Explicit condition grade on pool properties (set at sync time, not derived from cap_rate)
    ("sandbox_properties", "initial_grade", "VARCHAR NOT NULL DEFAULT 'C'"),

    # Property token address — EVM address of PropertyToken contract (Phase 1 RWA integration)
    ("sandbox_properties", "token_address", "TEXT"),

    # Per-game PropertyToken address carried from pool at game creation (Phase 3 RWA integration)
    ("sandbox_game_properties", "token_address", "TEXT"),
]


def run():
    logger.info("Running sandbox-api schema migrations...")
    with engine.connect() as conn:
        for table, column, definition in MIGRATIONS:
            add_column(conn, table, column, definition)
    logger.info("Migrations complete.")


if __name__ == "__main__":
    run()
