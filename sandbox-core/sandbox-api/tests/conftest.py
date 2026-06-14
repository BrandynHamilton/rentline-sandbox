"""
conftest.py — shared fixtures for the sandbox-api test suite.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

FAKE_CLERK_ID = "user_test_clerk_abc123"
FAKE_ADMIN_KEY = "test-admin-key-xyz"

# ---------------------------------------------------------------------------
# Force bot LLM off for all tests — bots use random strategy instead
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    """Disable LLM calls globally so bots use the fast random strategy."""
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "OPENAI_API_KEY", "")

# ---------------------------------------------------------------------------
# Shared in-memory SQLite engine — one per test, tables rebuilt each time.
# Using a named file-based in-memory DB so multiple connections see the same data.
# ---------------------------------------------------------------------------

_TEST_DB_COUNTER = 0


@pytest.fixture(scope="function")
def engine():
    global _TEST_DB_COUNTER
    _TEST_DB_COUNTER += 1
    # Named in-memory SQLite — multiple connections share the same data within the test
    db_url = f"sqlite:///file:testdb{_TEST_DB_COUNTER}?mode=memory&cache=shared&uri=true"

    from app.core.database import Base
    import app.models.user    # noqa
    import app.models.sandbox # noqa

    eng = create_engine(db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture(scope="function")
def db(engine):
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    yield session
    session.rollback()
    session.close()


# ---------------------------------------------------------------------------
# FastAPI TestClient wired to the test engine.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def client(engine, monkeypatch):
    import app.core.database as db_module
    import app.core.clerk_auth as clerk_auth
    import app.core.security as security
    import app.main as main_module
    import app.api.deps as deps_module
    from app.main import app
    from app.api.deps import get_db          # ← the one routes actually use
    from app.core.config import settings

    settings.ADMIN_API_KEY = FAKE_ADMIN_KEY

    # Patch the module-level engine references so startup uses the test DB
    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(main_module, "engine", engine)

    # Override the get_db dependency to use the test engine
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    # Also patch SessionLocal in deps so the original get_db works if called directly
    monkeypatch.setattr(deps_module, "SessionLocal", Session)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Inject fake Clerk user
    async def fake_clerk_dispatch(self, request, call_next):
        request.state.clerk_user_id = FAKE_CLERK_ID
        request.state.user = {"id": FAKE_CLERK_ID}
        return await call_next(request)

    monkeypatch.setattr(clerk_auth.ClerkAuthMiddleware, "dispatch", fake_clerk_dispatch)

    # Bypass APIKeyMiddleware
    async def fake_api_key_dispatch(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(security.APIKeyMiddleware, "dispatch", fake_api_key_dispatch)

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    return {"X-API-Key": FAKE_ADMIN_KEY}


# ---------------------------------------------------------------------------
# Seed fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def prop(db):
    """A single active SandboxProperty — required for create_game."""
    from app.models.sandbox import SandboxProperty
    import uuid
    p = SandboxProperty(
        id=str(uuid.uuid4()),
        geo_id="test-geo-001",
        name="Test Apartment",
        display_address="123 Test St",
        city="Austin",
        state="TX",
        property_type="residential",
        initial_price_usd=500_000.0,
        monthly_rent_usd=2_500.0,
        cap_rate=0.060,
        is_active=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def game(db, prop):
    """A game in lobby status, created by FAKE_CLERK_ID."""
    from app.services import sandbox_service
    g = sandbox_service.create_game(
        db=db,
        clerk_user_id=FAKE_CLERK_ID,
        display_name="Host",
        name="Test Game",
        max_turns=6,
        starting_balance_usdc=100_000.0,
        fed_meeting_interval=0,
    )
    return g


@pytest.fixture
def game_with_bot(db, game):
    """A lobby game with one balanced bot already added."""
    from app.services.sandbox_bot import add_bot
    add_bot(db, game, display_name="Test Bot", strategy="balanced")
    return game


@pytest.fixture
def trading_game(db, game_with_bot):
    """A game advanced to turn 1 (trading status) with one bot pre-added."""
    from app.services.sandbox_engine import advance_turn
    from app.services.sandbox_bot import run_all_bots
    g = advance_turn(db, game_with_bot)
    run_all_bots(db, g)
    return g
