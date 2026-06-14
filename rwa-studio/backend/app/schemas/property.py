"""
Pydantic schemas for Property endpoints.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


# ── Nested metadata structures (mirrors scraping_service.PropertyMetadata) ──

class AddressSchema(BaseModel):
    street: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    full_address: str = ""


class PropertyDetailsSchema(BaseModel):
    bedrooms: int = 0
    bathrooms: float = 0
    sqft: int = 0
    lot_size: str = ""
    year_built: int = 0
    property_type: str = ""
    style: str = ""
    stories: int = 0


class FinancialSchema(BaseModel):
    price_per_sqft: float = 0
    hoa_fee: float = 0
    hoa_fee_frequency: str = ""
    taxes_annual: float = 0
    utilities_included: list[str] = Field(default_factory=list)


class NeighborhoodSchema(BaseModel):
    name: str = ""
    description: str = ""
    schools: list[str] = Field(default_factory=list)
    walk_score: int = 0
    transit_score: int = 0


class MediaSchema(BaseModel):
    photos: list[str] = Field(default_factory=list)
    virtual_tour_url: str = ""
    video_url: str = ""


class FeaturesSchema(BaseModel):
    interior: list[str] = Field(default_factory=list)
    exterior: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    appliances: list[str] = Field(default_factory=list)
    flooring: list[str] = Field(default_factory=list)
    heating: list[str] = Field(default_factory=list)
    cooling: list[str] = Field(default_factory=list)
    parking: list[str] = Field(default_factory=list)


class PropertyMetadataSchema(BaseModel):
    """Full scraped / manually entered property metadata."""
    price: str = ""
    address: AddressSchema = Field(default_factory=AddressSchema)
    property_details: PropertyDetailsSchema = Field(default_factory=PropertyDetailsSchema)
    financial: FinancialSchema = Field(default_factory=FinancialSchema)
    neighborhood: NeighborhoodSchema = Field(default_factory=NeighborhoodSchema)
    media: MediaSchema = Field(default_factory=MediaSchema)
    features: FeaturesSchema = Field(default_factory=FeaturesSchema)


# ── Request / Response schemas ───────────────────────────────────────────────

class PropertyCreate(BaseModel):
    """
    Create a new property asset.
    Provide source_url to trigger a scrape job, OR provide metadata directly.
    If neither is given, the property is created in draft with no valuation.
    """
    source_url: Optional[str] = Field(
        None, description="Zillow / MLS listing URL — triggers background scrape"
    )
    # Optional: pre-populate with known data (skips scrape for that field)
    primary_value: Optional[float] = Field(None, description="Initial valuation in USD")
    metadata: Optional[PropertyMetadataSchema] = Field(
        None, description="Manually supplied metadata (bypasses scrape)"
    )


class PropertyValueUpdate(BaseModel):
    """Manual value override — used when scrape/AVM fails or user wants to override."""
    value: float = Field(..., gt=0, description="Property valuation in USD (whole dollars)")
    reason: Optional[str] = Field(None, description="Optional note explaining the override")


class PropertyMetadataUpdate(BaseModel):
    """Partial metadata update — any field can be patched without re-scraping."""
    metadata: PropertyMetadataSchema


class ValuationSourceRead(BaseModel):
    id: int
    source: str
    avm_value: float
    is_primary: bool
    fetched_at: datetime

    model_config = {"from_attributes": True}


class PropertyRead(BaseModel):
    id: int
    geo_id: str
    status: str
    scrape_status: str
    source_url: Optional[str]
    primary_value: Optional[float]
    property_token_address: Optional[str]
    security_token_address: Optional[str]
    nft_token_address: Optional[str]
    display_address: Optional[str]
    display_city: Optional[str]
    display_state: Optional[str]
    property_type: Optional[str]
    created_at: datetime
    updated_at: datetime
    valuation_sources: list[ValuationSourceRead] = []

    model_config = {"from_attributes": True}


class PropertyStatusRead(BaseModel):
    geo_id: str
    status: str
    scrape_status: str
    primary_value: Optional[float]
    property_token_address: Optional[str]
    security_token_address: Optional[str]
    nft_token_address: Optional[str]

    model_config = {"from_attributes": True}
