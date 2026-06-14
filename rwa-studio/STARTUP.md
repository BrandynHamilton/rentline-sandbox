# RWA Studio — Startup Guide

> Part of the [Rentline monorepo](../). For the full stack (RWA Studio + Core + Sandbox), run `docker compose up --build` from the repo root.

## Full Startup Sequence (from scratch)

```
1. forge build                  ← compile contracts
2. forge script DeployFactories ← deploy 8 factories to Robinhood Chain
3. copy addresses → .env + frontend/.env.local
4. (optional) cast send setOperator ← register backend wallet
5. docker compose up --build    ← start everything
```

---

## Step 1 — Build Contracts

Foundry does not run natively on Windows. Use WSL.

```bash
# In WSL
cd /mnt/c/Users/brand/projects/rwa-issuer/contracts

# Install lib dependencies (first time only)
forge install

# Compile all contracts — outputs to contracts/out/
forge build
```

`contracts/out/` must exist before the backend starts. It loads ABI and bytecode from there.

---

## Step 2 — Deploy the Factories

Load your `.env` variables into the shell, then run the deploy script:

```bash
# Still in WSL, from contracts/
export $(grep -v '^#' ../.env | grep -v '^$' | xargs)

forge script script/DeployFactories.s.sol \
  --rpc-url $AVALANCHE_RPC_URL \
  --broadcast \
  -vvv
```

The script deploys all 8 factories and prints their addresses.
The frontend and backend automatically read the addresses from
`contracts/broadcast/DeployFactories.s.sol/43113/run-latest.json`
on the next `docker compose up --build` — no manual env var setup needed.

```
-- Core --
PropertyTokenFactory        : 0xABC...
CREFactory                  : 0xDEF...
PropertyNFTFactory          : 0x123...
SecurityTokenFactory (legacy): 0x456...

-- Optional CRE --
DistributionManagerFactory  : 0x789...
PropertyLLCFactory          : 0xAAA...
InvestorRegistryFactory     : 0xBBB...
GovernanceFactory           : 0xCCC...
```

---

## Step 3 — Rebuild

```bash
docker compose up --build
```

Factory addresses are auto-loaded from the broadcast file. No `.env` changes needed.

---

## Step 3b — Manual Override (optional)

**Backend — `.env` (project root):**

```env
PROPERTY_TOKEN_FACTORY_ADDRESS=0xABC...
CRE_FACTORY_ADDRESS=0xDEF...
NFT_TOKEN_FACTORY_ADDRESS=0x123...
SECURITY_TOKEN_FACTORY_ADDRESS=0x456...   # legacy
```

**Frontend — `frontend/.env.local` (create if it doesn't exist):**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CHAIN_ID=43113
NEXT_PUBLIC_PROPERTY_TOKEN_FACTORY=0xABC...
NEXT_PUBLIC_CRE_FACTORY=0xDEF...
NEXT_PUBLIC_PROPERTY_NFT_FACTORY=0x123...
NEXT_PUBLIC_ADMIN_API_KEY=your-admin-api-key   # must match ADMIN_API_KEY in .env
```

---

## Step 4 — Register Backend Wallet as Operator (optional)

Required only if you want to deploy tokens via the backend admin path
(`/properties/[geo_id]` → Deploy Token button). Skip if you only use the
wallet path (`/wallet/mint`).

The deployer key is already the factory owner, so it can call `createFor()`
directly. If your backend uses a separate hot wallet, register it here:

```bash
# In WSL — repeat for each factory
cast send $PROPERTY_TOKEN_FACTORY_ADDRESS \
  "setOperator(address,bool)" $YOUR_BACKEND_WALLET_ADDRESS true \
  --rpc-url $AVALANCHE_RPC_URL --private-key $AVALANCHE_PRIVATE_KEY

cast send $SECURITY_TOKEN_FACTORY_ADDRESS \
  "setOperator(address,bool)" $YOUR_BACKEND_WALLET_ADDRESS true \
  --rpc-url $AVALANCHE_RPC_URL --private-key $AVALANCHE_PRIVATE_KEY

cast send $NFT_TOKEN_FACTORY_ADDRESS \
  "setOperator(address,bool)" $YOUR_BACKEND_WALLET_ADDRESS true \
  --rpc-url $AVALANCHE_RPC_URL --private-key $AVALANCHE_PRIVATE_KEY
```

---

## Step 5 — Start the App

### Option A — Root docker compose (recommended)

Starts all three Rentline services from the repo root. See [`STARTUP.md`](../STARTUP.md).

```bash
cd ..
docker compose up --build
```

| Service          | URL                          |
|------------------|------------------------------|
| RWA Studio API   | http://localhost:8000        |
| RWA Studio UI    | http://localhost:3002        |
| API docs         | http://localhost:8000/docs   |

### Option B — Docker (standalone)

Starts backend + frontend together from the project root.

```bash
docker compose up --build
```

| Service  | URL                          |
|----------|------------------------------|
| Backend  | http://localhost:8000        |
| API docs | http://localhost:8000/docs   |
| Frontend | http://localhost:3000        |

Run in background:

```bash
docker compose up --build -d
```

Tear down:

```bash
docker compose down
```

### Option B — Local Dev (two terminals)

**Terminal 1 — Backend**

Requires Python 3.11+ and `uv`.

```bash
pip install uv   # first time only

cd backend
uv pip install --system fastapi "uvicorn[standard]" pydantic pydantic-settings \
  sqlalchemy httpx "web3>=6.0.0" eth-account requests python-dotenv

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend**

Requires Node.js.

```bash
cd frontend
npm install      # first time only
npm run dev
```

---

## Contract Verification

Contracts deployed via `backend/scripts/deploy_tokens.py` are automatically
submitted for verification on [Snowscan](https://testnet.snowscan.xyz) after
each successful deployment.

Add your Snowscan API key to `.env`:

```env
ETHERSCAN_API_KEY=your-snowscan-api-key
```

Get a free key at https://snowscan.xyz/myapikey

If `ETHERSCAN_API_KEY` is not set, verification is silently skipped.

To verify a contract manually:

```bash
cd backend/scripts
python - <<'EOF'
from verify import verify_contract
verify_contract("PropertyToken", "0xYourDeployedAddress", "")
EOF
```
