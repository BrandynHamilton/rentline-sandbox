from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db, is_admin_request
from app.core.logging import logger
from app.models.sandbox import SandboxProperty
from app.services import sandbox_service
from app.services.sandbox_engine import advance_turn
from app.services import sandbox_bot

router = APIRouter(prefix="/properties", tags=["properties"])


class SetTokenAddressRequest(BaseModel):
    token_address: str = Field(..., description="EVM address of the PropertyToken contract")


@router.put("/{id}/token")
async def set_property_token_address(
    id: str,
    body: SetTokenAddressRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Register a PropertyToken contract address against a pool property.
    Called by rwa-issuer-sim after a token is deployed on-chain.
    Requires ADMIN_API_KEY.
    """
    if not is_admin_request(request):
        raise HTTPException(status_code=403, detail="Admin access required")

    prop = db.query(SandboxProperty).filter(SandboxProperty.id == id).first()
    if prop is None:
        # Also try lookup by geo_id so rwa-issuer-sim can use its own identifier
        prop = db.query(SandboxProperty).filter(SandboxProperty.geo_id == id).first()
    if prop is None:
        raise HTTPException(status_code=404, detail=f"Property '{id}' not found")

    prop.token_address = body.token_address
    db.commit()
    db.refresh(prop)

    logger.info(f"Property {prop.id} (geo_id={prop.geo_id}) token_address set to {prop.token_address}")

    return {
        "id": prop.id,
        "geo_id": prop.geo_id,
        "name": prop.name,
        "token_address": prop.token_address,
    }
