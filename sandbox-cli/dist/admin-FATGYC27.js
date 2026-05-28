#!/usr/bin/env node
import {
  getApiKey,
  getApiUrl,
  requireConfig
} from "./chunk-AS634Y3M.js";
import {
  createClient
} from "./chunk-IEOCAGIJ.js";

// src/commands/admin.ts
function client(cmd) {
  const opts = cmd.optsWithGlobals();
  const cfg = requireConfig();
  return createClient({ apiUrl: getApiUrl(opts.url), apiKey: getApiKey(opts.apiKey) ?? cfg.api_key });
}
function registerAdmin(program) {
  const admin = program.command("admin").description("Admin operations (requires admin API key)");
  const props = admin.command("properties").description("Property pool management");
  props.command("list").description("List all properties in the sandbox pool").option("--all", "Include inactive properties").action(async (opts, cmd) => {
    const properties = await client(cmd).listProperties(!opts.all);
    if (!properties.length) {
      console.log("No properties in pool. Run: sandbox admin properties sync");
      return;
    }
    console.log(`
${"Name".padEnd(32)}${"City".padEnd(16)}${"Price".padStart(12)}${"Rent/mo".padStart(10)}${"Cap".padStart(6)}`);
    console.log("\u2500".repeat(76));
    for (const p of properties) {
      const cap = p.cap_rate !== null ? `${(p.cap_rate * 100).toFixed(1)}%` : "\u2014";
      console.log(
        `${(p.name ?? p.id).slice(0, 30).padEnd(32)}${(p.city ?? "\u2014").padEnd(16)}$${p.initial_price_usd.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(11)}$${p.monthly_rent_usd.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)}${cap.padStart(6)}`
      );
    }
    console.log(`
Total: ${properties.length}`);
  });
  props.command("sync").description("Pull/update property pool from rwa-issuer-sim (RWA_ISSUER_URL must be set)").action(async (_, cmd) => {
    process.stdout.write("Syncing property pool from rwa-issuer-sim\u2026 ");
    const res = await client(cmd).syncProperties();
    console.log("done");
    console.log(`  Created:  ${res.created}`);
    console.log(`  Updated:  ${res.updated}`);
    console.log(`  Skipped:  ${res.skipped}`);
  });
  admin.command("mint <game-id> <player-id>").description("Mint additional tUSDC to a player (admin only)").requiredOption("--amount <n>", "Amount of tUSDC to mint").action(async (gameId, playerId, opts, cmd) => {
    const res = await client(cmd).mintTusdc(gameId, playerId, parseFloat(opts.amount));
    console.log(`Minted $${parseFloat(opts.amount).toFixed(2)} tUSDC to player ${res.player_id}`);
    console.log(`New balance: $${res.usdc_balance.toFixed(2)}`);
  });
}
export {
  registerAdmin
};
//# sourceMappingURL=admin-FATGYC27.js.map