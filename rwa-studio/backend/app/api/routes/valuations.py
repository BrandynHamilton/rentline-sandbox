"""
/valuations routes

POST /valuations/{geo_id}/fetch     — trigger AVM enrichment (Zillow, ATTOM)
GET  /valuations/{geo_id}           — list all valuation sources
PUT  /valuations/{geo_id}/primary   — set a source as primary
POST /valuations/{geo_id}/manual    — add a manual valuation entry
"""
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.logging import logger
from app.models.property import Property
from app.models.valuation import ValuationSource
from app.schemas.valuation import (
    AVMFetchRequest,
    ManualValuationCreate,
    SetPrimaryRequest,
    ValuationSourceRead,
)
from app.services.avm_service import fetch_all_avms
from app.services.metadata_service import write_geo_json

router = APIRouter(prefix="/valuations", tags=["valuations"])


def _get_property_or_404(geo_id: str, db: Session) -> Property:
    prop = db.query(Property).filter(Property.geo_id == geo_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail=f"Property not found: {geo_id}")
    return prop


# ── Background AVM task ───────────────────────────────────────────────────────

def _run_avm_fetch(geo_id: str, address: str, sources: list[str] | None):
    """Background task: run AVM fetchers and persist results."""
    import asyncio
    from app.core.db import SessionLocal

    db = SessionLocal()
    try:
        prop = db.query(Property).filter(Property.geo_id == geo_id).first()
        if not prop:
            return

        results = asyncio.run(fetch_all_avms(address, sources))

        if not results:
            logger.info(f"[valuations] No AVM results returned for {geo_id}")
            return

        for r in results:
            vs = ValuationSource(
                property_id=prop.id,
                source=r.source,
                avm_value=r.avm_value,
                raw_response=r.raw_response,
                is_primary=False,
            )
            db.add(vs)

        db.commit()

        # Auto-set primary to the first result if no primary exists
        has_primary = db.query(ValuationSource).filter(
            ValuationSource.property_id == prop.id,
            ValuationSource.is_primary == True,  # noqa: E712
        ).first()

        if not has_primary and results:
            first = db.query(ValuationSource).filter(
                ValuationSource.property_id == prop.id,
                ValuationSource.source == results[0].source,
            ).order_by(ValuationSource.id.desc()).first()

            if first:
                first.is_primary = True
                prop.primary_value = first.avm_value
                db.commit()
                write_geo_json(geo_id, prop.primary_value, prop.get_metadata())

        logger.info(f"[valuations] AVM fetch complete for {geo_id} — {len(results)} source(s)")

    except Exception as e:
        logger.error(f"[valuations] AVM fetch error for {geo_id}: {e}")
        db.rollback()
    finally:
        db.close()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/{geo_id}/fetch", response_model=dict)
def fetch_avm(
    geo_id: str,
    body: AVMFetchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Trigger AVM enrichment for a property.
    Results are fetched in the background and stored as ValuationSource rows.
    """
    prop = _get_property_or_404(geo_id, db)

    # Resolve address: body override → stored display_address → stored full_address in metadata
    address = body.address
    if not address:
        meta = prop.get_metadata()
        if meta:
            addr = meta.get("address", {})
            address = addr.get("full_address") or addr.get("street") or prop.display_address
        else:
            address = prop.display_address

    if not address:
        raise HTTPException(
            status_code=400,
            detail="No address available for AVM lookup. Provide address in body or scrape/set metadata first.",
        )

    background_tasks.add_task(_run_avm_fetch, geo_id, address, body.sources)
    return {"geo_id": geo_id, "address": address, "message": "AVM fetch enqueued"}


@router.get("/{geo_id}", response_model=list[ValuationSourceRead])
def list_valuation_sources(geo_id: str, db: Session = Depends(get_db)):
    """List all valuation sources for a property."""
    prop = _get_property_or_404(geo_id, db)
    return (
        db.query(ValuationSource)
        .filter(ValuationSource.property_id == prop.id)
        .order_by(ValuationSource.fetched_at.desc())
        .all()
    )


@router.put("/{geo_id}/primary", response_model=ValuationSourceRead)
def set_primary_source(
    geo_id: str,
    body: SetPrimaryRequest,
    db: Session = Depends(get_db),
):
    """
    Promote a specific ValuationSource as primary.
    Updates properties.primary_value and rewrites the oracle JSON.
    """
    prop = _get_property_or_404(geo_id, db)

    target = db.query(ValuationSource).filter(
        ValuationSource.id == body.valuation_source_id,
        ValuationSource.property_id == prop.id,
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="ValuationSource not found for this property")

    # Clear existing primary
    db.query(ValuationSource).filter(
        ValuationSource.property_id == prop.id,
        ValuationSource.is_primary == True,  # noqa: E712
    ).update({"is_primary": False})

    target.is_primary = True
    prop.primary_value = target.avm_value

    db.commit()

    # Rewrite oracle JSON
    write_geo_json(geo_id, prop.primary_value, prop.get_metadata())

    db.refresh(target)
    return target


@router.post("/{geo_id}/manual", response_model=ValuationSourceRead, status_code=201)
def add_manual_valuation(
    geo_id: str,
    body: ManualValuationCreate,
    db: Session = Depends(get_db),
):
    """
    Add a manual valuation entry (e.g. from a formal appraisal or broker opinion).
    Optionally sets it as primary immediately.
    """
    prop = _get_property_or_404(geo_id, db)

    if body.set_primary:
        db.query(ValuationSource).filter(
            ValuationSource.property_id == prop.id,
            ValuationSource.is_primary == True,  # noqa: E712
        ).update({"is_primary": False})

    vs = ValuationSource(
        property_id=prop.id,
        source="manual",
        avm_value=body.avm_value,
        raw_response=json.dumps({"notes": body.notes or ""}),
        is_primary=body.set_primary,
    )
    db.add(vs)

    if body.set_primary:
        prop.primary_value = body.avm_value
        if prop.status == "draft":
            prop.status = "ready"
        write_geo_json(geo_id, body.avm_value, prop.get_metadata())

    db.commit()
    db.refresh(vs)
    return vs
