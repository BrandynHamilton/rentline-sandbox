"""
Reads Foundry broadcast run-latest.json files from contracts/broadcast/ and
returns a mapping of contract name → deployed address.

Used by config.py as a fallback when factory addresses are not explicitly set
in the environment — so the app works out of the box after `forge script --broadcast`
without requiring any manual env var changes.

Priority: env vars always win over broadcast values.
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger("rwa_issuer")

# Relative to this file: backend/app/core/ → up 3 levels → project root → contracts/
_BROADCAST_DIR = Path(__file__).parent.parent.parent.parent / "contracts" / "broadcast"

# Contract name → config field name
_CONTRACT_MAP = {
    "PropertyTokenFactory":        "property_token_factory_address",
    "SecurityTokenFactory":        "security_token_factory_address",
    "PropertyNFTFactory":          "nft_token_factory_address",
    "CREFactory":                  "cre_factory_address",
    "PropertyLLCFactory":          "property_llc_factory_address",
    "InvestorRegistryFactory":     "investor_registry_factory_address",
    "GovernanceFactory":           "governance_factory_address",
    "DistributionManagerFactory":  "distribution_manager_factory_address",
}


def load_broadcast_addresses() -> dict[str, str]:
    """
    Walk every run-latest.json in contracts/broadcast/ and collect
    all CREATE transactions.

    Returns a dict of config field name → checksummed address.
    e.g. {"property_token_factory_address": "0xABC...", ...}
    """
    addresses: dict[str, str] = {}

    if not _BROADCAST_DIR.exists():
        logger.debug("[broadcast] contracts/broadcast/ not found — skipping")
        return addresses

    for latest in _BROADCAST_DIR.rglob("run-latest.json"):
        try:
            data = json.loads(latest.read_text())
            for tx in data.get("transactions", []):
                if tx.get("transactionType") != "CREATE":
                    continue
                name = tx.get("contractName", "")
                addr = tx.get("contractAddress", "")
                if name in _CONTRACT_MAP and addr:
                    field = _CONTRACT_MAP[name]
                    # Keep the first (oldest) broadcast if already found — or replace
                    # with newer one if the timestamp is greater. Since we iterate
                    # rglob non-deterministically, just let last-write win: the
                    # timestamps are in the filenames so using run-latest.json is
                    # already the canonical latest per script.
                    addresses[field] = addr.lower()
                    logger.debug(f"[broadcast] {name} → {addr}")
        except Exception as e:
            logger.warning(f"[broadcast] Failed to parse {latest}: {e}")

    return addresses
