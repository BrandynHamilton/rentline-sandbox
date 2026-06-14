"""
Pydantic schemas for Portfolio endpoints.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.property import PropertyRead


class PortfolioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None
    owner_address: Optional[str] = Field(None, description="EVM wallet address of portfolio owner")
    property_geo_ids: list[str] = Field(
        default_factory=list, description="geo_ids of initial properties to add"
    )


class AddPropertyRequest(BaseModel):
    geo_id: str = Field(..., description="geo_id of the property to add")


class PortfolioRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_address: Optional[str]
    created_at: datetime
    # Aggregate NAV = sum of primary_value across all member properties
    aggregate_nav: float = 0.0
    property_count: int = 0
    properties: list[PropertyRead] = []

    model_config = {"from_attributes": True}


class PortfolioSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_address: Optional[str]
    aggregate_nav: float
    property_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
