# RWA Integration Plan — On-Chain Cash Flows

> Findings from codebase audit of `E:/Projects/rentline/backend` and `E:/Projects/rwa-issuer-sim`.
> Date: 2026-06-02

---

## Repo map

| Short name | Full path | Purpose |
|---|---|---|
| **`rentline/backend`** | `E:/Projects/rentline/backend` | FastAPI fiat→USDC settlement pipeline (port 6531) |
| **`rentline-sandbox`** | `E:/Projects/rentline-sandbox/sandbox-api` | FastAPI turn-based game engine (port 6532) |
| **`rwa-issuer-sim`** | `E:/Projects/rwa-issuer-sim/backend` | FastAPI token factory + AVM oracle (port 8000) |
| **`contracts`** | `E:/Projects/rwa-issuer-sim/contracts` | Foundry Solidity — deployed on Avalanche Fuji |

---

## Current State

### What exists

| Component | Repo | File | Status |
|---|---|---|---|
| `PropertyToken.sol` — ERC-20 fractional token with USDC vault | `contracts` | `src/PropertyToken.sol` | Deployed on Avalanche Fuji |
| `PropertyNFT.sol` — ERC-721 single deed + vault | `contracts` | `src/PropertyNFT.sol` | Deployed on Avalanche Fuji |
| `CREFactory.sol` — deploys `SecurityToken` + `DistributionManager` in one tx | `contracts` | `src/CREFactory.sol` | Deployed on Avalanche Fuji |
| `DistributionAutomation.sol` — Chainlink Automation keeper | `contracts` | `src/DistributionAutomation.sol` | Compiled, not registered |
| All 8 factory contracts | `contracts` | `broadcast/DeployFactories.s.sol/43113/` | Live on Fuji |
| Fiat → USDC settlement pipeline | `rentline/backend` | `app/services/treasury_service.py` | Live on Avalanche Fuji |
| `send_usdc()` / `mint_usdc()` | `rentline/backend` | `app/services/avalanche_service.py` | Live on Fuji |
| `property_token_address` column | `rentline/backend` | `app/models/property.py` | Done; run `scripts/migrate_property_token_address.py` |
| Token registration endpoint | `rentline/backend` | `app/api/routes/properties.py` — `PUT /api/properties/{id}/token` | **Done** |
| Token registration push | `rwa-issuer-sim` | `app/services/token_service.py` — `push_to_rentline()` | Done; fixed to PUT + X-API-Key |
| Metadata oracle feed | `rwa-issuer-sim` | `app/api/routes/metadata.py` — `GET /metadata/{geo_id}` | Live; 3 properties with JSON |
| Token registration endpoint | `rentline-sandbox` | `app/api/routes/properties.py` — `PUT /api/sandbox/properties/{id}/token` | Done |
| `token_address` column on sandbox pool properties | `rentline-sandbox` | `app/models/sandbox.py` — `SandboxProperty.token_address` | Done |
| Sandbox AVM re-sync hook | `rentline-sandbox` | `app/services/sandbox_engine.py` | Done; set `RWA_ISSUER_URL` in `.env` to activate |
| `sandbox_transactions.rentline_payment_id` | `rentline-sandbox` | `app/models/sandbox.py` — `SandboxTransaction` | Done; stamped on every `RENT_RECEIVED` tx |
| Ledger bridge | `rentline-sandbox` | `app/services/ledger_bridge.py` | Done; returns `payment_event_id` |
| `token_address` on `SandboxGameProperty` | `rentline-sandbox` | `app/models/sandbox.py` — `SandboxGameProperty.token_address` | Done |

### The core gap

`rentline/backend` converts fiat → USDC via Modern Treasury and calls `send_usdc(property.wallet_address, amount)`. The `PropertyToken` contract vault sits at a separate address. USDC never reaches the vault, so `withdrawRewards()` always returns 0 and `distributeToAllHolders()` has nothing to push.

**One field change closes this gap:** if `property.property_token_address` is set, route USDC there instead of `property.wallet_address`, then call `PropertyToken.sync()`.

