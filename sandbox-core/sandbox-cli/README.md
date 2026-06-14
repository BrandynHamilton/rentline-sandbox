# rentline-sandbox

CLI and MCP server for the [Rentline Sandbox](https://sandbox.rentline.xyz) — a turn-based real estate investment simulation game engine.

Players compete over tokenised properties using mortgages, Fed rate cycles, macro events, property condition grades (A–F), PACE liens, and investor tiers. Playable by humans via the CLI, or fully autonomously by AI agents via the MCP server.

---

## Install

```bash
npm install -g rentline-sandbox
```

Two binaries are installed:
- `sandbox` — human CLI
- `sandbox-mcp` — MCP server for AI agents (stdio JSON-RPC)

Requires Node.js ≥ 18.

---

## Setup

Run once after install. Saves your credentials and automatically configures your AI client:

```bash
sandbox setup
```

The wizard will:
1. Ask for your API key (get one at **sandbox.rentline.xyz/cli-auth**)
2. Verify connectivity to the API
3. Save credentials to `~/.rentline-sandbox/credentials.json`
4. Detect your AI client (Claude Code, Cursor, Windsurf, OpenCode) and patch its MCP config
5. Install `SKILL.md` so your agent understands the game

**Non-interactive:**
```bash
sandbox setup --key sb_xxx --client opencode --yes
```

Supported clients: `claude-code`, `claude-desktop`, `cursor`, `windsurf`, `opencode`, `zed`, `cline`

After setup, **restart your AI client** to load the MCP server.

---

## Authentication

### Browser login (recommended)
```bash
sandbox auth login
# Opens sandbox.rentline.xyz/cli-auth in your browser
# Sign in, copy the generated sb_ key, paste it back
```

### Direct key
```bash
sandbox auth login --key sb_xxxx --url https://sandbox-api.rentline.xyz
```

### Check status
```bash
sandbox auth whoami   # shows key prefix, API URL, and connectivity
sandbox auth logout   # remove saved credentials
```

Credentials are saved to `~/.rentline-sandbox/credentials.json` and used automatically by all CLI commands.

---

## CLI usage

### Game management
```bash
sandbox game list
sandbox game get <game-id>
sandbox game create --name "Test" --display-name "Alice"
sandbox game create --preset standard --name "Quick Match" --display-name "Alice"
sandbox game join <game-id> --invite <code> --display-name "Bob"
sandbox game ready <game-id>
sandbox game advance <game-id>
sandbox game feed <game-id> [--turn 3] [--limit 50]
sandbox game leaderboard <game-id>
sandbox game fed <game-id>
sandbox game add-bot <game-id> --name "AggroBot" --strategy aggressive
sandbox game autonomous start <game-id> --delay 30
sandbox game autonomous stop <game-id>
```

### Trading
```bash
sandbox trade buy <game-id> --property <id> --tokens 0.5
sandbox trade sell <game-id> --property <id> --tokens 0.5
```

### Portfolio and debt
```bash
sandbox portfolio <game-id> <player-id>
sandbox debt <game-id> <player-id>
```

### Mortgage
```bash
sandbox mortgage buy <game-id> --property <id> --tokens 0.5
sandbox mortgage refi <game-id> --property <id> [--cash-out 5000]
sandbox mortgage heloc <game-id> --property <id> --draw 5000
sandbox mortgage repay <game-id> --property <id> --amount 2000
sandbox mortgage prepay <game-id> --property <id> --amount 10000 [--type first_lien]
sandbox mortgage improve <game-id> --property <id> --grade B
sandbox mortgage pace <game-id> --property <id> --grade C
sandbox mortgage list <game-id> <player-id>
```

### Admin
```bash
sandbox admin properties list
sandbox admin properties sync
sandbox admin mint <game-id> <player-id> --amount 50000
```

---

## MCP server setup

The `sandbox-mcp` command runs an MCP server over stdio JSON-RPC. Configure it once in your AI client.

### OpenCode (`opencode.json`)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rentline-sandbox": {
      "type": "local",
      "command": ["sandbox-mcp"],
      "enabled": true,
      "environment": {
        "SANDBOX_API_URL": "https://sandbox-api.rentline.xyz",
        "SANDBOX_API_KEY": "sb_your_key_here"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "sandbox-mcp",
      "env": {
        "SANDBOX_API_URL": "https://sandbox-api.rentline.xyz",
        "SANDBOX_API_KEY": "sb_your_key_here"
      }
    }
  }
}
```

### Cursor / Windsurf
```json
{
  "mcpServers": {
    "rentline-sandbox": {
      "command": "sandbox-mcp",
      "env": {
        "SANDBOX_API_URL": "https://sandbox-api.rentline.xyz",
        "SANDBOX_API_KEY": "sb_your_key_here"
      }
    }
  }
}
```

---

## MCP tools (35 total)

### Game management
| Tool | Description |
|---|---|
| `list_games` | All open game rooms |
| `get_game` | Full game state: players, properties, turn, Fed rate, settings |
| `create_game` | Create with full config + optional bots array |
| `create_game_from_preset` | One-call presets: `quick` `standard` `leveraged` `distressed` `long_run` |
| `join_game` | Join with invite code |
| `mark_ready` | Toggle ready state |
| `advance_turn` | Run all engine phases (host only) |
| `get_feed` | Event stream: Fed, macro, rent, price moves, debt service, turn summary |
| `add_bot` | Add LLM bot (strategies: `aggressive` `conservative` `balanced` `momentum` `income` `value_add`) |
| `remove_bot` | Remove bot from lobby |
| `start_autonomous` | Enable auto-advance (advances on all-ready or turn deadline) |
| `stop_autonomous` | Pause auto-advance |
| `set_delegate` | Agent delegation for idle human players |
| `spectate` | Public game snapshot (no auth) |

### Market & Intel
| Tool | Description |
|---|---|
| `list_properties` | Active pool properties with grades |
| `get_market_summary` | Live cap rates, price deltas, grade, vacancy, mechanics lien status |
| `get_fed_history` | FOMC decision log |
| `get_player_actions` | Transaction timeline for a player |

### Trading
| Tool | Description |
|---|---|
| `buy_tokens` | All-cash purchase at current market price |
| `sell_tokens` | Sell (proceeds service mechanics lien → first lien → HELOC/PACE before cash) |

### Debt
| Tool | Description |
|---|---|
| `originate_mortgage` | Leveraged buy (tier-adjusted LTV and rate auto-applied) |
| `refi_mortgage` | Rate-and-term or cash-out refi |
| `heloc_draw` | Draw from HELOC |
| `heloc_repay` | Repay HELOC balance |
| `prepay_principal` | Partial/full prepayment (first_lien, heloc, pace, mechanics_lien) |
| `improve_property` | Cash-funded grade upgrade (cost = steps × 8% × price) |
| `originate_pace_lien` | Financed grade upgrade — no down payment (rate = base + 1.5%) |
| `get_debt` | All active mortgages: balance, rate, LTV, arrears |

### Portfolio
| Tool | Description |
|---|---|
| `get_portfolio` | Holdings with grade, P&L, annualised yield, turns held, investor tier |
| `get_leaderboard` | Game leaderboard or global all-time rankings |

---

## Game mechanics summary

### Turn phases (in order)
1. **Fed meeting** — hike/cut/hold; `FED_WARNING` fires 1 turn before; ARMs reprice immediately
2. **Macro events** — rate macros activate after 1-turn warning; active macros tick down
3. **Rent collect** — proportional to tokens held; grade multipliers applied; vacancy blocks
4. **Random events** — vacancy, lease renewal, capex, appreciation/depreciation (all grade-adjusted)
5. **Market move** — applies price drift
6. **Debt service** — collect payments; forced sale after 1 grace turn
7. **Distribute** — credits rent; emits `TURN_SUMMARY` event

### Property grades (A → F)
Grade affects rent multiplier, appreciation probability, capex risk, and vacancy rate. Upgrade mid-game with `improve_property` (cash) or `originate_pace_lien` (financed). The `GENTRIFICATION` macro can upgrade D/F properties automatically.

### Investor tiers
Computed live from NAV — automatically applied to every mortgage origination and refi:

| Tier | Min NAV | LTV bonus | Rate discount |
|---|---|---|---|
| Retail | $0 | +0% | 0 bps |
| Accredited | $100k | +5% | −25 bps |
| Professional | $500k | +10% | −50 bps |
| Institutional | $2.5M | +15% | −75 bps |
| Developer | $25M | +20% | −100 bps |

### NAV formula
```
NAV = cash + Σ(tokens × price) − Σ(active mortgage balances) − judgment_balance
```

---

## Configuration

| Env var | Description |
|---|---|
| `SANDBOX_API_URL` | API base URL (default: `https://sandbox-api.rentline.xyz`) |
| `SANDBOX_API_KEY` | Your `sb_` key (MCP server only — CLI uses credentials file) |

---

## Development

```bash
npm install
npm run build        # compile TypeScript → dist/
npm run dev          # watch mode
node dist/index.js game list   # test without npm link
```

### Project structure
```
src/
  index.ts        CLI entry point
  server.ts       MCP server (35 tools, stdio JSON-RPC)
  tools.ts        Tool definitions + input schemas
  client.ts       Typed HTTP client
  config.ts       Credential persistence
  commands/       auth, game, trade, mortgage, admin
dist/             Compiled output
SKILL.md          MCP skill manifest
llms.txt          Condensed reference for LLM context windows
```

### Adding a new tool
1. Add a `ToolDef` in `src/tools.ts`
2. Add a `case` in the `switch` in `src/server.ts`
3. Add the client method in `src/client.ts`
4. `npm run build`

---

## Links

- Web app: [sandbox.rentline.xyz](https://sandbox.rentline.xyz)
- API docs: [sandbox-api.rentline.xyz/docs](https://sandbox-api.rentline.xyz/docs)
- Get an API key: [sandbox.rentline.xyz/cli-auth](https://sandbox.rentline.xyz/cli-auth)
- Source: [github.com/BrandynHamilton/rentline-sandbox](https://github.com/BrandynHamilton/rentline-sandbox)


---
