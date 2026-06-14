"""
/tokens routes

POST /tokens/{geo_id}/deploy/property  — deploy PropertyToken (residential ERC-20)
POST /tokens/{geo_id}/deploy/security  — deploy SecurityToken (CRE ERC-20)
GET  /tokens/{geo_id}                  — get deployed addresses + on-chain info
POST /tokens/{geo_id}/push_rentline    — push token address to Rentline API
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.logging import logger
from app.core.auth import require_admin_key
from app.models.property import Property
from app.services.metadata_service import token_uri, write_geo_json
from app.services.token_service import (
    deploy_property_token,
    deploy_security_token,
    deploy_nft_token,
    push_to_rentline,
)
from app.services.verification_service import verify_token

router = APIRouter(prefix="/tokens", tags=["tokens"])


# ── Request bodies ────────────────────────────────────────────────────────────

class DeployPropertyTokenRequest(BaseModel):
    owner_address: str
    usdc_address: str
    initial_supply: int = 1_000_000  # tokens (before 18 decimals)


class DeploySecurityTokenRequest(BaseModel):
    name: str
    symbol: str
    compliance_manager: str
    governance_multisig: str


class DeployNFTTokenRequest(BaseModel):
    owner_address: str
    usdc_address: str


class RegisterTokenRequest(BaseModel):
    token_type: str   # "property" | "nft" | "security" | "cre"
    address: str
    tx_hash: Optional[str] = None


class PushRentlineRequest(BaseModel):
    rentline_property_id: str
    token_address: Optional[str] = None  # optional — defaults to property_token_address


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_property_or_404(geo_id: str, db: Session) -> Property:
    prop = db.query(Property).filter(Property.geo_id == geo_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail=f"Property not found: {geo_id}")
    return prop


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/{geo_id}/deploy/property", response_model=dict)
def deploy_property_token_endpoint(
    geo_id: str,
    body: DeployPropertyTokenRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_key),
):
    """
    Deploy a PropertyToken (residential ERC-20) for this property.

    - Requires: property.status == 'ready' and primary_value set
    - Writes / updates {geo_id}.json for the oracle
    - Sets property.status = 'deployed'
    """
    prop = _get_property_or_404(geo_id, db)

    if prop.property_token_address:
        raise HTTPException(
            status_code=409,
            detail=f"PropertyToken already deployed: {prop.property_token_address}",
        )

    if not prop.primary_value:
        raise HTTPException(
            status_code=400,
            detail="primary_value must be set before deploying. Use PUT /properties/{geo_id}/value",
        )

    # Ensure oracle JSON is up-to-date before minting
    uri = token_uri(geo_id)
    write_geo_json(geo_id, prop.primary_value, prop.get_metadata())

    # Derive physical address string for PropertyToken constructor
    meta = prop.get_metadata() or {}
    addr_block = meta.get("address", {})
    physical_address = addr_block.get("full_address") or addr_block.get("street") or prop.display_address or ""

    try:
        result = deploy_property_token(
            property_name=meta.get("property_details", {}).get("property_type", "") + " " + geo_id,
            property_address=physical_address,
            owner_address=body.owner_address,
            usdc_address=body.usdc_address,
            metadata_uri=uri,
            initial_supply=body.initial_supply,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deployment failed: {e}")

    prop.property_token_address = result["address"]
    prop.status = "deployed"
    db.commit()

    logger.info(f"[tokens] PropertyToken deployed for {geo_id}: {result['address']}")
    return {
        "geo_id": geo_id,
        "token_type": "PropertyToken",
        "address": result["address"],
        "tx_hash": result["tx_hash"],
        "token_uri": uri,
    }


@router.post("/{geo_id}/deploy/security", response_model=dict)
def deploy_security_token_endpoint(
    geo_id: str,
    body: DeploySecurityTokenRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_key),
):
    """
    Deploy a SecurityToken (CRE ERC-20 with KYC/compliance) for this property.

    - Requires: property.status == 'ready' and primary_value set
    - Typically paired with /capital_stack/{geo_id}/deploy for waterfall contracts
    """
    prop = _get_property_or_404(geo_id, db)

    if prop.security_token_address:
        raise HTTPException(
            status_code=409,
            detail=f"SecurityToken already deployed: {prop.security_token_address}",
        )

    if not prop.primary_value:
        raise HTTPException(
            status_code=400,
            detail="primary_value must be set before deploying",
        )

    uri = token_uri(geo_id)
    write_geo_json(geo_id, prop.primary_value, prop.get_metadata())

    try:
        result = deploy_security_token(
            name=body.name,
            symbol=body.symbol,
            compliance_manager=body.compliance_manager,
            governance_multisig=body.governance_multisig,
            metadata_uri=uri,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deployment failed: {e}")

    prop.security_token_address = result["address"]
    prop.status = "deployed"
    db.commit()

    logger.info(f"[tokens] SecurityToken deployed for {geo_id}: {result['address']}")
    return {
        "geo_id": geo_id,
        "token_type": "SecurityToken",
        "address": result["address"],
        "tx_hash": result["tx_hash"],
        "token_uri": uri,
    }


@router.get("/{geo_id}", response_model=dict)
def get_token_info(geo_id: str, db: Session = Depends(get_db)):
    """Get deployed token addresses and oracle URI for a property."""
    prop = _get_property_or_404(geo_id, db)
    return {
        "geo_id": geo_id,
        "status": prop.status,
        "property_token_address": prop.property_token_address,
        "security_token_address": prop.security_token_address,
        "nft_token_address": prop.nft_token_address,
        "token_uri": token_uri(geo_id),
        "primary_value": prop.primary_value,
    }


@router.post("/{geo_id}/register", response_model=dict)
def register_token(
    geo_id: str,
    body: RegisterTokenRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Register a token address that was deployed directly from the user's wallet.
    Called by the frontend after a factory tx is confirmed on-chain.
    token_type: "property" | "nft" | "security" | "cre"

    Automatically triggers Blockscout contract verification in the background.
    """
    prop = _get_property_or_404(geo_id, db)

    addr = body.address.lower()
    t = body.token_type.lower()

    if t in ("property",):
        prop.property_token_address = addr
    elif t in ("nft",):
        prop.nft_token_address = addr
    elif t in ("security", "cre"):
        prop.security_token_address = addr
    else:
        raise HTTPException(status_code=400, detail=f"Unknown token_type: {body.token_type}")

    prop.status = "deployed"
    db.commit()

    logger.info(f"[tokens] registered {body.token_type} {addr} for {geo_id}")

    # Trigger verification in background
    background_tasks.add_task(verify_token, body.token_type, addr)

    return {
        "geo_id": geo_id,
        "token_type": body.token_type,
        "address": addr,
        "tx_hash": body.tx_hash,
    }