### Factory contract addresses (Avalanche Fuji, chain 43113)

| Contract | Address |
|---|---|
| `PropertyTokenFactory` | `0x325773504eda1bfc2069d9c4bcc07a161da98f68` |
| `PropertyNFTFactory` | `0x8f46a624a84891b08b4eab12f791645e1cb01e1a` |
| `CREFactory` | `0xf2b218fdedcc122edf67ebde335a8073ff576204` |
| `DistributionManagerFactory` | `0x6691ec0343183fe3396110566432c6f689f1534c` |
| `SecurityTokenFactory` | `0x15b141a473f2cfef28b27714924f61f304c89cb4` |
| `PropertyLLCFactory` | `0x4945fcd275d6e456eddd5348fc3f7c2af9f49641` |
| `InvestorRegistryFactory` | `0x4f5580326197a203d0cef0804e8dcebdc2dfa14c` |
| `GovernanceFactory` | `0xedbe579d575246e41c3725022dea51e69409c8d1` |

Deployer: `0xd20de147dfe3e272360e759a3e75a4d183320750`
Addresses are auto-discovered from `broadcast/*/run-latest.json` via `rwa-issuer-sim/backend/app/core/broadcast.py` — no manual env var required.

---

## Phase 1 — Route Rent to the Token Vault

**Effort: 1–2 days**

All steps in this phase are in **`rentline/backend`** unless noted.

### Step 1 — Add `property_token_address` column ✅ done

> **Repo: `rentline/backend`**

`app/models/property.py` — column already added:

```python
property_token_address = mapped_column(String, nullable=True)  # ERC-20 PropertyToken contract
```

Still needed — run the one-off migration script (idempotent, safe to re-run):
```bash
# from rentline/backend/
uv run python scripts/migrate_property_token_address.py

# preview without executing:
uv run python scripts/migrate_property_token_address.py --dry-run
```
The script derives the Postgres connection from `SUPABASE_URL` + `SUPABASE_PRIVATE_KEY` automatically.
Set `SUPABASE_DB_URL` in `.env` to override the connection string explicitly.

### Step 2a — Add token registration endpoint (`rentline/backend`) ✅ done

> **Repo: `rentline/backend`**

`app/api/routes/properties.py` — add this route after the existing `DELETE /{property_id}` handler. `rwa-issuer-sim/backend/app/services/token_service.py:push_to_rentline()` already calls this endpoint.

Two things to fix in `rwa-issuer-sim` at the same time:
- It currently sends `POST`, but the route below is `PUT` — match one to the other
- It sends `x-admin-key` header, but `rentline/backend` reads `X-API-Key` — update `push_to_rentline()` to send `X-API-Key: {settings.rentline_admin_api_key}` instead

Confirm `settings.rentline_url` in `rwa-issuer-sim` points to port `6531` (rentline/backend), not `6532` (rentline-sandbox).

```python
from pydantic import BaseModel

class SetTokenAddressRequest(BaseModel):
    token_address: str  # EVM address of the deployed PropertyToken contract


@router.put("/{property_id}/token")
async def set_property_token_address(
    property_id: str,
    body: SetTokenAddressRequest,
    request: Request,
):
    """
    Register a PropertyToken contract address against a property.
    Called by rwa-issuer-sim after a token is deployed on-chain.
    Requires ADMIN_API_KEY.
    """
    if not _is_admin(request):
        raise HTTPException(status_code=403, detail="Admin access required")

    sb = get_supabase()
    existing = sb.table("properties").select("id").eq("id", property_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Property not found")

    result = sb.table("properties").update({
        "property_token_address": body.token_address,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", property_id).execute()

    logger.info(f"Property {property_id} token address set to {body.token_address}")
    return _sanitize(result.data[0])
```

### Step 2b — Add token registration endpoint (`rentline-sandbox`) ✅ done

> **Repo: `rentline-sandbox`**

`app/api/routes/properties.py` — implemented:

