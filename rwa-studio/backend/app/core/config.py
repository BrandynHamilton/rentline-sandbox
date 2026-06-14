"""
Application settings loaded from environment variables.
Uses pydantic-settings for validation and .env file support.

Factory addresses are resolved in priority order:
  1. Explicit env var (e.g. PROPERTY_TOKEN_FACTORY_ADDRESS=0x... in .env)
  2. Foundry broadcast files (contracts/broadcast/*/run-latest.json)
  3. None — feature gracefully disabled
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # App
    # -------------------------------------------------------------------------
    app_name: str = "rwa-issuer-sim"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # -------------------------------------------------------------------------
    # Database
    # -------------------------------------------------------------------------
    database_url: str = "sqlite:///./rwa_issuer.db"

    # -------------------------------------------------------------------------
    # Metadata / Oracle
    # -------------------------------------------------------------------------
    metadata_dir: str = "./metadata"
    token_uri_base: str = "http://localhost:8000/metadata/"

    # -------------------------------------------------------------------------
    # Robinhood Chain (Arbitrum Orbit)
    # -------------------------------------------------------------------------
    avalanche_rpc_url: str = "https://rpc.testnet.chain.robinhood.com"
    avalanche_chain_id: int = 46630
    avalanche_private_key: Optional[str] = None

    # -------------------------------------------------------------------------
    # Factory contract addresses
    # Auto-loaded from contracts/broadcast/*/run-latest.json if not set in .env
    # -------------------------------------------------------------------------
    property_token_factory_address: Optional[str] = None
    security_token_factory_address: Optional[str] = None
    nft_token_factory_address: Optional[str] = None
    cre_factory_address: Optional[str] = None
    property_llc_factory_address: Optional[str] = None
    investor_registry_factory_address: Optional[str] = None
    governance_factory_address: Optional[str] = None
    distribution_manager_factory_address: Optional[str] = None

    # -------------------------------------------------------------------------
    # Scraping (x402)
    # -------------------------------------------------------------------------
    httpayer_api_key: Optional[str] = None
    x402_private_key: Optional[str] = None

    # -------------------------------------------------------------------------
    # AVM integrations (all optional — graceful no-op if not set)
    # -------------------------------------------------------------------------
    zillow_api_key: Optional[str] = None
    zillow_api_host: str = "zillow-com1.p.rapidapi.com"
    attom_api_key: Optional[str] = None
    attom_api_base: str = "https://api.gateway.attomdata.com/propertyapi/v1.0.0"

    # -------------------------------------------------------------------------
    # Rentline
    # -------------------------------------------------------------------------
    rentline_url: Optional[str] = None
    rentline_admin_api_key: Optional[str] = None
    rentline_admin_wallet: Optional[str] = None

    # -------------------------------------------------------------------------
    # Auth
    # -------------------------------------------------------------------------
    admin_api_key: Optional[str] = None


def _apply_broadcast_fallbacks(s: Settings) -> Settings:
    """
    Fill any None factory address field from the Foundry broadcast files.
    Env vars always take priority — this only fills gaps.
    """
    _factory_fields = [
        "property_token_factory_address",
        "security_token_factory_address",
        "nft_token_factory_address",
        "cre_factory_address",
        "property_llc_factory_address",
        "investor_registry_factory_address",
        "governance_factory_address",
        "distribution_manager_factory_address",
    ]

    # Skip if everything is already set
    if all(getattr(s, f) for f in _factory_fields):
        return s

    try:
        from app.core.broadcast import load_broadcast_addresses
        broadcast = load_broadcast_addresses()
    except Exception:
        return s

    updates = {
        field: broadcast[field]
        for field in _factory_fields
        if getattr(s, field) is None and field in broadcast
    }

    if updates:
        import logging
        log = logging.getLogger("rwa_issuer")
        for field, addr in updates.items():
            log.info(f"[config] {field} → {addr} (from broadcast)")
        return s.model_copy(update=updates)

    return s


settings = _apply_broadcast_fallbacks(Settings())
