"""
/capital_stack routes

POST /capital_stack/{geo_id}/config                    — create / update waterfall config
GET  /capital_stack/{geo_id}/config                    — get current config
POST /capital_stack/{geo_id}/deploy                    — deploy DistributionManager + InvestorRegistry
POST /capital_stack/{geo_id}/investors/{address}/approve — approve investor on-chain
GET  /capital_stack/{geo_id}/state                     — on-chain distribution state
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.logging import logger
from app.models.capital_stack import CapitalStackConfig
from app.models.property import Property
from app.schemas.capital_stack import (
    ApproveInvestorRequest,
    CapitalStackConfigCreate,
    CapitalStackConfigRead,
    DistributionStateRead,
)
from app.services.token_service import (
    deploy_distribution_manager,
    deploy_investor_registry,
    push_distribution_params,
)

router = APIRouter(prefix="/capital_stack", tags=["capital_stack"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_property_or_404(geo_id: str, db: Session) -> Property:
    p = db.query(Property).filter(Property.geo_id == geo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail=f"Property not found: {geo_id}")
    return p


class DeployCapitalStackRequest(BaseModel):
    usdc_address: str
    accreditation_verifier: Optional[str] = None  # defaults to deployer address


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/{geo_id}/config", response_model=CapitalStackConfigRead, status_code=201)
def create_or_update_config(
    geo_id: str,
    body: CapitalStackConfigCreate,
    db: Session = Depends(get_db),
):
    """
    Create or update the CRE capital stack waterfall configuration.
    Does not deploy contracts — call /deploy to put it on-chain.
    """
    prop = _get_property_or_404(geo_id, db)

    existing = db.query(CapitalStackConfig).filter(
        CapitalStackConfig.property_id == prop.id
    ).first()

    if existing:
        existing.preferred_return_bps = body.preferred_return_bps
        existing.sponsor_promote_bps = body.sponsor_promote_bps
        existing.waterfall_threshold = body.waterfall_threshold
        existing.equity_raise_target = body.equity_raise_target
        existing.min_investment_usd = body.min_investment_usd
        db.commit()
        db.refresh(existing)
        return existing
    else:
        config = CapitalStackConfig(
            property_id=prop.id,
            preferred_return_bps=body.preferred_return_bps,
            sponsor_promote_bps=body.sponsor_promote_bps,
            waterfall_threshold=body.waterfall_threshold,
            equity_raise_target=body.equity_raise_target,
            min_investment_usd=body.min_investment_usd,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
        return config


@router.get("/{geo_id}/config", response_model=CapitalStackConfigRead)
def get_config(geo_id: str, db: Session = Depends(get_db)):
    """Get the capital stack config for a property."""
    prop = _get_property_or_404(geo_id, db)
    config = db.query(CapitalStackConfig).filter(
        CapitalStackConfig.property_id == prop.id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="No capital stack config for this property")
    return config


@router.post("/{geo_id}/deploy", response_model=dict)
def deploy_capital_stack(
    geo_id: str,
    body: DeployCapitalStackRequest,
    db: Session = Depends(get_db),
):
    """
    Deploy DistributionManager + InvestorRegistry for a CRE deal.

    Requires:
    - Capital stack config saved (POST /capital_stack/{geo_id}/config)
    - SecurityToken deployed (POST /tokens/{geo_id}/deploy/security)
    """
    prop = _get_property_or_404(geo_id, db)

    if not prop.security_token_address:
        raise HTTPException(
            status_code=400,
            detail="SecurityToken must be deployed first. Run POST /tokens/{geo_id}/deploy/security",
        )

    config = db.query(CapitalStackConfig).filter(
        CapitalStackConfig.property_id == prop.id
    ).first()
    if not config:
        raise HTTPException(
            status_code=400,
            detail="Capital stack config not set. Run POST /capital_stack/{geo_id}/config first.",
        )

    if config.distribution_manager_address:
        raise HTTPException(
            status_code=409,
            detail=f"DistributionManager already deployed: {config.distribution_manager_address}",
        )

    # Deploy DistributionManager
    try:
        dm_result = deploy_distribution_manager(
            token_address=prop.security_token_address,
            usdc_address=body.usdc_address,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DistributionManager deployment failed: {e}")

    config.distribution_manager_address = dm_result["address"]

    # Deploy InvestorRegistry
    from app.core.config import settings
    verifier = body.accreditation_verifier
    if not verifier:
        # Fallback: derive from private key
        if settings.avalanche_private_key:
            from web3 import Web3
            from eth_account import Account
            verifier = Account.from_key(settings.avalanche_private_key).address
        else:
            raise HTTPException(status_code=400, detail="accreditation_verifier required (no private key set)")

    try:
        ir_result = deploy_investor_registry(accreditation_verifier=verifier)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"InvestorRegistry deployment failed: {e}")

    config.investor_registry_address = ir_result["address"]
    db.commit()

    # Push waterfall config on-chain
    try:
        push_result = push_distribution_params(
            dm_address=dm_result["address"],
            property_address=prop.security_token_address,
            preferred_return_bps=config.preferred_return_bps,
            sponsor_promote_bps=config.sponsor_promote_bps,
            waterfall_threshold=int(config.waterfall_threshold),
        )
        logger.info(
            f"[capital_stack] Pushed waterfall config for {geo_id}: "
            f"tx={push_result['tx_hash'][:10]}..."
        )
    except Exception as e:
        logger.warning(
            f"[capital_stack] Failed to push waterfall config for {geo_id}: {e}. "
            f"DM deployed, but params not set on-chain."
        )

    logger.info(
        f"[capital_stack] Deployed for {geo_id}: "
        f"DM={dm_result['address'][:10]}... IR={ir_result['address'][:10]}..."
    )

    return {
        "geo_id": geo_id,
        "distribution_manager": {
            "address": dm_result["address"],
            "tx_hash": dm_result["tx_hash"],
        },
        "investor_registry": {
            "address": ir_result["address"],
            "tx_hash": ir_result["tx_hash"],
        },
        "config": {
            "preferred_return_bps": config.preferred_return_bps,
            "sponsor_promote_bps": config.sponsor_promote_bps,
            "waterfall_threshold": config.waterfall_threshold,
        },
    }


@router.post("/{geo_id}/investors/{investor_address}/approve", response_model=dict)
def approve_investor(
    geo_id: str,
    investor_address: str,
    body: ApproveInvestorRequest,
    db: Session = Depends(get_db),
):
    """
    Approve an investor on the on-chain InvestorRegistry.
    Only callable after /capital_stack/{geo_id}/deploy.
    """
    prop = _get_property_or_404(geo_id, db)
    config = db.query(CapitalStackConfig).filter(
        CapitalStackConfig.property_id == prop.id
    ).first()

    if not config or not config.investor_registry_address:
        raise HTTPException(
            status_code=400,
            detail="InvestorRegistry not deployed. Run POST /capital_stack/{geo_id}/deploy first.",
        )

    from app.core.config import settings
    from web3 import Web3

    if not settings.avalanche_private_key:
        raise HTTPException(status_code=500, detail="AVALANCHE_PRIVATE_KEY not set")

    w3 = Web3(Web3.HTTPProvider(settings.avalanche_rpc_url))
    account = w3.eth.account.from_key(settings.avalanche_private_key)

    import json
    from pathlib import Path
    artifact_path = Path(__file__).parent.parent.parent.parent / "contracts" / "out" / "InvestorRegistry.sol" / "InvestorRegistry.json"
    with open(artifact_path) as f:
        abi = json.load(f)["abi"]

    registry = w3.eth.contract(
        address=Web3.to_checksum_address(config.investor_registry_address),
        abi=abi,
    )

    # Build approveInvestor tx
    fn = registry.functions.approveInvestor(
        Web3.to_checksum_address(investor_address),
        body.accredited,
        body.institutional,
        body.lockup_expiry,
    )
    tx = fn.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address, "pending"),
        "chainId": settings.avalanche_chain_id,
    })
    try:
        gas = w3.eth.estimate_gas(tx)
        tx["gas"] = int(gas * 1.3)
    except Exception:
        tx["gas"] = 200_000

    latest = w3.eth.get_block("latest")
    base_fee = latest.get("baseFeePerGas", w3.to_wei(25, "gwei"))
    priority = w3.to_wei(2, "gwei")
    tx["maxFeePerGas"] = int(base_fee * 1.2) + priority
    tx["maxPriorityFeePerGas"] = priority
    tx.pop("gasPrice", None)

    signed = w3.eth.account.sign_transaction(tx, settings.avalanche_private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

    if receipt["status"] != 1:
        raise HTTPException(status_code=500, detail="approveInvestor transaction reverted")

    return {
        "geo_id": geo_id,
        "investor": investor_address,
        "accredited": body.accredited,
        "institutional": body.institutional,
        "lockup_expiry": body.lockup_expiry,
        "tx_hash": "0x" + tx_hash.hex(),
    }


@router.get("/{geo_id}/state", response_model=dict)
def get_distribution_state(geo_id: str, db: Session = Depends(get_db)):
    """
    Read on-chain DistributionState from the deployed DistributionManager.
    Returns totalDistributed, preferredReturnPaid, sponsorPromotePaid, investorPayout.
    """
    prop = _get_property_or_404(geo_id, db)
    config = db.query(CapitalStackConfig).filter(
        CapitalStackConfig.property_id == prop.id
    ).first()

    if not config or not config.distribution_manager_address:
        raise HTTPException(
            status_code=400,
            detail="DistributionManager not deployed",
        )

    if not prop.security_token_address:
        raise HTTPException(status_code=400, detail="SecurityToken address not set")

    from app.core.config import settings
    from web3 import Web3
    import json
    from pathlib import Path

    w3 = Web3(Web3.HTTPProvider(settings.avalanche_rpc_url))
    artifact_path = Path(__file__).parent.parent.parent.parent / "contracts" / "out" / "DistributionManager.sol" / "DistributionManager.json"

    with open(artifact_path) as f:
        abi = json.load(f)["abi"]

    dm = w3.eth.contract(
        address=Web3.to_checksum_address(config.distribution_manager_address),
        abi=abi,
    )

    try:
        state = dm.functions.getDistributionState(
            Web3.to_checksum_address(prop.security_token_address)
        ).call()
        # state = (totalDistributed, preferredReturnPaid, sponsorPromotePaid, investorPayout, lastDistributionTime)
        usdc_scale = 10 ** 6
        return {
            "geo_id": geo_id,
            "distribution_manager": config.distribution_manager_address,
            "total_distributed": state[0] / usdc_scale,
            "preferred_return_paid": state[1] / usdc_scale,
            "sponsor_promote_paid": state[2] / usdc_scale,
            "investor_payout": state[3] / usdc_scale,
            "last_distribution_time": state[4],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read on-chain state: {e}")