```
PUT /api/sandbox/properties/{id}/token
Body: { "token_address": "0x..." }
Auth: ADMIN_API_KEY (X-API-Key header)
```

Sets `SandboxProperty.token_address`. Accepts either `SandboxProperty.id` or `geo_id` as the path parameter.

### Step 3 — Divert USDC to vault in `process_conversion()` ✅ done

> **Repo: `rentline/backend`**

`app/services/treasury_service.py` — the USDC send is at line 530–541. Replace the `send_usdc` call block with:

```python
# Route to PropertyToken vault if registered, otherwise fall back to wallet_address
destination = getattr(property_, "property_token_address", None) or property_.wallet_address

for attempt in range(3):
    try:
        tx_hash = send_usdc(
            to_address=destination,
            amount=fees.distributable_amount,
        )
        logger.info(
            f"USDC sent: {fees.distributable_amount} USDC -> {destination} tx={tx_hash}"
        )
        # If routed to a PropertyToken vault, call sync() so the vault's internal
        # accounting reflects the deposit and distributeToAllHolders() can fire.
        if getattr(property_, "property_token_address", None):
            try:
                from app.integrations.avalanche.contracts import call_property_token_sync
                call_property_token_sync(property_.property_token_address)
                logger.info(f"PropertyToken.sync() called for vault {property_.property_token_address}")
            except Exception as sync_err:
                # Non-fatal — USDC is already in the vault; sync failure doesn't undo the transfer
                logger.warning(f"PropertyToken.sync() failed for {property_.property_token_address}: {sync_err}")
        break
    except Exception as e:
        logger.warning(f"USDC send attempt {attempt + 1}/3 failed: {e}")
        if attempt < 2:
            time.sleep(2)
```

Also update the `to_address` written to the payment record and `FailedConversion` queue (lines 553–564) to use `destination` instead of `property_.wallet_address`.

### Step 4 — Add `PropertyToken` ABI ✅ done

> **Repo: `rentline/backend`**

`app/integrations/avalanche/contracts.py` — append after the existing `USDC_ABI` / `USDC_CONTRACT_ADDRESS` block. Copy the ABI fragments from `rwa-issuer-sim/contracts/out/PropertyToken.sol/PropertyToken.json` — do not add a build dependency on the contracts repo.

```python
# Minimal ABI for PropertyToken vault interactions.
# Full ABI: rwa-issuer-sim/contracts/out/PropertyToken.sol/PropertyToken.json
PROPERTY_TOKEN_ABI = [
    {
        "inputs": [],
        "name": "sync",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "syncAndDistribute",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "distributeToAllHolders",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


def call_property_token_sync(token_address: str) -> str:
    """
    Call PropertyToken.sync() to reconcile the vault's internal balance counter
    after a USDC deposit. Returns the tx hash.
    """
    from app.integrations.avalanche.client import get_web3
    from app.integrations.avalanche.tx import send_tx
    w3 = get_web3()
    account = w3.eth.account.from_key(settings.AVALANCHE_PRIVATE_KEY)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=PROPERTY_TOKEN_ABI,
    )
    tx = contract.functions.sync().build_transaction({
        "from": account.address,
        "gas": 100_000,
        "chainId": settings.AVALANCHE_CHAIN_ID,
    })
    return send_tx(tx, label=f"PropertyToken.sync({token_address[:10]}...)")
```

---

## Phase 2 — Wire Sandbox AVM Re-sync

**Effort: half day**

> **Repo: `rentline-sandbox`**

The hook is already implemented in `app/services/sandbox_engine.py:_maybe_resync_avm()` (line 1198). It is called during the market move phase for every `SandboxGameProperty`. It just needs two fixes.

**Fix 1 — URL mismatch (bug).** The engine currently calls:
```
GET {RWA_ISSUER_URL}/api/v1/properties/{geo_id}
```
But the actual `rwa-issuer-sim` endpoint (served at port 8000) is:
```
GET /metadata/{geo_id}
```
`app/services/sandbox_engine.py:1208` — update the URL:

