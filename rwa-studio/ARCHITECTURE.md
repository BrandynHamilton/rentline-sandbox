# RWA Studio — Architecture

Sandbox suite for creating, valuing, and tokenizing real estate assets. Supports residential fractional ownership (PropertyToken ERC-20) and commercial capital stacks (SecurityToken + DistributionManager waterfall), all built around Rentline for programmatic fiat → USDC cash flows.

---

## System Overview

```
User (URL / address / manual)
        │
        ▼
┌──────────────────────────────────────────────────────┐
│              rwa-studio backend (FastAPI)             │
│                                                      │
│  /properties   → create asset, trigger scrape job   │
│  /valuations   → AVM enrichment, reconcile value     │
│  /tokens       → deploy PropertyToken / SecurityToken│
│  /portfolios   → residential portfolio grouping      │
│  /capital_stack→ CRE waterfall config                │
│  /metadata     → serve {geoId}.json (oracle feed)   │
└──────────┬───────────────────────────────────────────┘
           │
     ┌─────┴──────────────────────────────┐
     │                                    │
     ▼                                    ▼
Heurist Firecrawl (via HTTPayer)    Zillow / ATTOM AVM APIs
(scrape MLS / Zillow page)          (structured valuation data)
     │                                    │
     └──────────┬─────────────────────────┘
                ▼
        SQLite (dev) / Postgres (prod)
        properties + valuation_sources
        capital_stack_configs + portfolios
                │
                ▼
        Robinhood Chain (Arbitrum Orbit)
        PropertyToken.sol  (residential ERC-20)
        SecurityToken.sol  (CRE compliance ERC-20)
        DistributionManager.sol (waterfall)
        InvestorRegistry.sol (KYC/accreditation)
                │
                ▼
        Rentline API
        (push token address → enable rent→USDC cash flows)
```

---

## Directory Structure

```
rwa-studio/
├── ARCHITECTURE.md
├── .env.example
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                    # FastAPI app, router registration, startup
│   │   ├── core/
│   │   │   ├── config.py              # Settings via pydantic-settings
│   │   │   ├── logging.py             # Structured logger
│   │   │   └── db.py                  # SQLAlchemy engine + session factory
│   │   ├── models/
│   │   │   ├── property.py            # Property ORM
│   │   │   ├── valuation.py           # ValuationSource ORM
│   │   │   ├── capital_stack.py       # CapitalStackConfig ORM
│   │   │   └── portfolio.py           # Portfolio + PortfolioProperty ORM
│   │   ├── schemas/
│   │   │   ├── property.py            # PropertyCreate / PropertyRead / PropertyUpdate
│   │   │   ├── valuation.py           # ValuationSourceRead / AVMRequest
│   │   │   ├── capital_stack.py       # CapitalStackConfigCreate / Read
│   │   │   └── portfolio.py           # PortfolioCreate / PortfolioRead
│   │   ├── services/
│   │   │   ├── scraping_service.py    # HTTPayer → Heurist Firecrawl
│   │   │   ├── avm_service.py         # Zillow / ATTOM / manual AVM fetchers
│   │   │   ├── metadata_service.py    # write + read {geoId}.json files
│   │   │   └── token_service.py       # web3 contract deploy + mint
│   │   └── api/
│   │       └── routes/
│   │           ├── properties.py      # CRUD, scrape trigger, manual override, status
│   │           ├── valuations.py      # AVM fetch, reconcile, set primary_value
│   │           ├── tokens.py          # deploy PropertyToken / SecurityToken
│   │           ├── portfolios.py      # residential portfolio grouping + NAV
│   │           ├── capital_stack.py   # CRE waterfall config + SecurityToken deploy
│   │           └── metadata.py        # serve {geoId}.json (oracle endpoint)
│   └── scripts/
│       ├── deploy_tokens.py           # standalone CSV batch deployer
│       └── generate_property_template.py
├── contracts/
│   ├── src/
│   │   ├── PropertyToken.sol          # Residential fractional ERC-20
│   │   └── cre/
│   │       ├── SecurityToken.sol      # CRE compliance ERC-20
│   │       ├── PropertyLLC.sol        # On-chain SPV wrapper
│   │       ├── DistributionManager.sol# Waterfall engine
│   │       ├── InvestorRegistry.sol   # KYC / accreditation registry
│   │       └── Governance.sol
│   └── ...
└── metadata/                          # Runtime: {geoId}.json files live here
```

