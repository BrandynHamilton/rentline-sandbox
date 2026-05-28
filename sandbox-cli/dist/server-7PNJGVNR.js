#!/usr/bin/env node
import {
  createClient
} from "./chunk-IEOCAGIJ.js";

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// src/tools.ts
var ALL_TOOLS = [
  // ── GAME ─────────────────────────────────────────────────────────────────
  {
    name: "list_games",
    title: "List Open Games",
    category: "game",
    description: "List all open sandbox game rooms (status: lobby, trading, or advancing).",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_game",
    title: "Get Game State",
    category: "game",
    description: "Get full game state including players, property pool, current turn, Fed rate, and LTV settings.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string", description: "Game ID" } },
      required: ["game_id"]
    }
  },
  {
    name: "create_game",
    title: "Create Game",
    category: "game",
    description: "Create a new game room. Configure mortgage rules (LTV, rate type, amortizing), Fed meeting schedule, and starting balance. Returns the game with its invite_code for sharing.",
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
        property_ids: { type: "array", items: { type: "string" }, description: "Specific property IDs to include (default: all active)" }
      },
      required: ["name", "display_name"]
    }
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
        display_name: { type: "string", description: "Your display name in this game" }
      },
      required: ["game_id", "invite_code", "display_name"]
    }
  },
  {
    name: "mark_ready",
    title: "Mark Ready",
    category: "game",
    description: "Toggle your ready state. When all players are ready, the host can advance the turn.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"]
    }
  },
  {
    name: "advance_turn",
    title: "Advance Turn (Host)",
    category: "game",
    description: "Advance the game by one turn. Runs all engine phases: Fed meeting check \u2192 macro events \u2192 rent collection \u2192 random events \u2192 market move \u2192 debt service \u2192 distribute yield \u2192 open trade window. Host only.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"]
    }
  },
  {
    name: "get_feed",
    title: "Get Turn Feed",
    category: "game",
    description: "Get the event feed for a game. Shows Fed decisions, macro events (recession, disaster, tax hike, etc.), rent payments, price moves, debt service, and defaults. Optionally filter by turn.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        turn: { type: "integer", description: "Filter by turn number (optional)" },
        limit: { type: "integer", description: "Max events to return (default 30)", maximum: 200 }
      },
      required: ["game_id"]
    }
  },
  // ── MARKET ───────────────────────────────────────────────────────────────
  {
    name: "list_properties",
    title: "List Property Pool",
    category: "market",
    description: "List all active properties in the sandbox pool with prices, rents, and cap rates.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_fed_history",
    title: "Get Fed Decision History",
    category: "market",
    description: "Get the FOMC decision history for a game: all rate hikes, cuts, and holds with basis point moves, rate levels, and statement flavour text. Fed meets every N turns on a predictable schedule.",
    inputSchema: {
      type: "object",
      properties: { game_id: { type: "string" } },
      required: ["game_id"]
    }
  },
  // ── TRADE ────────────────────────────────────────────────────────────────
  {
    name: "buy_tokens",
    title: "Buy Property Tokens",
    category: "trade",
    description: "Buy fractional property tokens at the current market price (all-cash, no mortgage). Game must be in 'trading' status.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string", description: "Property ID from the game pool" },
        tokens: { type: "number", description: "Number of tokens to buy (fractions allowed)", exclusiveMinimum: 0 }
      },
      required: ["game_id", "property_id", "tokens"]
    }
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
        tokens: { type: "number", exclusiveMinimum: 0 }
      },
      required: ["game_id", "property_id", "tokens"]
    }
  },
  // ── DEBT ─────────────────────────────────────────────────────────────────
  {
    name: "originate_mortgage",
    title: "Originate Acquisition Mortgage",
    category: "debt",
    description: "Buy property tokens using an acquisition mortgage. You pay down_payment + closing_costs in cash; the rest is financed up to the game's LTV limit. Supports fixed-rate and ARM.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        tokens_to_buy: { type: "number", exclusiveMinimum: 0 },
        rate_type: { type: "string", enum: ["fixed", "arm"], description: "Rate type (default: game default)" }
      },
      required: ["game_id", "property_id", "tokens_to_buy"]
    }
  },
  {
    name: "refi_mortgage",
    title: "Refinance Mortgage",
    category: "debt",
    description: "Refinance the existing first lien. cash_out_amount=0 for rate-and-term (just reset rate); cash_out_amount>0 for cash-out refi (net proceeds after closing costs credited to balance). New rate uses current Fed rate + spread.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        cash_out_amount: { type: "number", description: "Cash to extract (0 = rate-and-term refi)", minimum: 0 },
        new_rate_type: { type: "string", enum: ["fixed", "arm"] }
      },
      required: ["game_id", "property_id"]
    }
  },
  {
    name: "heloc_draw",
    title: "Draw HELOC",
    category: "debt",
    description: "Draw from a HELOC (home equity line of credit) against a property you own. Opens a new HELOC if none exists. Credit limit = (current_price \xD7 LTV) - first_lien_balance. Proceeds credited to your tUSDC balance immediately.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        property_id: { type: "string" },
        draw_amount: { type: "number", exclusiveMinimum: 0 }
      },
      required: ["game_id", "property_id", "draw_amount"]
    }
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
        repay_amount: { type: "number", exclusiveMinimum: 0 }
      },
      required: ["game_id", "property_id", "repay_amount"]
    }
  },
  {
    name: "get_debt",
    title: "Get Debt Summary",
    category: "debt",
    description: "List all mortgages (acquisition, refi, HELOC) for a player: current balances, rates, monthly payments, LTV, and arrears status.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        player_id: { type: "string" }
      },
      required: ["game_id", "player_id"]
    }
  },
  // ── INTEL ────────────────────────────────────────────────────────────────
  {
    name: "get_portfolio",
    title: "Get Portfolio",
    category: "intel",
    description: "Get a player's full portfolio: token holdings with P&L, unrealised gains, total yield received, cash balance, total debt, gross asset value, NAV, and leverage ratio.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string" },
        player_id: { type: "string" }
      },
      required: ["game_id", "player_id"]
    }
  },
  {
    name: "get_leaderboard",
    title: "Get Leaderboard",
    category: "intel",
    description: "Get the leaderboard for a game (ranked by NAV = cash + holdings value - debt). Omit game_id to get the all-time global leaderboard across all completed games.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: { type: "string", description: "Game ID (omit for global leaderboard)" },
        limit: { type: "integer", description: "Max entries for global leaderboard (default 50)" }
      },
      required: []
    }
  }
];