```python
# Before (wrong path):
resp = httpx.get(f"{settings.RWA_ISSUER_URL}/api/v1/properties/{prop.geo_id}", timeout=5.0)

# After (correct path):
resp = httpx.get(f"{settings.RWA_ISSUER_URL}/metadata/{prop.geo_id}", timeout=5.0)
```

Also update the field extraction on line 1211 to match the actual response shape:
```python
# rwa-issuer-sim /metadata/{geo_id} response:
# { "geoId": "geo-132473", "value": 1649000, "property": { ... } }

data = resp.json()
avm = data.get("value")  # top-level "value", not "avm_value_usd" or "estimated_value"
if avm and float(avm) > 0:
    gp.current_price_usd = round((gp.current_price_usd + float(avm)) / 2, 2)
prop.last_avm_sync = datetime.utcnow()
prop.updated_at = datetime.utcnow()
```

**Fix 2 — Set env var.** In `rentline-sandbox/.env`:
```
RWA_ISSUER_URL=http://localhost:8000
```

**Fix 3 — Seed `geo_id` on game creation.** The 3 properties with metadata files are `geo-132473`, `geo-250939`, `geo-670669`. When creating a game that includes these pool properties, ensure the corresponding `SandboxProperty.geo_id` values are set — they should already be set if the pool was synced from `rwa-issuer-sim` via `POST /api/sandbox/properties/sync`.

---

## Phase 3 — Sandbox Token Bridge

**Effort: 1 day**

> **Repo: `rentline-sandbox`** (all three steps), with a write target to **`rentline/backend`**

Close the `sandbox_transactions.rentline_payment_id` loop and surface on-chain token addresses in the sandbox.

### Step 1 — Stamp `rentline_payment_id` on `SandboxTransaction` ✅ done

> **Repo: `rentline-sandbox`**

`app/services/sandbox_engine.py:980–992` — the `RENT_RECEIVED` transaction is already written and `_record_rentline_ledger()` is already called immediately after. The ledger bridge fires a POST to `rentline/backend` and receives back a `payment_event_id`. Capture it and stamp the transaction.

The bridge currently returns nothing useful. The plan:

1. Update `ledger_bridge.py:record_sandbox_ledger_entry()` to return the `rentline_payment_id` from the response (Step 2 below).
2. In `sandbox_engine.py`, capture the return value and update the transaction:

```python
# sandbox_engine.py — in _phase_rent_collect(), after db.add(SandboxTransaction(...))

rent_tx = SandboxTransaction(
    id=str(uuid.uuid4()),
    game_id=game.id,
    turn=turn,
    player_id=holding.player_id,
    type="RENT_RECEIVED",
    property_id=prop.id,
    amount_usdc=net_rent,
    tokens=holding.tokens_held,
    price_per_token_usd=gp.current_price_usd,
)
db.add(rent_tx)

# Bridge call — returns rentline payment_event id if bridge is configured, else None
rentline_payment_id = _record_rentline_ledger(
    db, game, holding.player_id, prop.geo_id, net_rent,
    f"Sandbox rent: {prop.name} turn={turn}"
)
if rentline_payment_id:
    rent_tx.rentline_payment_id = rentline_payment_id
```

Also update `_record_rentline_ledger()` at line 1690 to return the value from `record_sandbox_ledger_entry()`.

### Step 2 — Wire `ledger_bridge.py` to return `rentline_payment_id` ✅ done

> **Repo: `rentline-sandbox`**

`app/services/ledger_bridge.py` — update `record_sandbox_ledger_entry()` to return the payment ID from the Rentline response:

```python
def record_sandbox_ledger_entry(
    property_ref: str,
    amount: float,
    reference_id: str,
    owner_clerk_id: str,
) -> str | None:
    """
    Non-fatal bridge call. Returns the rentline_payment_id if the bridge is configured
    and the request succeeds, otherwise None. Never raises.
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
            timeout=3.0,
        )
        data = resp.json()
        return data.get("payment_event_id")  # rentline/backend must return this field
    except Exception as e:
        logger.debug(f"Rentline ledger bridge failed (non-fatal): {e}")
        return None
```

