# Rentline Sandbox

Real estate investment simulation game engine — **sandbox.rentline.xyz**

Players compete over a pool of tokenised real-world properties using real RWA data, Fed rate cycles, macro events, and a full mortgage/HELOC system. Playable by humans via the web UI, via the CLI, or fully autonomously by AI agents through the MCP server.

---

## Contents

- [How the game works](#how-the-game-works)
- [Turn length and game timeline](#turn-length-and-game-timeline)
- [What happens each turn](#what-happens-each-turn)
- [Macro events](#macro-events)
- [Federal Reserve cycle](#federal-reserve-cycle)
- [Mortgage and debt system](#mortgage-and-debt-system)
- [AI bot players](#ai-bot-players)
- [Autonomous mode](#autonomous-mode)
- [All configurable settings](#all-configurable-settings)
- [MCP / agent integration](#mcp--agent-integration)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Deployment](#deployment)

---

## How the game works

1. A **host** creates a game room and gets an `invite_code`
2. Up to 8 players join using that code (human or AI bot)
3. Each player starts with a `starting_balance_usdc` of tUSDC (default $100,000)
4. The host advances turns one at a time (or enables **autonomous mode** to run hands-free)
5. Each turn: rent is collected, prices move, the Fed may meet, macro events may fire, and debt service is collected
6. Between turns: the **trade window** is open — players buy/sell property tokens, take out mortgages, draw HELOCs, refi
7. After `max_turns` (default 12), the game ends and players are ranked by **NAV**

**NAV = cash balance + (tokens held × current price) − outstanding debt**

---

## Turn length and game timeline

**One turn = one month.**

Every game mechanic is calibrated to monthly cadence:
- Rent is paid monthly (per `current_rent_usd` on each property)
- Mortgage payments are monthly (interest-only by default, or amortizing)
- The Fed meets every `fed_meeting_interval` turns — default is every 6 turns (every 6 months), matching real FOMC semi-annual cadence
- Macro events have durations measured in turns (months): a recession lasts 2–4 months, rent control 4 months, etc.
- A default game of 12 turns = **one year of simulated real estate investing**

You can change the scale with `max_turns`:

| `max_turns` | Simulated period | Use case |
|---|---|---|
| 6 | 6 months | Quick game / demo |
| 12 | 1 year | Standard game (default) |
| 24 | 2 years | Extended campaign |
| 48 | 4 years | Full market cycle |

---

## What happens each turn

Turn phases run in this exact order every time `advance-turn` is called:

### Phase −1: Fed meeting
Fires on scheduled turns (`turn % fed_meeting_interval == 0`). The turn *before* a meeting, a `FED_WARNING` event appears in the feed so players can prepare. On meeting turn, the RNG rolls:
- **Hike** (probability `fed_hike_prob`, default 30%): raises `fed_rate_current` by 25–50 bps, raises `base_mortgage_rate` by the same, adjusts all active ARM mortgages immediately
- **Cut** (probability `fed_cut_prob`, default 25%): lowers rates, ARM mortgages reprice down
- **Hold** (remaining probability ~45%): no change

### Phase 0: Macro events
One new macro event may fire per turn (see [Macro events](#macro-events) table). Existing active macros tick down their `turns_remaining`; expired ones are marked `expired` and logged.

### Phase 1: Rent collection
For every property in the game pool, rent is distributed to token holders in proportion to their share of total supply. Macro events can suppress rent (recession, natural disaster), freeze rent increases (rent control), or add monthly expenses (tax hike, insurance crisis). Vacancy from the previous turn blocks rent entirely.

### Phase 2: Per-property random events
Each property rolls independently using a deterministic RNG seeded on `sha256(game_id:turn:property_id)` — reproducible for debugging. Events:
- **Vacancy** — property sits empty next turn, no rent collected
- **Lease renewal** — rent adjusts ±2–8% (blocked during active rent control)
- **CapEx hit** — one-time capital expense ($500–$3,000) deducted from holders proportionally
- **Appreciation** — AVM up 2–5%
- **Depreciation** — AVM down 1–4%

Active macro events override or amplify random price moves.

### Phase 3: Market move
Applies the price drift from Phase 2 to each property's `current_price_usd`. If `RWA_ISSUER_URL` is configured and the property's AVM data is >24 hours old, the live AVM is blended in.

### Phase 4: Debt service
Collects monthly mortgage payments from each player's tUSDC balance:
- Interest-only (default): `payment = balance × (current_rate / 12)`
- Amortizing: standard PMT formula against a 30-year term
- ARM mortgages adjust based on active macro rate adjustments
- If a player can't pay: `turns_in_arrears++`
- After 1 grace turn: **forced sale** at `current_price × (1 − default_penalty)`. Proceeds repay all debt on that property; surplus goes to the player, shortfall is absorbed.

### Phase 5: Distribute
Credits the rent collected in Phase 1 to each player's `usdc_balance`.

### Phase 6: Trade window
Resets all players' `is_ready = False`, sets `game.status = "trading"`, and opens the trade window. If this was the final turn, finalises the game, computes final NAVs, and sets `status = "completed"`.

---

## Macro events

At most one new macro event fires per turn. Probabilities are intentionally low to make them impactful rather than routine noise. Multiple events can be active simultaneously (effects stack).

| Event | Prob/turn | Duration | Effect |
|---|---|---|---|
| `RECESSION` | 6% | 2–4 months | −5%/turn price, −8%/turn rent, +15% vacancy chance |
| `HOUSING_BOOM` | 5% | 2–3 months | +6%/turn price, +5%/turn rent |
| `NATURAL_DISASTER` | 3% | 1 month | −20% price (instant), rent = 0, +40% vacancy |
| `POLICY_CHANGE` | 8% | 3 months | ±3–7% price, ±5–12% rent (random direction) |
| `TAX_HIKE` | 7% | Permanent | $50–150/token/month expense against yield |
| `INTEREST_RATE_RISE` | 7% | 3–6 months | +1.5% rate on ARM mortgages and new originations |
| `INTEREST_RATE_CUT` | 6% | 3–6 months | −1.0% rate on ARM mortgages; refi window opens |
| `RENT_CONTROL` | 5% | 4 months | Blocks lease renewal rent increases (residential or commercial) |
| `INSURANCE_CRISIS` | 5% | 2–3 months | $100–300/token/month expense against yield |

`NATURAL_DISASTER`, `RENT_CONTROL` target one randomly selected property type (residential or commercial). All others are game-wide.

---

## Federal Reserve cycle

- Meetings fire every `fed_meeting_interval` turns (default: 6 — every 6 months)
- Set `fed_meeting_interval = 0` to disable the Fed entirely (deterministic games)
- Outcomes: **hike**, **cut**, or **hold** — each with configurable probability
- All moves are in 25 bps increments (`fed_move_magnitude_min = 0.0025`)
- `base_mortgage_rate = fed_rate_current + fed_mortgage_spread`
- ARM mortgages reprice immediately on the Fed meeting turn
- Fixed-rate mortgages lock at their origination rate forever
- A `FED_WARNING` event fires the turn *before* each meeting

---

## Mortgage and debt system

### Acquisition mortgage (`originate_mortgage`)
Leveraged purchase. You provide the down payment (purchase price − loan) plus closing costs (2% of loan by default). The rest is financed. LTV is capped at `ltv_limit` (default 70%).

### Refinance (`refi_mortgage`)
Replace an existing first lien. Rate-and-term refi: same balance, lower rate. Cash-out refi: tap equity (net of closing costs). LTV limit applies to new loan.

### HELOC (`heloc_draw` / `heloc_repay`)
Revolving line of credit against owned equity. Credit limit = `(current_price × ltv_limit) − first_lien_balance`. Draw and repay freely during the trade window. HELOC rate = `base_mortgage_rate + heloc_spread` (default +2%).

### Rate types
| Type | Behaviour |
|---|---|
| `fixed` | Rate locked at origination, never changes |
| `arm` | Adjusts each Fed meeting by the same delta as the Fed move, clamped to `origination_rate ± arm_cap` |

### Default mechanics
- Missed payment: 1 grace turn
- After grace: forced sale at `current_price × (1 − debt_service_default_penalty)`
- Proceeds repay all debt on that property; surplus credited to player, shortfall absorbed

---

## AI bot players

Bots are `SandboxPlayer` rows with `is_bot = True`. They act automatically after each `advance_turn` call, during the trade window.

### Adding bots

At game creation (all bots added in one call):
```json
{
  "name": "My Game",
  "display_name": "Alice",
  "bots": [
    { "display_name": "Warren Buffett", "strategy": "conservative" },
    { "display_name": "Gordon Gekko",   "strategy": "aggressive" },
    { "display_name": "Index Fund",     "strategy": "income" }
  ]
}
```

Or individually after creation (lobby status only):
```bash
sandbox game add-bot <game-id> --name "Warren Buffett" --strategy conservative
# MCP: add_bot(game_id, display_name, strategy)
```

### Strategies

Each strategy maps to a distinct LLM system prompt persona:

| Strategy | Behaviour |
|---|---|
| `aggressive` | Max leverage, concentrated positions, high default tolerance |
| `conservative` | Low LTV, diversified, holds 3+ turns of debt service in cash |
| `balanced` | Moderate leverage, mixed income/growth, rebalances on macro shifts |
| `momentum` | Chases recent price trends; buys booms, sells recessions |
| `income` | Highest cap-rate properties only, avoids speculative plays |

### LLM vs random fallback

- **With `OPENAI_API_KEY`**: bots call the OpenAI API (or any compatible endpoint via `OPENAI_BASE_URL`) and make strategic decisions using their persona prompt
- **Without `OPENAI_API_KEY`**: bots use a lightweight rule-based random strategy — still functional, less strategic
- If the LLM call fails for any reason, the bot automatically falls back to random and is still marked ready — the game never stalls

### Bot context (what the LLM sees each turn)
- Current game state: turn, turns remaining, Fed rate, LTV limit, mortgage rate
- All properties: price, monthly rent, cap rate
- Own holdings: tokens held, avg purchase price, unrealised P&L, rent received
- Active mortgages: balance, rate, type, monthly payment, arrears status
- Active macro events
- Recent feed (last turn's events)

---

## Autonomous mode

Autonomous mode lets a game run to completion without any human input. The API runs a background asyncio loop (polls every 5 seconds) that advances turns automatically on a configurable timer.

### Enable

```bash
# MCP
start_autonomous(game_id, delay_seconds=30)

# CLI
sandbox game autonomous start <game-id> --delay 30

# HTTP
POST /api/sandbox/games/<id>/autonomous
{ "delay_seconds": 30 }
```

### Disable (pause)

```bash
stop_autonomous(game_id)
DELETE /api/sandbox/games/<id>/autonomous
```

### How it works

1. Background loop checks every 5 seconds for games with `auto_advance = True` and `status = trading|lobby`
2. For each such game, checks if `elapsed_seconds_since_last_turn >= auto_advance_delay_seconds`
3. If yes: runs `advance_turn()`, then `run_all_bots()` for all bot players
4. When the game reaches `status = completed`, `auto_advance` is automatically set to `False`

### Minimum delay

5 seconds (`SANDBOX_AUTO_ADVANCE_DELAY` env var sets the global default; individual games override with `delay_seconds`). With bot LLM calls, each turn takes ~2–5 seconds — set delay to at least 10–15 seconds in practice.

### Fully autonomous agent workflow

The complete hands-free flow from a single agent conversation:

```
create_game(
  name="AI Tournament",
  display_name="Observer",
  max_turns=12,
  bots=[
    {display_name: "Momentum Mike", strategy: "momentum"},
    {display_name: "Safe Sally",    strategy: "conservative"},
    {display_name: "Leveraged Leo", strategy: "aggressive"}
  ]
)
→ game_id, invite_code

start_autonomous(game_id, delay_seconds=30)
→ "Turns will advance every 30s until turn 12"

# Watch it play out:
get_feed(game_id)        # events every ~30s
get_game(game_id)        # current_turn, status
get_leaderboard(game_id) # live NAV rankings

# After ~6 minutes (12 turns × 30s):
game.status == "completed"
get_leaderboard(game_id) # final standings
```

---

## All configurable settings

Every setting below can be passed to `create_game`. All have sane defaults — you only need to set what you want to change.

### Game length

| Field | Default | Description |
|---|---|---|
| `max_turns` | 12 | Number of turns before game ends (3–50). One turn = one month. |
| `starting_balance_usdc` | 100,000 | Starting tUSDC per player. |

### Leverage and mortgage rules

| Field | Default | Description |
|---|---|---|
| `ltv_limit` | 0.70 | Maximum loan-to-value ratio (0.10–0.95). Applies to acquisitions, refis, and HELOC credit limits. |
| `default_rate_type` | `"fixed"` | Default mortgage rate type for new originations: `"fixed"` or `"arm"`. |
| `amortizing` | false | If true, principal pays down each turn (standard PMT, 30-year term). Default is interest-only. |
| `base_mortgage_rate` | — | Override starting mortgage rate (annual). Default is derived from `fed_rate_current + fed_mortgage_spread`. |
| `arm_spread` | 0.005 | Unused directly — ARM adjusts with Fed moves, clamped by `arm_cap`. |
| `arm_cap` | 0.03 | Maximum ARM drift from origination rate in either direction (300 bps lifetime cap). |
| `closing_cost_pct` | 0.02 | Closing costs as a fraction of loan amount, deducted at origination and refi. |
| `heloc_spread` | 0.02 | HELOC rate = `base_mortgage_rate + heloc_spread`. |
| `debt_service_default_penalty` | 0.10 | Forced sale haircut: tokens sell at `current_price × (1 − penalty)`. |

### Federal Reserve cycle

| Field | Default | Description |
|---|---|---|
| `fed_meeting_interval` | 6 | Turns between Fed meetings. 0 = disable Fed entirely. |
| `fed_rate_current` | 0.055 | Starting Fed funds rate (5.5%). |
| `fed_mortgage_spread` | 0.020 | Spread over Fed rate for mortgage pricing (2%). |
| `fed_hike_prob` | 0.30 | Probability of a rate hike at each meeting (30%). |
| `fed_cut_prob` | 0.25 | Probability of a rate cut at each meeting (25%). Hold probability = 1 − hike − cut. |
| `fed_move_magnitude_min` | 0.0025 | Minimum move size (25 bps). |
| `fed_move_magnitude_max` | 0.0050 | Maximum move size (50 bps). |

### Property pool

| Field | Default | Description |
|---|---|---|
| `property_ids` | all active | Restrict the game to specific property IDs from the sandbox pool. |

### Bots (at game creation)

| Field | Description |
|---|---|
| `bots` | Array of `{display_name, strategy?, personality?}` objects. Strategy options: `aggressive`, `conservative`, `balanced`, `momentum`, `income`. |

### Autonomous mode (via `start_autonomous`)

| Field | Default | Description |
|---|---|---|
| `delay_seconds` | 30 | Seconds between automatic turn advances (5–3600). |

### Global server defaults (env vars)

| Env var | Default | Description |
|---|---|---|
| `SANDBOX_STARTING_BALANCE_USDC` | 100000 | Server-wide default starting balance. |
| `SANDBOX_MAX_PLAYERS` | 8 | Maximum players per game (humans + bots). |
| `SANDBOX_DEFAULT_MAX_TURNS` | 12 | Default `max_turns` when not specified. |
| `SANDBOX_AUTO_ADVANCE_DELAY` | 30 | Global default delay for autonomous mode (overridden per-game). |
| `OPENAI_API_KEY` | — | Enables LLM-driven bots. Without this, bots use rule-based random strategy. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for bot decisions. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint (OpenRouter, Azure, Ollama, etc.). |

---

## MCP / agent integration

The `sandbox-cli` package exposes all game actions as an MCP server over stdio, making the game directly playable by AI agents in OpenCode, Claude Code, Cursor, and Windsurf.

### OpenCode (`opencode.json`) — via Node

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rentline-sandbox": {
      "type": "local",
      "command": ["node", "C:/absolute/path/to/sandbox-cli/dist/index.js"],
      "enabled": true,
      "environment": {
        "SANDBOX_API_URL": "http://localhost:6532",
        "SANDBOX_API_KEY": "your-api-key"
      }
    }
  }
}
```

### OpenCode (`opencode.json`) — via Docker

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rentline-sandbox": {
      "type": "local",
      "command": ["docker", "run", "--rm", "-i",
        "-e", "SANDBOX_API_URL=http://host.docker.internal:6532",
        "-e", "SANDBOX_API_KEY=your-api-key",
        "sandbox-cli"
      ],
      "enabled": true
    }
  }
}
```

> `type: "local"` and `command` as an array are required by OpenCode. Use an absolute path for the Node variant. For Docker, `host.docker.internal` resolves to your host machine on Mac/Windows; use `--network host` + `localhost` on Linux.

### Available MCP tools

**Game management**
| Tool | Description |
|---|---|
| `list_games` | List all open game rooms |
| `get_game` | Full game state: players, properties, turn, Fed rate, settings |
| `create_game` | Create a game with full config + optional bots array |
| `join_game` | Join with invite code |
| `mark_ready` | Toggle ready state |
| `advance_turn` | Host: run all 7 engine phases |
| `get_feed` | Event stream: Fed decisions, macro events, rent, price moves, debt service |
| `add_bot` | Add LLM bot to lobby (strategy, personality) |
| `remove_bot` | Remove bot from lobby |
| `start_autonomous` | Enable auto-advance (delay_seconds) |
| `stop_autonomous` | Pause auto-advance |

**Market**
| Tool | Description |
|---|---|
| `list_properties` | All active properties with prices, rent, cap rates |
| `get_fed_history` | FOMC decision log for a game |

**Trading**
| Tool | Description |
|---|---|
| `buy_tokens` | All-cash purchase at current market price |
| `sell_tokens` | Sell tokens back to pool |

**Debt**
| Tool | Description |
|---|---|
| `originate_mortgage` | Leveraged buy: pay down payment, finance the rest |
| `refi_mortgage` | Rate-and-term or cash-out refinance |
| `heloc_draw` | Draw from a HELOC |
| `heloc_repay` | Repay HELOC balance |
| `get_debt` | All active mortgages for a player |

**Portfolio / Intel**
| Tool | Description |
|---|---|
| `get_portfolio` | Holdings, P&L, NAV, leverage ratio |
| `get_leaderboard` | Game or global leaderboard ranked by NAV |

See [`sandbox-cli/README.md`](./sandbox-cli/README.md) for Cursor, Windsurf, and Claude Code setup, full CLI reference, and data type documentation.

---

## Project structure

```
rentline-sandbox/
  sandbox-api/              FastAPI game engine (port 6532)
    app/
      api/routes/
        sandbox.py          All game endpoints
        ws.py               WebSocket (turn events, game state push)
        health.py
      core/
        config.py           All settings (Settings class)
        database.py         SQLAlchemy engine + SessionLocal
        migrations.py       Idempotent ALTER TABLE migrations (runs on startup)
        clerk_auth.py       Clerk JWT middleware
      models/
        sandbox.py          ORM models: SandboxGame, SandboxPlayer, SandboxHolding,
                            SandboxMortgage, SandboxGameProperty, SandboxTurnEvent,
                            SandboxMacroEvent, SandboxFedDecision, SandboxTransaction
      services/
        sandbox_engine.py   Turn state machine (7 phases)
        sandbox_service.py  Game/player/trade/mortgage business logic
        sandbox_bot.py      LLM bot decision engine + random fallback
        sandbox_runner.py   Autonomous mode background loop

  sandbox-web/              Next.js frontend → sandbox.rentline.xyz
    app/
      (game)/               Game UI routes
      settings/             User settings (home page after login)

  sandbox-cli/              CLI + MCP server
    src/
      index.ts              Entry point
      server.ts             MCP server (stdio JSON-RPC)
      tools.ts              All tool definitions
      client.ts             HTTP client + TypeScript types
      commands/             CLI subcommands (auth, game, trade, mortgage, admin)
    dist/                   Compiled output (run npm run build)
```

---

## Quick start

### Docker (all services)

```bash
cp .env.example .env
# Fill in CLERK_SECRET_KEY, CLERK_JWKS_URL, CLERK_ISSUER
# Optionally: OPENAI_API_KEY for LLM-driven bots

# Start API + web
docker compose up --build

# API:  http://localhost:6532
# Web:  http://localhost:3001
# Docs: http://localhost:6532/docs
```

Run CLI commands via Docker (no Node.js needed):
```bash
docker compose build sandbox-cli   # build once

docker compose run --rm sandbox-cli auth login --key <your-api-key>
docker compose run --rm sandbox-cli game list
docker compose run --rm sandbox-cli game create --name "Test" --display-name "Alice"
```

Use as an MCP server via Docker (add to your AI client config):
```bash
docker run --rm -i \
  -e SANDBOX_API_URL=http://host.docker.internal:6532 \
  -e SANDBOX_API_KEY=your-api-key \
  sandbox-cli
```

### Local dev

```bash
cp .env.example .env

# API
cd sandbox-api
uv sync
uv run uvicorn app.main:app --reload --port 6532

# Web (separate terminal)
cd sandbox-web
npm install
npm run dev   # http://localhost:3001

# CLI (separate terminal)
cd sandbox-cli
npm install && npm run build && npm link
sandbox auth login --key <your-api-key>
sandbox game list
```

API docs: `http://localhost:6532/docs`

Migrations run automatically on startup (`app/migrations.py`). To run manually:
```bash
docker compose exec sandbox-api uv run python -c "from app.migrations import run; run()"
```

---

## Deployment

- **API + Web**: `docker compose up --build` on any VPS. Set `ALLOWED_ORIGINS=https://sandbox.rentline.xyz` and `NEXT_PUBLIC_SANDBOX_API_URL=https://api.sandbox.rentline.xyz`.
- **Web (Vercel alternative)**: Point a Vercel project at `sandbox-web/`. Build args: `NEXT_PUBLIC_SANDBOX_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- **DNS**: `sandbox.rentline.xyz` → CNAME `cname.vercel-dns.com` (Vercel) or your VPS IP.
- **Shared auth**: The sandbox shares the same Clerk application as Rentline — users sign in once and both apps recognise the session.
- **Rentline bridge**: Set `RENTLINE_API_URL` + `RENTLINE_SANDBOX_BRIDGE_KEY` to write simulated rent payments into the real Rentline ledger dashboard. Leave blank to disable.