---

## Database Schema

### `properties`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| geo_id | TEXT UNIQUE | e.g. `geo-382910` — oracle anchor |
| status | TEXT | `draft` / `scraping` / `ready` / `deployed` |
| scrape_status | TEXT | `pending` / `running` / `done` / `failed` |
| source_url | TEXT | Zillow / MLS URL submitted by user |
| primary_value | REAL | USD, user-confirmed valuation |
| property_token_address | TEXT | deployed PropertyToken address |
| security_token_address | TEXT | deployed SecurityToken address |
| metadata_json | TEXT | full PropertyMetadata blob (JSON) |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### `valuation_sources`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| property_id | INTEGER FK → properties.id | |
| source | TEXT | `scrape` / `zillow` / `attom` / `manual` |
| avm_value | REAL | USD estimate from this source |
| raw_response | TEXT | full API/scrape response JSON |
| fetched_at | DATETIME | |
| is_primary | BOOLEAN | which source drives `properties.primary_value` |

### `capital_stack_configs`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| property_id | INTEGER FK → properties.id | |
| preferred_return_bps | INTEGER | e.g. 800 = 8% preferred return |
| sponsor_promote_bps | INTEGER | e.g. 2000 = 20% promote above pref |
| waterfall_threshold | REAL | USD threshold for tiered waterfall |
| equity_raise_target | REAL | total raise target in USD |
| min_investment_usd | REAL | minimum check size |
| distribution_manager_address | TEXT | deployed DistributionManager address |
| investor_registry_address | TEXT | deployed InvestorRegistry address |
| created_at | DATETIME | |

### `portfolios`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | display name |
| description | TEXT | |
| owner_address | TEXT | EVM wallet |
| created_at | DATETIME | |

### `portfolio_properties`
| column | type | notes |
|---|---|---|
| portfolio_id | INTEGER FK → portfolios.id | |
| property_id | INTEGER FK → properties.id | |

---

## API Endpoints

### Properties

| method | path | description |
|---|---|---|
| POST | `/properties` | Create asset. Pass `source_url` to trigger background scrape, or pass full metadata to skip scrape. |
| GET | `/properties` | List all properties with status. |
| GET | `/properties/{geo_id}` | Get single property + all valuation sources. |
| GET | `/properties/{geo_id}/status` | Lightweight scrape/deploy status poll. |
| POST | `/properties/{geo_id}/scrape` | Re-trigger scrape job manually. |
| PUT | `/properties/{geo_id}/value` | Manual value override (when scrape/AVM fails). |
| PUT | `/properties/{geo_id}/metadata` | Manually update any metadata fields. |
| DELETE | `/properties/{geo_id}` | Remove property (only if not deployed). |

### Valuations (AVM)

| method | path | description |
|---|---|---|
| POST | `/valuations/{geo_id}/fetch` | Trigger AVM enrichment (Zillow, ATTOM, etc. based on configured keys). |
| GET | `/valuations/{geo_id}` | List all valuation sources for a property. |
| PUT | `/valuations/{geo_id}/primary` | Set a specific valuation source as primary (updates `properties.primary_value`). |

### Tokens

| method | path | description |
|---|---|---|
| POST | `/tokens/{geo_id}/deploy/property` | Deploy PropertyToken (residential ERC-20). |
| POST | `/tokens/{geo_id}/deploy/security` | Deploy SecurityToken (CRE ERC-20 with compliance). |
| GET | `/tokens/{geo_id}` | Get deployed token addresses + on-chain status. |
| POST | `/tokens/{geo_id}/push_rentline` | Push token address to Rentline API. |

### Capital Stack (CRE)

| method | path | description |
|---|---|---|
| POST | `/capital_stack/{geo_id}/config` | Create waterfall config (preferred return, promote, thresholds). |
| GET | `/capital_stack/{geo_id}/config` | Get current config. |
| POST | `/capital_stack/{geo_id}/deploy` | Deploy DistributionManager + InvestorRegistry on-chain with config. |
| POST | `/capital_stack/{geo_id}/investors/{address}/approve` | Approve investor (KYC/accredited). |
| GET | `/capital_stack/{geo_id}/state` | Get on-chain distribution state (totalDistributed, preferredReturnPaid, etc.). |

