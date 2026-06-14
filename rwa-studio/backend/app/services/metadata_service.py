"""
Metadata service.

Responsible for writing and reading {geoId}.json files that are:
  1. Served by GET /metadata/{geo_id} (the oracle endpoint)
  2. Set as the tokenURI on PropertyToken / SecurityToken contracts
  3. Consumed by rwa-desk valuation feed: reads .value field

File format:
{
  "geoId": "geo-382910",
  "value": 850000,
  "property": { ...full PropertyMetadata... }
}
"""
import json
import os
from typing import Optional

from app.core.config import settings
from app.core.logging import logger


def _ensure_dir(directory: str):
    os.makedirs(directory, exist_ok=True)


def write_geo_json(
    geo_id: str,
    value: float,
    property_metadata: Optional[dict] = None,
    output_dir: Optional[str] = None,
) -> str:
    """
    Write {geo_id}.json to the metadata directory.

    Args:
        geo_id: The geo_id string (becomes the filename)
        value: Property valuation in USD (whole dollars)
        property_metadata: Optional full metadata dict (from scrape / manual entry)
        output_dir: Override directory (defaults to settings.metadata_dir)

    Returns:
        Absolute file path of the written JSON
    """
    directory = output_dir or settings.metadata_dir
    _ensure_dir(directory)

    filename = f"{geo_id}.json"
    filepath = os.path.join(directory, filename)

    data: dict = {"geoId": geo_id, "value": value}
    if property_metadata:
        data["property"] = property_metadata

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    logger.info(f"[metadata] Wrote {filepath} (value=${value:,.0f})")
    return filepath


def read_geo_json(geo_id: str, directory: Optional[str] = None) -> Optional[dict]:
    """
    Read and parse {geo_id}.json from the metadata directory.
    Returns None if the file does not exist.
    """
    directory = directory or settings.metadata_dir
    filepath = os.path.join(directory, f"{geo_id}.json")

    if not os.path.exists(filepath):
        return None

    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def geo_json_exists(geo_id: str, directory: Optional[str] = None) -> bool:
    directory = directory or settings.metadata_dir
    return os.path.exists(os.path.join(directory, f"{geo_id}.json"))


def token_uri(geo_id: str) -> str:
    """Build the tokenURI for a given geo_id (served by /metadata/{geo_id})."""
    base = settings.token_uri_base.rstrip("/")
    return f"{base}/{geo_id}.json"


def list_geo_ids(directory: Optional[str] = None) -> list[str]:
    """Return all geo_ids with existing JSON files in the metadata directory."""
    directory = directory or settings.metadata_dir
    if not os.path.exists(directory):
        return []
    return [
        f.replace(".json", "")
        for f in os.listdir(directory)
        if f.endswith(".json")
    ]
