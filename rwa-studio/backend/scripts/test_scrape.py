"""Test LoopNet scraping: tries Firecrawl scrape + extract + regex fallback."""
import os
import sys
import json
import re

# Set HTTPAYER_API_KEY in your .env or shell before running this script
if not os.environ.get("HTTPAYER_API_KEY"):
    print("ERROR: Set HTTPAYER_API_KEY env var before running this script")
    sys.exit(1)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import requests
from app.core.config import settings
from app.services.scraping_service import scrape_property_url, extract_property_metadata, get_scraping_prompt
from app.api.routes.properties import _extract_price_from_raw, _parse_price_string

API_KEY = settings.httpayer_api_key
PROXY = "https://api.httpayer.com/proxy"
URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.loopnet.com/Listing/484-Amsterdam-Ave-New-York-NY/31379002/"

def proxy_post(api_url: str, payload: dict) -> dict:
    resp = requests.post(PROXY, json={"api_url": api_url, "method": "POST", "json": payload},
                         headers={"Content-Type": "application/json", "x-api-key": API_KEY}, timeout=120)
    return resp.json()

_PRICE_RE = re.compile(r'\$\s*[\d,]+(?:\.\d+)?')

def extract_price(text: str) -> str | None:
    matches = _PRICE_RE.findall(text)
    if not matches:
        return None
    best, best_val = None, 0.0
    for m in matches:
        try:
            val = float(m.replace("$", "").replace(",", ""))
            if val > best_val:
                best_val, best = val, m
        except ValueError:
            continue
    return best

# ── 1. Firecrawl scrape endpoint (raw markdown) ────────────────────────────
print("=== 1. Firecrawl scrape (raw markdown) ===")
SCRAPE_API = "https://mesh.heurist.xyz/x402/agents/FirecrawlSearchDigestAgent/firecrawl_scrape_url"
try:
    scrape_resp = proxy_post(SCRAPE_API, {"url": URL})
    scrape_text = json.dumps(scrape_resp)
    print(f"Response size: {len(scrape_text)} chars")

    markdown = (
        scrape_resp.get("markdown", "")
        or scrape_resp.get("data", {}).get("markdown", "")
        or scrape_resp.get("data", ""))
    if markdown and len(markdown) > 200:
        print(f"Markdown ({len(markdown)} chars):\n{markdown[:1500]}...")
        price = extract_price(scrape_text)
        print(f"\nDollar amounts: {_PRICE_RE.findall(scrape_text)}")
        print(f"Best price: {price}")
    else:
        print(f"Response:\n{scrape_text[:2000]}")
except Exception as e:
    print(f"Error: {e}")

# ── 2. Firecrawl AI extract (current approach) ────────────────────────────
print("\n=== 2. Firecrawl AI extract ===")
raw = scrape_property_url(URL)
metadata = extract_property_metadata(raw)
print(f"Price: {metadata.get('price', '')!r}")
print(f"Address: {metadata.get('fullAddress', '')!r}")

price_str = metadata.get("price", "")
if not price_str:
    fb = _extract_price_from_raw(raw)
    print(f"Regex fallback on raw JSON: {fb!r}")
    if fb:
        price_str = fb

if price_str:
    avm = _parse_price_string(price_str)
    print(f"AVM: ${avm:,.2f}" if avm else "Parse failed")
