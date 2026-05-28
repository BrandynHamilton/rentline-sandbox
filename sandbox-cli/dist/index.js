#!/usr/bin/env node
#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import dotenv from "dotenv";
dotenv.config();
var args = process.argv.slice(2);
if (args[0] === "setup" || args[0] === "--setup") {
  const { runSetup, parseSetupArgs } = await import("./setup-2SML24ZN.js");
  const opts = parseSetupArgs(args.filter((a) => a !== "setup" && a !== "--setup"));
  await runSetup(opts);
  process.exit(0);
}
if (args.length === 0 || args[0] === "server" || args[0] === "--server") {
  const { startServer } = await import("./server-7PNJGVNR.js");
  await startServer();
  process.exit(0);
}
var program = new Command();
program.name("sandbox").description("Rentline Sandbox \u2014 CLI and MCP server for the real estate simulation game").version("0.1.0").option("--url <url>", "Sandbox API base URL (overrides saved config)").option("--api-key <key>", "API key (overrides saved config)");
var { registerAuth } = await import("./auth-BEZ75SMV.js");
var { registerGame } = await import("./game-MSXFXLD2.js");
var { registerTrade } = await import("./trade-BP7XBG27.js");
var { registerMortgage } = await import("./mortgage-KLJC4UA7.js");
var { registerAdmin } = await import("./admin-FATGYC27.js");
registerAuth(program);
registerGame(program);
registerTrade(program);
registerMortgage(program);
registerAdmin(program);
program.command("mcp-setup", { hidden: true }).allowUnknownOption().action(async () => {
  const { runSetup, parseSetupArgs } = await import("./setup-2SML24ZN.js");
  const opts = parseSetupArgs(process.argv.slice(3));
  await runSetup(opts);
});
await program.parseAsync(process.argv);
//# sourceMappingURL=index.js.map