"""
/properties routes

POST   /properties                — create asset (triggers scrape if source_url provided)
GET    /properties                — list all
GET    /properties/{geo_id}       — get single property + valuation sources
GET    /properties/{geo_id}/status— lightweight status poll
POST   /properties/{geo_id}/scrape— re-trigger scrape job
PUT    /properties/{geo_id}/value — manual value override
PUT    /properties/{geo_id}/metadata — manual metadata patch
DELETE /properties/{geo_id}       — delete (only if not deployed)
"""
import json
import random
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.logging import logger
from app.models.property import Property
from app.models.valuation import ValuationSource
from app.schemas.property import (
    PropertyCreate,
    PropertyMetadataUpdate,
    PropertyRead,
    PropertyStatusRead,
    PropertyValueUpdate,
)
from app.services.metadata_service import write_geo_json
from app.services.scraping_service import (
    extract_property_metadata,
    scrape_property_url,
)
from app.services.token_service import create_rentline_property, sync_tokens_from_chain
from web3 import Web3

router = APIRouter(prefix="/properties", tags=["properties"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _generate_geo_id() -> str:
    return f"geo-{random.randint(100_000, 999_999)}"


def _get_property_or_404(geo_id: str, db: Session) -> Property:
    prop = db.query(Property).filter(Property.geo_id == geo_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail=f"Property not found: {geo_id}")
    return prop


# ── Background scrape task ────────────────────────────────────────────────────

def _run_scrape(geo_id: str, source_url: str):
    """
    Background task: scrape property URL and populate metadata + valuation.
    Runs outside the request lifecycle — uses its own DB session.
    """
    from app.core.db import SessionLocal

    db = SessionLocal()
    try:
        prop = db.query(Property).filter(Property.geo_id == geo_id).first()
        if not prop:
            return

        prop.scrape_status = "running"
        db.commit()

        logger.info(f"[scrape] Starting scrape for {geo_id} — {source_url}")

        try:
            raw = scrape_property_url(source_url)
            metadata = extract_property_metadata(raw)
            logger.info(f"[scrape] extracted keys={list(metadata.keys())} price={metadata.get('price')!r}")
        except Exception as e:
            logger.error(f"[scrape] Failed for {geo_id}: {e}")
            prop.scrape_status = "failed"
            db.commit()
            return

        # Extract price string → float for initial valuation source
        price_str = metadata.get("price", "")

        # Fallback: if AI agent returned empty price, try regex on raw response
        if not price_str:
            fallback_price = _extract_price_from_raw(raw)
            if fallback_price:
                price_str = metadata["price"] = fallback_price
                logger.info(f"[scrape] fallback price extracted from raw response: {price_str}")

        # Persist metadata (with corrected price if fallback was used)
        prop.set_metadata(metadata)
        prop.scrape_status = "done"

        avm_value = _parse_price_string(price_str)

        if avm_value and avm_value > 0:
            source = ValuationSource(
                property_id=prop.id,
                source="scrape",
                avm_value=avm_value,
                raw_response=json.dumps(metadata),
                is_primary=True,
            )
            db.add(source)
            prop.primary_value = avm_value

        prop.status = "ready"
        db.commit()

        # Write the oracle JSON now that we have a value
        if prop.primary_value:
            write_geo_json(prop.geo_id, prop.primary_value, metadata)

        logger.info(f"[scrape] Completed {geo_id} — value=${prop.primary_value}")

    except Exception as e:
        logger.error(f"[scrape] Unexpected error for {geo_id}: {e}")
        db.rollback()
    finally:
        db.close()


def _parse_price_string(price_str: str) -> Optional[float]:
    """Parse price strings like '$850,000' → 850000.0"""
    if not price_str:
        return None
    cleaned = price_str.replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


_PRICE_RE = re.compile(r'\$\s*[\d,]+(?:\.\d+)?')


def _extract_price_from_raw(scrape_result: dict) -> Optional[str]:
    """Fallback: search raw JSON response for dollar amounts when AI misses the price."""
    raw_text = json.dumps(scrape_result)
    matches = _PRICE_RE.findall(raw_text)
    if not matches:
        return None
    # Parse all matches to numeric, return the largest (list price, not per-unit/cap)
    best = None
    best_val = 0.0
    for m in matches:
        cleaned = m.replace("$", "").replace(",", "").strip()
        try:
            val = float(cleaned)
            if val > best_val:
                best_val = val
                best = m
        except ValueError:
            continue
    return best


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=PropertyRead, status_code=201)
def create_property(
    body: PropertyCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Create a new property asset.

    - If `source_url` is provided, a background scrape job is triggered immediately.
    - If `metadata` is provided directly, it is stored and the property is marked ready.
    - If `primary_value` is provided and no scrape is triggered, the oracle JSON is written now.
    """
    # Generate unique geo_id
    geo_id = _generate_geo_id()
    while db.query(Property).filter(Property.geo_id == geo_id).first():
        geo_id = _generate_geo_id()

    prop = Property(
        geo_id=geo_id,
        source_url=body.source_url,
        primary_value=body.primary_value,
        status="draft",
        scrape_status="pending",
    )

    # If metadata was provided directly, skip scrape
    if body.metadata:
        meta_dict = body.metadata.model_dump()
        prop.set_metadata(meta_dict)
        prop.status = "ready"
        prop.scrape_status = "done"

        if body.primary_value:
            vs = ValuationSource(
                property_id=0,  # will be set after flush
                source="manual",
                avm_value=body.primary_value,
                raw_response=json.dumps({"note": "provided at creation"}),
                is_primary=True,
            )
            db.add(prop)
            db.flush()  # get prop.id
            vs.property_id = prop.id
            db.add(vs)
            write_geo_json(geo_id, body.primary_value, meta_dict)
        else:
            db.add(prop)

    else:
        db.add(prop)

    db.commit()
    db.refresh(prop)

    # Trigger scrape in background if URL provided
    if body.source_url and prop.scrape_status != "done":
        prop.scrape_status = "pending"
        db.commit()
        background_tasks.add_task(_run_scrape, geo_id, body.source_url)
        logger.info(f"[properties] Scrape enqueued for {geo_id}")

    db.refresh(prop)
    return prop


@router.get("", response_model=list[PropertyRead])
def list_properties(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List all properties, optionally filtered by status."""
    q = db.query(Property)
    if status:
        q = q.filter(Property.status == status)
    return q.order_by(Property.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{geo_id}/status", response_model=PropertyStatusRead)
def get_property_status(geo_id: str, db: Session = Depends(get_db)):
    """Lightweight status poll — for frontend polling after scrape trigger."""
    return _get_property_or_404(geo_id, db)


@router.get("/{geo_id}", response_model=PropertyRead)
def get_property(geo_id: str, db: Session = Depends(get_db)):
    """Get full property details including all valuation sources.
    Automatically syncs any missing token addresses from on-chain factory events.
    """
    prop = _get_property_or_404(geo_id, db)

    # If any token address is missing, check the chain
    if not (prop.property_token_address and prop.nft_token_address and prop.security_token_address):
        try:
            found = sync_tokens_from_chain(geo_id, prop)
            if found:
                for field, addr in found.items():
                    setattr(prop, field, addr)
                prop.status = "deployed"
                db.commit()
        except Exception as e:
            logger.warning(f"[get_property] chain sync failed for {geo_id}: {e}")

    return prop


@router.post("/{geo_id}/scrape", response_model=dict)
def retrigger_scrape(
    geo_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Re-trigger the scrape job for a property."""
    prop = _get_property_or_404(geo_id, db)

    if not prop.source_url:
        raise HTTPException(status_code=400, detail="No source_url stored — cannot scrape")

    if prop.scrape_status == "running":
        raise HTTPException(status_code=409, detail="Scrape already in progress")

    prop.scrape_status = "pending"
    db.commit()

    background_tasks.add_task(_run_scrape, geo_id, prop.source_url)
    return {"geo_id": geo_id, "message": "Scrape job enqueued"}


@router.put("/{geo_id}/value", response_model=PropertyRead)
def update_value(
    geo_id: str,
    body: PropertyValueUpdate,
    db: Session = Depends(get_db),
):
    """
    Manual value override.
    Creates a valuation source with source='manual' and sets it as primary.
    Writes / overwrites the oracle JSON.
    """
    prop = _get_property_or_404(geo_id, db)

    # Clear existing primary flags
    db.query(ValuationSource).filter(
        ValuationSource.property_id == prop.id,
        ValuationSource.is_primary == True,  # noqa: E712
    ).update({"is_primary": False})

    vs = ValuationSource(
        property_id=prop.id,
        source="manual",
        avm_value=body.value,
        raw_response=json.dumps({"reason": body.reason or "manual override"}),
        is_primary=True,
    )
    db.add(vs)

    prop.primary_value = body.value
    if prop.status == "draft":
        prop.status = "ready"

    db.commit()

    # Update oracle JSON
    write_geo_json(geo_id, body.value, prop.get_metadata())

    db.refresh(prop)
    return prop


@router.put("/{geo_id}/metadata", response_model=PropertyRead)
def update_metadata(
    geo_id: str,
    body: PropertyMetadataUpdate,
    db: Session = Depends(get_db),
):
    """Patch property metadata fields without re-scraping."""
    prop = _get_property_or_404(geo_id, db)

    meta_dict = body.metadata.model_dump()
    prop.set_metadata(meta_dict)

    if prop.status == "draft":
        prop.status = "ready"
    prop.scrape_status = "done"

    db.commit()

    # Re-write oracle JSON if we have a value
    if prop.primary_value:
        write_geo_json(geo_id, prop.primary_value, meta_dict)

    db.refresh(prop)
    return prop


@router.delete("/{geo_id}", response_model=dict)
def delete_property(geo_id: str, db: Session = Depends(get_db)):
    """Delete a property. Only allowed if not deployed."""
    prop = _get_property_or_404(geo_id, db)

    if prop.status == "deployed":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a deployed property. Token is already on-chain.",
        )

    db.delete(prop)
    db.commit()
    return {"geo_id": geo_id, "deleted": True}


@router.post("/{geo_id}/rentline/create", response_model=dict)
async def create_property_in_rentline(
    geo_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a property in Rentline using this property's metadata, so tokens can be pushed."""
    prop = _get_property_or_404(geo_id, db)
    meta = prop.get_metadata() or {}
    addr_block = meta.get("address", {})

    name = (
        addr_block.get("full_address")
        or prop.display_address
        or geo_id
    )
    street_address = addr_block.get("street") or prop.display_address or ""
    city = addr_block.get("city") or prop.display_city or ""
    state = addr_block.get("state") or prop.display_state or ""
    zip_code = addr_block.get("zip_code") or ""

    # Forward the Clerk Bearer token from the incoming request so Rentline
    # authenticates the user directly — no admin API key needed.
    auth_header = request.headers.get("Authorization", "")
    auth_token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else None
    
    print(f"DEBUG: auth_header present: {bool(auth_header)}, auth_token: {auth_token[:20] if auth_token else '(none)'}", flush=True)
    logger.info(f"[properties] RWA Studio: auth_header={bool(auth_header)}, token_len={len(auth_token) if auth_token else 0}")

    try:
        w3 = Web3()
        admin_wallet = w3.eth.account.from_key(settings.AVALANCHE_PRIVATE_KEY).address
    except Exception:
        admin_wallet = "0x0000000000000000000000000000000000000000"

    try:
        result = await create_rentline_property(
            name=name,
            wallet_address=admin_wallet,
            street_address=street_address,
            city=city,
            state=state,
            zip_code=zip_code,
            auth_token=auth_token,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Rentline API error: {e}")

    logger.info(f"[properties] Created Rentline property {result.get('id', '?')[:12]}... for {geo_id}")
    return {
        "geo_id": geo_id,
        "rentline_property_id": result.get("id", ""),
        "rentline_response": result,
    }
