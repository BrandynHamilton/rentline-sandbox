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

# ── OpenAPI security schemes ───────────────────────────────────────────────────
# Adds the Authorize button to /docs so API keys and Bearer tokens can be set
# and will be sent automatically with every Try it out request.

from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {}).update({
        "ApiKeyHeader": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "Admin key (`ADMIN_API_KEY`) or a user `sb_` key",
        },
        "BearerToken": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Clerk session JWT (`Authorization: Bearer <token>`)",
        },
    })
    # Apply both schemes globally — each endpoint only needs whichever applies
    schema["security"] = [{"ApiKeyHeader": []}, {"BearerToken": []}]
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi


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

# CORS — allow_credentials=True is incompatible with allow_origins=["*"] per the CORS spec
# (browsers reject it). Always require explicit origins in production.
_raw_origins = settings.ALLOWED_ORIGINS.strip()
if _raw_origins == "*":
    # Wildcard with credentials is invalid — fall back to no-credentials open mode.
    # This should never happen in production; set ALLOWED_ORIGINS to explicit domains.
    logger.warning(
        "ALLOWED_ORIGINS='*' is set. Credentials will be disabled for CORS. "
        "Set ALLOWED_ORIGINS to explicit domain(s) in production."
    )
    _allow_origins = ["*"]
    _allow_credentials = False
else:
    _allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    _allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "X-API-Key", "Content-Type", "X-Request-ID"],
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
from app.api.routes.properties import router as properties_router

app.include_router(health_router)
app.include_router(sandbox_router, prefix="/api")
app.include_router(api_keys_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(properties_router, prefix="/api/sandbox")


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
    if not settings.ADMIN_API_KEY:
        logger.warning(
            "ADMIN_API_KEY not set — admin routes are unprotected and "
            "all write routes bypass API key auth (dev mode). "
            "Set ADMIN_API_KEY in production."
        )

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
