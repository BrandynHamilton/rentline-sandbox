"""
Token deployment service.

Routes ALL deployments through on-chain factories:
  - PropertyTokenFactory.createFor()  — admin/operator path (backend key pays gas)
  - SecurityTokenFactory.createFor()  — admin/operator path

The factories are the canonical on-chain registry. Direct contract deployment
is kept as a fallback only if factory addresses are not configured.

Frontend user-path (wallet calls factory.create() directly) is handled purely
in the frontend via wagmi — this service only covers the admin/operator path.
"""
import json
from pathlib import Path
from typing import Optional

import httpx
from web3 import Web3

from app.core.config import settings
from app.core.logging import logger


# ── Artifact loader ───────────────────────────────────────────────────────────

ARTIFACTS_DIR = Path(__file__).parent.parent.parent / "contracts" / "out"


def _load_artifact(contract_name: str) -> dict:
    path = ARTIFACTS_DIR / f"{contract_name}.sol" / f"{contract_name}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"Artifact not found: {path}\n"
            "Run: cd contracts && forge build"
        )
    with open(path) as f:
        return json.load(f)


# ── Web3 helpers ──────────────────────────────────────────────────────────────

def _get_w3() -> Web3:
    w3 = Web3(Web3.HTTPProvider(settings.avalanche_rpc_url))
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to RPC: {settings.avalanche_rpc_url}")
    return w3


def _get_account(w3: Web3):
    if not settings.avalanche_private_key:
        raise ValueError("AVALANCHE_PRIVATE_KEY not set")
    return w3.eth.account.from_key(settings.avalanche_private_key)


def _send_tx(w3: Web3, tx: dict, private_key: str) -> dict:
    signed  = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    return receipt


def _gas(w3: Web3, tx: dict, buffer: float = 1.3) -> dict:
    """Add EIP-1559 gas params to a transaction dict in-place."""
    try:
        est = w3.eth.estimate_gas(tx)
        tx["gas"] = int(est * buffer)
    except Exception as e:
        logger.warning(f"[gas] estimate failed: {e} — using 3_000_000")
        tx["gas"] = 3_000_000

    latest    = w3.eth.get_block("latest")
    base_fee  = latest.get("baseFeePerGas", w3.to_wei(25, "gwei"))
    priority  = w3.to_wei(2, "gwei")
    tx["maxFeePerGas"]         = int(base_fee * 1.2) + priority
    tx["maxPriorityFeePerGas"] = priority
    tx.pop("gasPrice", None)
    return tx


def _build_call_tx(w3: Web3, fn, from_addr: str) -> dict:
    tx = fn.build_transaction({
        "from": from_addr,
        "nonce": w3.eth.get_transaction_count(from_addr, "pending"),
        "chainId": settings.avalanche_chain_id,
    })
    return _gas(w3, tx)


# ── Factory helpers ───────────────────────────────────────────────────────────

def _get_property_factory(w3: Web3):
    if not settings.property_token_factory_address:
        raise ValueError(
            "PROPERTY_TOKEN_FACTORY_ADDRESS not configured. "
            "Deploy the factory first: forge script script/Deploy.s.sol"
        )
    artifact = _load_artifact("PropertyTokenFactory")
    return w3.eth.contract(
        address=Web3.to_checksum_address(settings.property_token_factory_address),
        abi=artifact["abi"],
    )


def _get_security_factory(w3: Web3):
    if not settings.security_token_factory_address:
        raise ValueError(
            "SECURITY_TOKEN_FACTORY_ADDRESS not configured. "
            "Deploy the factory first: forge script script/Deploy.s.sol"
        )
    artifact = _load_artifact("SecurityTokenFactory")
    return w3.eth.contract(
        address=Web3.to_checksum_address(settings.security_token_factory_address),
        abi=artifact["abi"],
    )


def _extract_address_from_event(receipt: dict, w3: Web3, factory_contract, event_name: str) -> Optional[str]:
    """Parse a factory event from receipt logs to get the deployed token address."""
    try:
        event = getattr(factory_contract.events, event_name)
        for log in receipt["logs"]:
            try:
                parsed = event().process_log(log)
                return parsed["args"]["tokenAddress"]
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"[token_service] Could not parse {event_name} event: {e}")
    return receipt.get("contractAddress")  # fallback