Note: `rentline/backend` needs a `/api/sandbox/ledger-bridge` endpoint that creates a `PaymentEvent` and returns `{ "payment_event_id": "..." }`. This endpoint does not exist yet.

### Step 3 — Add `token_address` to `SandboxGameProperty` ✅ done

> **Repo: `rentline-sandbox`**

`app/models/sandbox.py` — add the field to `SandboxGameProperty`:

```python
# In SandboxGameProperty, after the existing `grade` field:
token_address: Mapped[str | None] = mapped_column(String, nullable=True)
# EVM address of PropertyToken contract — populated from rwa-issuer-sim at game creation.
# Surfaced in the game API so clients can link to the on-chain token explorer.
```

`app/migrations.py` — add the migration entry to the `MIGRATIONS` list:

```python
("sandbox_game_properties", "token_address", "TEXT"),
```

`app/services/sandbox_service.py` — in `create_game()`, when seeding `SandboxGameProperty` rows, copy `token_address` from `SandboxProperty`:

```python
# When building each SandboxGameProperty at game creation:
gp = SandboxGameProperty(
    id=str(uuid.uuid4()),
    game_id=game.id,
    property_id=pool_prop.id,
    current_price_usd=pool_prop.initial_price_usd,
    current_rent_usd=pool_prop.monthly_rent_usd,
    grade=pool_prop.initial_grade,
    token_address=pool_prop.token_address,  # carry through from pool
)
```

---

## Phase 4 — Yield Distribution Trigger

**Effort: 1 day**

> **Repo: `rentline/backend`** for Option A; **`contracts`** for Option B

Once USDC flows into `PropertyToken`, distribution still needs a trigger.

**Option A — Backend cron (simplest):**

`app/services/treasury_service.py` — in `process_conversion()`, replace the `call_property_token_sync()` call added in Phase 1 Step 3 with `syncAndDistribute()`, which reconciles the vault balance and pushes it pro-rata to all holders in a single tx:

```python
if getattr(property_, "property_token_address", None):
    try:
        from app.integrations.avalanche.contracts import call_property_token_sync_and_distribute
        call_property_token_sync_and_distribute(property_.property_token_address)
        logger.info(
            f"PropertyToken.syncAndDistribute() called for vault {property_.property_token_address}"
        )
    except Exception as dist_err:
        logger.warning(
            f"PropertyToken.syncAndDistribute() failed for {property_.property_token_address}: {dist_err} "
            f"— USDC is in vault; manual distributeToAllHolders() call required"
        )
```

Add the helper to `app/integrations/avalanche/contracts.py`:

```python
def call_property_token_sync_and_distribute(token_address: str) -> str:
    """
    Call PropertyToken.syncAndDistribute() — reconciles vault balance and
    distributes pro-rata to all token holders in a single transaction.
    """
    from app.integrations.avalanche.client import get_web3
    from app.integrations.avalanche.tx import send_tx
    w3 = get_web3()
    account = w3.eth.account.from_key(settings.AVALANCHE_PRIVATE_KEY)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=PROPERTY_TOKEN_ABI,
    )
    tx = contract.functions.syncAndDistribute().build_transaction({
        "from": account.address,
        "gas": 300_000,  # higher gas — iterates over all holders
        "chainId": settings.AVALANCHE_CHAIN_ID,
    })
    return send_tx(tx, label=f"PropertyToken.syncAndDistribute({token_address[:10]}...)")
```

**Option B — Chainlink Automation (decentralized):**

Register `DistributionAutomation.sol` from **`contracts`** — already compiled, just needs Chainlink registration. `checkUpkeep()` triggers when vault balance ≥ `minDistributionAmount` and the interval has elapsed. `performUpkeep()` calls `distributeToAllHolders()`. No backend involvement after setup.

