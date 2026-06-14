"""
Pydantic schemas for Valuation (AVM) endpoints.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AVMFetchRequest(BaseModel):
    """
    Trigger AVM enrichment for a property.
    If address is not provided, the backend uses the property's stored address.
    """
    address: Optional[str] = Field(
        None, description="Property address string (overrides stored address)"
    )
    sources: Optional[list[str]] = Field(
        None,
        description="Specific AVM sources to query: zillow, attom. Defaults to all configured.",
    )


class SetPrimaryRequest(BaseModel):
    """Set a specific valuation source as the primary (drives primary_value)."""
    valuation_source_id: int = Field(..., description="ID of the ValuationSource row to promote")


class ManualValuationCreate(BaseModel):
    """Add a manual valuation entry directly (no API call)."""
    avm_value: float = Field(..., gt=0, description="Valuation in USD")
    set_primary: bool = Field(True, description="Also set as primary_value")
    notes: Optional[str] = Field(None, description="Optional appraisal notes stored in raw_response")


class ValuationSourceRead(BaseModel):
    id: int
    property_id: int
    source: str
    avm_value: float
    is_primary: bool
    fetched_at: datetime

    model_config = {"from_attributes": True}
