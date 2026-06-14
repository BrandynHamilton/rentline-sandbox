# RWA Studio

Asset tokenization studio for real estate — create, value, and deploy fractional property tokens on-chain.

## Overview

RWA Studio handles the full lifecycle of tokenizing real estate assets:
1. **Scrape** property data from Zillow/MLS URLs
2. **Value** via multiple AVM sources (Zillow API, ATTOM, manual)
3. **Deploy** ERC-20 property tokens (residential) or security tokens (CRE with waterfall)
4. **Register** with Rentline so rent payments flow into on-chain vaults

## Architecture

```
rwa-studio/
├── backend/          Python FastAPI service (port 8000)
│   ├── app/
│   │   ├── main.py
│   │   ├── core/         Config, DB, logging
│   │   ├── models/       Property, Valuation, CapitalStack, Portfolio
│   │   ├── schemas/      Pydantic request/response models
│   │   ├── services/     Scraping, AVM, metadata, token deploy
│   │   └── api/routes/   Properties, valuations, tokens, capital stack, portfolios, metadata
│   └── scripts/          Batch deployers, template generators
│
├── contracts/        Solidity (Foundry)
│   ├── src/
│   │   ├── PropertyToken.sol           Residential fractional ERC-20
│   │   └── cre/
│   │       ├── SecurityToken.sol       CRE compliance ERC-20
│   │       ├── DistributionManager.sol Waterfall engine
│   │       ├── InvestorRegistry.sol    KYC / accreditation
│   │       ├── PropertyLLC.sol         On-chain SPV wrapper
│   │       └── Governance.sol
│   └── script/       Foundry deployment scripts
│
├── frontend/         Next.js 16 admin UI (Clerk auth, wagmi/viem)
│   ├── app/          App router pages
│   ├── components/
│   ├── lib/
│   └── scripts/      ABI generation, broadcast env sync
│
└── metadata/         Runtime output: {geoId}.json oracle feed files
```

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, httpx, web3.py |
| Contracts | Solidity, Foundry (forge), deployed to Arbitrum |
| Frontend | Next.js 16, Clerk, wagmi, viem, TanStack Query |
| Scraping | Heurist Firecrawl via HTTPayer (x402) |
| Package managers | uv (backend), npm (frontend), forge (contracts) |

## Development

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Contracts — install dependencies first
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
# If using Chainlink (optional):
# forge install smartcontractkit/chainlink
# forge install smartcontractkit/chainlink-ccip
forge build
forge test
```

## Environment

See `.env.example` for full variable list. Key groups:
- **Chain:** `AVALANCHE_RPC_URL`, `AVALANCHE_PRIVATE_KEY`, `AVALANCHE_CHAIN_ID`
- **Scraping:** `X402_PRIVATE_KEY` (HTTPayer for Firecrawl)
- **AVM:** `ZILLOW_API_KEY`, `ATTOM_API_KEY` (optional)
- **Rentline:** `RENTLINE_URL`, `RENTLINE_ADMIN_API_KEY`
- **App:** `DATABASE_URL`, `METADATA_DIR`, `TOKEN_URI_BASE`