// src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
function readSkill() {
  for (const p of [join(__dirname, "../SKILL.md"), join(__dirname, "SKILL.md")]) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  return "# Rentline Sandbox\n\nReal estate investment simulation game engine.";
}
var INSTRUCTIONS = `
You are connected to the Rentline Sandbox game engine \u2014 a turn-based real estate investment simulation.

KEY CONCEPTS:
- Players compete over a pool of tokenised properties using simulated tUSDC
- Each turn = 1 month. Properties generate rent, prices drift, and macro events fire
- Fed meetings occur every N turns (configurable) with hike/cut/hold outcomes \u2014 affects ARM rates and new mortgage originations
- Macro events: recession, housing boom, natural disaster, policy change, tax hike, interest rate moves, rent control, insurance crisis
- Debt strategies: acquisition mortgage (LTV-limited), cash-out refi, HELOC draw/repay. Fixed and ARM rates
- NAV = cash balance + (token holdings \xD7 current prices) - outstanding debt

WHEN TO USE TOOLS:
- User wants to play/observe a game \u2192 list_games, get_game, get_feed
- User wants to buy a property \u2192 buy_tokens (cash) or originate_mortgage (leveraged)
- User wants to extract equity \u2192 refi_mortgage (cash-out) or heloc_draw
- User wants to check their position \u2192 get_portfolio, get_debt
- User wants the scoreboard \u2192 get_leaderboard
- User wants to see macro/Fed events \u2192 get_feed, get_fed_history
- User is the host and wants to advance \u2192 advance_turn

All tools require a game_id. Most debt/portfolio tools also require a player_id (from join_game or get_game).
`.trim();
function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}
async function startServer() {
  const apiUrl = process.env.SANDBOX_API_URL ?? "http://localhost:6532";
  const apiKey = process.env.SANDBOX_API_KEY;
  const client = createClient({ apiUrl, apiKey });
  const server = new Server(
    { name: "rentline-sandbox", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { listChanged: false }
      },
      instructions: INSTRUCTIONS
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = args ?? {};
    try {
      switch (name) {
        // ── Game ──────────────────────────────────────────────────────────
        case "list_games":
          return ok(await client.listGames());
        case "get_game":
          return ok(await client.getGame(a.game_id));
        case "create_game":
          return ok(await client.createGame({
            name: a.name,
            display_name: a.display_name,
            max_turns: a.max_turns,
            starting_balance_usdc: a.starting_balance_usdc,
            ltv_limit: a.ltv_limit,
            default_rate_type: a.default_rate_type,
            amortizing: a.amortizing,
            fed_meeting_interval: a.fed_meeting_interval,
            fed_rate_current: a.fed_rate_current,
            property_ids: a.property_ids
          }));
        case "join_game":
          return ok(await client.joinGame(a.game_id, {
            invite_code: a.invite_code,
            display_name: a.display_name
          }));
        case "mark_ready":
          return ok(await client.markReady(a.game_id));
        case "advance_turn":
          return ok(await client.advanceTurn(a.game_id));
        case "get_feed":
          return ok(await client.getFeed(a.game_id, {
            turn: a.turn,
            limit: a.limit ?? 30
          }));
        // ── Market ────────────────────────────────────────────────────────
        case "list_properties":
          return ok(await client.listProperties());
        case "get_fed_history":
          return ok(await client.getFedHistory(a.game_id));
        // ── Trade ─────────────────────────────────────────────────────────
        case "buy_tokens":
          return ok(await client.trade(a.game_id, {
            property_id: a.property_id,
            direction: "buy",
            tokens: a.tokens
          }));
        case "sell_tokens":
          return ok(await client.trade(a.game_id, {
            property_id: a.property_id,
            direction: "sell",
            tokens: a.tokens
          }));
        // ── Debt ──────────────────────────────────────────────────────────
        case "originate_mortgage":
          return ok(await client.originateMortgage(a.game_id, {
            property_id: a.property_id,
            tokens_to_buy: a.tokens_to_buy,
            rate_type: a.rate_type
          }));
        case "refi_mortgage":
          return ok(await client.refi(a.game_id, {
            property_id: a.property_id,
            cash_out_amount: a.cash_out_amount ?? 0,
            new_rate_type: a.new_rate_type
          }));
        case "heloc_draw":
          return ok(await client.helocDraw(a.game_id, {
            property_id: a.property_id,
            draw_amount: a.draw_amount
          }));
        case "heloc_repay":
          return ok(await client.helocRepay(a.game_id, {
            property_id: a.property_id,
            repay_amount: a.repay_amount
          }));
        case "get_debt":
          return ok(await client.getDebt(a.game_id, a.player_id));
        // ── Intel ─────────────────────────────────────────────────────────
        case "get_portfolio":
          return ok(await client.getPortfolio(a.game_id, a.player_id));
        case "get_leaderboard":
          return a.game_id ? ok(await client.getLeaderboard(a.game_id)) : ok(await client.getGlobalLeaderboard(a.limit ?? 50));
        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{
      name: "sandbox-context",
      description: "Inject Rentline Sandbox game mechanics context into the conversation"
    }]
  }));
  server.setRequestHandler(GetPromptRequestSchema, async () => ({
    messages: [{ role: "user", content: { type: "text", text: INSTRUCTIONS } }]
  }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "sandbox://skill.md",
        name: "Rentline Sandbox SKILL.md",
        description: "Full skill manifest: triggers, setup, tool reference, game mechanics",
        mimeType: "text/markdown"
      },
      {
        uri: "sandbox://tools",
        name: "Tool definitions",
        description: "All tool names, descriptions, and input schemas",
        mimeType: "application/json"
      }
    ]
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const { uri } = req.params;
    if (uri === "sandbox://skill.md") {
      return { contents: [{ uri, mimeType: "text/markdown", text: readSkill() }] };
    }
    if (uri === "sandbox://tools") {
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(ALL_TOOLS, null, 2) }] };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
export {
  startServer
};
//# sourceMappingURL=server-7PNJGVNR.js.map