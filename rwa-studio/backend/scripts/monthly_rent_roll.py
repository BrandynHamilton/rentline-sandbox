"""
Monthly rent roll automation: create RWA → deploy token → schedule recurring payments.

Modes:
  init       One-shot: create property, deploy token, push to rentline
  schedule   Run APScheduler that fires monthly rent payments
  run-once   Single payment cycle (for cron instead of APScheduler)

Usage:
    # Create RWA from a Zillow / MLS listing
    uv run python scripts/monthly_rent_roll.py init \\
        --source-url "https://www.zillow.com/..." \\
        --value 850000 \\
        --owner 0x1051218fbA33A2997Ff3320c6daef3C392A9F39c

    # Create RWA with manual metadata (skip scrape)
    uv run python scripts/monthly_rent_roll.py init \\
        --value 450000 \\
        --address "123 Main St, Austin, TX 78701"

    # Start scheduler (payments fire on the 1st of each month)
    uv run python scripts/monthly_rent_roll.py schedule \\
        --property-id <uuid-from-core> \\
        --geo-id geo-382910 \\
        --amount 1200

    # One-shot payment (for cron: 0 0 1 * *)
    uv run python scripts/monthly_rent_roll.py run-once \\
        --property-id <uuid-from-core> \\
        --amount 1200
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests

# ── Config from env ──────────────────────────────────────────────────────────
RWA_STUDIO_URL = os.getenv("RWA_STUDIO_URL", "http://localhost:8000")
CORE_API_URL = os.getenv("CORE_API_URL", "http://localhost:6531")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")
CORE_API_KEY = os.getenv("CORE_API_KEY", "")
OWNER_ADDRESS = os.getenv("OWNER_ADDRESS", "")
USDC_ADDRESS = os.getenv("USDC_ADDRESS", "0xa1dCB49Cf93CA429cb8F0f72581E1C917ed0c9D1")
INITIAL_SUPPLY = int(os.getenv("INITIAL_SUPPLY", "1000000"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _rwa_headers() -> dict:
    h = {"Content-Type": "application/json"}
    if ADMIN_API_KEY:
        h["X-Admin-Key"] = ADMIN_API_KEY
    return h


def _core_headers() -> dict:
    h = {"Content-Type": "application/json"}
    if CORE_API_KEY:
        h["X-API-Key"] = CORE_API_KEY
    return h


def _require_env(var: str):
    val = os.getenv(var)
    if not val:
        print(f"ERROR: {var} is not set in .env")
        sys.exit(1)
    return val


def divider(title: str):
    print()
    print(f"{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")
    print()


# ── Step 1: Create Property ──────────────────────────────────────────────────

def create_property(source_url: str = "", value: float = 0,
                    address: str = "") -> dict:
    divider("STEP 1: Create Property in RWA Studio")

    body = {}
    if source_url:
        body["source_url"] = source_url
        print(f"  Source URL: {source_url}")
    if value:
        body["primary_value"] = value
        print(f"  Value:      ${value:,.0f}")
    if address:
        body.setdefault("metadata", {})
        body["metadata"]["address"] = {"full_address": address}
        print(f"  Address:    {address}")

    r = requests.post(
        f"{RWA_STUDIO_URL}/api/v1/properties",
        json=body,
        headers=_rwa_headers(),
    )
    if r.status_code not in (200, 201):
        print(f"  FAILED: {r.status_code} — {r.text}")
        sys.exit(1)

    prop = r.json()
    geo_id = prop["geo_id"]
    status = prop.get("status", "draft")
    print(f"  Geo ID:     {geo_id}")
    print(f"  Status:     {status}")
    return prop


# ── Step 2: Wait for scrape ─────────────────────────────────────────────────

def wait_for_scrape(geo_id: str, timeout: int = 120) -> dict:
    divider("STEP 2: Wait for Scrape to Complete")

    for i in range(timeout // POLL_INTERVAL):
        r = requests.get(
            f"{RWA_STUDIO_URL}/api/v1/properties/{geo_id}/status",
            headers=_rwa_headers(),
        )
        if r.status_code != 200:
            print(f"  Status check failed: {r.status_code}")
            time.sleep(POLL_INTERVAL)
            continue

        data = r.json()
        s = data.get("scrape_status", "")
        val = data.get("primary_value")
        print(f"  [{i * POLL_INTERVAL:>3}s] scrape={s} value={val}")

        if s == "done":
            print(f"  Scrape complete — value=${val}")
            return data
        if s == "failed":
            print(f"  Scrape failed — continuing with available data")
            return data

        time.sleep(POLL_INTERVAL)

    print(f"  TIMEOUT after {timeout}s — continuing with whatever we have")
    r = requests.get(
        f"{RWA_STUDIO_URL}/api/v1/properties/{geo_id}",
        headers=_rwa_headers(),
    )
    return r.json()


# ── Step 3: Deploy PropertyToken ─────────────────────────────────────────────

def deploy_token(geo_id: str, owner: str = "") -> dict:
    divider("STEP 3: Deploy PropertyToken")

    owner = owner or _require_env("OWNER_ADDRESS")
    body = {
        "owner_address": owner,
        "usdc_address": USDC_ADDRESS,
        "initial_supply": INITIAL_SUPPLY,
    }

    r = requests.post(
        f"{RWA_STUDIO_URL}/api/v1/tokens/{geo_id}/deploy/property",
        json=body,
        headers=_rwa_headers(),
    )
    if r.status_code not in (200, 201):
        print(f"  FAILED: {r.status_code} — {r.text}")
        sys.exit(1)

    result = r.json()
    print(f"  Token address:  {result['address']}")
    print(f"  Tx hash:        {result.get('tx_hash', 'N/A')}")
    return result


# ── Step 4: Push to Rentline ─────────────────────────────────────────────────

def push_to_rentline(geo_id: str, rentline_property_id: str) -> dict:
    divider("STEP 4: Push Token Address to Rentline")

    body = {"rentline_property_id": rentline_property_id}
    r = requests.post(
        f"{RWA_STUDIO_URL}/api/v1/tokens/{geo_id}/push_rentline",
        json=body,
        headers=_rwa_headers(),
    )
    if r.status_code not in (200, 201):
        print(f"  WARNING: push_rentline returned {r.status_code} — {r.text}")
        return {}

    result = r.json()
    print(f"  OK — token registered in Rentline")
    return result


# ── Step 5: Simulate Payment ─────────────────────────────────────────────────

def simulate_payment(property_id: str, amount: float) -> dict:
    body = {
        "property_id": property_id,
        "amount": amount,
        "currency": "USD",
    }
    r = requests.post(
        f"{CORE_API_URL}/payments/simulate",
        json=body,
        headers=_core_headers(),
    )
    if r.status_code != 201:
        print(f"  PAYMENT FAILED: {r.status_code} — {r.text}")
        return {"status": "FAILED", "error": r.text}

    payment = r.json()
    print(f"  Payment:  {payment['id']}")
    print(f"  Status:   {payment['status']}")
    print(f"  Amount:   ${amount:,.2f}")
    return payment


# ── Modes ────────────────────────────────────────────────────────────────────

def cmd_init(args):
    """Create RWA + deploy token (one-shot setup)."""
    prop = create_property(
        source_url=args.source_url or "",
        value=args.value or 0,
        address=args.address or "",
    )
    geo_id = prop["geo_id"]

    wait_for_scrape(geo_id)

    token = deploy_token(geo_id, owner=args.owner or "")

    if args.rentline_property_id:
        push_to_rentline(geo_id, args.rentline_property_id)

    # Print summary for chaining into next command
    divider("READY")
    print(f"  GEO ID:             {geo_id}")
    print(f"  Token address:      {token['address']}")
    print(f"  Core property ID:   {args.rentline_property_id or '(not set)'}")
    print()
    if args.rentline_property_id:
        print(f"  Next: schedule payments")
        print(f"    uv run python scripts/monthly_rent_roll.py schedule \\")
        print(f"      --geo-id {geo_id} \\")
        print(f"      --property-id {args.rentline_property_id} \\")
        print(f"      --amount {args.amount or 1200}")
    else:
        print(f"  Next: push to rentline (set --rentline-property-id)")

    return geo_id


def cmd_run_once(args):
    """Single payment cycle — for cron: 0 0 1 * *"""
    now = datetime.now(timezone.utc).isoformat()
    print(f"[{now}] Monthly rent payment — ${args.amount:,.2f}")
    payment = simulate_payment(args.property_id, args.amount)
    status = payment.get("status", "UNKNOWN")
    print(f"  Result: {status}")
    if status == "ONCHAIN_SETTLED":
        print(f"  ✅ Rent settled on-chain")
    return payment


def cmd_schedule(args):
    """Run APScheduler that fires on the 1st of each month."""
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger

    day = args.day
    hour = args.hour
    minute = args.minute
    amount = args.amount
    property_id = args.property_id

    print(f"Starting monthly rent scheduler")
    print(f"  Property ID:  {property_id}")
    print(f"  Amount:       ${amount:,.2f}")
    print(f"  Schedule:     Day {day} @ {hour:02d}:{minute:02d} UTC")
    print()

    def job():
        now = datetime.now(timezone.utc).isoformat()
        print(f"[{now}] Scheduled rent payment firing...")
        payment = simulate_payment(property_id, amount)
        s = payment.get("status", "UNKNOWN")
        print(f"  Status: {s}")
        if s == "ONCHAIN_SETTLED":
            print(f"  ✅ Done")
        else:
            print(f"  ⚠️  Check core backend logs")

    scheduler = BlockingScheduler()
    trigger = CronTrigger(day=day, hour=hour, minute=minute, timezone="UTC")
    scheduler.add_job(job, trigger)
    print("Press Ctrl+C to stop")
    try:
        scheduler.start()
    except KeyboardInterrupt:
        print("\nStopped")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Monthly rent roll: create RWA → deploy token → schedule payments"
    )
    sub = parser.add_subparsers(dest="mode", required=True)

    # init
    p_init = sub.add_parser("init", help="Create RWA + deploy token")
    p_init.add_argument("--source-url", help="Zillow/MLS listing URL to scrape")
    p_init.add_argument("--value", type=float, default=0, help="Property valuation in USD")
    p_init.add_argument("--address", help="Full address (skip scrape, use manual metadata)")
    p_init.add_argument("--owner", default="", help="Owner EVM address (default: OWNER_ADDRESS env)")
    p_init.add_argument("--rentline-property-id", help="Core backend property UUID to push token to")
    p_init.add_argument("--amount", type=float, default=1200, help="Monthly rent amount")

    # schedule
    p_sched = sub.add_parser("schedule", help="Run APScheduler for monthly payments")
    p_sched.add_argument("--property-id", required=True, help="Core backend property UUID")
    p_sched.add_argument("--amount", type=float, default=1200, help="Monthly rent amount")
    p_sched.add_argument("--day", type=int, default=1, help="Day of month (default: 1)")
    p_sched.add_argument("--hour", type=int, default=12, help="Hour UTC (default: 12)")
    p_sched.add_argument("--minute", type=int, default=0, help="Minute UTC (default: 0)")

    # run-once
    p_once = sub.add_parser("run-once", help="Single payment (for cron)")
    p_once.add_argument("--property-id", required=True, help="Core backend property UUID")
    p_once.add_argument("--amount", type=float, default=1200, help="Rent amount")

    args = parser.parse_args()

    if args.mode == "init":
        cmd_init(args)
    elif args.mode == "schedule":
        cmd_schedule(args)
    elif args.mode == "run-once":
        cmd_run_once(args)


if __name__ == "__main__":
    main()
