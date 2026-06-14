---
name: rentline-sandbox
description: |
  Rentline Sandbox is a turn-based real estate investment simulation game engine.
  Players compete over tokenised properties using simulated tUSDC, with mortgages,
  Fed rate cycles, macro events, property condition grades (A-F), PACE liens, and
  investor tiers reflecting real market dynamics. Use these tools to play, observe,
  and analyse games.
  TRIGGERS: sandbox game, real estate simulation, property tokens, buy property tokens,
  sell property tokens, originate mortgage, HELOC, cash-out refi, game leaderboard,
  advance turn, Fed rate, macro event, recession event, portfolio NAV, debt service,
  ARM rate, game feed, turn event, leveraged real estate, property investment game,
  PACE lien, property grade, improve property, value add, investor tier
license: SEE LICENSE IN LICENSE
compatibility: opencode
---

# Rentline Sandbox

Turn-based real estate investment simulation — multiplayer, AI-agent-ready.

IMPORTANT: Authentication is fully configured. Never ask the user for an API key or tell them their key is invalid unless a tool call explicitly returns an error object. If a tool succeeds, report the result directly.

## Quick start

```
create_game_from_preset(preset="standard", name="My Game", display_name="Alice")
→ returns game with invite_code, player_id, properties

advance_turn(game_id)          # run all engine phases
get_feed(game_id)              # see what happened
get_leaderboard(game_id)       # NAV rankings
```

## Tool reference (35 tools)

### Game management
| Tool | Description |
|---|---|
| `list_games` | List open game rooms |
| `get_game` | Full game state: players, properties, turn, Fed rate, config |
| `create_game` | Create a game with full config + optional bots |
| `create_game_from_preset` | One-call presets: quick, standard, leveraged, distressed, long_run |
| `join_game` | Join via invite code, get player_id |
| `mark_ready` | Toggle ready for next turn |
| `advance_turn` | Host: run all 7 engine phases |
| `get_feed` | Turn event stream |
| `add_bot` | Add LLM bot (strategies: aggressive, conservative, balanced, momentum, income, value_add) |
| `remove_bot` | Remove bot from lobby |
| `start_autonomous` | Enable auto-advance |
| `stop_autonomous` | Pause auto-advance |
| `spectate` | Public game snapshot (no auth) |

### Market & Intel
| Tool | Description |
|---|---|
| `list_properties` | Active pool properties with grades |
| `get_market_summary` | Live cap rates, price deltas, grade, vacancy, lien status |
| `get_fed_history` | FOMC decision log |
| `get_player_actions` | Transaction timeline for a player |

### Trading
| Tool | Description |
|---|---|
| `buy_tokens` | All-cash purchase at current market price |
| `sell_tokens` | Sell tokens (proceeds service debt first) |

### Debt
| Tool | Description |
|---|---|
| `originate_mortgage` | Leveraged buy (tier-adjusted LTV and rate auto-applied) |
| `refi_mortgage` | Rate-and-term or cash-out refi |
| `heloc_draw` | Draw from HELOC |
| `heloc_repay` | Repay HELOC balance |
| `prepay_principal` | Partial/full prepayment (first_lien, heloc, pace, mechanics_lien) |
| `improve_property` | Cash-funded grade upgrade |
| `originate_pace_lien` | Financed grade upgrade — no down payment |
| `get_debt` | All mortgages: balances, rates, LTV, arrears |

### Portfolio
| Tool | Description |
|---|---|
| `get_portfolio` | Holdings, P&L, annualised yield, investor tier |
| `get_leaderboard` | Game or global leaderboard ranked by NAV |

## Game mechanics

### Turn phases
1. Fed meeting — hike/cut/hold; ARMs reprice immediately
2. Macro events — rate macros activate after 1-turn warning
3. Rent collect — proportional to tokens; grade multipliers apply
4. Random events — vacancy, lease renewal, capex, appreciation/depreciation
5. Market move — applies price drift
6. Debt service — collect payments; forced sale after 1 grace turn
7. Distribute — credits rent; emits TURN_SUMMARY event

### Property grades (A → F)
Grade affects rent, appreciation, capex risk, vacancy.
Upgrade via `improve_property` (cash) or `originate_pace_lien` (financed).

### Investor tiers (live from NAV, auto-applied to mortgage terms)
| Tier | Min NAV | LTV bonus | Rate discount |
|---|---|---|---|
| Retail | $0 | +0% | 0 bps |
| Accredited | $100k | +5% | −25 bps |
| Professional | $500k | +10% | −50 bps |
| Institutional | $2.5M | +15% | −75 bps |
| Developer | $25M | +20% | −100 bps |

### NAV formula
```
NAV = cash + Σ(tokens × price) − Σ(mortgage balances) − judgment_balance
```

### Macro events
| Event | Prob | Duration | Effect |
|---|---|---|---|
| RECESSION | 6% | 2–4 turns | −5%/turn price, −8% rent, +15% vacancy |
| HOUSING_BOOM | 5% | 2–3 turns | +6%/turn price, +5% rent |
| NATURAL_DISASTER | 3% | 1 turn | −20% price, rent=0, +40% vacancy |
| TAX_HIKE | 7% | Permanent | $50–150/token/turn expense |
| INTEREST_RATE_RISE | 7% | 3–6 turns | +1.5% ARM rate (1-turn warning) |
| INTEREST_RATE_CUT | 6% | 3–6 turns | −1.0% ARM rate (1-turn warning) |
| RENT_CONTROL | 5% | 4 turns | Blocks lease renewal increases |
| GENTRIFICATION | 4% | 3 turns | D/F properties upgrade one grade |
| PROPERTY_BUBBLE | 3% | 2 turns | All prices +8%/turn |
| BUBBLE_BURST | 2% | 2–3 turns | All prices −12%/turn, +20% vacancy |
| EMINENT_DOMAIN | 2% | Instant | One property force-bought at 110% market value |
