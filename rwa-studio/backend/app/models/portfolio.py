"""
Portfolio + PortfolioProperty ORM models.

Portfolio groups residential PropertyTokens together.
Aggregate NAV = sum of primary_value across all member properties.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # EVM wallet that owns / controls this portfolio
    owner_address: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now()
    )

    # Relationships
    property_links: Mapped[list["PortfolioProperty"]] = relationship(
        "PortfolioProperty", back_populates="portfolio", cascade="all, delete-orphan"
    )


class PortfolioProperty(Base):
    """Association table linking portfolios to properties."""

    __tablename__ = "portfolio_properties"

    portfolio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), primary_key=True
    )
    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("properties.id", ondelete="CASCADE"), primary_key=True
    )

    added_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now()
    )

    # Relationships
    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="property_links")
    property: Mapped["Property"] = relationship(  # noqa: F821
        "Property", back_populates="portfolio_links"
    )
