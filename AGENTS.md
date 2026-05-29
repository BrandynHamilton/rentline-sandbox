# Rentline Sandbox — Agent Context

Turn-based real estate investment simulation. Players compete over tokenised properties using
simulated tUSDC, with mortgages, Fed rate cycles, and macro events reflecting real market dynamics.

---

## Monorepo layout

```
rentline-sandbox/
├── sandbox-api/     Python 3.13 FastAPI game engine  (port 6532)
├── sandbox-cli/     Node.js 18 TypeScript CLI + MCP server (stdio)
└── sandbox-web/     Next.js 16 frontend → sandbox.rentline.xyz
```

Each sub-package has its own dependency manifest. Do not mix them:

| Sub-package | Package manager | Install command |
|---|---|---|
| `sandbox-api/` | `uv` (Python) | `uv sync` |
| `sandbox-cli/` | `npm` | `npm install` |
| `sandbox-web/` | `npm` | `npm install` |

Root `.env` is shared. `sandbox-api/app/core/config.py` loads it via `python-dotenv`.

---

## sandbox-api

**Stack:** FastAPI + SQLAlchemy 2.x + SQLite (dev) / PostgreSQL (prod). No Alembic — migrations
are idempotent `ALTER TABLE` statements in `app/migrations.py`, run on every boot.

**Key files:**

```
app/
├── main.py                  App factory + middleware registration
├── core/
│   ├── config.py            All settings (env-backed, with defaults)
│   ├── database.py          SQLAlchemy engine + SessionLocal
│   ├── clerk_auth.py        Clerk RS256 JWT middleware (JWKS-backed)
│   ├── security.py          APIKeyMiddleware: admin / static / sb_ DB keys
│   ├── middleware.py        RequestIDMiddleware + RateLimitMiddleware
│   └── ws_manager.py        WebSocket ConnectionManager
├── models/
│   ├── user.py              User + ApiKey
│   └── sandbox.py           SandboxGame, SandboxPlayer, SandboxProperty,
│                            SandboxGameProperty, SandboxHolding,
│                            SandboxMortgage, SandboxTransaction,
│                            SandboxTurnEvent, SandboxMacroEvent,
│                            SandboxFedDecision
├── api/
│   ├── deps.py              get_db, get_current_user, is_admin_request
│   └── routes/
│       ├── sandbox.py       39 game endpoints
│       ├── ws.py            WebSocket /api/ws?token=<clerk_jwt>
│       ├── api_keys.py      sb_ key CRUD
│       └── health.py        GET /health
└── services/
    ├── sandbox_engine.py    Turn state machine — 7 phases (advance_turn)
    ├── sandbox_service.py   Game/player/trade/mortgage business logic
    ├── sandbox_bot.py       LLM bot engine + random fallback
    ├── sandbox_runner.py    Autonomous mode asyncio background loop
    └── ledger_bridge.py    Optional Rentline ledger HTTP bridge (non-fatal)
```

**Middleware stack** (outermost → innermost, i.e. last `add_middleware` = outermost):

```
ClerkAuthMiddleware → APIKeyMiddleware → RateLimitMiddleware → RequestIDMiddleware → CORSMiddleware
```

When adding new middleware, place the `add_middleware` call in `main.py` in reverse order of
desired execution. Comment the stack ordering — it is not intuitive.

**Authentication — three tiers, coexisting:**

1. Clerk JWT (`Authorization: Bearer <jwt>`) — human users via the web app
2. `sb_` DB-backed API keys (`X-API-Key: sb_...`) — MCP agents, CLI, CI
3. `ADMIN_API_KEY` env var — admin-only routes (`/mint-tusdc`, `/properties/sync`)

Bot players use synthetic `clerk_user_id` prefixed `bot_{hex}`. They never have a `User` row.

**Game state machine:**

```
lobby → trading → advancing → trading → ... → completed
```

