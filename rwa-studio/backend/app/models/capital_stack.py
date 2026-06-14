"""
CapitalStackConfig ORM model.

Stores CRE deal parameters: preferred return, sponsor promote, waterfall threshold.
One config per property (one-to-one). On deploy, DistributionManager +
InvestorRegistry contract addresses are written back here.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class CapitalStackConfig(Base):
    __tablename__ = "capital_stack_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("properties.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # Waterfall parameters (basis points — 100 bps = 1%)
    preferred_return_bps: Mapped[int] = mapped_column(Integer, default=800, nullable=False)
    sponsor_promote_bps: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)
    waterfall_threshold: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Fundraising targets
    equity_raise_target: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_investment_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Deployed on-chain addresses (populated after /capital_stack/{geo_id}/deploy)
    distribution_manager_address: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)
    investor_registry_address: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now()
    )

    # Relationship
    property: Mapped["Property"] = relationship(  # noqa: F821
        "Property", back_populates="capital_stack_config"
    )
