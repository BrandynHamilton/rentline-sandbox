/**
 * game.ts — `sandbox game` command group
 *
 * sandbox game list
 * sandbox game create --name "My Game" [--turns 12] [--balance 100000]
 *                     [--auto-advance] [--auto-advance-delay 60]
 * sandbox game get <id>
 * sandbox game join <id> --invite <code> [--name "Alice"]
 * sandbox game leave <id>
 * sandbox game ready <id>
 * sandbox game advance <id>          (host only)
 * sandbox game feed <id> [--turn N] [--limit 20]
 * sandbox game leaderboard <id>
 * sandbox game leaderboard            (global, omit id)
 * sandbox game autonomous <id> [--delay 30]   (host only — start auto-advance)
 * sandbox game stop-autonomous <id>            (host only — stop auto-advance)
 * sandbox game delegate <id> [--strategy balanced] [--off]
 */

import { Command } from "commander";
import { requireConfig, getApiKey, getApiUrl } from "../config.js";
import { createClient } from "../client.js";
import type { CreateGameBody } from "../client.js";

function client(cmd: Command) {
  const opts = cmd.optsWithGlobals();
  const cfg = requireConfig();
  return createClient({ apiUrl: getApiUrl(opts.url), apiKey: getApiKey(opts.apiKey) ?? cfg.api_key });
}

