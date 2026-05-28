/**
 * index.ts — CLI entry point
 *
 * Dispatch:
 *   sandbox setup [...]     → MCP installer wizard (per-client config patching)
 *   sandbox server          → Start MCP server (stdio JSON-RPC)
 *   sandbox <command>       → CLI commands (game, trade, mortgage, admin, auth)
 *
 * Default (no args) → show help
 */

import { Command } from "commander";
import dotenv from "dotenv";
dotenv.config();

const args = process.argv.slice(2);

// Fast dispatch for MCP paths — avoid loading Commander for these
if (args[0] === "setup" || args[0] === "--setup") {
  const { runSetup, parseSetupArgs } = await import("./setup.js");
  const opts = parseSetupArgs(args.filter((a) => a !== "setup" && a !== "--setup"));
  await runSetup(opts);
  process.exit(0);
}

if (args.length === 0 || args[0] === "server" || args[0] === "--server") {
  // Default: start MCP server via stdio
  // startServer() connects the stdio transport and returns — the event loop keeps the process alive.
  // Do NOT call process.exit() and do NOT fall through to Commander.
  const { startServer } = await import("./server.js");
  await startServer();
} else {

// ── CLI mode ─────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("sandbox")
  .description("Rentline Sandbox — CLI and MCP server for the real estate simulation game")
  .version("0.1.0")
  .option("--url <url>", "Sandbox API base URL (overrides saved config)")
  .option("--api-key <key>", "API key (overrides saved config)");

const { registerAuth } = await import("./commands/auth.js");
const { registerGame } = await import("./commands/game.js");
const { registerTrade } = await import("./commands/trade.js");
const { registerMortgage } = await import("./commands/mortgage.js");
const { registerAdmin } = await import("./commands/admin.js");

registerAuth(program);
registerGame(program);
registerTrade(program);
registerMortgage(program);
registerAdmin(program);

// Hidden shortcut: `sandbox mcp-setup` as alias for `sandbox setup`
program
  .command("mcp-setup", { hidden: true })
  .allowUnknownOption()
  .action(async () => {
    const { runSetup, parseSetupArgs } = await import("./setup.js");
    const opts = parseSetupArgs(process.argv.slice(3));
    await runSetup(opts);
  });

await program.parseAsync(process.argv);
}
