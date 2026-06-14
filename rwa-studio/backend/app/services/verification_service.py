"""
Contract verification service — submits deployed contract source code to
Blockscout (Robinhood Chain explorer) for on-chain verification.

Builds the standard-json-input from Foundry artifacts + source files on disk,
eliminating the need for the forge binary inside Docker.
"""
import json
import os
import time
from pathlib import Path
from typing import Optional

import requests

from app.core.logging import logger

PROJECT_ROOT = Path(__file__).parent.parent.parent
CONTRACTS_DIR = PROJECT_ROOT / "contracts"
OUT_DIR = CONTRACTS_DIR / "out"

EXPLORER_API = os.getenv(
    "EXPLORER_API_URL",
    "https://explorer.testnet.chain.robinhood.com/api",
)
EXPLORER_TX = os.getenv(
    "EXPLORER_TX_URL",
    "https://explorer.testnet.chain.robinhood.com/address",
)

TOKEN_CONTRACTS: dict[str, str] = {
    "property": "PropertyToken",
    "nft": "PropertyNFT",
    "security": "SecurityToken",
    "cre": "SecurityToken",
}


def _read_artifact(contract_name: str) -> Optional[dict]:
    """Read the Foundry build artifact for a contract."""
    path = OUT_DIR / f"{contract_name}.sol" / f"{contract_name}.json"
    if not path.exists():
        logger.error(f"[verify] artifact not found: {path}")
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[verify] failed to read artifact {path}: {e}")
        return None


def _standard_json(contract_name: str) -> Optional[str]:
    """Build standard-json-input from Foundry artifact metadata + source files."""
    artifact = _read_artifact(contract_name)
    if artifact is None:
        return None

    meta = artifact.get("metadata", {})
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            logger.error(f"[verify] invalid metadata JSON in artifact for {contract_name}")
            return None

    source_paths = meta.get("sources", {})
    if not source_paths:
        logger.error(f"[verify] no sources in artifact metadata for {contract_name}")
        return None

    sources = {}
    for rel_path in source_paths:
        full_path = CONTRACTS_DIR / rel_path
        if full_path.exists() and full_path.is_file():
            try:
                sources[rel_path] = {"content": full_path.read_text(encoding="utf-8")}
            except Exception as e:
                logger.warning(f"[verify] failed to read {rel_path}: {e}")
        else:
            logger.warning(f"[verify] source not found on disk: {rel_path}")

    if not sources:
        logger.error(f"[verify] no source files could be read for {contract_name}")
        return None

    settings = dict(meta.get("settings", {}))
    settings.pop("compilationTarget", None)

    std_json = {
        "language": "Solidity",
        "sources": sources,
        "settings": settings,
    }

    return json.dumps(std_json)


def _compiler_version(contract_name: str) -> str:
    """Read compiler version from Foundry artifact metadata."""
    artifact = _read_artifact(contract_name)
    if artifact is None:
        return ""
    meta = artifact.get("metadata", {})
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            return ""
    version = meta.get("compiler", {}).get("version", "")
    return f"v{version}" if version and not version.startswith("v") else version


_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://explorer.testnet.chain.robinhood.com",
    "Referer": "https://explorer.testnet.chain.robinhood.com/",
}


def _submit_v1_etherscan(addr: str, name: str, source_json: str, compiler: str) -> tuple[str, str]:
    """Submit via Blockscout's Etherscan-compatible API."""
    body = {
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": addr,
        "sourceCode": source_json,
        "codeformat": "solidity-standard-json-input",
        "contractname": f"{name}.sol:{name}",
        "compilerversion": compiler,
        "constructorArguments": "",
        "licenseType": "3",
    }
    try:
        resp = requests.post(EXPLORER_API, data=body, headers=_HEADERS, timeout=30)
        if not resp.ok:
            return "", f"HTTP {resp.status_code}"
        result = resp.json()
        return result.get("result", ""), result.get("message", "")
    except Exception as e:
        return "", str(e)


def _submit_v2_blockscout(addr: str, name: str, source_json: str, compiler: str) -> tuple[str, str]:
    """Submit via Blockscout v2 API (/api/v2/verification/verifysourcecode)."""
    parsed = json.loads(source_json)
    sources = {}
    for path, info in parsed.get("sources", {}).items():
        sources[path] = {"content": info.get("content", "")}

    body = {
        "address_hash": addr,
        "compiler_version": compiler,
        "contract_name": name,
        "is_blueprint": False,
        "license": "MIT",
        "sources": sources,
        "evm_version": parsed.get("settings", {}).get("evmVersion", "paris"),
        "optimization_runs": parsed.get("settings", {}).get("optimizer", {}).get("runs", 200),
        "optimization_enabled": parsed.get("settings", {}).get("optimizer", {}).get("enabled", True),
        "via_ir": parsed.get("settings", {}).get("viaIR", False),
    }

    headers = {**_HEADERS, "Content-Type": "application/json"}
    api_v2 = EXPLORER_API.replace("/api", "/api/v2/verification/verifysourcecode", 1)
    try:
        resp = requests.post(api_v2, json=body, headers=headers, timeout=30)
        if not resp.ok:
            return "", f"HTTP {resp.status_code}"
        result = resp.json()
        return result.get("message", ""), ""
    except Exception as e:
        return "", str(e)


def _submit_blockscout(addr: str, name: str, source_json: str, compiler: str) -> tuple[str, str]:
    """Try Etherscan-compatible API first, fall back to v2 Blockscout API."""
    guid, msg = _submit_v1_etherscan(addr, name, source_json, compiler)
    if guid:
        return guid, msg
    if "403" in msg and not guid:
        logger.info("[verify] v1 API returned 403, trying v2 API...")
        return _submit_v2_blockscout(addr, name, source_json, compiler)
    return guid, msg


def verify_contract(contract_name: str, address: str, retries: int = 3) -> bool:
    """
    Verify a deployed contract on Blockscout.

    Retries up to `retries` times with a delay to allow the explorer to index.
    Returns True if verification was submitted successfully.
    """
    logger.info(f"[verify] starting {contract_name} @ {address}")

    for attempt in range(1, retries + 1):
        if attempt > 1:
            time.sleep(10)

        source_json = _standard_json(contract_name)
        if source_json is None:
            logger.error(f"[verify] failed to build standard JSON for {contract_name}")
            return False

        try:
            compiler = _compiler_version(contract_name)
        except Exception as e:
            logger.error(f"[verify] failed to read compiler version: {e}")
            return False

        if not compiler:
            logger.error(f"[verify] empty compiler version for {contract_name}")
            return False

        try:
            guid, msg = _submit_blockscout(address, contract_name, source_json, compiler)
        except Exception as e:
            logger.warning(f"[verify] submit attempt {attempt} failed: {e}")
            continue

        if guid and msg.upper() != "NOTOK":
            logger.info(f"[verify] submitted {contract_name} @ {EXPLORER_TX}/{address}#code")
            return True
        else:
            logger.warning(f"[verify] attempt {attempt}: {msg} — {guid}")

    logger.error(f"[verify] all {retries} attempts failed for {contract_name} @ {address}")
    return False


def verify_token(token_type: str, address: str) -> bool:
    """Verify a token contract by type ('property', 'nft', 'security', 'cre')."""
    contract_name = TOKEN_CONTRACTS.get(token_type.lower())
    if not contract_name:
        logger.warning(f"[verify] unknown token type: {token_type}")
        return False
    return verify_contract(contract_name, address)