class VerifyTokenRequest(BaseModel):
    token_type: str  # "property" | "nft" | "security" | "cre"
    address: str


@router.post("/{geo_id}/verify", response_model=dict)
def verify_token_endpoint(
    geo_id: str,
    body: VerifyTokenRequest,
    background_tasks: BackgroundTasks,
):
    """Trigger Blockscout contract verification for a deployed token."""
    background_tasks.add_task(verify_token, body.token_type, body.address)
    return {
        "geo_id": geo_id,
        "token_type": body.token_type,
        "address": body.address,
        "message": "Verification submitted",
    }


@router.post("/{geo_id}/deploy/nft", response_model=dict)
def deploy_nft_token_endpoint(
    geo_id: str,
    body: DeployNFTTokenRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_key),
):
    """
    Deploy a PropertyNFT (ERC-721 deed with yield vault) for this property.

    - Requires: property.status == 'ready' and primary_value set
    - Mints exactly 1 NFT (tokenId = 0) to owner_address
    - Writes / updates {geo_id}.json for the oracle / tokenURI
    - Sets property.status = 'deployed'
    """
    prop = _get_property_or_404(geo_id, db)

    if prop.nft_token_address:
        raise HTTPException(
            status_code=409,
            detail=f"PropertyNFT already deployed: {prop.nft_token_address}",
        )

    if not prop.primary_value:
        raise HTTPException(
            status_code=400,
            detail="primary_value must be set before deploying. Use PUT /properties/{geo_id}/value",
        )

    uri = token_uri(geo_id)
    write_geo_json(geo_id, prop.primary_value, prop.get_metadata())

    meta = prop.get_metadata() or {}
    addr_block = meta.get("address", {})
    physical_address = addr_block.get("full_address") or addr_block.get("street") or prop.display_address or ""

    try:
        result = deploy_nft_token(
            property_name=meta.get("property_details", {}).get("property_type", "") + " " + geo_id,
            property_address=physical_address,
            owner_address=body.owner_address,
            usdc_address=body.usdc_address,
            metadata_uri=uri,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deployment failed: {e}")

    prop.nft_token_address = result["address"]
    prop.status = "deployed"
    db.commit()

    logger.info(f"[tokens] PropertyNFT deployed for {geo_id}: {result['address']}")
    return {
        "geo_id": geo_id,
        "token_type": "PropertyNFT",
        "address": result["address"],
        "tx_hash": result["tx_hash"],
        "token_uri": uri,
    }


@router.post("/{geo_id}/push_rentline", response_model=dict)
async def push_token_to_rentline(
    geo_id: str,
    body: PushRentlineRequest,
    db: Session = Depends(get_db),
):
    """
    Push a deployed token address to Rentline.
    Enables Rentline to route rent payments to any token contract.
    Token type is chosen by the caller — typically the PropertyToken.
    """
    prop = _get_property_or_404(geo_id, db)

    token_addr = body.token_address or prop.property_token_address
    if not token_addr:
        raise HTTPException(
            status_code=400,
            detail="No token address provided and no PropertyToken deployed yet. "
                   "Deploy a token first or pass token_address explicitly.",
        )

    try:
        result = await push_to_rentline(body.rentline_property_id, token_addr)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Rentline API error: {e}")

    return {
        "geo_id": geo_id,
        "rentline_property_id": body.rentline_property_id,
        "token_address": token_addr,
        "rentline_response": result,
    }
