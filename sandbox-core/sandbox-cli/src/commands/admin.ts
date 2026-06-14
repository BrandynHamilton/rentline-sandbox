/**
 * admin.ts — `sandbox admin` command group (requires ADMIN_API_KEY)
 *
 * sandbox admin properties list
 * sandbox admin properties sync            (pull from rwa-issuer-sim)
 * sandbox admin mint <game-id> <player-id> --amount 50000
 */

import { Command } from "commander";
import { requireConfig, getApiKey, getApiUrl } from "../config.js";
import { createClient } from "../client.js";

function client(cmd: Command) {
  const opts = cmd.optsWithGlobals();
  const cfg = requireConfig();
  return createClient({ apiUrl: getApiUrl(opts.url), apiKey: getApiKey(opts.apiKey) ?? cfg.api_key });
}

export function registerAdmin(program: Command) {
  const admin = program
    .command("admin")
    .description("Admin operations (requires admin API key)");

  const props = admin.command("properties").description("Property pool management");

  props
    .command("list")
    .description("List all properties in the sandbox pool")
    .option("--all", "Include inactive properties")
    .action(async (opts, cmd) => {
      const properties = await client(cmd).listProperties(!opts.all);
      if (!properties.length) {
        console.log("No properties in pool. Run: sandbox admin properties sync");
        return;
      }
      console.log(`\n${"Name".padEnd(32)}${"City".padEnd(16)}${"Price".padStart(12)}${"Rent/mo".padStart(10)}${"Cap".padStart(6)}`);
      console.log("─".repeat(76));
      for (const p of properties) {
        const cap = p.cap_rate !== null ? `${(p.cap_rate * 100).toFixed(1)}%` : "—";
        console.log(
          `${(p.name ?? p.id).slice(0, 30).padEnd(32)}` +
          `${(p.city ?? "—").padEnd(16)}` +
          `$${p.initial_price_usd.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(11)}` +
          `$${p.monthly_rent_usd.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)}` +
          `${cap.padStart(6)}`
        );
      }
      console.log(`\nTotal: ${properties.length}`);
    });

  props
    .command("sync")
    .description("Pull/update property pool from rwa-issuer-sim (RWA_ISSUER_URL must be set)")
    .action(async (_, cmd) => {
      process.stdout.write("Syncing property pool from rwa-issuer-sim… ");
      const res = await client(cmd).syncProperties();
      console.log("done");
      console.log(`  Created:  ${res.created}`);
      console.log(`  Updated:  ${res.updated}`);
      console.log(`  Skipped:  ${res.skipped}`);
    });

  admin
    .command("mint <game-id> <player-id>")
    .description("Mint additional tUSDC to a player (admin only)")
    .requiredOption("--amount <n>", "Amount of tUSDC to mint")
    .action(async (gameId, playerId, opts, cmd) => {
      const res = await client(cmd).mintTusdc(gameId, playerId, parseFloat(opts.amount));
      console.log(`Minted $${parseFloat(opts.amount).toFixed(2)} tUSDC to player ${res.player_id}`);
      console.log(`New balance: $${res.usdc_balance.toFixed(2)}`);
    });
}