Trades and mortgage actions are only valid in `trading` status.
`advance_turn()` transitions through `advancing` and back to `trading`.

**Turn phases** (in `sandbox_engine.py`):

1. Fed meeting (if scheduled) — hike/cut/hold, reprices all ARMs
2. Macro events — tick active events, roll for new ones
3. Rent collection — proportional yield to token holders
4. Random events — per-property vacancy, capex, appreciation
5. Market move — apply price drift, optional AVM re-sync
6. Debt service — collect mortgage payments, forced sale on default after 1 grace turn
7. Distribute + trade window — credit yield, reset `is_ready`, open trading

**NAV:** `usdc_balance + Σ(tokens × price) - Σ(active_mortgage_balances)`

**Deterministic RNG:** events are seeded with `sha256(game_id:turn:scope)` — fully reproducible.

**Adding a new route:**

1. Add the handler to `app/api/routes/sandbox.py`
2. Auth is resolved via `_clerk_id(request)` or `get_current_user(db, request)`
3. Admin check via `is_admin_request(request)` in `app/api/deps.py`
4. No route-level payment logic — keep that in middleware

**Adding a new migration:**

Add an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block to `app/migrations.py`.
It runs on every boot; guard with `IF NOT EXISTS` so it is safe to replay.

**On-chain stubs (do not activate):**

`app/integrations/arbitrum/` is empty. `ARBITRUM_SEPOLIA_RPC_URL`, `ORBIT_RPC_URL`, and related
config vars exist but are unused. `web3` is commented out in `pyproject.toml`. Do not wire these
up without explicit instruction — they are Phase 2 placeholders.

---

## sandbox-cli

**Stack:** Node.js 18, TypeScript, `@modelcontextprotocol/sdk` (stdio JSON-RPC), `commander`.

All 22 MCP tools in `src/tools.ts` map 1-to-1 to API endpoints via the typed HTTP client in
`src/client.ts`. Authentication is `SANDBOX_API_KEY` env var → `X-API-Key` header.

When adding a new game action to the API, also add the corresponding tool definition in
`src/tools.ts` and client method in `src/client.ts`.

Build: `npm run build` → `dist/`. Entry points: `dist/index.js` (CLI) and `dist/server.js` (MCP).

---

## sandbox-web

See `sandbox-web/AGENTS.md` for web-specific rules. Key note: this is Next.js 16 — APIs and
conventions differ significantly from older versions. Read `node_modules/next/dist/docs/` before
writing any Next.js code.

---

## Environment

All config lives in the root `.env` (copy `.env.example` to get started). Required vars for local
development:

```
DATABASE_URL=sqlite:///./data/sandbox.db   # default, no config needed
ADMIN_API_KEY=<any string>                 # enables admin routes
# Leave everything else blank for fully local, auth-free dev mode
```

Optional integrations (leave blank to disable):
- `CLERK_JWKS_URL` + `CLERK_ISSUER` + `CLERK_SECRET_KEY` — Clerk JWT auth
- `OPENAI_API_KEY` — LLM-driven bot decisions (falls back to rule-based if unset)
- `RWA_ISSUER_URL` — live property AVM re-sync
- `RENTLINE_API_URL` — ledger bridge to the Rentline platform
- `SUPABASE_URL` + keys — Supabase dual-write (optional mirror)

---

## Design documents

- `README.md` — full game manual and all configurable settings
- `WEBSOCKETS.md` — WebSocket gap analysis and improvement roadmap
- `X402.md` — x402 payment integration design sketch (phased plan)

---

## What does not exist yet (do not hallucinate)

- No on-chain contract calls anywhere in the codebase
- No x402 payment middleware (see `X402.md` for the design)
- No real USDC transfers — `usdc_balance` is a float column, entirely simulated
- `SandboxTransaction.rentline_payment_id` and `tx_hash` exist but are always `null`
- `app/integrations/arbitrum/` is an empty directory