# ── PropertyToken — admin path via factory ────────────────────────────────────

def deploy_property_token(
    property_name: str,
    property_address: str,
    owner_address: str,
    usdc_address: str,
    metadata_uri: str,
    initial_supply: int = 1_000_000,
) -> dict:
    """
    Deploy a PropertyToken via PropertyTokenFactory.createFor().
    Backend operator key pays gas; owner_address receives tokens + ownership.

    Returns { address, tx_hash, status, via_factory }
    """
    logger.info(f"[token_service] Deploying PropertyToken via factory for owner {owner_address[:10]}...")
    w3       = _get_w3()
    account  = _get_account(w3)
    factory  = _get_property_factory(w3)

    supply_raw = initial_supply * (10 ** 18)

    distributor = (
        Web3.to_checksum_address(settings.rentline_admin_wallet)
        if settings.rentline_admin_wallet
        else "0x" + "0" * 40
    )
    fn = factory.functions.createFor(
        property_name,
        property_address,
        Web3.to_checksum_address(owner_address),
        Web3.to_checksum_address(usdc_address),
        metadata_uri,
        supply_raw,
        distributor,
    )

    tx      = _build_call_tx(w3, fn, account.address)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)

    if receipt["status"] != 1:
        raise RuntimeError(
            f"PropertyTokenFactory.createFor() reverted. tx={receipt['transactionHash'].hex()}"
        )

    token_addr = _extract_address_from_event(receipt, w3, factory, "PropertyTokenCreated")
    logger.info(f"[token_service] PropertyToken deployed at {token_addr}")

    return {
        "address":     token_addr,
        "tx_hash":     "0x" + receipt["transactionHash"].hex(),
        "status":      receipt["status"],
        "via_factory": settings.property_token_factory_address,
    }


# ── SecurityToken — admin path via factory ────────────────────────────────────

def deploy_security_token(
    name: str,
    symbol: str,
    compliance_manager: str,
    governance_multisig: str,
    metadata_uri: str,
) -> dict:
    """
    Deploy a SecurityToken via SecurityTokenFactory.createFor().
    """
    logger.info(f"[token_service] Deploying SecurityToken '{symbol}' via factory...")
    w3       = _get_w3()
    account  = _get_account(w3)
    factory  = _get_security_factory(w3)

    fn = factory.functions.createFor(
        name,
        symbol,
        Web3.to_checksum_address(compliance_manager),
        Web3.to_checksum_address(governance_multisig),
        metadata_uri,
    )

    tx      = _build_call_tx(w3, fn, account.address)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)

    if receipt["status"] != 1:
        raise RuntimeError(
            f"SecurityTokenFactory.createFor() reverted. tx={receipt['transactionHash'].hex()}"
        )

    token_addr = _extract_address_from_event(receipt, w3, factory, "SecurityTokenCreated")
    logger.info(f"[token_service] SecurityToken deployed at {token_addr}")

    return {
        "address":     token_addr,
        "tx_hash":     "0x" + receipt["transactionHash"].hex(),
        "status":      receipt["status"],
        "via_factory": settings.security_token_factory_address,
    }


def _get_nft_factory(w3: Web3):
    if not settings.nft_token_factory_address:
        raise ValueError(
            "NFT_TOKEN_FACTORY_ADDRESS not configured. "
            "Deploy the factory first: forge script script/DeployFactories.s.sol"
        )
    artifact = _load_artifact("PropertyNFTFactory")
    return w3.eth.contract(
        address=Web3.to_checksum_address(settings.nft_token_factory_address),
        abi=artifact["abi"],
    )


# ── PropertyNFT — admin path via factory ──────────────────────────────────────

