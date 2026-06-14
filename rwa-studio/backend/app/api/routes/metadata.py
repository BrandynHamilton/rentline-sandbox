"""
/metadata routes

GET /metadata/{geo_id}       — serve {geo_id}.json for oracle / tokenURI resolution
GET /metadata/{geo_id}.json  — same with explicit .json extension
GET /metadata                — list all geo_ids with metadata files
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.services.metadata_service import list_geo_ids, read_geo_json

router = APIRouter(prefix="/metadata", tags=["metadata"])


def _serve(geo_id: str):
    geo_id = geo_id.replace(".json", "")
    data = read_geo_json(geo_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Metadata not found: {geo_id}")
    # Return raw JSON with no Pydantic wrapping — oracle reads this directly
    return JSONResponse(content=data)


@router.get("")
def list_metadata():
    """List all geo_ids that have a metadata JSON file on disk."""
    return {"geo_ids": list_geo_ids()}


@router.get("/{geo_id}")
def get_metadata(geo_id: str):
    """
    Serve the oracle metadata JSON for a geo_id.
    This is the URL set as tokenURI and as the valuation feed.

    Response format:
    {
      "geoId": "geo-382910",
      "value": 850000,
      "property": { ...scraped metadata... }
    }
    """
    return _serve(geo_id)