```bash
# Register via Chainlink Automation UI at automation.chain.link
# or via the Chainlink Automation registry contract directly:
cast send $AUTOMATION_REGISTRY \
  "registerUpkeep(address,uint32,address,bytes,bytes)" \
  $DISTRIBUTION_AUTOMATION_ADDRESS \
  500000 \                         # gas limit for performUpkeep
  $LINK_TOKEN_ADDRESS \
  "" \                             # checkData (empty)
  "" \                             # offchainConfig (empty)
  --value 5ether \                 # LINK funding for upkeep
  --rpc-url $AVALANCHE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Recommendation: ship Option A for the hackathon demo, document Option B as the production path.

---

## Hackathon Demo Story

> "Rentline is the off-chain treasury that already moves real rent payments — ACH in, USDC out. We plugged the `PropertyToken` vault directly into that settlement pipeline. No middleware. No oracle. Plain USDC transfer + `sync()`. Chainlink Automation distributes yield to fractional holders automatically. Every rent payment is now an on-chain event."

---

---

# Arbitrum Deployment Plan — Orbit Chain vs. Smart Wallet

> Two options for Arbitrum hackathon track with gas sponsorship.

---

## Option Comparison

| | Orbit Chain | Smart Wallet + Paymaster |
|---|---|---|
| **Gas sponsorship** | You own the sequencer — gas is zero by design | Paymaster contract covers gas for scoped ops |
| **Deploy cost** | $3k–10k/month infra; $10k challenge deposit for Arb One | ~$500 one-time paymaster deposit + credits |
| **Time to launch** | 2–4 weeks | 2–3 days |
| **Contract changes** | None — redeploy same Solidity | None — only tx submission layer changes |
| **UX** | Fully invisible — no gas concept | Gasless UX via AA wallet; bundler submits |
| **Data availability** | AnyTrust (committee) = cheap; Rollup = expensive | Arbitrum One/Sepolia shared security |
| **Hackathon fit** | Custom chain track — strong differentiator | Account abstraction track — fast to demo |
| **Complexity** | High — node infra, DA committee, bridge setup | Low — SDK + one paymaster contract |
| **Good if** | Volume justifies infra; want per-property tx pricing | Want gasless UX now without infra commitment |

---

## Option A — Orbit Chain

### What you build

1. **Chain config** — AnyTrust DA (cheapest), ETH gas token, Arbitrum Sepolia as L1 for the hackathon
2. **Redeploy all contracts** — `forge script DeployFactories.s.sol --rpc-url <orbit-rpc>` — no Solidity changes
3. **Sequencer = you** — set gas price to 0 or absorb it; users never see gas
4. **Bridge** — users bridge tUSDC from Arbitrum Sepolia into the Orbit chain; all property token txs happen there
5. **`rwa-issuer-sim` + `rentline/backend`** — update `AVALANCHE_RPC_URL` → Orbit RPC, `AVALANCHE_CHAIN_ID` → Orbit chain ID

### Tooling

- `orbit-setup-cli` — handles chain config, DA committee setup, bridge contracts
- Nitro node Docker image for the sequencer
- Arbitrum Sepolia as parent chain (free testnet)

### Timeline

- Day 1–2: chain config + `orbit-setup-cli` + node up
- Day 3–4: redeploy contracts, update backend configs, smoke test
- Day 5+: bridge UI, integrate with Rentline backend

### Pitch

> "We run an Orbit chain purpose-built for real estate settlement. Every rent distribution, every token transfer, is gasless for tenants and investors. The chain is permanently anchored to Arbitrum for finality."

---

## Option B — Smart Wallet + Paymaster (Recommended for hackathon)

### What you build

1. **Redeploy contracts on Arbitrum Sepolia** — same Foundry scripts, different `--rpc-url`
2. **Paymaster contract** — sponsor gas for calls scoped to `PropertyToken` and `PropertyTokenFactory` only (ERC-4337 `validatePaymasterUserOp` checks `to` address)
3. **ERC-4337 smart wallets** for property owners — they sign intents, bundler submits, paymaster pays
4. **`rwa-issuer-sim/backend/app/services/token_service.py`** — replace `web3.eth.contract(...).createFor()` with a UserOperation submitted via a bundler RPC (Pimlico / Alchemy AA)

No Solidity contract changes. Only the tx submission layer in the Python backend changes.

### Tooling

- [Pimlico](https://pimlico.io) or [ZeroDev](https://zerodev.app) — bundler + paymaster as a service, both have HTTP JSON-RPC compatible with Python `httpx`
- Alternatively: deploy `VerifyingPaymaster` from eth-infinitism reference implementation and run own bundler

### Implementation sketch

`rwa-issuer-sim/backend/app/services/token_service.py` — replace `send_tx()` with:

```python
# Build calldata for PropertyTokenFactory.createFor(...)
calldata = factory_contract.encodeABI("createFor", [...])