def deploy_nft_token(
    property_name: str,
    property_address: str,
    owner_address: str,
    usdc_address: str,
    metadata_uri: str,
) -> dict:
    """
    Deploy a PropertyNFT via PropertyNFTFactory.createFor().
    Backend operator key pays gas; owner_address receives the deed NFT + ownership.

    Returns { address, tx_hash, status, via_factory }
    """
    logger.info(f"[token_service] Deploying PropertyNFT via factory for owner {owner_address[:10]}...")
    w3      = _get_w3()
    account = _get_account(w3)
    factory = _get_nft_factory(w3)

    fn = factory.functions.createFor(
        property_name,
        property_address,
        Web3.to_checksum_address(owner_address),
        Web3.to_checksum_address(usdc_address),
        metadata_uri,
    )

    tx      = _build_call_tx(w3, fn, account.address)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)

    if receipt["status"] != 1:
        raise RuntimeError(
            f"PropertyNFTFactory.createFor() reverted. tx={receipt['transactionHash'].hex()}"
        )

    token_addr = _extract_address_from_event(receipt, w3, factory, "PropertyNFTCreated")
    logger.info(f"[token_service] PropertyNFT deployed at {token_addr}")

    return {
        "address":     token_addr,
        "tx_hash":     "0x" + receipt["transactionHash"].hex(),
        "status":      receipt["status"],
        "via_factory": settings.nft_token_factory_address,
    }


# ── DistributionManager + InvestorRegistry (unchanged, no factory for these) ──

def deploy_distribution_manager(token_address: str, usdc_address: str) -> dict:
    logger.info(f"[token_service] Deploying DistributionManager for {token_address[:10]}...")
    w3       = _get_w3()
    account  = _get_account(w3)
    artifact = _load_artifact("DistributionManager")
    bytecode = artifact["bytecode"]["object"]
    abi      = artifact["abi"]

    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    nonce    = w3.eth.get_transaction_count(account.address, "pending")
    tx = contract.constructor(token_address, usdc_address).build_transaction({
        "from": account.address, "nonce": nonce, "chainId": settings.avalanche_chain_id,
    })
    tx = _gas(w3, tx)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)

    if receipt["status"] != 1:
        raise RuntimeError("DistributionManager deployment reverted")

    addr = receipt["contractAddress"]
    logger.info(f"[token_service] DistributionManager deployed at {addr}")
    return {"address": addr, "tx_hash": "0x" + receipt["transactionHash"].hex(), "status": 1}


def deploy_investor_registry(accreditation_verifier: str) -> dict:
    logger.info("[token_service] Deploying InvestorRegistry...")
    w3       = _get_w3()
    account  = _get_account(w3)
    artifact = _load_artifact("InvestorRegistry")
    bytecode = artifact["bytecode"]["object"]
    abi      = artifact["abi"]

    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    nonce    = w3.eth.get_transaction_count(account.address, "pending")
    tx = contract.constructor(accreditation_verifier).build_transaction({
        "from": account.address, "nonce": nonce, "chainId": settings.avalanche_chain_id,
    })
    tx = _gas(w3, tx)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)

    if receipt["status"] != 1:
        raise RuntimeError("InvestorRegistry deployment reverted")

    addr = receipt["contractAddress"]
    logger.info(f"[token_service] InvestorRegistry deployed at {addr}")
    return {"address": addr, "tx_hash": "0x" + receipt["transactionHash"].hex(), "status": 1}


def deploy_property_llc(
    property_name: str,
    property_address: str,
    property_id: str,
    security_token_address: str,
) -> dict:
    logger.info(f"[token_service] Deploying PropertyLLC for {security_token_address[:10]}...")
    w3       = _get_w3()
    account  = _get_account(w3)
    artifact = _load_artifact("PropertyLLC")
    contract = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"]["object"])
    nonce    = w3.eth.get_transaction_count(account.address, "pending")
    tx = contract.constructor(
        property_name,
        property_address,
        property_id,
        Web3.to_checksum_address(security_token_address),
    ).build_transaction({
        "from": account.address, "nonce": nonce, "chainId": settings.avalanche_chain_id,
    })
    tx = _gas(w3, tx)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)
    if receipt["status"] != 1:
        raise RuntimeError("PropertyLLC deployment reverted")
    addr = receipt["contractAddress"]
    logger.info(f"[token_service] PropertyLLC deployed at {addr}")
    return {"address": addr, "tx_hash": "0x" + receipt["transactionHash"].hex(), "status": 1}


