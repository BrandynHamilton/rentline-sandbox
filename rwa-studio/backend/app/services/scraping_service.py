"""
Scraping service for property data from MLS/Zillow URLs.

Supports two backends (dynamically selected):
  1. HTTPayer proxy — if HTTPAYER_API_KEY is set (user has HTTPayer credits)
  2. x402 SDK — if X402_PRIVATE_KEY is set (user has a funded EVM wallet)
"""
import os
import json
import requests
from typing import Optional

from pydantic import BaseModel, Field
from typing import List

from app.core.config import settings
from app.core.logging import logger

HTTPAYER_PROXY_URL = "https://api.httpayer.com/proxy"
FIRECRAWL_URL = "https://mesh.heurist.xyz/x402/agents/FirecrawlSearchDigestAgent/firecrawl_extract_web_data"


# ── x402 backend (lazy import ─ only if needed) ──────────────────────────────

_x402_client = None


def _init_x402():
    global _x402_client
    if _x402_client is not None:
        return _x402_client
    pk = settings.x402_private_key
    if not pk:
        return None
    try:
        from eth_account import Account
        from x402 import x402ClientSync
        from x402.http.clients import x402_requests
        from x402.mechanisms.evm import EthAccountSigner
        from x402.mechanisms.evm.exact.register import register_exact_evm_client
        account = Account.from_key(pk)
        client = x402ClientSync()
        register_exact_evm_client(client, EthAccountSigner(account))
        _x402_client = (client, x402_requests)
        logger.info(f"[scrape] x402 backend — account: {account.address}")
    except ImportError as e:
        logger.warning(f"[scrape] x402 backend unavailable (install x402[requests,evm]): {e}")
        return None
    return _x402_client


# ── Pydantic models ───────────────────────────────────────────────────────────

class Address(BaseModel):
    street: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    full_address: str = ""


class PropertyDetails(BaseModel):
    bedrooms: int = 0
    bathrooms: float = 0
    sqft: int = 0
    lot_size: str = ""
    year_built: int = 0
    property_type: str = ""
    style: str = ""
    stories: int = 0


class ListingDetails(BaseModel):
    mls_number: str = ""
    listing_type: str = ""
    status: str = ""
    listed_date: str = ""
    expiration_date: str = ""
    url: str = ""


class Features(BaseModel):
    interior: List[str] = Field(default_factory=list)
    exterior: List[str] = Field(default_factory=list)
    amenities: List[str] = Field(default_factory=list)
    appliances: List[str] = Field(default_factory=list)
    flooring: List[str] = Field(default_factory=list)
    heating: List[str] = Field(default_factory=list)
    cooling: List[str] = Field(default_factory=list)
    parking: List[str] = Field(default_factory=list)
    roof: List[str] = Field(default_factory=list)
    foundation: List[str] = Field(default_factory=list)


class Neighborhood(BaseModel):
    name: str = ""
    description: str = ""
    schools: List[str] = Field(default_factory=list)
    walk_score: int = 0
    transit_score: int = 0


class Financial(BaseModel):
    price_per_sqft: float = 0
    hoa_fee: float = 0
    hoa_fee_frequency: str = ""
    taxes_annual: float = 0
    utilities_included: List[str] = Field(default_factory=list)


class Media(BaseModel):
    photos: List[str] = Field(default_factory=list)
    virtual_tour_url: str = ""
    video_url: str = ""


