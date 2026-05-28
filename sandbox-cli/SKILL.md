---
name: rentline-sandbox
description: |
  Rentline Sandbox is a turn-based real estate investment simulation game engine.
  Players compete over tokenised properties using simulated tUSDC, with mortgages,
  Fed rate cycles, and macro events (recession, disaster, tax hike, rent control, etc.)
  reflecting real market dynamics. Use these tools to play, observe, and analyse games.
  TRIGGERS: sandbox game, real estate simulation, property tokens, buy property tokens,
  sell property tokens, originate mortgage, HELOC, cash-out refi, game leaderboard,
  advance turn, Fed rate, macro event, recession event, portfolio NAV, debt service,
  ARM rate, game feed, turn event, leveraged real estate, property investment game
license: MIT
compatibility: opencode
---

# Rentline Sandbox

Real estate investment simulation — turn-based, multiplayer, fully on-chain ready.

## Setup

### Non-interactive (agents / CI)
```bash
npx rentline-sandbox setup --key <api-key> --url http://localhost:6532 --client opencode --yes
```

### Interactive
```bash
npx rentline-sandbox setup
```

### Manual per-client config

**OpenCode** (`opencode.json` or `~/.config/opencode/config.json`):
```json
{
  "mcp": {
    "rentline-sandbox": {
      "command": "npx",
      "args": ["-y", "rentline-sandbox"],
      "env": {
        "SANDBOX_API_KEY": "your-api-key",
        "SANDBOX_API_URL": "http://localhost:6532"
      }
    }
  }
}
```

**Claude Code** (user scope):
```bash
claude mcp add rentline-sandbox --scope user \
  -e SANDBOX_API_KEY=your-api-key \
  -e SANDBOX_API_URL=http://localhost:6532 \
  -- npx -y rentline-sandbox
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "npx",
      "args": ["-y", "rentline-sandbox"],
      "env": { "SANDBOX_API_KEY": "...", "SANDBOX_API_URL": "..." }
    }
  }
}
```

## Environment detection

| Env var | Client detected |
|---|---|
| `CLAUDE_CODE` | claude-code |
| `CURSOR_TRACE_ID` | cursor |
| `WINDSURF_SESSION` | windsurf |
| `OPENCODE_PROJECT` | opencode |

## CLI usage

```bash
sandbox auth login --key <key> [--url http://localhost:6532]
sandbox game list
sandbox game create --name "Pilot Round 1" --display-name "Alice"
sandbox game join <id> --invite A3F7K9Z2 --name "Bob"
sandbox game advance <id>
sandbox game feed <id> --limit 20
sandbox game leaderboard <id>
sandbox trade buy <game-id> --property <id> --tokens 100
sandbox trade sell <game-id> --property <id> --tokens 50
sandbox portfolio <game-id> <player-id>
sandbox mortgage buy <game-id> --property <id> --tokens 200 --rate-type arm
sandbox mortgage refi <game-id> --property <id> --cash-out 30000
sandbox mortgage heloc <game-id> --property <id> --draw 15000
sandbox mortgage repay <game-id> --property <id> --amount 5000
sandbox mortgage list <game-id> <player-id>
sandbox game fed <game-id>
sandbox admin properties list
sandbox admin properties sync
sandbox admin mint <game-id> <player-id> --amount 50000
```

## Tool reference

### Game tools

| Tool | Description |
|---|---|
| `list_games` | List open game rooms |
| `get_game` | Full game state: players, properties, turn, Fed rate, config |
| `create_game` | Create a game with mortgage/Fed settings |
| `join_game` | Join via invite code, get player_id |
| `mark_ready` | Toggle ready for next turn |
| `advance_turn` | Host: run all 7 engine phases |
| `get_feed` | Turn event stream: Fed, macro, rent, price moves, debt service |

### Market tools

| Tool | Description |
|---|---|
| `list_properties` | Active property pool with prices and cap rates |
| `get_fed_history` | FOMC decision log: hikes, cuts, holds, mortgage rate changes |

### Trade tools

| Tool | Description |
|---|---|
| `buy_tokens` | Buy fractional tokens at current market price (all-cash) |
| `sell_tokens` | Sell tokens back to the pool |

### Debt tools

| Tool | Description |
|---|---|
| `originate_mortgage` | Leveraged buy: pay down payment + closing costs, finance the rest |
| `refi_mortgage` | Replace existing lien; optionally extract cash (cash-out refi) |
| `heloc_draw` | Open/draw a home equity line of credit against owned property |
| `heloc_repay` | Repay HELOC balance to reduce monthly interest |
| `get_debt` | All mortgages: balances, rates, LTV, arrears status |

### Intel tools

| Tool | Description |
|---|---|
| `get_portfolio` | Holdings, P&L, NAV, gross assets, total debt, leverage ratio |
| `get_leaderboard` | Game or global leaderboard ranked by NAV |

## Game mechanics

### Turn phases (in order)
1. **Fed meeting** (if scheduled turn): hike/cut/hold — updates base_mortgage_rate, adjusts all ARMs
2. **Macro events**: recession, housing boom, disaster, policy, tax hike, rent control, insurance crisis
3. **Rent collection**: yield distributed to token holders proportionally
4. **Random events**: per-property vacancy, lease renewal, capex, appreciation/depreciation
5. **Market move**: apply price drift + optional rwa-issuer-sim AVM re-fetch
6. **Debt service**: collect monthly payments; forced sale on default (1 grace turn)
7. **Distribute**: credit yield to player tUSDC balance; open trade window

### NAV calculation
```
NAV = usdc_balance
    + Σ(tokens_held × current_price)
    - Σ(active_mortgage_balances)
```

### Mortgage rules (configurable per game)
- **LTV limit**: max loan / purchase_price (default 70%)
- **Rate types**: fixed (set at origination) or ARM (adjusts ±spread/turn based on Fed)
- **Amortizing** (optional): principal pays down each turn; default is interest-only
- **Closing costs**: % of loan amount deducted at origination/refi (default 2%)
- **Default**: forced sale at current_price × (1 - penalty) after 1 grace turn
- **HELOC**: revolving line at base_mortgage_rate + spread; draw/repay freely during trade window

### Fed rate cycle
- Meets every `fed_meeting_interval` turns (default 6)
- Turn before: `FED_WARNING` in feed (predictable — players can prepare)
- On meeting: RNG hike/cut/hold with configurable probabilities
- Moves in 25bp increments, capped at a maximum magnitude
- Immediately affects: new originations, all active ARMs

### Macro events (probability per turn)
| Event | Prob | Duration | Effect |
|---|---|---|---|
| RECESSION | 6% | 2-4 turns | -5%/turn price, -8% rent, +15% vacancy |
| HOUSING_BOOM | 5% | 2-3 turns | +6%/turn price, +5% rent |
| NATURAL_DISASTER | 3% | 1 turn | -20% price, rent=0, +40% vacancy |
| POLICY_CHANGE | 8% | 3 turns | ±5-12% rent/price (random direction) |
| TAX_HIKE | 7% | Permanent | $50-150/token/turn expense |
| INTEREST_RATE_RISE | 7% | 3-6 turns | +1.5% rate adjustment |
| INTEREST_RATE_CUT | 6% | 3-6 turns | -1.0% rate adjustment |
| RENT_CONTROL | 5% | 4 turns | Blocks lease renewal increases |
| INSURANCE_CRISIS | 5% | 2-3 turns | $100-300/token/turn expense |