def deploy_governance(
    admin_multisig: str,
    emergency_admin: str,
    timelock_delay: int = 86400,
) -> dict:
    logger.info("[token_service] Deploying Governance...")
    w3       = _get_w3()
    account  = _get_account(w3)
    artifact = _load_artifact("Governance")
    contract = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"]["object"])
    nonce    = w3.eth.get_transaction_count(account.address, "pending")
    tx = contract.constructor(
        Web3.to_checksum_address(admin_multisig),
        Web3.to_checksum_address(emergency_admin),
        timelock_delay,
    ).build_transaction({
        "from": account.address, "nonce": nonce, "chainId": settings.avalanche_chain_id,
    })
    tx = _gas(w3, tx)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)
    if receipt["status"] != 1:
        raise RuntimeError("Governance deployment reverted")
    addr = receipt["contractAddress"]
    logger.info(f"[token_service] Governance deployed at {addr}")
    return {"address": addr, "tx_hash": "0x" + receipt["transactionHash"].hex(), "status": 1}


# ── Chain sync — discover wallet-deployed tokens by metadataUri ───────────────

def sync_tokens_from_chain(geo_id: str, prop) -> dict:
    """
    Query every configured factory for Created events whose metadataUri
    contains geo_id, and return a dict of any newly-found addresses:
      { "property_token_address": "0x...", "nft_token_address": "0x...", ... }

    Only fills fields that are currently None on prop.
    Safe to call on every GET — returns {} immediately if all addresses known
    or no factory is configured.
    """
    needs = {
        "property": not prop.property_token_address and settings.property_token_factory_address,
        "nft":      not prop.nft_token_address      and settings.nft_token_factory_address,
        "security": not prop.security_token_address and settings.security_token_factory_address,
    }
    if not any(needs.values()):
        return {}

    try:
        w3 = _get_w3()
    except Exception as e:
        logger.warning(f"[sync] cannot connect to chain: {e}")
        return {}

    found = {}

    # ── PropertyToken factory ──────────────────────────────────────────────────
    if needs["property"]:
        try:
            factory  = _get_property_factory(w3)
            event    = factory.events.PropertyTokenCreated
            logs     = event.get_logs(from_block=0)
            for log in logs:
                if geo_id in log["args"].get("metadataUri", ""):
                    found["property_token_address"] = log["args"]["tokenAddress"].lower()
                    break
        except Exception as e:
            logger.warning(f"[sync] PropertyToken query failed: {e}")

    # ── PropertyNFT factory ────────────────────────────────────────────────────
    if needs["nft"]:
        try:
            artifact = _load_artifact("PropertyNFTFactory")
            factory  = w3.eth.contract(
                address=Web3.to_checksum_address(settings.nft_token_factory_address),
                abi=artifact["abi"],
            )
            event = factory.events.PropertyNFTCreated
            logs  = event.get_logs(from_block=0)
            for log in logs:
                if geo_id in log["args"].get("metadataUri", ""):
                    found["nft_token_address"] = log["args"]["tokenAddress"].lower()
                    break
        except Exception as e:
            logger.warning(f"[sync] PropertyNFT query failed: {e}")

    # ── SecurityToken / CRE factory ───────────────────────────────────────────
    if needs["security"]:
        try:
            factory  = _get_security_factory(w3)
            event    = factory.events.SecurityTokenCreated
            logs     = event.get_logs(from_block=0)
            for log in logs:
                if geo_id in log["args"].get("metadataUri", ""):
                    found["security_token_address"] = log["args"]["tokenAddress"].lower()
                    break
        except Exception as e:
            logger.warning(f"[sync] SecurityToken query failed: {e}")

    if found:
        logger.info(f"[sync] discovered for {geo_id}: {found}")

    return found


# ── Factory registry reads (expose to API) ────────────────────────────────────

def get_factory_tokens(token_type: str, offset: int = 0, limit: int = 100) -> list[str]:
    """Read all deployed token addresses from a factory."""
    w3 = _get_w3()
    factory = _get_property_factory(w3) if token_type == "property" else _get_security_factory(w3)
    return factory.functions.getTokens(offset, limit).call()


