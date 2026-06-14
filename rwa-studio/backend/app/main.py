"""
FastAPI application entry point.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db
from app.core.logging import logger
from app.api.routes import properties, valuations, tokens, portfolios, capital_stack, metadata, factory


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(settings.metadata_dir, exist_ok=True)
    init_db()
    logger.info(f"[startup] DB initialized at {settings.database_url}")
    logger.info(f"[startup] Metadata dir: {settings.metadata_dir}")
    logger.info(f"[startup] Chain: {settings.avalanche_rpc_url} (id={settings.avalanche_chain_id})")

    avm_sources = []
    if settings.zillow_api_key:
        avm_sources.append("zillow")
    if settings.attom_api_key:
        avm_sources.append("attom")
    logger.info(f"[startup] AVM sources configured: {avm_sources or ['none']}")

    if settings.rentline_url:
        logger.info(f"[startup] Rentline integration: {settings.rentline_url}")
    else:
        logger.info("[startup] Rentline URL not set — push_rentline disabled")

    yield
    # Shutdown (nothing to do)


app = FastAPI(
    title="RWA Studio",
    description=(
        "Sandbox suite for creating, valuing, and tokenizing real estate assets. "
        "Residential (PropertyToken) and commercial capital stacks (SecurityToken + waterfall), "
        "built around Rentline for programmatic fiat → USDC cash flows."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = settings.api_prefix  # /api/v1

app.include_router(properties.router, prefix=PREFIX)
app.include_router(valuations.router, prefix=PREFIX)
app.include_router(tokens.router, prefix=PREFIX)
app.include_router(portfolios.router, prefix=PREFIX)
app.include_router(capital_stack.router, prefix=PREFIX)
app.include_router(factory.router, prefix=PREFIX)
app.include_router(metadata.router)  # /metadata — no versioned prefix (oracle endpoint)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.1.0"}