# Wrap in a UserOperation
userop = {
    "sender": smart_wallet_address,
    "callData": calldata,
    "paymasterAndData": PAYMASTER_ADDRESS + paymaster_data,
    ...
}

# Submit to bundler
response = httpx.post(BUNDLER_RPC, json={"method": "eth_sendUserOperation", "params": [userop, ENTRYPOINT]})
```

### Timeline

- Day 1: redeploy contracts on Arbitrum Sepolia, verify on Arbiscan
- Day 2: deploy paymaster, fund it, test sponsorship with cast
- Day 3: update `token_service.py` to submit UserOperations via bundler

### Pitch

> "Investors and landlords interact with on-chain real estate with zero gas friction. We sponsor all minting, yield claims, and distribution transactions via ERC-4337. No gas. No wallet setup friction. Fully compatible with Arbitrum's security model."

---

## Recommended Sequence for the Hackathon

**Do both — in order:**

1. **Week 1:** Smart wallet + Paymaster on Arbitrum Sepolia (Option B). Ship a working demo. Redeploying contracts is the entire migration — `forge script DeployFactories.s.sol --rpc-url $ARB_SEPOLIA_RPC --broadcast`. Update `rentline/backend` chain config to point at Arbitrum Sepolia. Done.

2. **Pitch deck:** Include Orbit as the "production scaling" section. The story is that Option B is today's UX layer; Orbit is tomorrow's infrastructure layer where you own the sequencer and gas is structurally zero.

### The combined hackathon story

> "Today: Rentline converts real rent to USDC and deposits it into on-chain `PropertyToken` vaults on Arbitrum. Yield distributes automatically to fractional holders — gasless, because a Paymaster sponsors all property-related transactions. Tomorrow: we migrate to an Orbit AnyTrust chain where we control the sequencer, gas is zero by design, and each property settlement is a dedicated shard."

---

## Prerequisite for Both Options

**Migrate contracts from Avalanche Fuji to Arbitrum Sepolia.** The contracts are chain-agnostic Solidity — zero code changes required.

```bash
cd rwa-issuer-sim/contracts

forge script script/DeployFactories.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY
```

Then update in `rentline/backend/.env`:
```
# was:
AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
AVALANCHE_CHAIN_ID=43113

# becomes:
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_CHAIN_ID=421614
```

And in `rwa-issuer-sim/.env`, update `CHAIN_ID=421614` and RPC accordingly. `broadcast.py` auto-discovers the new factory addresses from the updated `run-latest.json`.

---

## Open Questions

1. **eERC / BabyJubJub privacy layer** — currently lives on Avalanche. Does it migrate to Arbitrum, stay on Avalanche, or get replaced with a different privacy mechanism (e.g., Aztec, noir proofs)? This is a significant dependency in `rentline/backend`.
2. **USDC on Arbitrum Sepolia** — need to deploy or use an existing testnet USDC mock. The current mock at `0xa836F9a497489506e7059B02ce5795aF43e0662F` is Fuji-specific.
3. **Modern Treasury** — fiat settlement is chain-agnostic. The only change is `send_usdc()` destination chain. MT → fiat collection is unaffected.
4. **Orbit DA committee** — for production, need 2+ DA committee members. For hackathon, a 1-of-1 committee (just your node) is fine; note this in the pitch as "testnet only."
