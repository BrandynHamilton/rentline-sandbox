/**
 * server.ts — MCP server for Rentline Sandbox
 *
 * Transport: stdio JSON-RPC (standard for npx-invoked MCP servers)
 * Auth: SANDBOX_API_KEY + SANDBOX_API_URL env vars (set by MCP client config)
 *
 * Capabilities:
 *   tools      — all game actions (buy, sell, mortgage, refi, HELOC, advance turn, etc.)
 *   prompts    — sandbox-context (injects game mechanics explanation)
 *   resources  — sandbox://skill.md, sandbox://tools
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "./client.js";
import { ALL_TOOLS } from "./tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read SKILL.md from package root (works in both src/ and dist/)
function readSkill(): string {
  for (const p of [join(__dirname, "../SKILL.md"), join(__dirname, "SKILL.md")]) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  return "# Rentline Sandbox\n\nReal estate investment simulation game engine.";
}

const INSTRUCTIONS = `
You are connected to the Rentline Sandbox game engine — a turn-based real estate investment simulation.

IMPORTANT: Authentication is handled automatically via saved credentials. Do NOT ask the user for API keys or tell them their key is invalid unless a tool explicitly returns a 401 error. If a tool call succeeds, report the result — do not second-guess it.

KEY CONCEPTS:
- Players compete over a pool of tokenised properties using simulated tUSDC
- Each turn = 1 month. Properties generate rent, prices drift, and macro events fire
- Fed meetings occur every N turns — affects ARM rates and new mortgage originations
- Macro events: recession, housing boom, disaster, tax hike, rate moves, rent control, PACE liens, property grades
- Debt strategies: acquisition mortgage (LTV-limited), cash-out refi, HELOC, PACE lien, improvements
- NAV = cash + (tokens × price) − debt. Investor tier improves automatically as NAV grows.

WHEN TO USE TOOLS:
- User wants to play → create_game_from_preset, then advance_turn
- User wants to buy a property → buy_tokens (cash) or originate_mortgage (leveraged)
- User wants to improve a distressed property → originate_pace_lien
- User wants to check their position → get_portfolio, get_debt, get_market_summary
- User wants the scoreboard → get_leaderboard
- User wants to see events → get_feed, get_fed_history
- User is host → advance_turn

All tools require a game_id. Debt/portfolio tools also require a player_id (from join_game or get_game).
`.trim();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

import { loadConfig, saveConfig, updateOpenCodeKey, DEFAULT_API_URL } from "./config.js";

function getClient() {
  // Re-read credentials on every call so key updates take effect without restart
  let apiUrl = process.env.SANDBOX_API_URL;
  let apiKey = process.env.SANDBOX_API_KEY;

  if (!apiUrl || !apiKey) {
    const cfg = loadConfig();
    if (cfg) {
      apiUrl = apiUrl ?? cfg.api_url;
      apiKey = apiKey ?? cfg.api_key;
    }
  }

  if (!apiKey) {
    process.stderr.write(
      "rentline-sandbox: No API key found. Run: sandbox setup --key sb_your_key\n"
    );
  }

  return createClient({ apiUrl: apiUrl ?? DEFAULT_API_URL, apiKey });
}

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: "rentline-sandbox", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { listChanged: false },
      },
      instructions: INSTRUCTIONS,
    }
  );

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args ?? {}) as Record<string, unknown>;
    const client = getClient(); // fresh credentials on every call

    try {
      switch (name) {
        // ── Game ──────────────────────────────────────────────────────────
        case "list_games":
          return ok(await client.listGames());

        case "get_game":
          return ok(await client.getGame(a.game_id as string));

        case "create_game":
          return ok(await client.createGame({
            name: a.name as string,
            display_name: a.display_name as string,
            max_turns: a.max_turns as number | undefined,
            starting_balance_usdc: a.starting_balance_usdc as number | undefined,
            ltv_limit: a.ltv_limit as number | undefined,
            default_rate_type: a.default_rate_type as string | undefined,
            amortizing: a.amortizing as boolean | undefined,
            fed_meeting_interval: a.fed_meeting_interval as number | undefined,
            fed_rate_current: a.fed_rate_current as number | undefined,
            property_ids: a.property_ids as string[] | undefined,
            bots: a.bots as Array<{ display_name: string; strategy?: string; personality?: string }> | undefined,
            auto_advance: a.auto_advance as boolean | undefined,
            auto_advance_delay_seconds: a.auto_advance_delay_seconds as number | undefined,
          }));

        case "join_game":
          return ok(await client.joinGame(a.game_id as string, {
            invite_code: a.invite_code as string,
            display_name: a.display_name as string,
          }));

        case "mark_ready":
          return ok(await client.markReady(a.game_id as string));

        case "advance_turn":
          return ok(await client.advanceTurn(a.game_id as string));

        case "get_feed":
          return ok(await client.getFeed(a.game_id as string, {
            turn: a.turn as number | undefined,
            limit: (a.limit as number | undefined) ?? 30,
          }));

        // ── Market ────────────────────────────────────────────────────────
        case "list_properties":
          return ok(await client.listProperties());

        case "get_fed_history":
          return ok(await client.getFedHistory(a.game_id as string));

        // ── Trade ─────────────────────────────────────────────────────────
        case "buy_tokens":
          return ok(await client.trade(a.game_id as string, {
            property_id: a.property_id as string,
            direction: "buy",
            tokens: a.tokens as number,
          }));

        case "sell_tokens":
          return ok(await client.trade(a.game_id as string, {
            property_id: a.property_id as string,
            direction: "sell",
            tokens: a.tokens as number,
          }));

        // ── Debt ──────────────────────────────────────────────────────────
        case "originate_mortgage":
          return ok(await client.originateMortgage(a.game_id as string, {
            property_id: a.property_id as string,
            tokens_to_buy: a.tokens_to_buy as number,
            rate_type: a.rate_type as string | undefined,
          }));

        case "refi_mortgage":
          return ok(await client.refi(a.game_id as string, {
            property_id: a.property_id as string,
            cash_out_amount: (a.cash_out_amount as number | undefined) ?? 0,
            new_rate_type: a.new_rate_type as string | undefined,
          }));

        case "heloc_draw":
          return ok(await client.helocDraw(a.game_id as string, {
            property_id: a.property_id as string,
            draw_amount: a.draw_amount as number,
          }));

        case "heloc_repay":
          return ok(await client.helocRepay(a.game_id as string, {
            property_id: a.property_id as string,
            repay_amount: a.repay_amount as number,
          }));

        case "prepay_principal":
          return ok(await client.prepayPrincipal(a.game_id as string, {
            property_id: a.property_id as string,
            amount: a.amount as number,
            mortgage_type: a.mortgage_type as "first_lien" | "acquisition" | "refi" | "heloc" | "pace" | "mechanics_lien" | undefined,
          }));

        case "improve_property":
          return ok(await client.improveProperty(a.game_id as string, {
            property_id: a.property_id as string,
            target_grade: a.target_grade as "A" | "B" | "C" | "D",
          }));

        case "originate_pace_lien":
          return ok(await client.originatePaceLien(a.game_id as string, {
            property_id: a.property_id as string,
            target_grade: a.target_grade as "A" | "B" | "C" | "D",
          }));

        case "get_debt":
          return ok(await client.getDebt(a.game_id as string, a.player_id as string));

        // ── Intel ─────────────────────────────────────────────────────────
        case "get_portfolio":
          return ok(await client.getPortfolio(a.game_id as string, a.player_id as string));

        case "get_leaderboard":
          return a.game_id
            ? ok(await client.getLeaderboard(a.game_id as string))
            : ok(await client.getGlobalLeaderboard((a.limit as number | undefined) ?? 50));

        // ── Bots ──────────────────────────────────────────────────────────
        case "add_bot":
          return ok(await client.addBot(a.game_id as string, {
            display_name: a.display_name as string,
            strategy: a.strategy as string | undefined,
            personality: a.personality as string | undefined,
          }));

        case "remove_bot":
          return ok(await client.removeBot(a.game_id as string, a.bot_player_id as string));

        // ── Autonomous mode ────────────────────────────────────────────────
        case "start_autonomous":
          return ok(await client.startAutonomous(
            a.game_id as string,
            a.delay_seconds as number | undefined,
          ));

        case "stop_autonomous":
          return ok(await client.stopAutonomous(a.game_id as string));

        // ── Delegation ─────────────────────────────────────────────────────
        case "set_delegate":
          return ok(await client.setDelegate(a.game_id as string, {
            agent_delegate: a.agent_delegate as boolean,
            delegate_strategy: a.delegate_strategy as string | undefined,
          }));

        // ── Market & Intel ─────────────────────────────────────────────────
        case "get_market_summary":
          return ok(await client.getMarketSummary(a.game_id as string));

        case "get_player_actions":
          return ok(await client.getPlayerActions(
            a.game_id as string,
            a.player_id as string,
            a.limit as number | undefined,
            a.turn as number | undefined,
          ));

        case "spectate":
          return ok(await client.spectate(a.game_id as string));

        case "create_game_from_preset":
          return ok(await client.createGameFromPreset({
            preset: a.preset as string,
            name: a.name as string,
            display_name: a.display_name as string,
            starting_balance_usdc: a.starting_balance_usdc as number | undefined,
          }));

        case "update_key": {
          const newKey = a.api_key as string;
          if (!newKey?.startsWith("sb_")) {
            return err("Invalid key format — must start with sb_");
          }
          // Verify the key works before saving
          const testClient = createClient({ apiUrl: DEFAULT_API_URL, apiKey: newKey });
          try {
            await testClient.health();
          } catch {
            return err("Could not verify key against the API. Check the key is valid.");
          }
          const existing = loadConfig();
          saveConfig({
            api_key: newKey,
            api_url: existing?.api_url ?? DEFAULT_API_URL,
            display_name: existing?.display_name ?? "Player",
            created_at: new Date().toISOString(),
          });
          const patched = updateOpenCodeKey(newKey);
          const patchNote = patched.length > 0
            ? ` OpenCode config updated (${patched.length} file${patched.length > 1 ? "s" : ""}).`
            : "";
          return ok({ message: "API key updated. New key prefix: " + newKey.slice(0, 8) + "…" + patchNote });
        }

        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });

  // ── Prompts ────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{
      name: "sandbox-context",
      description: "Inject Rentline Sandbox game mechanics context into the conversation",
    }],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async () => ({
    messages: [{ role: "user", content: { type: "text", text: INSTRUCTIONS } }],
  }));

  // ── Resources ─────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "sandbox://skill.md",
        name: "Rentline Sandbox SKILL.md",
        description: "Full skill manifest: triggers, setup, tool reference, game mechanics",
        mimeType: "text/markdown",
      },
      {
        uri: "sandbox://tools",
        name: "Tool definitions",
        description: "All tool names, descriptions, and input schemas",
        mimeType: "application/json",
      },
    ],
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

  // ── Connect ────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Auto-start when run directly as a bin
startServer().catch((e) => {
  process.stderr.write(`rentline-sandbox MCP server error: ${e}\n`);
  process.exit(1);
});