### Portfolios

| method | path | description |
|---|---|---|
| POST | `/portfolios` | Create portfolio. |
| GET | `/portfolios` | List all portfolios. |
| GET | `/portfolios/{id}` | Get portfolio + properties + aggregate NAV. |
| POST | `/portfolios/{id}/properties` | Add property to portfolio. |
| DELETE | `/portfolios/{id}/properties/{geo_id}` | Remove property from portfolio. |

### Metadata (Oracle Feed)

| method | path | description |
|---|---|---|
| GET | `/metadata/{geo_id}` | Serve `{geoId}.json` — consumed by oracle/valuation feed. |
| GET | `/metadata/{geo_id}.json` | Same, with `.json` extension (for direct tokenURI resolution). |

---

## Asset Creation Flow

```
1. User POSTs source_url (Zillow/MLS) to POST /properties
   → property created: status=draft, scrape_status=pending
   → background task fires: scrape_service.scrape_property_url(source_url)

2. Scrape completes (or fails):
   → success: metadata_json populated, valuation_sources entry (source=scrape),
              scrape_status=done, status=ready
   → failure: scrape_status=failed, user can manually call PUT /properties/{geo_id}/value

3. Optional AVM enrichment: POST /valuations/{geo_id}/fetch
   → calls Zillow API (if ZILLOW_API_KEY set) → stores valuation_source (source=zillow)
   → calls ATTOM API (if ATTOM_API_KEY set) → stores valuation_source (source=attom)
   → all sources returned; user picks primary via PUT /valuations/{geo_id}/primary

4. Deploy: POST /tokens/{geo_id}/deploy/property  (residential)
          or POST /tokens/{geo_id}/deploy/security (CRE)
   → token_service deploys contract on Robinhood Chain
   → metadata_service writes {geo_id}.json to /metadata/
   → property_token_address / security_token_address saved to DB
   → status → deployed

5. Push to Rentline: POST /tokens/{geo_id}/push_rentline
   → POSTs token address to RENTLINE_URL/api/properties/{rentline_id}/token
   → enables Rentline rent→USDC→PropertyToken.depositRent() cash flow
```

---

## AVM Integration

AVMs are **additive sources** stored in `valuation_sources`. No per-API ID is needed — the property record anchors everything via `geo_id`.

```python
# avm_service.py pattern
async def fetch_all_avms(property_id, address) -> list[ValuationSource]:
    sources = []
    if settings.ZILLOW_API_KEY:
        sources.append(await _fetch_zillow(address))
    if settings.ATTOM_API_KEY:
        sources.append(await _fetch_attom(address))
    # scrape-derived price is already stored at property creation time
    return [s for s in sources if s]
```

To add a new AVM: add its API key to `.env`, add a `_fetch_<provider>()` function to `avm_service.py`, register it in `fetch_all_avms()`. The DB schema requires no changes.

---

## Rentline Integration

`PropertyToken.depositRent(from, amount)` is called by Rentline when a rent payment is processed. The flow:

```
Tenant pays rent (fiat) via Rentline
    → Rentline converts to USDC (via its own rails)
    → Rentline calls PropertyToken.depositRent(rentline_wallet, amount)
    → USDC lands in PropertyToken vault
    → Token holders call withdrawRewards() pro-rata
```

This backend's job: deploy the token, register its address in Rentline, write the metadata JSON so the oracle can value it.

---

## Environment Variables

See `.env.example` for the full list. Key groups:

- **Chain**: `AVALANCHE_RPC_URL`, `AVALANCHE_PRIVATE_KEY`, `AVALANCHE_CHAIN_ID`
- **Scraping**: `X402_PRIVATE_KEY`
- **AVM** (optional): `ZILLOW_API_KEY`, `ZILLOW_ZWSID`, `ATTOM_API_KEY`
- **Rentline**: `RENTLINE_URL`, `RENTLINE_ADMIN_API_KEY`
- **App**: `METADATA_DIR`, `TOKEN_URI_BASE`, `DATABASE_URL`
