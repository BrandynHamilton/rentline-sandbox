# Rentline Sandbox

Monorepo for the Rentline Sandbox platform — a turn-based real estate investment simulation game engine with on-chain asset tokenization.

**Live:** [sandbox.rentline.xyz](https://sandbox.rentline.xyz) | **API docs:** [sandbox-api.rentline.xyz/docs](https://sandbox-api.rentline.xyz/docs) | **npm:** [rentline-sandbox](https://www.npmjs.com/package/rentline-sandbox)

---

## Monorepo Structure

```
rentline-sandbox/
├── sandbox-core/       Game engine, CLI/MCP server, and frontend
│   ├── sandbox-api/    Python 3.13 FastAPI game engine (port 6532)
│   ├── sandbox-cli/    Node.js TypeScript CLI + MCP server (npm: rentline-sandbox)
│   └── sandbox-frontend/  Next.js 16 web app (pnpm, Vercel)
│
├── rwa-studio/         Asset tokenization studio
│   ├── backend/        FastAPI property data + token deployment service (port 8000)
│   ├── contracts/      Solidity (Foundry) — PropertyToken, SecurityToken, waterfall
│   └── frontend/       Next.js 16 admin UI (wagmi/viem)
│
└── .gitignore          Monorepo-level ignores
```

## Packages

| Package | Description | Stack | Manager |
|---------|-------------|-------|---------|
| `sandbox-core/sandbox-api` | Game engine API — turns, trades, mortgages, bots | Python, FastAPI, SQLAlchemy | `uv` |
| `sandbox-core/sandbox-cli` | CLI + MCP server (35 tools) | Node.js, TypeScript | `npm` |
| `sandbox-core/sandbox-frontend` | Player-facing web app | Next.js 16, shadcn, Zustand | `pnpm` |
| `rwa-studio/backend` | Property scraping, AVM, token deployment | Python, FastAPI, web3.py | `uv` |
| `rwa-studio/contracts` | ERC-20 property/security tokens, waterfall | Solidity, Foundry | `forge` |
| `rwa-studio/frontend` | Admin UI for asset management | Next.js 16, wagmi, viem | `npm` |

## Quick Start

### Prerequisites

- **Python 3.13+** with [uv](https://docs.astral.sh/uv/) installed
- **Node.js 18+** with npm
- **pnpm** (`npm install -g pnpm`) — for sandbox-frontend
- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`) — for contracts only
- **Docker** (optional) — for containerized runs

---

### Sandbox API (game engine)

```bash
cd sandbox-core
cp .env.example .env
# Edit .env — set ADMIN_API_KEY=anything for local dev

cd sandbox-api
uv sync
uv run uvicorn app.main:app --reload --port 6532
```

API is now at `http://localhost:6532` — Swagger docs at `/docs`.

Seed the property pool:
```bash
curl -X POST http://localhost:6532/api/sandbox/properties/sync \
  -H "X-API-Key: your-admin-key"
```

### Sandbox Frontend

```bash
cd sandbox-core/sandbox-frontend
cp .env.example .env.local  # or create manually (see below)
pnpm install
pnpm dev
```

Runs at `http://localhost:3000`. Required env vars in `.env.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_SANDBOX_API_URL=http://localhost:6532
CLERK_SECRET_KEY=sk_...
```

### Sandbox CLI + MCP Server

```bash
npm install -g rentline-sandbox

# Authenticate
sandbox auth login              # browser OAuth via Clerk
# or:
sandbox auth login --key sb_xxx # direct API key

# Play
sandbox game list
sandbox game create --preset standard --name "Test" --display-name "Alice"
```

For AI agent integration, run `sandbox setup` to auto-configure your MCP client (OpenCode, Claude, Cursor, etc).

---

### RWA Studio Backend

```bash
cd rwa-studio
cp .env.example .env
# Edit .env — set chain RPC, private key, etc.

cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

API at `http://localhost:8000` — docs at `/docs`.

### RWA Studio Frontend

```bash
cd rwa-studio/frontend
npm install
npm run dev
```

Runs at `http://localhost:3000` (or `3002` via Docker).

### RWA Studio Contracts

```bash
cd rwa-studio/contracts
forge install OpenZeppelin/openzeppelin-contracts
forge build
forge test
```

Deploy (requires funded wallet + RPC):
```bash
forge script script/DeployFactories.s.sol \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

---

### Docker (full sandbox stack)

```bash
cd sandbox-core
cp .env.example .env
docker compose up --build
# API: http://localhost:6532
```

### Docker (full RWA Studio stack)

```bash
cd rwa-studio
cp .env.example .env
docker compose up --build
# Backend:  http://localhost:8000
# Frontend: http://localhost:3002
```

## How They Connect

```
RWA Studio                         Sandbox Core
─────────────────────              ─────────────────────
backend (port 8000)  ──metadata──▶  sandbox-api (port 6532)
  • Scrapes properties               • Fetches live AVM prices
  • Deploys tokens                     during MARKET_MOVE phase
  • Serves /metadata/{geoId}          via RWA_ISSUER_URL config

sandbox-api  ──ledger bridge──▶  Rentline Core (optional)
  • Rent events bridged to            • Real dashboard entries
    the landlord's Rentline             for demo purposes
    dashboard
```

## Links

- [Game manual](sandbox-core/README.md) — full rules, settings, and API reference
- [RWA Studio architecture](rwa-studio/ARCHITECTURE.md) — tokenization flows and DB schema
- [CLI README](sandbox-core/sandbox-cli/README.md) — install, setup, all commands
- [API docs](https://sandbox-api.rentline.xyz/docs) — interactive Swagger UI
