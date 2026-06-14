"""
/portfolios routes

POST   /portfolios                          — create portfolio
GET    /portfolios                          — list all
GET    /portfolios/{id}                     — get portfolio + properties + aggregate NAV
POST   /portfolios/{id}/properties          — add property
DELETE /portfolios/{id}/properties/{geo_id} — remove property
DELETE /portfolios/{id}                     — delete portfolio
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.portfolio import Portfolio, PortfolioProperty
from app.models.property import Property
from app.schemas.portfolio import (
    AddPropertyRequest,
    PortfolioCreate,
    PortfolioRead,
    PortfolioSummary,
)

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_portfolio_or_404(portfolio_id: int, db: Session) -> Portfolio:
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    return p


def _get_property_or_404(geo_id: str, db: Session) -> Property:
    p = db.query(Property).filter(Property.geo_id == geo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail=f"Property not found: {geo_id}")
    return p


def _build_portfolio_read(portfolio: Portfolio, db: Session) -> dict:
    """Build a PortfolioRead-compatible dict with aggregate NAV."""
    links = (
        db.query(PortfolioProperty)
        .filter(PortfolioProperty.portfolio_id == portfolio.id)
        .all()
    )
    properties = [link.property for link in links]
    aggregate_nav = sum(
        (p.primary_value or 0) for p in properties
    )
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "description": portfolio.description,
        "owner_address": portfolio.owner_address,
        "created_at": portfolio.created_at,
        "aggregate_nav": aggregate_nav,
        "property_count": len(properties),
        "properties": properties,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=PortfolioRead, status_code=201)
def create_portfolio(body: PortfolioCreate, db: Session = Depends(get_db)):
    """Create a portfolio, optionally with initial properties."""
    portfolio = Portfolio(
        name=body.name,
        description=body.description,
        owner_address=body.owner_address,
    )
    db.add(portfolio)
    db.flush()

    for geo_id in body.property_geo_ids:
        prop = _get_property_or_404(geo_id, db)
        # Check not already in this portfolio
        existing = db.query(PortfolioProperty).filter(
            PortfolioProperty.portfolio_id == portfolio.id,
            PortfolioProperty.property_id == prop.id,
        ).first()
        if not existing:
            db.add(PortfolioProperty(portfolio_id=portfolio.id, property_id=prop.id))

    db.commit()
    db.refresh(portfolio)
    return _build_portfolio_read(portfolio, db)


@router.get("", response_model=list[PortfolioSummary])
def list_portfolios(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all portfolios with aggregate NAV summary."""
    portfolios = db.query(Portfolio).order_by(Portfolio.created_at.desc()).offset(skip).limit(limit).all()
    results = []
    for portfolio in portfolios:
        links = db.query(PortfolioProperty).filter(PortfolioProperty.portfolio_id == portfolio.id).all()
        nav = sum((link.property.primary_value or 0) for link in links)
        results.append({
            "id": portfolio.id,
            "name": portfolio.name,
            "description": portfolio.description,
            "owner_address": portfolio.owner_address,
            "aggregate_nav": nav,
            "property_count": len(links),
            "created_at": portfolio.created_at,
        })
    return results


@router.get("/{portfolio_id}", response_model=PortfolioRead)
def get_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    """Get portfolio details including all properties and aggregate NAV."""
    portfolio = _get_portfolio_or_404(portfolio_id, db)
    return _build_portfolio_read(portfolio, db)


@router.post("/{portfolio_id}/properties", response_model=dict)
def add_property_to_portfolio(
    portfolio_id: int,
    body: AddPropertyRequest,
    db: Session = Depends(get_db),
):
    """Add a property to a portfolio."""
    portfolio = _get_portfolio_or_404(portfolio_id, db)
    prop = _get_property_or_404(body.geo_id, db)

    existing = db.query(PortfolioProperty).filter(
        PortfolioProperty.portfolio_id == portfolio.id,
        PortfolioProperty.property_id == prop.id,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Property {body.geo_id} is already in portfolio {portfolio_id}",
        )

    db.add(PortfolioProperty(portfolio_id=portfolio.id, property_id=prop.id))
    db.commit()
    return {"portfolio_id": portfolio_id, "geo_id": body.geo_id, "added": True}


@router.delete("/{portfolio_id}/properties/{geo_id}", response_model=dict)
def remove_property_from_portfolio(
    portfolio_id: int,
    geo_id: str,
    db: Session = Depends(get_db),
):
    """Remove a property from a portfolio."""
    portfolio = _get_portfolio_or_404(portfolio_id, db)
    prop = _get_property_or_404(geo_id, db)

    link = db.query(PortfolioProperty).filter(
        PortfolioProperty.portfolio_id == portfolio.id,
        PortfolioProperty.property_id == prop.id,
    ).first()

    if not link:
        raise HTTPException(
            status_code=404,
            detail=f"Property {geo_id} not found in portfolio {portfolio_id}",
        )

    db.delete(link)
    db.commit()
    return {"portfolio_id": portfolio_id, "geo_id": geo_id, "removed": True}


@router.delete("/{portfolio_id}", response_model=dict)
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    """Delete a portfolio and all its property links (properties themselves are kept)."""
    portfolio = _get_portfolio_or_404(portfolio_id, db)
    db.delete(portfolio)
    db.commit()
    return {"portfolio_id": portfolio_id, "deleted": True}
