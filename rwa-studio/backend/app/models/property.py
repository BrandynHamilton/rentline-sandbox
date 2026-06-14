"""
Property ORM model.

geo_id is the primary oracle anchor — every {geo_id}.json served by /metadata
maps directly to this record.
"""
import json
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Oracle anchor — filename of the metadata JSON served to the valuation feed
    geo_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    # Lifecycle
    status: Mapped[str] = mapped_column(
        String(32), default="draft", nullable=False
    )  # draft | scraping | ready | deployed
    scrape_status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False
    )  # pending | running | done | failed

    # Source — the URL the user submitted (Zillow / MLS)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Confirmed valuation in USD (whole dollars) — drives the oracle feed
    primary_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Deployed token addresses
    property_token_address: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)
    security_token_address: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)
    nft_token_address: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)

    # Full scraped/manual metadata blob (PropertyMetadata JSON)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Display helpers (denormalized from metadata_json for quick queries)
    display_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    display_city: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    display_state: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    property_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now()
    )

    # Relationships
    valuation_sources: Mapped[list["ValuationSource"]] = relationship(  # noqa: F821
        "ValuationSource", back_populates="property", cascade="all, delete-orphan"
    )
    capital_stack_config: Mapped[Optional["CapitalStackConfig"]] = relationship(  # noqa: F821
        "CapitalStackConfig", back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    portfolio_links: Mapped[list["PortfolioProperty"]] = relationship(  # noqa: F821
        "PortfolioProperty", back_populates="property", cascade="all, delete-orphan"
    )

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def get_metadata(self) -> Optional[dict]:
        if self.metadata_json:
            return json.loads(self.metadata_json)
        return None

    def set_metadata(self, data: dict):
        self.metadata_json = json.dumps(data)
        # Support both nested schema shape { address: { full_address, city, ... }, property_details: { ... } }
        # and flat scrape shape { full_address, city, property_type, ... } returned by Firecrawl
        addr = data.get("address", {})
        self.display_address = (
            addr.get("full_address")
            or addr.get("street")
            or data.get("full_address")        # flat key
            or data.get("fullAddress")         # camelCase variant
            or ""
        )
        self.display_city = (
            addr.get("city")
            or data.get("city")
            or ""
        )
        self.display_state = (
            addr.get("state")
            or data.get("state")
            or data.get("region")
            or ""
        )
        pd = data.get("property_details", {})
        self.property_type = (
            pd.get("property_type")
            or data.get("property_type")       # flat key
            or data.get("propertyType")        # camelCase variant
            or ""
        )

    def to_oracle_json(self) -> dict:
        """
        Produces the JSON blob written to {geo_id}.json and served by /metadata.
        Matches the format consumed by rwa-desk oracle: { geoId, value, property }.
        """
        out: dict = {
            "geoId": self.geo_id,
            "value": self.primary_value or 0,
        }
        meta = self.get_metadata()
        if meta:
            out["property"] = meta
        return out
