/**
 * tools.ts — MCP tool definitions for the Rentline Sandbox game
 *
 * Each ToolDef describes one callable MCP tool. The server maps these
 * dynamically to avoid duplicating schema in server.ts.
 *
 * Categories:
 *   GAME    — create, join, advance, read state
 *   MARKET  — properties, prices, feed
 *   TRADE   — buy/sell tokens
 *   DEBT    — mortgage origination, refi, HELOC
 *   INTEL   — portfolio, leaderboard, Fed history
 */

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  category: "game" | "market" | "trade" | "debt" | "intel" | "admin";
  inputSchema: Record<string, unknown>;
}

export const ALL_TOOLS: ToolDef[] = [
  // ── GAME ─────────────────────────────────────────────────────────────────
  {
    name: "list_games",
    title: "List Open Games",
    category: "game",
    description: "List all open sandbox game rooms (status: lobby, trading, or advancing).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_game",
    title: "Get Game State",
    category: "game",
    description: "Get full game state including players, property pool, current turn, Fed rate, and LTV settings.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string", description: "Game ID" } },
      required: ["game_id"],
    },
  },
  {
    name: "create_game",
    title: "Create Game",
    category: "game",
    description:
      "Create a new game room. Configure mortgage rules (LTV, rate type, amortizing), Fed meeting schedule, and starting balance. Returns the game with its invite_code for sharing.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Game room name" },
        display_name: { type: "string", description: "Your display name in this game" },
        max_turns: { type: "integer", description: "Max turns (default 12)", minimum: 3, maximum: 50 },
        starting_balance_usdc: { type: "number", description: "Starting tUSDC per player (default 100000)" },
        ltv_limit: { type: "number", description: "Max loan-to-value ratio 0.0-0.95 (default 0.70)" },
        default_rate_type: { type: "string", enum: ["fixed", "arm"], description: "Default mortgage rate type" },
        amortizing: { type: "boolean", description: "Amortizing mortgages (default: interest-only)" },
        fed_meeting_interval: { type: "integer", description: "Fed meetings every N turns (0=disabled, default 6)" },
        fed_rate_current: { type: "number", description: "Starting Fed funds rate (default 0.055 = 5.5%)" },
        property_ids: { type: "array", items: { type: "string" }, description: "Specific property IDs to include (default: all active)" },
        bots: {
          type: "array",
          description: "Bot players to add at creation. Each item: {display_name, strategy?, personality?}",
          items: {
            type: "object",
            properties: {
              display_name: { type: "string" },
              strategy: { type: "string", enum: ["aggressive", "conservative", "balanced", "momentum", "income"] },
              personality: { type: "string" },
            },
            required: ["display_name"],
          },
        },
        auto_advance: {
          type: "boolean",
          description: "Start autonomous mode immediately after game creation (default false)",
        },
        auto_advance_delay_seconds: {
          type: "integer",
          description: "Seconds between automatic turn advances when auto_advance=true (5–3600, default 30)",
          minimum: 5,
          maximum: 3600,
        },
      },
      required: ["name", "display_name"],
    },
  },
  {
    name: "join_game",
    title: "Join Game",
    category: "game",
    description: "Join an open game room using an invite code. Returns your player_id.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        invite_code: { type: "string", description: "8-character invite code from the host" },
        display_name: { type: "string", description: "Your display name in this game" },
      },
      required: ["game_id", "invite_code", "display_name"],
    },
  },
  {
    name: "mark_ready",
    title: "Mark Ready",
    category: "game",
    description: "Toggle your ready state. When all players are ready, the host can advance the turn.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"],
    },
  },
  {
    name: "advance_turn",
    title: "Advance Turn (Host)",
    category: "game",
    description:
      "Advance the game by one turn. Runs all engine phases: Fed meeting check → macro events → rent collection → random events → market move → debt service → distribute yield → open trade window. Host only.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"],
    },
  },
  {
    name: "get_feed",
    title: "Get Turn Feed",
    category: "game",
    description:
      "Get the event feed for a game. Shows Fed decisions, macro events (recession, disaster, tax hike, etc.), rent payments, price moves, debt service, and defaults. Optionally filter by turn.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        turn: { type: "integer", description: "Filter by turn number (optional)" },
        limit: { type: "integer", description: "Max events to return (default 30)", maximum: 200 },
      },
      required: ["game_id"],
    },
  },

  // ── MARKET ───────────────────────────────────────────────────────────────
  {
    name: "list_properties",
    title: "List Property Pool",
    category: "market",
    description: "List all active properties in the sandbox pool with prices, rents, and cap rates.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_fed_history",
    title: "Get Fed Decision History",
    category: "market",
    description:
      "Get the FOMC decision history for a game: all rate hikes, cuts, and holds with basis point moves, rate levels, and statement flavour text. Fed meets every N turns on a predictable schedule.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"],
    },
  },

  // ── TRADE ────────────────────────────────────────────────────────────────
  {
    name: "buy_tokens",
    title: "Buy Property Tokens",
    category: "trade",
    description:
      "Buy fractional property tokens at the current market price (all-cash, no mortgage). Game must be in 'trading' status.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string", description: "Property ID from the game pool" },
        tokens: { type: "number", description: "Number of tokens to buy (fractions allowed)", exclusiveMinimum: 0 },
      },
      required: ["game_id", "property_id", "tokens"],
    },
  },
  {
    name: "sell_tokens",
    title: "Sell Property Tokens",
    category: "trade",
    description: "Sell fractional property tokens back to the pool at the current market price.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        tokens: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["game_id", "property_id", "tokens"],
    },
  },

  // ── DEBT ─────────────────────────────────────────────────────────────────
  {
    name: "originate_mortgage",
    title: "Originate Acquisition Mortgage",
    category: "debt",
    description:
      "Buy property tokens using an acquisition mortgage. You pay down_payment + closing_costs in cash; the rest is financed up to the game's LTV limit. Supports fixed-rate and ARM.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        tokens_to_buy: { type: "number", exclusiveMinimum: 0 },
        rate_type: { type: "string", enum: ["fixed", "arm"], description: "Rate type (default: game default)" },
      },
      required: ["game_id", "property_id", "tokens_to_buy"],
    },
  },
  {
    name: "refi_mortgage",
    title: "Refinance Mortgage",
    category: "debt",
    description:
      "Refinance the existing first lien. cash_out_amount=0 for rate-and-term (just reset rate); cash_out_amount>0 for cash-out refi (net proceeds after closing costs credited to balance). New rate uses current Fed rate + spread.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        cash_out_amount: { type: "number", description: "Cash to extract (0 = rate-and-term refi)", minimum: 0 },
        new_rate_type: { type: "string", enum: ["fixed", "arm"] },
      },
      required: ["game_id", "property_id"],
    },
  },
  {
    name: "heloc_draw",
    title: "Draw HELOC",
    category: "debt",
    description:
      "Draw from a HELOC (home equity line of credit) against a property you own. Opens a new HELOC if none exists. Credit limit = (current_price × LTV) - first_lien_balance. Proceeds credited to your tUSDC balance immediately.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        draw_amount: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["game_id", "property_id", "draw_amount"],
    },
  },
  {
    name: "heloc_repay",
    title: "Repay HELOC",
    category: "debt",
    description: "Repay drawn HELOC balance, reducing the outstanding balance and future monthly interest cost.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        repay_amount: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["game_id", "property_id", "repay_amount"],
    },
  },
  {
    name: "prepay_principal",
    title: "Prepay Principal",
    category: "debt",
    description:
      "Make a partial or full principal prepayment against an active mortgage. Reduces the loan balance immediately and recalculates the monthly payment. Works for interest-only, amortizing, HELOC, PACE, and mechanics lien.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        amount: { type: "number", exclusiveMinimum: 0, description: "Amount to prepay against principal" },
        mortgage_type: {
          type: "string",
          enum: ["first_lien", "acquisition", "refi", "heloc", "pace", "mechanics_lien"],
          description: "Which lien to target.",
        },
      },
      required: ["game_id", "property_id", "amount"],
    },
  },
  {
    name: "improve_property",
    title: "Improve Property",
    category: "debt",
    description:
      "Fund a property grade upgrade out of pocket (cash-funded). Cost = steps × upgrade_cost_pct × price. Grade improves immediately, boosting rent and appreciation. May trigger a mechanics lien if cash runs low.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        target_grade: {
          type: "string",
          enum: ["A", "B", "C", "D"],
          description: "Target grade. Must be higher than current grade.",
        },
      },
      required: ["game_id", "property_id", "target_grade"],
    },
  },
  {
    name: "originate_pace_lien",
    title: "Originate PACE Lien",
    category: "debt",
    description:
      "Finance a property grade upgrade via a PACE lien (no down payment). Grade and price improve immediately. Loan is serviced via debt service each turn at base_rate + pace_spread.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        target_grade: {
          type: "string",
          enum: ["A", "B", "C", "D"],
          description: "Target grade after PACE-funded improvement.",
        },
      },
      required: ["game_id", "property_id", "target_grade"],
    },
  },
  {
    name: "get_debt",
    title: "Get Debt Summary",
    category: "debt",
    description:
      "List all mortgages (acquisition, refi, HELOC) for a player: current balances, rates, monthly payments, LTV, and arrears status.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        player_id: { type: "string" },
      },
      required: ["game_id", "player_id"],
    },
  },

  // ── INTEL ────────────────────────────────────────────────────────────────
  {
    name: "get_portfolio",
    title: "Get Portfolio",
    category: "intel",
    description:
      "Get a player's full portfolio: token holdings with P&L, unrealised gains, total yield received, cash balance, total debt, gross asset value, NAV, and leverage ratio.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        player_id: { type: "string" },
      },
      required: ["game_id", "player_id"],
    },
  },
  {
    name: "get_leaderboard",
    title: "Get Leaderboard",
    category: "intel",
    description:
      "Get the leaderboard for a game (ranked by NAV = cash + holdings value - debt). Omit game_id to get the all-time global leaderboard across all completed games.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string", description: "Game ID (omit for global leaderboard)" },
        limit: { type: "integer", description: "Max entries for global leaderboard (default 50)" },
      },
      required: [],
    },
  },

  // ── BOTS ─────────────────────────────────────────────────────────────────
  {
    name: "add_bot",
    title: "Add Bot Player",
    category: "game",
    description:
      "Add an LLM-driven bot player to a game that is still in lobby status. The bot will automatically make investment decisions each turn after advance_turn is called. Requires being the game host.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        display_name: { type: "string", description: "Bot's display name, e.g. 'Warren Buffett'" },
        strategy: {
          type: "string",
          enum: ["aggressive", "conservative", "balanced", "momentum", "income"],
          description: "Investment strategy persona for the bot (default: balanced)",
        },
        personality: {
          type: "string",
          maxLength: 80,
          description: "Optional flavour description for the bot's character (max 80 chars)",
        },
      },
      required: ["game_id", "display_name"],
    },
  },
  {
    name: "remove_bot",
    title: "Remove Bot Player",
    category: "game",
    description:
      "Remove a bot player from a game that is still in lobby status. Requires being the game host.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        bot_player_id: { type: "string", description: "The player_id of the bot to remove" },
      },
      required: ["game_id", "bot_player_id"],
    },
  },

  // ── AUTONOMOUS MODE ───────────────────────────────────────────────────────
  {
    name: "start_autonomous",
    title: "Start Autonomous Mode",
    category: "game",
    description:
      "Enable autonomous mode on a game. The API will automatically advance turns at the specified interval until the game completes — no manual advance-turn calls needed. Perfect for all-bot games. Requires being the game host.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        delay_seconds: {
          type: "integer",
          description: "Seconds between automatic turn advances (5–3600, default 30)",
          minimum: 5,
          maximum: 3600,
        },
      },
      required: ["game_id"],
    },
  },
  {
    name: "stop_autonomous",
    title: "Stop Autonomous Mode",
    category: "game",
    description:
      "Disable autonomous mode. The game pauses and waits for manual advance-turn calls. Requires being the game host.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
      },
      required: ["game_id"],
    },
  },

  // ── DELEGATION ────────────────────────────────────────────────────────────
  {
    name: "set_delegate",
    title: "Set Agent Delegation",
    category: "game",
    description:
      "Opt in (or out) of agent delegation. When enabled, an LLM agent will act on your behalf " +
      "during any turn where you have not traded, taken a mortgage, or marked ready before the " +
      "turn advances — in both autonomous and host-manual advance modes.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        agent_delegate: {
          type: "boolean",
          description: "true = opt in to delegation; false = opt out",
        },
        delegate_strategy: {
          type: "string",
          enum: ["aggressive", "conservative", "balanced", "momentum", "income", "value_add"],
          description: "Bot strategy to use when acting as your delegate (default: balanced)",
        },
      },
      required: ["game_id", "agent_delegate"],
    },
  },

  // ── MARKET & INTEL ────────────────────────────────────────────────────────
  {
    name: "get_market_summary",
    title: "Get Market Summary",
    category: "market",
    description:
      "Snapshot of all properties in a game: grade, price, rent, live cap rate, price delta this turn, vacancy status, and mechanics lien info. Sorted by cap rate descending.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"],
    },
  },
  {
    name: "get_player_actions",
    title: "Get Player Actions",
    category: "intel",
    description:
      "Human-readable transaction timeline for a player in a game. Shows buys, sells, debt service, rent, improvements, and more.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        player_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Max transactions (default 50)" },
        turn: { type: "integer", description: "Filter to a specific turn (optional)" },
      },
      required: ["game_id", "player_id"],
    },
  },
  {
    name: "spectate",
    title: "Spectate Game",
    category: "intel",
    description:
      "Public game snapshot — no auth required. Returns leaderboard with tiers, recent feed events, and current property prices.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"],
    },
  },
  {
    name: "create_game_from_preset",
    title: "Create Game from Preset",
    category: "game",
    description:
      "Create a game using a named preset configuration. Presets: 'quick' (6 turns, high volatility), 'standard' (12 turns default), 'leveraged' (ARM 80% LTV amortizing), 'distressed' (D/F properties only, judgment liens), 'long_run' (120 turns, 10-year monthly).",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["quick", "standard", "leveraged", "distressed", "long_run"],
          description: "Preset name",
        },
        name: { type: "string", description: "Game room name" },
        display_name: { type: "string", description: "Your display name in this game" },
        starting_balance_usdc: { type: "number", description: "Optional override for starting balance" },
      },
      required: ["preset", "name", "display_name"],
    },
  },
  {
    name: "update_key",
    title: "Update API Key",
    category: "admin",
    description:
      "Update the saved Rentline Sandbox API key. Use this if the current key is invalid or expired. Get a new key at sandbox.rentline.xyz/cli-auth. Updates both ~/.rentline-sandbox/credentials.json and the OpenCode config environment block — takes effect immediately, no restart needed.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: {
          type: "string",
          description: "New API key (must start with sb_)",
        },
      },
      required: ["api_key"],
    },
  },
];
