"""
SQLAlchemy engine + session factory.
Supports SQLite (dev) and Postgres (prod) via DATABASE_URL.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

# SQLite needs check_same_thread=False for FastAPI's thread-pool workers
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called on app startup."""
    # Import models so SQLAlchemy registers them before create_all
    from app.models import property, valuation, capital_stack, portfolio  # noqa: F401
    Base.metadata.create_all(bind=engine)
