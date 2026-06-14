"""
ValuationSource ORM model.

Each row is one AVM / scrape / manual valuation attempt for a property.
Multiple sources can coexist; is_primary=True drives properties.primary_value.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class ValuationSource(Base):
    __tablename__ = "valuation_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Source identifier: scrape | zillow | attom | manual
    source: Mapped[str] = mapped_column(String(32), nullable=False)

    # USD estimate from this source
    avm_value: Mapped[float] = mapped_column(Float, nullable=False)

    # Full raw API / scrape response JSON (for audit trail)
    raw_response: Mapped[str] = mapped_column(Text, nullable=True)

    # Whether this source is driving properties.primary_value
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now()
    )

    # Relationship
    property: Mapped["Property"] = relationship(  # noqa: F821
        "Property", back_populates="valuation_sources"
    )
