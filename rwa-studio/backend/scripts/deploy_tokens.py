"""
Deploy RWA tokens (PropertyToken / SecurityToken) from a CSV file.

This is a standalone script — it has no dependency on the rentline backend.
After deployment, token addresses are written to a JSON output file that
can be POSTed to the rentline API to update the property record.

Usage:
    uv run python scripts/deploy_tokens.py <csv_file> [--dry-run] [--output deployments.json]

CSV columns:
    name             Property display name (required)
    wallet_address   Owner EVM address (required)
    property_address Physical address string, passed to PropertyToken constructor
    deploy_property  "true" to deploy PropertyToken ERC-20
    cre_name         CRE token name — if set, also deploys SecurityToken
    cre_symbol       CRE token symbol (default: CRE)
    compliance_manager  EVM address for CRE compliance role (defaults to wallet_address)

Output JSON format (one entry per row):
    [
      {
        "name": "My Property",
        "wallet_address": "0x...",
        "token_address": "0x...",       // PropertyToken, if deployed
        "cre_token_address": "0x...",   // SecurityToken, if deployed
        "tx_hashes": { ... }
      }
    ]
"""

import sys
import os
import csv
import json
import argparse
from pathlib import Path

# Avalanche / Web3
from web3 import Web3
from eth_account import Account

# Contract verification (Snowtrace / Etherscan-compatible API)
from verify import verify_contract


# ---------------------------------------------------------------------------
# Config from env
# ---------------------------------------------------------------------------

RPC_URL = os.getenv("AVALANCHE_RPC_URL", "https://rpc.testnet.chain.robinhood.com/rpc")
CHAIN_ID = int(os.getenv("AVALANCHE_CHAIN_ID", "46630"))
PRIVATE_KEY = os.getenv("AVALANCHE_PRIVATE_KEY", "")
TEST_USDC_ADDRESS = os.getenv("TEST_USDC_ADDRESS", "0xa1dCB49Cf93CA429cb8F0f72581E1C917ed0c9D1")
ARTIFACTS_DIR = Path(__file__).parent.parent / "contracts" / "out"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_web3() -> Web3:
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to Avalanche RPC: {RPC_URL}")
    return w3


def load_artifact(name: str) -> dict:
    """Load compiled contract artifact from Foundry out/ directory."""
    path = ARTIFACTS_DIR / f"{name}.sol" / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"Artifact not found: {path}\n"
            f"Run: cd contracts && forge build"
        )
    with open(path) as f:
        return json.load(f)


def deploy_contract(w3: Web3, artifact: dict, constructor_args: list, account) -> dict:
    bytecode = artifact["bytecode"]["object"]
    abi = artifact["abi"]
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    nonce = w3.eth.get_transaction_count(account.address)
    tx = contract.constructor(*constructor_args).build_transaction({
        "from": account.address,
        "nonce": nonce,
        "gas": 3_000_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": CHAIN_ID,
    })
    signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    return {"address": receipt.contractAddress, "tx_hash": tx_hash.hex(), "status": receipt["status"]}


# ---------------------------------------------------------------------------
# Token deployment functions
# ---------------------------------------------------------------------------

def deploy_property_token(w3: Web3, account, name: str, property_address: str, owner: str) -> dict | None:
    print(f"    Deploying PropertyToken for '{name}'...")
    try:
        artifact = load_artifact("PropertyToken")
        metadata_uri = f"https://explorer.testnet.chain.robinhood.com/api/v1/metadata/{name.lower().replace(' ', '-')}"
        result = deploy_contract(w3, artifact, [name, property_address, owner, TEST_USDC_ADDRESS, metadata_uri], account)
        if result["status"] == 1:
            print(f"    PropertyToken: {result['address']}")
            # ABI-encode constructor args: (string name, string propertyAddress, address owner, address usdcAddress, string metadataUri)
            ctor_hex = w3.codec.encode(
                ["string", "string", "address", "address", "string"],
                [name, property_address, owner, TEST_USDC_ADDRESS, metadata_uri],
            ).hex()
            verify_contract("PropertyToken", result["address"], ctor_hex)
            return result
        else:
            print(f"    PropertyToken deployment failed: {result['tx_hash']}")
            return None
    except Exception as e:
        print(f"    PropertyToken error: {e}")
        return None


def deploy_security_token(w3: Web3, account, name: str, symbol: str, compliance_manager: str) -> dict | None:
    print(f"    Deploying SecurityToken (CRE) '{symbol}'...")
    try:
        artifact = load_artifact("SecurityToken")
        result = deploy_contract(
            w3, artifact,
            [name, symbol, compliance_manager, account.address],
            account,
        )
        if result["status"] == 1:
            print(f"    SecurityToken: {result['address']}")
            # ABI-encode constructor args: (string name, string symbol, address complianceManager, address owner)
            ctor_hex = w3.codec.encode(
                ["string", "string", "address", "address"],
                [name, symbol, compliance_manager, account.address],
            ).hex()
            verify_contract("SecurityToken", result["address"], ctor_hex)
            return result
        else:
            print(f"    SecurityToken deployment failed: {result['tx_hash']}")
            return None
    except Exception as e:
        print(f"    SecurityToken error: {e}")
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(csv_path: str, dry_run: bool, output_path: str):
    if not os.path.exists(csv_path):
        print(f"ERROR: CSV not found: {csv_path}")
        sys.exit(1)

    if not dry_run:
        if not PRIVATE_KEY:
            print("ERROR: AVALANCHE_PRIVATE_KEY not set.")
            sys.exit(1)
        w3 = get_web3()
        account = Account.from_key(PRIVATE_KEY)
        print(f"Deployer: {account.address}")
        print(f"Network:  {RPC_URL} (chain {CHAIN_ID})")
    else:
        w3 = account = None
        print("[dry-run] No transactions will be sent.")

    results = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("name", "").strip()
            wallet = row.get("wallet_address", "").strip()
            if not name or not wallet:
                print(f"  SKIP: missing name or wallet_address")
                continue

            print(f"\n{name} ({wallet})")
            entry = {"name": name, "wallet_address": wallet, "token_address": None, "cre_token_address": None, "tx_hashes": {}}

            if dry_run:
                if row.get("deploy_property", "").lower() == "true":
                    print(f"  [dry-run] Would deploy PropertyToken")
                if row.get("cre_name"):
                    print(f"  [dry-run] Would deploy SecurityToken: {row['cre_name']}")
                results.append(entry)
                continue

            # PropertyToken
            if row.get("deploy_property", "").lower() == "true":
                r = deploy_property_token(w3, account, name, row.get("property_address", ""), wallet)
                if r:
                    entry["token_address"] = r["address"]
                    entry["tx_hashes"]["property_token"] = r["tx_hash"]

            # SecurityToken (CRE)
            if row.get("cre_name", "").strip():
                r = deploy_security_token(
                    w3, account,
                    row["cre_name"].strip(),
                    row.get("cre_symbol", "CRE").strip(),
                    row.get("compliance_manager", wallet).strip(),
                )
                if r:
                    entry["cre_token_address"] = r["address"]
                    entry["tx_hashes"]["security_token"] = r["tx_hash"]

            results.append(entry)

    # Write output
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDeployments written to: {output_path}")
    deployed = sum(1 for r in results if r["token_address"] or r["cre_token_address"])
    print(f"Deployed: {deployed} / {len(results)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy RWA tokens from CSV.")
    parser.add_argument("csv_file", help="Path to CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Preview without deploying")
    parser.add_argument("--output", default="deployments.json", help="Output JSON file path")
    args = parser.parse_args()
    run(args.csv_file, args.dry_run, args.output)
