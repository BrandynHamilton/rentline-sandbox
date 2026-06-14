# Rentline Sandbox

Real estate investment simulation game engine — **sandbox.rentline.xyz**

Players compete over a pool of tokenised properties using Fed rate cycles, macro events, a full mortgage/HELOC/PACE system, and property condition grades. Playable by humans via the web UI, via the CLI, or fully autonomously by AI agents through the MCP server.

> Part of the [Rentline Sandbox monorepo](https://github.com/BrandynHamilton/rentline-sandbox). Start all services: `docker compose up --build` from the repo root.

---

## Contents

- [How the game works](#how-the-game-works)
- [Turn phases](#turn-phases)
- [Property grades](#property-grades)
- [Macro events](#macro-events)
- [Federal Reserve cycle](#federal-reserve-cycle)
- [Mortgage and debt system](#mortgage-and-debt-system)
- [Property improvements and PACE liens](#property-improvements-and-pace-liens)
- [Mechanics liens](#mechanics-liens)
- [Investor tiers](#investor-tiers)
- [AI bot players](#ai-bot-players)
- [Autonomous mode and turn windows](#autonomous-mode-and-turn-windows)
- [Game presets](#game-presets)
- [All configurable settings](#all-configurable-settings)
- [MCP / agent integration](#mcp--agent-integration)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Deployment](#deployment)

---

## How the game works

1. A **host** creates a game room (or picks a preset) and gets an `invite_code`
2. Up to 8 players join using that code (human or AI bot)
3. Each player starts with `starting_balance_usdc` tUSDC (default $100,000)
4. The host advances turns, or enables **autonomous mode** to run hands-free
5. Each turn: rent collected, prices move, Fed may meet, macro events fire, debt service collected
6. Between turns: **trade window** open — buy/sell tokens, mortgages, HELOC, refi, improve properties, originate PACE liens
7. After `max_turns`, game ends and players ranked by **NAV**

**NAV = cash + (tokens × current price) − outstanding debt − judgment balance**

---

## Turn phases

Every `advance-turn` call runs exactly these phases in order:

| #   | Phase                          | What happens                                                                                                                                                                |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| −1  | **Fed meeting**                | On scheduled turns: hike/cut/hold. `FED_WARNING` fires the turn before. ARM mortgages reprice immediately.                                                                  |
| 0   | **Macro events**               | Pending rate macros activate (1-turn warning system). New macros may roll. Active macros tick down.                                                                         |
| 1   | **Rent collection**            | Distributed to token holders proportionally. Grade multipliers apply. Macro events suppress, freeze, or expense against yield. Vacancy from last turn blocks rent entirely. |
| 2   | **Per-property random events** | Vacancy, lease renewal, CapEx hit, appreciation/depreciation — all grade-adjusted. Mechanics lien rolls if property flagged at-risk.                                        |
| 3   | **Market move**                | Applies price drift. Live AVM blended in if `RWA_ISSUER_URL` configured and data is stale.                                                                                  |
| 4   | **Debt service**               | Collects monthly payments. Grace turn on miss; forced sale on second miss. Proceeds pay liens in order: mechanics lien → first lien → HELOC/PACE.                           |
| 5   | **Distribute + Turn Summary**  | Credits rent to player balances. Emits `TURN_SUMMARY` event with rent, debt service, and per-player NAVs.                                                                   |
| 6   | **Trade window**               | Resets `is_ready`, opens trading. Sets `turn_started_at` for deadline tracking.                                                                                             |

---

## Property grades

Every property has a condition grade (A–F) set at game creation from the pool's `initial_grade` field, or derived from cap rate as a fallback. Grade affects all engine phases:

| Grade | Description            | Appreciation prob | Rent mult | CapEx prob | Vacancy prob |
| ----- | ---------------------- | ----------------- | --------- | ---------- | ------------ |
| A     | Excellent / turnkey    | +13% base         | 1.30×     | 2%         | 3%           |
| B     | Good condition         | +6% base          | 1.10×     | 4%         | 5%           |
| C     | Average (baseline)     | ±0%               | 1.00×     | 6%         | 8%           |
| D     | Deferred maintenance   | −12% base         | 0.80×     | 10%        | 14%          |
| F     | Distressed / value-add | −27% base         | 0.60×     | 16%        | 22%          |

Grade can be improved mid-game via cash improvements or PACE liens. The `GENTRIFICATION` macro event can also upgrade D/F properties one tier automatically.

**Seed data grades** (default pool):

| Property                          | Grade |
| --------------------------------- | ----- |
| Beachfront Condo (Miami)          | A     |
| Tech Hub Office (San Jose)        | B     |
| Mountain View Cabin (Denver)      | B     |
| Sunset Bungalow (LA)              | C     |
| Midtown Walkup (New York)         | C     |
| Eastside Duplex (Seattle)         | C     |
| Downtown Loft (Austin)            | D     |
| Warehouse District Flat (Chicago) | F     |

---

## Macro events

At most one new macro fires per turn. Multiple events can be active simultaneously (effects stack). `INTEREST_RATE_RISE` and `INTEREST_RATE_CUT` have a **1-turn warning** before taking effect — ARM holders have one trade window to refi to fixed.

| Event                | Prob/turn | Duration  | Effect                                                                   |
| -------------------- | --------- | --------- | ------------------------------------------------------------------------ |
| `RECESSION`          | 6%        | 2–4 turns | −5%/turn price, −8%/turn rent, +15% vacancy                              |
| `HOUSING_BOOM`       | 5%        | 2–3 turns | +6%/turn price, +5%/turn rent                                            |
| `NATURAL_DISASTER`   | 3%        | 1 turn    | −20% price, rent=0, +40% vacancy                                         |
| `POLICY_CHANGE`      | 8%        | 3 turns   | ±3–7% price, ±5–12% rent (random direction)                              |
| `TAX_HIKE`           | 7%        | Permanent | $50–150/token/month expense                                              |
| `INTEREST_RATE_RISE` | 7%        | 3–6 turns | +1.5% ARM rate _(1-turn warning)_                                        |
| `INTEREST_RATE_CUT`  | 6%        | 3–6 turns | −1.0% ARM rate _(1-turn warning)_                                        |
| `RENT_CONTROL`       | 5%        | 4 turns   | Blocks lease renewal increases                                           |
| `INSURANCE_CRISIS`   | 5%        | 2–3 turns | $100–300/token/month expense                                             |
| `GENTRIFICATION`     | 4%        | 3 turns   | D/F properties upgrade one grade, rent +15%, price +10%                  |
| `ZONING_CHANGE`      | 5%        | 2 turns   | Targeted property type: −10% rent, −5% price                             |
| `PROPERTY_BUBBLE`    | 3%        | 2 turns   | All prices +8%/turn                                                      |
| `BUBBLE_BURST`       | 2%        | 2–3 turns | All prices −12%/turn, +20% vacancy                                       |
| `TENANT_STRIKE`      | 4%        | 1–2 turns | Targeted property type: rent = 0                                         |
| `EMINENT_DOMAIN`     | 2%        | Instant   | One random property force-bought at 110% market value, mortgages cleared |

---

## Federal Reserve cycle

- Meetings fire every `fed_meeting_interval` turns (default 6)
- Set `fed_meeting_interval = 0` to disable the Fed entirely
- Outcomes: **hike**, **cut**, **hold** — each with configurable probability
- All moves in 25–50 bps increments
- `base_mortgage_rate = fed_rate_current + fed_mortgage_spread`
- ARM mortgages reprice immediately on the meeting turn
- Fixed-rate mortgages lock at origination rate forever
- `FED_WARNING` event fires the turn _before_ each meeting

---

## Mortgage and debt system

### Acquisition mortgage

Leveraged purchase. Down payment + closing costs (2% of loan by default). LTV capped at `ltv_limit` (default 70%, expanded by investor tier).

**Tier-adjusted rates and LTV** are applied automatically — higher NAV = lower rate + higher LTV. No action required.

### Refinance

Replace an existing first lien. Rate-and-term (lower rate, same balance) or cash-out (tap equity). LTV limit applies. Blocked if property has an active mechanics lien.

### HELOC

Revolving line against owned equity. Credit limit = `(price × ltv_limit) − first_lien_balance`. Rate = `base_mortgage_rate + heloc_spread` (+2% default).

### PACE lien

Finance a grade upgrade with no down payment. Loan amount = improvement cost. Rate = `base_mortgage_rate + pace_spread` (+1.5% default). Grade and price improve immediately on origination. Subordinate to first lien.

### Principal prepayment

`POST /prepay-principal` with `mortgage_type`: `first_lien`, `acquisition`, `refi`, `heloc`, `pace`, or `mechanics_lien`. Reduces balance and recalculates monthly payment immediately.

### Sale proceeds waterfall

When tokens are sold, proceeds service debt in this order before any cash goes to the player:

1. Mechanics lien (senior claim on title)
2. First lien (acquisition or refi)
3. HELOC / PACE (subordinate)

Any shortfall on a full exit: absorbed silently (default) or recorded as a `judgment_balance` NAV deduction if `judgment_on_shortfall = true`.

### Rate types

| Type    | Behaviour                                                                     |
| ------- | ----------------------------------------------------------------------------- |
| `fixed` | Locked at origination rate forever                                            |
| `arm`   | Adjusts with each Fed move, clamped to `origination_rate ± arm_cap` (300 bps) |

### Default mechanics

- Missed payment: 1 grace turn
- After grace: forced sale at `current_price × (1 − default_penalty)`
- `judgment_on_shortfall`: if true, any deficiency after forced sale recorded as `judgment_balance` (reduces NAV)

---

## Property improvements and PACE liens

Two ways to upgrade a property's grade:

### Cash improvement

`POST /games/{id}/improve-property` `{ property_id, target_grade }`

- Cost = `steps × upgrade_cost_pct × current_price` (default 8%/step) paid from cash
- Price bumps immediately by `steps × improvement_value_add_pct` (default 5%/step)
- Grade improves immediately — rent and appreciation improve next turn
- **Risk**: if post-improvement cash < 2× monthly debt service → mechanics lien risk flag set

### PACE lien

`POST /games/{id}/pace-lien` `{ property_id, target_grade }`

- No cash required — full improvement cost financed
- Rate = `base_mortgage_rate + pace_spread` (default +1.5%, expensive by design)
- LTV check: `(existing debt + PACE amount) / new_price ≤ ltv_limit`
- Grade and price improve immediately on origination

**Strategy**: buy Grade D/F cheaply → PACE to C/B → price bumps → cash-out refi to extract equity → redeploy into next distressed property.

---

## Mechanics liens

A mechanics lien is a contractor dispute that clouds a property's title.

**Triggers:**

- Cash-strapped improvement (balance < 2× debt service after paying): lien _may_ fire next turn (60% chance)
- If lien files: amount = 3–10% of current property price
- 40% chance of a simultaneous `PRICE_DISPUTE` event: AVM reduced 5–15% until lien cleared

**Effects while active:**

- Blocks refi and PACE origination
- Sale proceeds must pay the lien first (before mortgages)

**Clearing:**
`POST /prepay-principal` with `mortgage_type: "mechanics_lien"` and the lien amount. Lien is removed immediately and refi/PACE become available again.

---

## Investor tiers

Tiers are computed live from current NAV — never stored, never gated at signup. Higher tiers automatically receive better mortgage terms on every origination and refi.

| Tier | Min NAV | Name                   | LTV bonus | Rate discount |
| ---- | ------- | ---------------------- | --------- | ------------- |
| 0    | $0      | Retail Investor        | +0%       | 0 bps         |
| 1    | $100k   | Accredited Investor    | +5%       | −25 bps       |
| 2    | $500k   | Professional Investor  | +10%      | −50 bps       |
| 3    | $2.5M   | Institutional Investor | +15%      | −75 bps       |
| 4    | $25M    | Real Estate Developer  | +20%      | −100 bps      |

Tier and next-tier progress are included in all portfolio and leaderboard responses.

---

## AI bot players

Bots are `SandboxPlayer` rows with `is_bot = True`. They act automatically after every `advance_turn`.

### Strategies

| Strategy       | Behaviour                                                              |
| -------------- | ---------------------------------------------------------------------- |
| `aggressive`   | Max leverage, concentrated positions, high default tolerance           |
| `conservative` | Low LTV, diversified, holds 3+ turns of debt service in cash           |
| `balanced`     | Moderate leverage, mixed income/growth, rebalances on macro shifts     |
| `momentum`     | Chases price trends; buys booms, sells recessions                      |
| `income`       | Highest cap-rate properties only, avoids speculation                   |
| `value_add`    | Targets Grade D/F → acquires → PACE improves → cash-out refi → repeats |

### LLM vs random fallback

- **With `OPENAI_API_KEY`**: strategic LLM decisions using the strategy's system prompt persona
- **Without**: lightweight rule-based random fallback — still functional, less strategic
- On LLM failure: automatic fallback to random, bot still marks ready (game never stalls)

### Bot context

Each turn the bot sees: game state, all properties with grades, own holdings with P&L, active mortgages, active macros, recent feed events.

---

## Autonomous mode and turn windows

### Two advance triggers

The autonomous runner checks every 5 seconds for games with `auto_advance = True`:

| Trigger   | Condition                                               | Behaviour                     |
| --------- | ------------------------------------------------------- | ----------------------------- |
| All ready | All human players `is_ready = True`                     | Advance immediately           |
| Deadline  | `turn_duration_seconds` elapsed since `turn_started_at` | Advance; idle players skipped |
| All-bot   | No human players, `auto_advance_delay_seconds` elapsed  | Advance at bot speed          |

### Turn window

`turn_duration_seconds` (default 1800 = 30 minutes) is the real-world deadline per turn. Players who haven't acted are skipped when the deadline fires. Set to `0` for manual-only advance.

### Enable autonomous mode

```bash
# MCP
start_autonomous(game_id, delay_seconds=30)

# HTTP
POST /api/sandbox/games/{id}/autonomous
{ "delay_seconds": 30 }
```

### All-bot autonomous workflow

```
create_game_from_preset(
  preset="standard",
  name="AI Tournament",
  display_name="Observer",
  bots=[
    {display_name: "Aggro", strategy: "aggressive"},
    {display_name: "Value", strategy: "value_add"},
    {display_name: "Income", strategy: "income"}
  ]
)
→ game_id

start_autonomous(game_id, delay_seconds=30)

# Watch:
get_feed(game_id)        # events every ~30s
get_leaderboard(game_id) # live NAV + tier rankings
spectate(game_id)        # public snapshot, no auth

# After ~6 min (12 turns × 30s):
game.status == "completed"
```

---

## Game presets

`POST /api/sandbox/games/from-preset` — opinionated configs, one call:

| Preset       | Config                                                 |
| ------------ | ------------------------------------------------------ |
| `quick`      | 6 turns, Fed meets every 2 turns, high rate volatility |
| `standard`   | 12 turns, all defaults                                 |
| `leveraged`  | 12 turns, ARM default, 80% LTV, amortizing             |
| `distressed` | 12 turns, D/F properties only, judgment liens enabled  |
| `long_run`   | 120 turns, monthly cadence, 5-min turn window          |

---

## All configurable settings

All fields can be passed to `POST /games` or `POST /games/from-preset`. All have defaults — set only what you want to change.

### Game length and timing

| Field                   | Default   | Description                                                             |
| ----------------------- | --------- | ----------------------------------------------------------------------- |
| `max_turns`             | 12        | Turns before game ends (1–1200). Monthly: 12=1yr, 120=10yr, 1200=100yr. |
| `turn_duration`         | `"month"` | Label: `"month"` or `"year"`. Contextual only — mechanics identical.    |
| `turn_duration_seconds` | 1800      | Wall-clock seconds per turn before auto-advance (0 = manual only).      |
| `starting_balance_usdc` | 100,000   | Starting tUSDC per player.                                              |

### Leverage and mortgage

| Field                          | Default   | Description                                                             |
| ------------------------------ | --------- | ----------------------------------------------------------------------- |
| `ltv_limit`                    | 0.70      | Max LTV (further expanded by player tier).                              |
| `default_rate_type`            | `"fixed"` | `"fixed"` or `"arm"` for new originations.                              |
| `amortizing`                   | false     | Principal pays down each turn (30-year PMT). Default = interest-only.   |
| `base_mortgage_rate`           | —         | Override starting rate. Default = `fed_rate + fed_mortgage_spread`.     |
| `arm_cap`                      | 0.03      | Max ARM drift from origination rate (300 bps lifetime).                 |
| `closing_cost_pct`             | 0.02      | Closing costs as fraction of loan at origination/refi.                  |
| `heloc_spread`                 | 0.02      | HELOC rate = `base_rate + heloc_spread`.                                |
| `debt_service_default_penalty` | 0.10      | Forced sale haircut (10% below market).                                 |
| `judgment_on_shortfall`        | false     | If true, underwater sale deficiency becomes a persistent NAV deduction. |

### Improvements and PACE

| Field                       | Default | Description                                    |
| --------------------------- | ------- | ---------------------------------------------- |
| `upgrade_cost_pct`          | 0.08    | Cost per grade step as % of price (8%).        |
| `improvement_value_add_pct` | 0.05    | One-time price bump per grade step (5%).       |
| `pace_spread`               | 0.015   | PACE rate = `base_rate + pace_spread` (+1.5%). |

### Federal Reserve

| Field                    | Default | Description                                |
| ------------------------ | ------- | ------------------------------------------ |
| `fed_meeting_interval`   | 6       | Turns between Fed meetings. 0 = disabled.  |
| `fed_rate_current`       | 0.055   | Starting Fed funds rate (5.5%).            |
| `fed_mortgage_spread`    | 0.020   | Spread over Fed rate for mortgage pricing. |
| `fed_hike_prob`          | 0.30    | Hike probability per meeting.              |
| `fed_cut_prob`           | 0.25    | Cut probability. Hold = 1 − hike − cut.    |
| `fed_move_magnitude_min` | 0.0025  | Min move (25 bps).                         |
| `fed_move_magnitude_max` | 0.0050  | Max move (50 bps).                         |

### Property pool

| Field          | Default    | Description                        |
| -------------- | ---------- | ---------------------------------- |
| `property_ids` | all active | Restrict to specific property IDs. |

### Bots

| Field  | Description                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `bots` | Array of `{display_name, strategy?, personality?}`. Strategies: `aggressive`, `conservative`, `balanced`, `momentum`, `income`, `value_add`. |

### Env vars (server-wide defaults)

| Var                             | Default       | Description                                                    |
| ------------------------------- | ------------- | -------------------------------------------------------------- |
| `SANDBOX_STARTING_BALANCE_USDC` | 100000        | Default starting balance.                                      |
| `SANDBOX_MAX_PLAYERS`           | 8             | Max players per game.                                          |
| `SANDBOX_DEFAULT_MAX_TURNS`     | 12            | Default `max_turns`.                                           |
| `OPENAI_API_KEY`                | —             | Enables LLM bots. Without this, bots use rule-based fallback.  |
| `OPENAI_MODEL`                  | `gpt-4o-mini` | Model for bot decisions.                                       |
| `OPENAI_BASE_URL`               | OpenAI        | Any OpenAI-compatible endpoint.                                |
| `ADMIN_API_KEY`                 | —             | Required in production. Without it, all write routes are open. |

---

## MCP / agent integration

The `sandbox-cli` npm package exposes all game actions as an MCP server over stdio.

### Install

```bash
npm install -g rentline-sandbox
```

### OpenCode config (`opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rentline-sandbox": {
      "type": "local",
      "command": ["npx", "-y", "rentline-sandbox@latest"],
      "enabled": true,
      "environment": {
        "SANDBOX_API_KEY": "sb_your_key_here"
      }
    }
  }
}
```

Run `sandbox setup --client opencode` to have the wizard write this automatically (including your real key).

### CLI login

```bash
sandbox auth login
# Opens sandbox.rentline.xyz/cli-auth in browser
# Sign in with Clerk, copy the generated key, paste back into terminal
```

Or with a direct API key (admin/CI):

```bash
sandbox auth login --key sb_xxxx --url http://localhost:6532
```

### Available MCP tools

**Game management**
| Tool | Description |
|---|---|
| `list_games` | All open game rooms |
| `get_game` | Full game state: players, properties, turn, settings |
| `create_game` | Full config + optional bots |
| `create_game_from_preset` | One-call preset games (quick/standard/leveraged/distressed/long_run) |
| `join_game` | Join with invite code |
| `mark_ready` | Toggle ready state |
| `advance_turn` | Run all engine phases (host only) |
| `get_feed` | Full event stream with optional turn filter |
| `add_bot` | Add LLM bot to lobby |
| `remove_bot` | Remove bot from lobby |
| `start_autonomous` | Enable auto-advance |
| `stop_autonomous` | Pause auto-advance |
| `set_delegate` | Opt in to agent delegation when idle |
| `spectate` | Public game snapshot (no auth) |

**Market & Intel**
| Tool | Description |
|---|---|
| `list_properties` | All active pool properties with grades |
| `get_market_summary` | Live cap rates, price deltas, grade, vacancy, lien status |
| `get_fed_history` | FOMC decision log |
| `get_player_actions` | Transaction timeline for a player |

**Trading**
| Tool | Description |
|---|---|
| `buy_tokens` | All-cash purchase |
| `sell_tokens` | Sell back to pool (proceeds service debt first) |

**Debt**
| Tool | Description |
|---|---|
| `originate_mortgage` | Leveraged buy |
| `refi_mortgage` | Rate-and-term or cash-out refi |
| `heloc_draw` | Draw from HELOC |
| `heloc_repay` | Repay HELOC |
| `prepay_principal` | Partial/full principal prepayment (any lien type) |
| `improve_property` | Cash-funded grade upgrade |
| `originate_pace_lien` | Financed grade upgrade (no down payment) |
| `get_debt` | All active mortgages for a player |

**Portfolio**
| Tool | Description |
|---|---|
| `get_portfolio` | Holdings with grade, P&L, annualised yield, turns held, tier |
| `get_leaderboard` | Game or global leaderboard ranked by NAV |

---

## API reference

Base URL: `https://sandbox-api.rentline.xyz` (or `http://localhost:6532` locally)

Interactive docs with Authorize button: `/docs`

Auth — pick one:

- `X-API-Key: sb_xxxx` — user API key (from `/cli-auth` or `POST /api/sandbox/api-keys`)
- `X-API-Key: <ADMIN_API_KEY>` — admin access to all routes
- `Authorization: Bearer <clerk_jwt>` — web app session

Public endpoints (no auth): `GET /health`, `GET /api/sandbox/games/{id}/spectate`, `GET /api/sandbox/games/{id}/leaderboard`, `GET /api/sandbox/properties`, `GET /api/sandbox/games`

---

## Project structure

```
sandbox-core/
├── sandbox-api/            Python 3.13 FastAPI game engine (port 6532)
│   ├── app/
│   │   ├── main.py         App factory, middleware, startup
│   │   ├── migrations.py   Idempotent ALTER TABLE migrations (run on every boot)
│   │   ├── api/routes/
│   │   │   └── sandbox.py  All 35 game endpoints
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── clerk_auth.py
│   │   │   └── security.py
│   │   ├── models/
│   │   │   └── sandbox.py  ORM: Game, Player, Holding, Mortgage, GameProperty,
│   │   │                   TurnEvent, MacroEvent, FedDecision, Transaction
│   │   └── services/
│   │       ├── sandbox_engine.py   Turn state machine (7 phases) + grade system + tiers
│   │       ├── sandbox_service.py  Business logic: trade, mortgage, PACE, improve, spectate
│   │       ├── sandbox_bot.py      LLM bot engine (6 strategies) + random fallback
│   │       └── sandbox_runner.py   Autonomous mode runner (ready-check + deadline)
│   └── Dockerfile
│
├── sandbox-cli/            Node.js 18 TypeScript CLI + MCP server (npm: rentline-sandbox)
│   ├── src/
│   │   ├── index.ts        CLI entry point
│   │   ├── server.ts       MCP server (stdio JSON-RPC, 35 tools)
│   │   ├── tools.ts        Tool definitions + input schemas
│   │   ├── client.ts       Typed HTTP client
│   │   └── commands/       auth, game, trade, mortgage, admin
│   └── dist/               Compiled output (npm run build)
│
├── sandbox-frontend/       Next.js 16 frontend → sandbox.rentline.xyz (pnpm)
│   ├── src/
│   │   ├── app/            App router pages
│   │   ├── components/     UI components (shadcn + Base UI)
│   │   ├── lib/            Utilities + API client
│   │   └── store/          Zustand state
│   └── public/
│
├── deploy.sh               Build/push script (--api or --cli flags)
└── docker-compose.yml      Local dev (API only; frontend deploys to Vercel)
```

---

## Quick start

### Full stack (recommended)

```bash
docker compose up --build
# Sandbox API: http://localhost:6532
# Frontend:    http://localhost:3000
```

### Local dev (API only)

```bash
cp .env.example .env
# Set ADMIN_API_KEY=anything for local dev

cd sandbox-api
uv sync
uv run uvicorn app.main:app --reload --port 6532

# Seed properties:
curl -X POST http://localhost:6532/api/sandbox/properties/sync \
  -H "X-API-Key: your-admin-key"
```

Docs: `http://localhost:6532/docs`

### Docker

```bash
cp .env.example .env
docker compose up --build
# API: http://localhost:6532
# Docs: http://localhost:6532/docs
```

### CLI

```bash
npm install -g rentline-sandbox

sandbox auth login               # browser OAuth via Clerk
# or:
sandbox auth login --key sb_xxx  # direct key

sandbox game list
sandbox game create --name "Test" --display-name "Alice"
```

### MCP (in OpenCode)

```json
{
  "mcp": {
    "rentline-sandbox": {
      "type": "local",
      "command": ["npx", "-y", "rentline-sandbox@latest"],
      "environment": {
        "SANDBOX_API_KEY": "sb_your_key"
      }
    }
  }
}
```

Or run `sandbox setup --client opencode` to have it written automatically.

---

## Deployment

### API (Akash / any Docker host)

```bash
./deploy.sh --api   # builds and pushes brandynham/sandbox-api:latest
```

Set in your deployment environment:

```
ADMIN_API_KEY=<strong-secret>
ALLOWED_ORIGINS=https://sandbox.rentline.xyz
OPENAI_API_KEY=<optional, enables LLM bots>
CLERK_JWKS_URL=https://flexible-bluejay-5.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://flexible-bluejay-5.clerk.accounts.dev
```

### Frontend (Vercel)

Point a Vercel project at `sandbox-frontend/`. Set environment variables in the Vercel dashboard:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_SANDBOX_API_URL=https://sandbox-api.rentline.xyz
CLERK_SECRET_KEY=sk_...
```

### CLI (npm)

```bash
./deploy.sh --cli   # runs npm run build && npm publish
```
