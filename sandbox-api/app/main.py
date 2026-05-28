import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', '.env'))

from sqlalchemy import text

from app.core.config import settings
from app.core.database import init_db, engine
from app.core.middleware import RequestIDMiddleware, RateLimitMiddleware
from app.core.clerk_auth import ClerkAuthMiddleware
from app.core.security import APIKeyMiddleware
from app.core.logging import logger

# Register all models so init_db / Base.metadata.create_all picks them up
import app.models.user     # noqa: F401
import app.models.sandbox  # noqa: F401

app = FastAPI(
    title="Rentline Sandbox API",
    description="Real estate simulation game engine — sandbox.rentline.xyz",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


# ── Global exception handlers ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(
        f"Unhandled exception [{request_id}] {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if exc.status_code == 500 and isinstance(detail, str):
        logger.error(f"HTTP 500 [{request.url.path}]: {detail}")
        detail = "Internal server error"
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


# ── Middleware ────────────────────────────────────────────────────────────────
# Last added = outermost = runs first

allowed_origins = (
    settings.ALLOWED_ORIGINS.split(",")
    if settings.ALLOWED_ORIGINS != "*"
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(APIKeyMiddleware)
app.add_middleware(ClerkAuthMiddleware)


# ── Routers ───────────────────────────────────────────────────────────────────

from app.api.routes.health import router as health_router
from app.api.routes.sandbox import router as sandbox_router
from app.api.routes.ws import router as ws_router
from app.api.routes.api_keys import router as api_keys_router

app.include_router(health_router)
app.include_router(sandbox_router, prefix="/api")
app.include_router(api_keys_router, prefix="/api")
app.include_router(ws_router, prefix="/api")


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    from app.core.ws_manager import _capture_loop
    _capture_loop()

    if not settings.CLERK_JWKS_URL:
        logger.warning("CLERK_JWKS_URL not set — Clerk JWT verification disabled")
    if not settings.CLERK_ISSUER:
        logger.warning("CLERK_ISSUER not set — JWT issuer validation disabled")
    if not settings.SUPABASE_URL:
        logger.warning("SUPABASE_URL not set — Supabase dual-write disabled")

    init_db()

    # Run idempotent column migrations (safe to run on every boot)
    try:
        from app.migrations import run as run_migrations
        run_migrations()
    except Exception as e:
        logger.warning(f"Migration warning (non-fatal): {e}")

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection OK")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise

    if settings.RENTLINE_API_URL:
        logger.info(f"Rentline ledger bridge: {settings.RENTLINE_API_URL}")
    else:
        logger.info("Rentline ledger bridge: disabled (RENTLINE_API_URL not set)")

    if settings.RWA_ISSUER_URL:
        logger.info(f"rwa-issuer-sim: {settings.RWA_ISSUER_URL}")
    else:
        logger.info("rwa-issuer-sim: disabled (RWA_ISSUER_URL not set) — property pool sync unavailable")

    # Start the autonomous game runner background task
    import asyncio
    from app.services.sandbox_runner import start_runner
    asyncio.create_task(start_runner())

    logger.info(f"Rentline Sandbox API v{settings.VERSION} started on {settings.HOST}:{settings.PORT}")
