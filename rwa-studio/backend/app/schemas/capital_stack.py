"""
Pydantic schemas for Capital Stack (CRE) endpoints.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CapitalStackConfigCreate(BaseModel):
    """
    CRE deal waterfall parameters.
    Deployed on-chain via DistributionManager.setDistributionParams().
    """
    preferred_return_bps: int = Field(
        800, ge=0, le=5000, description="Preferred return in basis points (800 = 8%)"
    )
    sponsor_promote_bps: int = Field(
        2000, ge=0, le=5000, description="Sponsor promote above pref, in basis points (2000 = 20%)"
    )
    waterfall_threshold: float = Field(
        0.0, ge=0, description="USD threshold above which tiered waterfall kicks in"
    )
    equity_raise_target: Optional[float] = Field(
        None, gt=0, description="Total equity raise target in USD"
    )
    min_investment_usd: Optional[float] = Field(
        None, gt=0, description="Minimum investor check size in USD"
    )


class CapitalStackConfigRead(BaseModel):
    id: int
    property_id: int
    preferred_return_bps: int
    sponsor_promote_bps: int
    waterfall_threshold: float
    equity_raise_target: Optional[float]
    min_investment_usd: Optional[float]
    distribution_manager_address: Optional[str]
    investor_registry_address: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApproveInvestorRequest(BaseModel):
    """Approve an investor on the InvestorRegistry (KYC/accredited)."""
    address: str = Field(..., description="EVM wallet address of the investor")
    accredited: bool = Field(True, description="Whether the investor is accredited")
    institutional: bool = Field(False, description="Whether the investor is institutional")
    lockup_expiry: int = Field(0, ge=0, description="Unix timestamp when lockup expires (0 = none)")
    jurisdiction: Optional[str] = Field(None, description="Investor jurisdiction string")
    kyc_hash: Optional[str] = Field(None, description="Hash of KYC document for audit trail")


class DistributionStateRead(BaseModel):
    """On-chain DistributionManager state for a property."""
    property_address: str
    total_distributed: float
    preferred_return_paid: float
    sponsor_promote_paid: float
    investor_payout: float
    last_distribution_time: int
