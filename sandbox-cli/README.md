# sandbox-cli

CLI and MCP server for the Rentline Sandbox real estate simulation game.

Exposes all 18 game actions as an [MCP](https://modelcontextprotocol.io) server over stdio, so AI agents in OpenCode, Claude Code, Cursor, and Windsurf can play, observe, and analyse games directly. Also ships a full terminal CLI for humans.

---

## Contents

- [Installation](#installation)
- [MCP server setup](#mcp-server-setup)
- [CLI usage](#cli-usage)
- [Tool reference](#tool-reference)
- [Game mechanics](#game-mechanics)
- [Data types](#data-types)
- [Configuration](#configuration)
- [Development](#development)

---

## Installation

### Docker (recommended — no Node.js required)

```bash
# Build the image once from the repo root
docker compose build sandbox-cli

# Or build directly
docker build -t sandbox-cli ./sandbox-cli
```

Run CLI commands:
```bash
docker run --rm -it \
  -e SANDBOX_API_URL=http://host.docker.internal:6532 \
  -e SANDBOX_API_KEY=your-api-key \
  sandbox-cli game list
```

Run as MCP stdio server:
```bash
docker run --rm -i \
  -e SANDBOX_API_URL=http://host.docker.internal:6532 \
  -e SANDBOX_API_KEY=your-api-key \
  sandbox-cli
```

> **`host.docker.internal`** resolves to your host machine from inside a container on Docker Desktop (Mac/Windows). On Linux use `--network host` and `http://localhost:6532` instead.

### From source (this repo)

```bash
cd sandbox-cli
npm install
npm run build
```

This compiles TypeScript to `dist/`. The entry point is `dist/index.js`.

To use the `sandbox` command globally from any terminal:

```bash
npm link
```

To invoke without linking, use `node dist/index.js` directly (e.g. `node dist/index.js game list`).

### From npm (once published)

```bash
npm install -g rentline-sandbox
# or use without installing:
npx rentline-sandbox
```

---

## MCP server setup

The MCP server communicates over stdio JSON-RPC. Configure it in your AI client once and it will be available in every session.

**Important:** The server process must stay alive — do not wrap the command in a shell that exits immediately. Use `node <path>` or `docker run -i` directly.

### OpenCode

Add to `opencode.json` in your project root (recommended) or `~/.config/opencode/config.json` (global):

**Via Node (from source):**
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

**Via Docker:**
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

> **`type` and `command` as an array are required.** OpenCode's schema does not accept the `command`/`args`/`env` format used by other clients.
>
> **Use an absolute path** for the Node variant. OpenCode runs from a varying working directory, so relative paths will fail.
>
> **Windows paths:** Use either forward slashes (`C:/path/...`) or escaped backslashes (`C:\\path\\...`).

Verify the server connected:

```bash
opencode mcp list
```

### Claude Code

**Via Node:**
```bash
claude mcp add rentline-sandbox --scope user \
  -e SANDBOX_API_KEY=your-api-key \
  -e SANDBOX_API_URL=http://localhost:6532 \
  -- node /absolute/path/to/sandbox-cli/dist/index.js
```

**Via Docker:**
```bash
claude mcp add rentline-sandbox --scope user \
  -- docker run --rm -i \
    -e SANDBOX_API_URL=http://host.docker.internal:6532 \
    -e SANDBOX_API_KEY=your-api-key \
    sandbox-cli
```

### Cursor (`.cursor/mcp.json`)

**Via Node:**
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "node",
      "args": ["/absolute/path/to/sandbox-cli/dist/index.js"],
      "env": {
        "SANDBOX_API_KEY": "your-api-key",
        "SANDBOX_API_URL": "http://localhost:6532"
      }
    }
  }
}
```

**Via Docker:**
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "SANDBOX_API_URL=http://host.docker.internal:6532",
        "-e", "SANDBOX_API_KEY=your-api-key",
        "sandbox-cli"
      ]
    }
  }
}
```

### Windsurf (`~/.codeium/windsurf/mcp_config.json`)

**Via Node:**
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "node",
      "args": ["/absolute/path/to/sandbox-cli/dist/index.js"],
      "env": {
        "SANDBOX_API_KEY": "your-api-key",
        "SANDBOX_API_URL": "http://localhost:6532"
      }
    }
  }
}
```

**Via Docker:**
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "SANDBOX_API_URL=http://host.docker.internal:6532",
        "-e", "SANDBOX_API_KEY=your-api-key",
        "sandbox-cli"
      ]
    }
  }
}
```

### Docker networking note

| Host OS | `SANDBOX_API_URL` value |
|---|---|
| Mac / Windows (Docker Desktop) | `http://host.docker.internal:6532` |
| Linux | `http://localhost:6532` with `--network host` added to `docker run` |
| API also in Docker Compose | `http://sandbox-api:6532` with `--network rentline-sandbox_default` added |

---

## CLI usage

All commands read saved credentials from `~/.rentline-sandbox/credentials.json`. Authenticate once with `auth login`, then every other command picks it up automatically. You can always override with `--url` and `--api-key` flags on any command.

If you ran `npm link` (or installed globally), use `sandbox <command>`. Otherwise substitute `node dist/index.js` for `sandbox`.

**Via Docker**, prefix any command with:
```bash
docker run --rm -it \
  -e SANDBOX_API_URL=http://host.docker.internal:6532 \
  -e SANDBOX_API_KEY=your-api-key \
  sandbox-cli <command>
```

For brevity, the examples below use `sandbox <command>`. All work identically via Docker.

### Auth

```bash
# Save credentials (verifies connectivity on save)
sandbox auth login --key <api-key> [--url http://localhost:6532] [--name "Alice"]

# Show current credentials and test connectivity
sandbox auth whoami

# Remove saved credentials
sandbox auth logout
```

### Game management

```bash
# List all open game rooms
sandbox game list

# Show full game state (players, properties, turn, Fed rate, config)
sandbox game get <game-id>

# Create a new game — you become the host
sandbox game create \
  --name "Round 1" \
  --display-name "Alice" \
  [--max-turns 12] \
  [--balance 100000] \
  [--ltv 0.70] \
  [--rate-type fixed|arm] \
  [--amortizing] \
  [--fed-interval 6] \
  [--fed-rate 0.055]

# Join a game using the host's invite code
sandbox game join <game-id> --invite A3F7K9Z2 --name "Bob"

# Toggle your ready state
sandbox game ready <game-id>

# Advance one turn (host only — runs all 7 engine phases)
sandbox game advance <game-id>

# Stream turn events (Fed, macro, rent, price moves, debt service, defaults)
sandbox game feed <game-id> [--turn 3] [--limit 50]

# Leaderboard ranked by NAV
sandbox game leaderboard <game-id>

# Fed rate decision log for a game
sandbox game fed <game-id>
```

### Trading

```bash
# All-cash token purchase at current market price
sandbox trade buy <game-id> --property <property-id> --tokens 100

# Sell tokens back to the pool
sandbox trade sell <game-id> --property <property-id> --tokens 50
```

### Portfolio

```bash
# Full portfolio: holdings, P&L, NAV, gross assets, total debt, leverage ratio
sandbox portfolio <game-id> <player-id>
```

### Mortgage and debt

```bash
# Leveraged buy — pays down payment + closing costs, finances the rest
sandbox mortgage buy <game-id> \
  --property <property-id> \
  --tokens 200 \
  [--rate-type arm]

# Refinance existing first lien (rate-and-term or cash-out)
sandbox mortgage refi <game-id> \
  --property <property-id> \
  [--cash-out 30000] \
  [--rate-type fixed]

# Draw from a HELOC against owned property
sandbox mortgage heloc <game-id> --property <property-id> --draw 15000

# Repay HELOC balance
sandbox mortgage repay <game-id> --property <property-id> --amount 5000

# List all mortgages for a player
sandbox mortgage list <game-id> <player-id>
```

### Admin

```bash
# List all properties in the sandbox pool
sandbox admin properties list

# Sync properties from the upstream RWA data source
sandbox admin properties sync

# Mint tUSDC into a player's balance (admin key required)
sandbox admin mint <game-id> <player-id> --amount 50000
```

---

## Tool reference

These are the MCP tools exposed to agents. All tools require `game_id`; most debt and portfolio tools also require `player_id` (returned from `join_game` or visible in `get_game`).

### Game tools

| Tool | Required params | Description |
|---|---|---|
| `list_games` | — | List all open game rooms with status, turn, and player count |
| `get_game` | `game_id` | Full game state: players, property pool, current turn, Fed rate, LTV limit, config |
| `create_game` | `name`, `display_name` | Create a game room; returns `invite_code` to share with other players |
| `join_game` | `game_id`, `invite_code`, `display_name` | Join an open room; returns your `player_id` |
| `mark_ready` | `game_id` | Toggle ready state; host can advance once all players are ready |
| `advance_turn` | `game_id` | Host: run all 7 engine phases and open the trade window |
| `get_feed` | `game_id` | Turn event stream: Fed decisions, macro events, rent, price moves, debt service, defaults |

**`create_game` optional params:**

| Param | Default | Description |
|---|---|---|
| `max_turns` | 12 | Number of turns before game ends (3–50) |
| `starting_balance_usdc` | 100000 | Starting tUSDC per player |
| `ltv_limit` | 0.70 | Max loan-to-value ratio (0.0–0.95) |
| `default_rate_type` | `"fixed"` | Default mortgage rate type: `"fixed"` or `"arm"` |
| `amortizing` | false | If true, principal pays down each turn; default is interest-only |
| `fed_meeting_interval` | 6 | Fed meets every N turns; 0 to disable |
| `fed_rate_current` | 0.055 | Starting Fed funds rate (5.5%) |
| `property_ids` | all active | Restrict the property pool to specific IDs |

### Market tools

| Tool | Required params | Description |
|---|---|---|
| `list_properties` | — | All active properties with prices, monthly rent, and cap rates |
| `get_fed_history` | `game_id` | FOMC decision log: outcome, bps move, rate before/after, mortgage rate change, statement text |

### Trade tools

| Tool | Required params | Description |
|---|---|---|
| `buy_tokens` | `game_id`, `property_id`, `tokens` | All-cash purchase at current market price; game must be in `trading` status |
| `sell_tokens` | `game_id`, `property_id`, `tokens` | Sell tokens back to pool at current market price |

### Debt tools

| Tool | Required params | Description |
|---|---|---|
| `originate_mortgage` | `game_id`, `property_id`, `tokens_to_buy` | Leveraged buy: you pay down payment + closing costs, the rest is financed up to LTV limit |
| `refi_mortgage` | `game_id`, `property_id` | Replace first lien; `cash_out_amount=0` for rate-and-term, `>0` for cash-out (net of closing costs) |
| `heloc_draw` | `game_id`, `property_id`, `draw_amount` | Draw from a HELOC; opens a new line if none exists; credit limit = (price × LTV) − first lien |
| `heloc_repay` | `game_id`, `property_id`, `repay_amount` | Repay HELOC balance to reduce outstanding balance and monthly interest |
| `get_debt` | `game_id`, `player_id` | All mortgages: type, balance, rate, monthly payment, LTV, arrears status |

### Intel tools

| Tool | Required params | Description |
|---|---|---|
| `get_portfolio` | `game_id`, `player_id` | Holdings with P&L, unrealised gains, total yield, cash balance, total debt, NAV, leverage ratio |
| `get_leaderboard` | — | Game leaderboard (pass `game_id`) or all-time global leaderboard (omit `game_id`) |

---

## Game mechanics

### Turn phases (executed in order)

1. **Fed meeting** — fires on scheduled turns (`fed_meeting_interval`). RNG outcome: hike / cut / hold in 25 bp increments. Updates `base_mortgage_rate` and adjusts all active ARMs immediately. A `FED_WARNING` event appears in the feed on the turn *before* a meeting so players can prepare.
2. **Macro events** — probabilistic events that affect rent, prices, and costs across properties for a duration of turns (see table below).
3. **Rent collection** — yield distributed to token holders proportionally to their share of each property's supply.
4. **Random events** — per-property stochastic events: vacancy spikes, lease renewals, capex surprises, appreciation and depreciation.
5. **Market move** — applies price drift from macro and random events; optionally re-fetches AVM data from the upstream RWA issuer.
6. **Debt service** — collects monthly payments from each mortgaged player. Players with insufficient cash enter arrears; after 1 grace turn a forced sale is triggered at `current_price × (1 − default_penalty)`.
7. **Distribute** — credits rent yield to player tUSDC balances and opens the trade window for the turn.

### NAV formula

```
NAV = usdc_balance
    + Σ(tokens_held × current_price_usd)
    − Σ(active_mortgage_balances)
```

The leaderboard ranks players by NAV. A player with a high-leverage position can be overtaken quickly by a price drop.

### Mortgage rules

| Rule | Default | Notes |
|---|---|---|
| LTV limit | 70% | `loan / purchase_price ≤ ltv_limit`; configurable per game |
| Closing costs | 2% of loan | Deducted at origination and refi from proceeds/balance |
| Rate types | fixed or ARM | Fixed locks at origination rate; ARM adjusts each Fed meeting |
| Amortizing | false (interest-only) | Enable per game to have principal pay down each turn |
| Grace turns | 1 | One turn of arrears before forced sale |
| Default penalty | ~5% | Forced sale executes at a discount to current price |
| HELOC credit limit | (price × LTV) − first lien | Revolving line; draw and repay freely during the trade window |

### Fed rate cycle

- Meets every `fed_meeting_interval` turns (default: every 6 turns)
- Outcomes are probabilistic: hike, cut, or hold
- All moves are in 25 bp increments, subject to a per-game maximum magnitude
- `base_mortgage_rate` = `fed_rate_current` + spread (set at game creation)
- ARM mortgages reprice immediately on the turn of the Fed meeting
- `FED_WARNING` event fires in the feed one turn before each meeting

### Macro events

| Event | Prob/turn | Duration | Effect |
|---|---|---|---|
| `RECESSION` | 6% | 2–4 turns | −5%/turn price, −8% rent, +15% vacancy |
| `HOUSING_BOOM` | 5% | 2–3 turns | +6%/turn price, +5% rent |
| `NATURAL_DISASTER` | 3% | 1 turn | −20% price, rent = 0, +40% vacancy |
| `POLICY_CHANGE` | 8% | 3 turns | ±5–12% rent and price (random direction) |
| `TAX_HIKE` | 7% | Permanent | $50–150/token/turn expense against yield |
| `INTEREST_RATE_RISE` | 7% | 3–6 turns | +1.5% rate adjustment on new originations |
| `INTEREST_RATE_CUT` | 6% | 3–6 turns | −1.0% rate adjustment on new originations |
| `RENT_CONTROL` | 5% | 4 turns | Blocks lease renewal rent increases |
| `INSURANCE_CRISIS` | 5% | 2–3 turns | $100–300/token/turn expense against yield |

Multiple macro events can be active simultaneously. Check `get_feed` after each `advance_turn` to see what fired.

---

## Data types

Key response shapes returned by the API and MCP tools.

### `Game`

```ts
{
  id: string
  name: string
  status: "lobby" | "trading" | "advancing" | "finished"
  current_turn: number
  max_turns: number
  invite_code: string       // share with other players to join
  player_count: number
  created_by: string
  started_at: string | null
  ended_at: string | null
  created_at: string
}
```

### `GameFull` (extends `Game`)

```ts
{
  players: Player[]
  properties: GameProperty[]
  starting_balance_usdc: number
  ltv_limit: number
  base_mortgage_rate: number
  fed_rate_current: number
  fed_meeting_interval: number
}
```

### `Player`

```ts
{
  id: string              // player_id — use this for portfolio/debt queries
  clerk_user_id: string
  display_name: string
  usdc_balance: number
  is_ready: boolean
  is_host: boolean
}
```

### `Portfolio`

```ts
{
  player_id: string
  display_name: string
  usdc_balance: number
  holdings: Holding[]
  nav: number
  gross_asset_value: number
  total_debt: number
  leverage_ratio: number    // gross_asset_value / nav
}
```

### `Holding`

```ts
{
  property_id: string
  property_name: string | null
  tokens_held: number
  avg_purchase_price_usd: number | null
  current_price_usd: number
  current_value_usd: number
  unrealized_pnl_usd: number
  total_rent_received_usd: number
}
```

### `Mortgage`

```ts
{
  id: string
  mortgage_type: "acquisition" | "refi" | "heloc"
  property_id: string
  status: "active" | "paid_off" | "defaulted"
  current_balance: number
  origination_rate: number
  current_rate: number
  rate_type: "fixed" | "arm"
  monthly_payment: number
  credit_limit: number | null   // HELOC only
  drawn_balance: number | null  // HELOC only
  turns_in_arrears: number
  origination_turn: number
  total_interest_paid: number
  total_principal_paid: number
}
```

### `FeedEvent`

```ts
{
  id: string
  turn: number
  event_type: string          // e.g. "FED_HIKE", "RECESSION", "RENT_COLLECTED", "TRADE", "DEBT_SERVICE"
  property_id: string | null
  player_id: string | null
  description: string
  delta_usdc: number          // cash impact on the player
  delta_pct: number           // price change in percent (property events)
  macro_event_id: string | null
  created_at: string
}
```

---

## Configuration

Credentials are stored in `~/.rentline-sandbox/credentials.json`:

```json
{
  "api_key": "sb_...",
  "api_url": "http://localhost:6532",
  "display_name": "Alice",
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

Every CLI command reads this file automatically. Override per-command with:

```bash
sandbox --url http://other-host:6532 --api-key sb_other game list
```

For the MCP server, credentials come from the `SANDBOX_API_URL` and `SANDBOX_API_KEY` environment variables set in your client's MCP config — the credentials file is not used by the server.

---

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (rebuilds on save)
npm run dev

# Run the MCP server directly (useful for debugging with an MCP inspector)
node dist/index.js

# Run as CLI
node dist/index.js auth login --key sb_...
node dist/index.js game list
```

### Project structure

```
sandbox-cli/
  src/
    index.ts          CLI entry point — dispatches to setup, server, or CLI commands
    server.ts         MCP server: tools, prompts, resources over stdio JSON-RPC
    tools.ts          All 18 MCP tool definitions (name, description, inputSchema)
    client.ts         HTTP client for sandbox-api with full TypeScript types
    config.ts         Credential persistence (~/.rentline-sandbox/credentials.json)
    setup.ts          MCP installer wizard — patches per-client config files
    commands/
      auth.ts         sandbox auth login | logout | whoami
      game.ts         sandbox game list | get | create | join | ready | advance | feed | leaderboard | fed
      trade.ts        sandbox trade buy | sell
      mortgage.ts     sandbox mortgage buy | refi | heloc | repay | list
      admin.ts        sandbox admin properties list | sync | mint
  dist/               Compiled output (gitignored — run npm run build)
  SKILL.md            MCP skill manifest (loaded as a resource by the server)
  llms.txt            Condensed reference for LLM context windows
  tsup.config.ts      Build config (ESM, es2022, source maps)
  tsconfig.json       TypeScript config
  package.json
```

### Adding a new tool

1. Add a `ToolDef` entry to `src/tools.ts` with `name`, `title`, `description`, `category`, and `inputSchema`.
2. Add a `case` to the `switch` in `server.ts:startServer()` that calls the appropriate `client` method.
3. If a new API endpoint is needed, add it to `client.ts` and the relevant command file.
4. Run `npm run build`.