def get_factory_info(token_type: str) -> dict:
    """Return factory address + total deployed count."""
    w3      = _get_w3()
    address = (
        settings.property_token_factory_address if token_type == "property"
        else settings.security_token_factory_address
    )
    if not address:
        return {"address": None, "total_deployed": 0, "configured": False}

    factory = _get_property_factory(w3) if token_type == "property" else _get_security_factory(w3)
    total   = factory.functions.totalDeployed().call()
    return {"address": address, "total_deployed": total, "configured": True}


# ── DistributionManager on-chain config push ─────────────────────────────────

def push_distribution_params(
    dm_address: str,
    property_address: str,
    preferred_return_bps: int,
    sponsor_promote_bps: int,
    waterfall_threshold: int,
) -> dict:
    """
    Call setDistributionParams() on a deployed DistributionManager contract.
    Uses the backend admin key (must be the contract owner).
    """
    w3       = _get_w3()
    account  = _get_account(w3)
    artifact = _load_artifact("DistributionManager")
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(dm_address),
        abi=artifact["abi"],
    )

    fn = contract.functions.setDistributionParams(
        Web3.to_checksum_address(property_address),
        (preferred_return_bps, sponsor_promote_bps, waterfall_threshold),
    )

    tx = _build_call_tx(w3, fn, account.address)
    receipt = _send_tx(w3, tx, settings.avalanche_private_key)

    if receipt["status"] != 1:
        raise RuntimeError("setDistributionParams reverted")

    logger.info(
        f"[token_service] Pushed distribution params for {property_address[:10]}... "
        f"on DM {dm_address[:10]}... "
        f"(pref={preferred_return_bps}bps, promo={sponsor_promote_bps}bps, thr={waterfall_threshold})"
    )
    return {
        "tx_hash": "0x" + receipt["transactionHash"].hex(),
        "status": receipt["status"],
    }


# ── Rentline integration ──────────────────────────────────────────────────────

async def create_rentline_property(
    name: str,
    wallet_address: str = "",
    owner_id: str | None = None,
    street_address: str = "",
    city: str = "",
    state: str = "",
    zip_code: str = "",
    reserve_percent: float = 0.0,
    conversion_enabled: bool = True,
    privacy_mode: str = "public",
    auth_token: str | None = None,
) -> dict:
    """Create a property in Rentline and return the property record.

    Auth priority:
      1. auth_token — forwarded Clerk Bearer token (from RWA Studio frontend session)
      2. rentline_admin_api_key — fallback for admin/service calls
    """
    if not settings.rentline_url:
        raise ValueError("RENTLINE_URL not configured")

    url = f"{settings.rentline_url.rstrip('/')}/api/properties"
    headers = {
        "Content-Type": "application/json",
    }

    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    else:
        if not settings.rentline_admin_api_key:
            raise ValueError("RENTLINE_ADMIN_API_KEY not configured — or pass auth_token")
        headers["X-API-Key"] = settings.rentline_admin_api_key

    body = {
        "name": name,
        "wallet_address": wallet_address,
        "reserve_percent": reserve_percent,
        "conversion_enabled": conversion_enabled,
        "privacy_mode": privacy_mode,
    }
    if owner_id:
        body["owner_id"] = owner_id
    if street_address:
        body["street_address"] = street_address
    if city:
        body["city"] = city
    if state:
        body["state"] = state
    if zip_code:
        body["zip_code"] = zip_code

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[token_service] Created Rentline property {result.get('id', '?')[:12]}... for '{name}'")
        return result


async def push_to_rentline(rentline_property_id: str, token_address: str) -> dict:
    if not settings.rentline_url:
        raise ValueError("RENTLINE_URL not configured")
    if not settings.rentline_admin_api_key:
        raise ValueError("RENTLINE_ADMIN_API_KEY not configured")

    url = f"{settings.rentline_url.rstrip('/')}/api/properties/{rentline_property_id}/token"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(
            url,
            json={"token_address": token_address},
            headers={"Content-Type": "application/json", "X-API-Key": settings.rentline_admin_api_key},
        )
        resp.raise_for_status()
        logger.info(f"[token_service] Pushed {token_address[:10]}... to Rentline property {rentline_property_id}")
        return resp.json()