class AgentInfo(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""
    company: str = ""


class MetaInfo(BaseModel):
    scraped_at: str = ""
    source_url: str = ""
    source_type: str = ""
    confidence_score: float = 0


class PropertyMetadata(BaseModel):
    """Pydantic model for property metadata - defines the structure for scraping."""
    price: str = ""
    address: Address = Field(default_factory=Address)
    property_details: PropertyDetails = Field(default_factory=PropertyDetails)
    listing_details: ListingDetails = Field(default_factory=ListingDetails)
    features: Features = Field(default_factory=Features)
    neighborhood: Neighborhood = Field(default_factory=Neighborhood)
    financial: Financial = Field(default_factory=Financial)
    media: Media = Field(default_factory=Media)
    agent_info: AgentInfo = Field(default_factory=AgentInfo)
    meta: MetaInfo = Field(default_factory=MetaInfo)


def get_scraping_prompt() -> str:
    return (
        "Extract ALL property details from this real estate listing page. "
        "The page may be in any language (English, Spanish, Portuguese, French, etc.) — "
        "extract the data regardless of language. "
        "Include: price (with currency symbol), full address, bedrooms, bathrooms, "
        "square footage (convert m² to sqft by multiplying by 10.764 if needed), "
        "lot size, year built, property type, listing status, MLS number, "
        "agent name and contact, amenities, and any other relevant listing information. "
        "IMPORTANT for price: the listing price is often shown with a dollar sign "
        "like $8,900,000 or $1,250,000 — extract ONLY the numeric listing price "
        "(e.g. '$8,900,000'), NOT per-unit prices or cap rates. "
        "Return as valid JSON only."
    )


# ── HTTPayer backend ─────────────────────────────────────────────────────────

def _scrape_via_httpayer(url: str, prompt: str) -> dict:
    payload = {
        "extraction_prompt": prompt,
        "urls": [url],
    }
    resp = requests.post(
        HTTPAYER_PROXY_URL,
        json={
            "api_url": FIRECRAWL_URL,
            "method": "POST",
            "json": payload,
        },
        headers={
            "Content-Type": "application/json",
            "x-api-key": settings.httpayer_api_key,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


# ── x402 backend ─────────────────────────────────────────────────────────────

def _scrape_via_x402(url: str, prompt: str) -> dict:
    client, x402_requests = _init_x402()
    payload = {
        "extraction_prompt": prompt,
        "urls": [url],
    }
    with x402_requests(client) as session:
        resp = session.post(FIRECRAWL_URL, json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()


# ── Public entry point ────────────────────────────────────────────────────────

def scrape_property_url(url: str, extraction_prompt: Optional[str] = None) -> dict:
    """
    Scrape property data from a URL.

    Backend selection (first available wins):
      1. HTTPAYER_API_KEY → HTTPayer proxy (user has HTTPayer credits)
      2. X402_PRIVATE_KEY → x402 SDK direct (user has funded EVM wallet)

    Raises:
        ValueError: If no backend is configured.
        Exception: If scraping fails.
    """
    if extraction_prompt is None:
        extraction_prompt = get_scraping_prompt()

    # ── Prefer HTTPayer (credits-based, no USDC needed) ────────────────────
    if settings.httpayer_api_key:
        logger.info(f"[scrape] backend=httpayer {url}")
        try:
            return _scrape_via_httpayer(url, extraction_prompt)
        except Exception as e:
            logger.error(f"[scrape] HTTPayer failed for {url}: {e}")
            raise

    # ── Fall back to x402 SDK ──────────────────────────────────────────────
    x402_backend = _init_x402()
    if x402_backend is not None:
        logger.info(f"[scrape] backend=x402 {url}")
        try:
            return _scrape_via_x402(url, extraction_prompt)
        except Exception as e:
            logger.error(f"[scrape] x402 failed for {url}: {e}")
            raise

    raise ValueError(
        "No scraping backend configured. "
        "Set HTTPAYER_API_KEY (HTTPayer credits) or X402_PRIVATE_KEY (EVM wallet) in .env"
    )


def extract_property_metadata(scrape_result: dict) -> dict:
    if not isinstance(scrape_result, dict):
        return {}

    # Peel off HTTPayer proxy wrapper if present
    inner = scrape_result.get("result", scrape_result)
    if inner is not scrape_result:
        logger.debug(f"[extract] result keys={list(inner.keys()) if isinstance(inner, dict) else type(inner).__name__}")

    # ── Firecrawl agent response (wrapped or bare) ──────────────────────────
    # Shape: { ..., "data": { "extracted_data": { "data": { ...fields... } } } }
    try:
        extracted_data = (
            inner
            .get("data", {})
            .get("extracted_data", {})
        )
        if isinstance(extracted_data, dict):
            inner_data = extracted_data.get("data", {})
            if isinstance(inner_data, dict) and inner_data:
                return inner_data
            # extracted_data itself might be the property fields
            firecrawl_meta = {"id", "status", "expiresAt", "success", "error", "warning", "sources"}
            property_fields = {k: v for k, v in extracted_data.items() if k not in firecrawl_meta}
            if property_fields:
                return property_fields
    except AttributeError:
        pass

    # ── HTTPayer direct result wrapper ──────────────────────────────────────
    # Shape: { "status": "success", "data": { ...property fields... } }
    if isinstance(inner, dict):
        status_data = inner.get("data", {})
        if isinstance(status_data, dict) and status_data:
            return status_data

    # ── Top-level data ─────────────────────────────────────────────────────
    if "data" in inner and isinstance(inner["data"], dict):
        return inner["data"]
    if "data" in inner and isinstance(inner["data"], list):
        if inner["data"]:
            return inner["data"][0]

    # ── extracted_content string ───────────────────────────────────────────
    if "extracted_content" in inner:
        try:
            return json.loads(inner["extracted_content"])
        except (json.JSONDecodeError, TypeError):
            return {"raw_content": inner["extracted_content"]}

    # ── markdown blob ──────────────────────────────────────────────────────
    if "markdown" in inner:
        return {"markdown": inner["markdown"]}

    logger.warning(
        f"[scrape] extract_property_metadata: unrecognised shape — "
        f"top_keys={list(scrape_result.keys())} "
        f"inner_type={type(inner).__name__} "
        f"inner_keys={list(inner.keys()) if isinstance(inner, dict) else 'N/A'}"
    )
    return {}


def validate_property_metadata(metadata: dict) -> PropertyMetadata:
    try:
        return PropertyMetadata(**metadata)
    except Exception as e:
        raise ValueError(f"Metadata validation failed: {e}")
