"""
ledger_bridge.py — Optional HTTP bridge to the Rentline backend.

When RENTLINE_API_URL and RENTLINE_SANDBOX_BRIDGE_KEY are configured,
this fires a non-fatal POST to Rentline's /api/sandbox/ledger-bridge endpoint
so that simulated rent payments appear in the landlord's real Rentline ledger tab.

If either env var is missing, this is a complete no-op. The sandbox works
fully without this — the bridge is purely cosmetic/demo enrichment.

Returns the rentline payment_event_id on success so the engine can stamp
SandboxTransaction.rentline_payment_id for the audit trail.
"""

import httpx
from app.core.config import settings
from app.core.logging import logger


def record_sandbox_ledger_entry(
    property_ref: str,
    amount: float,
    reference_id: str,
    owner_clerk_id: str,
) -> str | None:
    """
    Non-fatal bridge call. Returns the rentline_payment_id if the bridge is
    configured and the request succeeds, otherwise None. Never raises.
    """
    if not settings.RENTLINE_API_URL or not settings.RENTLINE_SANDBOX_BRIDGE_KEY:
        return None
    try:
        resp = httpx.post(
            f"{settings.RENTLINE_API_URL}/api/sandbox/ledger-bridge",
            json={
                "property_ref": property_ref,
                "amount": amount,
                "reference_id": reference_id,
                "owner_clerk_id": owner_clerk_id,
            },
            headers={"X-API-Key": settings.RENTLINE_SANDBOX_BRIDGE_KEY},
            timeout=10.0,
        )
        data = resp.json()
        return data.get("payment_event_id")
    except Exception as e:
        logger.debug(f"Rentline ledger bridge failed (non-fatal): {e}")
        return None
