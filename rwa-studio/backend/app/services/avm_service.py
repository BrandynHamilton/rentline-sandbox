"""
AVM (Automated Valuation Model) service.

Fetches property valuations from third-party APIs.
Each fetcher is independent and fail-safe — a failed source does not block others.

Supported sources:
  - zillow   : Zillow Bridge API via RapidAPI (ZILLOW_API_KEY required)
  - attom    : ATTOM Property API (ATTOM_API_KEY required)
  - manual   : User-supplied value (no API call — handled in routes)

To add a new AVM:
  1. Add its API key to config.py + .env.example
  2. Implement _fetch_<provider>() below
  3. Register it in fetch_all_avms()
"""
import json
from datetime import datetime
from typing import Optional

import httpx

from app.core.config import settings
from app.core.logging import logger


# ── Result dataclass ──────────────────────────────────────────────────────────

class AVMResult:
    def __init__(self, source: str, avm_value: float, raw_response: dict):
        self.source = source
        self.avm_value = avm_value
        self.raw_response = json.dumps(raw_response)
        self.fetched_at = datetime.utcnow()


# ── Zillow Bridge API (RapidAPI) ──────────────────────────────────────────────

async def _fetch_zillow(address: str) -> Optional[AVMResult]:
    """
    Fetch Zestimate from Zillow Bridge API (hosted on RapidAPI).
    Docs: https://rapidapi.com/apimaker/api/zillow-com1
    """
    if not settings.zillow_api_key:
        logger.debug("[avm/zillow] ZILLOW_API_KEY not set — skipping")
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: Search property to get zpid
            search_resp = await client.get(
                "https://zillow-com1.p.rapidapi.com/propertyExtendedSearch",
                params={"location": address},
                headers={
                    "X-RapidAPI-Key": settings.zillow_api_key,
                    "X-RapidAPI-Host": settings.zillow_api_host,
                },
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()

            results = search_data.get("props", [])
            if not results:
                logger.warning(f"[avm/zillow] No results for address: {address}")
                return None

            zpid = results[0].get("zpid")
            if not zpid:
                return None

            # Step 2: Get property details + Zestimate
            detail_resp = await client.get(
                "https://zillow-com1.p.rapidapi.com/property",
                params={"zpid": str(zpid)},
                headers={
                    "X-RapidAPI-Key": settings.zillow_api_key,
                    "X-RapidAPI-Host": settings.zillow_api_host,
                },
            )
            detail_resp.raise_for_status()
            detail_data = detail_resp.json()

            zestimate = detail_data.get("zestimate")
            if not zestimate:
                logger.warning(f"[avm/zillow] No Zestimate for zpid {zpid}")
                return None

            logger.info(f"[avm/zillow] Zestimate for '{address}': ${zestimate:,.0f}")
            return AVMResult(
                source="zillow",
                avm_value=float(zestimate),
                raw_response={"zpid": zpid, "zestimate": zestimate, "detail": detail_data},
            )

    except httpx.HTTPStatusError as e:
        logger.error(f"[avm/zillow] HTTP error {e.response.status_code}: {e.response.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"[avm/zillow] Error fetching for '{address}': {e}")
        return None


# ── ATTOM Property API ────────────────────────────────────────────────────────

async def _fetch_attom(address: str) -> Optional[AVMResult]:
    """
    Fetch AVM value from ATTOM Property API.
    Docs: https://api.gateway.attomdata.com/propertyapi/v1.0.0/avm/detail
    """
    if not settings.attom_api_key:
        logger.debug("[avm/attom] ATTOM_API_KEY not set — skipping")
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{settings.attom_api_base}/avm/detail",
                params={"address": address},
                headers={
                    "apikey": settings.attom_api_key,
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            # ATTOM response: data.property[0].avm.amount.value
            props = data.get("property", [])
            if not props:
                logger.warning(f"[avm/attom] No property found for address: {address}")
                return None

            avm_block = props[0].get("avm", {})
            amount = avm_block.get("amount", {})
            value = amount.get("value")

            if not value:
                logger.warning(f"[avm/attom] No AVM value in response for: {address}")
                return None

            logger.info(f"[avm/attom] AVM value for '{address}': ${value:,.0f}")
            return AVMResult(
                source="attom",
                avm_value=float(value),
                raw_response=data,
            )

    except httpx.HTTPStatusError as e:
        logger.error(f"[avm/attom] HTTP error {e.response.status_code}: {e.response.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"[avm/attom] Error fetching for '{address}': {e}")
        return None


# ── Orchestrator ─────────────────────────────────────────────────────────────

async def fetch_all_avms(
    address: str,
    sources: Optional[list[str]] = None,
) -> list[AVMResult]:
    """
    Run all configured AVM fetchers for a given address.
    Returns a list of AVMResult — only sources that returned a value.

    Args:
        address: Property address string (full or partial)
        sources: Optional list of source names to restrict to (e.g. ["zillow"])
                 Defaults to all configured sources.
    """
    import asyncio

    all_fetchers = {
        "zillow": _fetch_zillow,
        "attom": _fetch_attom,
    }

    active = {k: v for k, v in all_fetchers.items() if sources is None or k in sources}

    if not active:
        logger.info("[avm] No AVM sources configured or requested")
        return []

    tasks = [fetcher(address) for fetcher in active.values()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out = []
    for result in results:
        if isinstance(result, Exception):
            logger.error(f"[avm] Unexpected exception: {result}")
        elif result is not None:
            out.append(result)

    logger.info(f"[avm] Got {len(out)} AVM results for '{address}'")
    return out