function fmt(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

export function registerGame(program: Command) {
  const game = program.command("game").description("Manage sandbox game rooms");

  game
    .command("list")
    .description("List open game rooms (lobby, trading, advancing)")
    .action(async (_, cmd) => { fmt(await client(cmd).listGames()); });

  game
    .command("create")
    .description("Create a new game room")
    .requiredOption("--name <name>", "Game name")
    .option("--display-name <n>", "Your display name in this game")
    .option("--turns <n>", "Max turns (default 12)", "12")
    .option("--balance <n>", "Starting tUSDC per player", "100000")
    .option("--ltv <n>", "LTV limit 0.0-0.95 (default 0.70)", "0.70")
    .option("--rate-type <t>", "Default mortgage rate type: fixed|arm", "fixed")
    .option("--amortizing", "Enable amortizing mortgages (default: interest-only)")
    .option("--fed-interval <n>", "Fed meeting every N turns (0=disabled)", "6")
    .option("--properties <ids...>", "Specific property IDs to include (default: all active)")
    .option("--auto-advance", "Start autonomous mode immediately after creation")
    .option("--auto-advance-delay <n>", "Seconds between auto-advance turns (5-3600, default 30)", "30")
    .action(async (opts, cmd) => {
      const cfg = requireConfig();
      const body: CreateGameBody = {
        name: opts.name,
        display_name: opts.displayName ?? cfg.display_name ?? "Host",
        max_turns: parseInt(opts.turns),
        starting_balance_usdc: parseFloat(opts.balance),
        ltv_limit: parseFloat(opts.ltv),
        default_rate_type: opts.rateType,
        amortizing: !!opts.amortizing,
        fed_meeting_interval: parseInt(opts.fedInterval),
        property_ids: opts.properties,
        auto_advance: !!opts.autoAdvance,
        auto_advance_delay_seconds: parseInt(opts.autoAdvanceDelay),
      };
      const g = await client(cmd).createGame(body);
      console.log(`\nGame created: ${g.id}`);
      console.log(`Invite code:  ${g.invite_code}`);
      console.log(`Share link:   sandbox.rentline.xyz/join/${g.invite_code}\n`);
      fmt(g);
    });

  game
    .command("get <id>")
    .description("Get full game state (players, properties, status)")
    .action(async (id, _, cmd) => { fmt(await client(cmd).getGame(id)); });

  game
    .command("join <id>")
    .description("Join a game via invite code")
    .requiredOption("--invite <code>", "Invite code")
    .option("--name <n>", "Your display name")
    .action(async (id, opts, cmd) => {
      const cfg = requireConfig();
      const res = await client(cmd).joinGame(id, {
        invite_code: opts.invite,
        display_name: opts.name ?? cfg.display_name ?? "Player",
      });
      console.log(`Joined game ${res.game_id} as player ${res.player_id}`);
    });

  game
    .command("leave <id>")
    .description("Leave a game (only before it starts)")
    .action(async (id, _, cmd) => {
      await client(cmd).leaveGame(id);
      console.log(`Left game ${id}`);
    });

  game
    .command("ready <id>")
    .description("Toggle your ready state for the next turn")
    .action(async (id, _, cmd) => {
      const res = await client(cmd).markReady(id);
      console.log(`Ready: ${res.is_ready}`);
    });

  game
    .command("advance <id>")
    .description("Advance the game by one turn (host only — runs all engine phases)")
    .action(async (id, _, cmd) => {
      const res = await client(cmd).advanceTurn(id);
      console.log(`Turn ${res.current_turn}/${res.max_turns} — status: ${res.status}`);
    });

  game
    .command("feed <id>")
    .description("Show the turn event feed (macro events, rent, price moves, debt service)")
    .option("--turn <n>", "Filter by turn number")
    .option("--limit <n>", "Max events to show", "30")
    .action(async (id, opts, cmd) => {
      const events = await client(cmd).getFeed(id, {
        turn: opts.turn !== undefined ? parseInt(opts.turn) : undefined,
        limit: parseInt(opts.limit),
      });
      if (!events.length) { console.log("No events yet."); return; }
      for (const e of events) {
        const sign = e.delta_usdc > 0 ? "+" : "";
        const money = e.delta_usdc !== 0 ? ` [${sign}$${Math.abs(e.delta_usdc).toFixed(2)}]` : "";
        console.log(`T${e.turn} ${e.event_type.padEnd(18)} ${e.description}${money}`);
      }
    });

  game
    .command("leaderboard [id]")
    .description("Show leaderboard for a game (or global all-time if no game ID given)")
    .option("--limit <n>", "Number of entries (global only)", "50")
    .action(async (id, opts, cmd) => {
      const rows = id
        ? await client(cmd).getLeaderboard(id)
        : await client(cmd).getGlobalLeaderboard(parseInt(opts.limit));
      console.log(`\n${"#".padEnd(4)}${"Player".padEnd(22)}${"NAV".padStart(14)}${"Cash".padStart(14)}`);
      console.log("─".repeat(54));
      for (const r of rows) {
        console.log(
          `${String(r.rank).padEnd(4)}${r.display_name.padEnd(22)}` +
          `$${r.nav.toLocaleString("en-US", { maximumFractionDigits: 2 }).padStart(13)}` +
          `$${r.usdc_balance.toLocaleString("en-US", { maximumFractionDigits: 2 }).padStart(13)}`
        );
      }
    });

  game
    .command("fed <id>")
    .description("Show FOMC decision history for a game")
    .action(async (id, _, cmd) => {
      const history = await client(cmd).getFedHistory(id);
      if (!history.length) { console.log("No Fed decisions yet."); return; }
      for (const d of history) {
        const arrow = d.outcome === "hike" ? "↑" : d.outcome === "cut" ? "↓" : "→";
        console.log(
          `T${d.turn} ${arrow} ${d.outcome.toUpperCase().padEnd(5)} ` +
          `${d.move_bps > 0 ? "+" : ""}${d.move_bps}bps  ` +
          `Fed: ${(d.rate_after * 100).toFixed(2)}%  ` +
          `Mortgage: ${(d.mortgage_rate_after * 100).toFixed(2)}%`
        );
        console.log(`   ${d.statement}`);
      }
    });

  game
    .command("autonomous <id>")
    .description("Enable autonomous mode — game advances turns automatically (host only)")
    .option("--delay <n>", "Seconds between turns (5–3600, default 30)", "30")
    .action(async (id, opts, cmd) => {
      const res = await client(cmd).startAutonomous(id, parseInt(opts.delay));
      console.log(`Autonomous mode enabled for game ${id}`);
      console.log(`Delay: ${res.auto_advance_delay_seconds}s between turns`);
      console.log(res.message);
    });

  game
    .command("stop-autonomous <id>")
    .description("Disable autonomous mode — game waits for manual advance-turn (host only)")
    .action(async (id, _, cmd) => {
      const res = await client(cmd).stopAutonomous(id);
      console.log(`Autonomous mode disabled for game ${id}`);
      console.log(res.message);
    });

  game
    .command("delegate <id>")
    .description("Opt in to agent delegation — an LLM acts for you if you don't move in time")
    .option("--strategy <s>", "Bot strategy to use: aggressive|conservative|balanced|momentum|income", "balanced")
    .option("--off", "Opt out of delegation")
    .action(async (id, opts, cmd) => {
      const res = await client(cmd).setDelegate(id, {
        agent_delegate: !opts.off,
        delegate_strategy: opts.strategy,
      });
      console.log(res.message);
      console.log(`Strategy: ${res.delegate_strategy}`);
    });
}
