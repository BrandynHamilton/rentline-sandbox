"""
/factory routes — read-only factory registry endpoints.

GET /factory/property          — factory address + total deployed
GET /factory/property/tokens   — paginated list of deployed PropertyToken addresses
GET /factory/security          — factory address + total deployed
GET /factory/security/tokens   — paginated list of deployed SecurityToken addresses

These endpoints let the frontend display the on-chain registry without
needing to index events. The frontend wallet-path deploy (factory.create())
is done entirely client-side — these routes only expose registry reads.
"""
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services.token_service import get_factory_info, get_factory_tokens

router = APIRouter(prefix="/factory", tags=["factory"])


@router.get("/property")
def property_factory_info():
    """PropertyTokenFactory address + total tokens deployed."""
    return get_factory_info("property")


@router.get("/property/tokens")
def property_factory_tokens(
    offset: int = Query(0, ge=0),
    limit:  int = Query(100, ge=1, le=500),
):
    """Paginated list of PropertyToken addresses from the on-chain factory registry."""
    if not settings.property_token_factory_address:
        return {"tokens": [], "total": 0, "configured": False}
    try:
        tokens = get_factory_tokens("property", offset, limit)
        return {"tokens": tokens, "offset": offset, "limit": limit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/security")
def security_factory_info():
    """SecurityTokenFactory address + total tokens deployed."""
    return get_factory_info("security")


@router.get("/security/tokens")
def security_factory_tokens(
    offset: int = Query(0, ge=0),
    limit:  int = Query(100, ge=1, le=500),
):
    """Paginated list of SecurityToken addresses from the on-chain factory registry."""
    if not settings.security_token_factory_address:
        return {"tokens": [], "total": 0, "configured": False}
    try:
        tokens = get_factory_tokens("security", offset, limit)
        return {"tokens": tokens, "offset": offset, "limit": limit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
