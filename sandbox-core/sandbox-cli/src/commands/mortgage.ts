/**
 * mortgage.ts — `sandbox mortgage` command group
 *
 * sandbox mortgage buy   <game-id>  --property <id> --tokens <n> [--rate-type arm]
 * sandbox mortgage refi  <game-id>  --property <id> [--cash-out 25000] [--rate-type fixed]
 * sandbox mortgage heloc <game-id>  --property <id> --draw 15000
 * sandbox mortgage repay <game-id>  --property <id> --amount 5000
 * sandbox mortgage list  <game-id>  <player-id>
 */

import { Command } from "commander";
import { requireConfig, getApiKey, getApiUrl } from "../config.js";
import { createClient, type Mortgage } from "../client.js";

function client(cmd: Command) {
  const opts = cmd.optsWithGlobals();
  const cfg = requireConfig();
  return createClient({ apiUrl: getApiUrl(opts.url), apiKey: getApiKey(opts.apiKey) ?? cfg.api_key });
}

function printMortgage(m: Mortgage) {
  console.log(`\nMortgage: ${m.id}`);
  console.log(`  Type:        ${m.mortgage_type}`);
  console.log(`  Status:      ${m.status}`);
  console.log(`  Balance:     $${m.current_balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  console.log(`  Rate:        ${(m.current_rate * 100).toFixed(3)}% ${m.rate_type.toUpperCase()} ${m.amortizing ? "(amortizing)" : "(interest-only)"}`);
  console.log(`  Monthly pmt: $${m.monthly_payment.toFixed(2)}`);
  if (m.credit_limit !== null) {
    console.log(`  HELOC limit: $${m.credit_limit.toFixed(2)}  drawn: $${(m.drawn_balance ?? 0).toFixed(2)}`);
  }
  if (m.turns_in_arrears > 0) {
    console.log(`  ⚠ IN ARREARS: ${m.turns_in_arrears} turn(s)`);
  }
  console.log(`  Interest paid: $${m.total_interest_paid.toFixed(2)}  Principal paid: $${m.total_principal_paid.toFixed(2)}`);
}

export function registerMortgage(program: Command) {
  const mtg = program
    .command("mortgage")
    .alias("mtg")
    .description("Leveraged buying, refinancing, and HELOC operations");

  mtg
    .command("buy <game-id>")
    .description("Buy tokens using an acquisition mortgage (down payment + financing)")
    .requiredOption("--property <id>", "Property ID from the game pool")
    .requiredOption("--tokens <n>", "Tokens to purchase (LTV limit applies to purchase price)")
    .option("--rate-type <t>", "fixed or arm", "fixed")
    .action(async (gameId, opts, cmd) => {
      const res = await client(cmd).originateMortgage(gameId, {
        property_id: opts.property,
        tokens_to_buy: parseFloat(opts.tokens),
        rate_type: opts.rateType,
      });
      console.log(`Acquisition mortgage originated`);
      printMortgage(res);
    });

  mtg
    .command("refi <game-id>")
    .description("Refinance existing first lien (rate-and-term or cash-out)")
    .requiredOption("--property <id>", "Property ID")
    .option("--cash-out <n>", "Cash-out amount in USD (0 = rate-and-term refi)", "0")
    .option("--rate-type <t>", "New rate type: fixed or arm")
    .action(async (gameId, opts, cmd) => {
      const res = await client(cmd).refi(gameId, {
        property_id: opts.property,
        cash_out_amount: parseFloat(opts.cashOut),
        new_rate_type: opts.rateType,
      });
      const type = parseFloat(opts.cashOut) > 0 ? "Cash-out refi" : "Rate-and-term refi";
      console.log(`${type} completed`);
      printMortgage(res);
    });

  mtg
    .command("heloc <game-id>")
    .description("Draw from a HELOC (opens one if none exists)")
    .requiredOption("--property <id>", "Property ID")
    .requiredOption("--draw <n>", "Amount to draw in USD")
    .action(async (gameId, opts, cmd) => {
      const res = await client(cmd).helocDraw(gameId, {
        property_id: opts.property,
        draw_amount: parseFloat(opts.draw),
      });
      console.log(`HELOC draw of $${parseFloat(opts.draw).toFixed(2)} complete`);
      printMortgage(res);
    });

  mtg
    .command("repay <game-id>")
    .description("Repay drawn HELOC balance (reduces interest cost)")
    .requiredOption("--property <id>", "Property ID")
    .requiredOption("--amount <n>", "Amount to repay in USD")
    .action(async (gameId, opts, cmd) => {
      const res = await client(cmd).helocRepay(gameId, {
        property_id: opts.property,
        repay_amount: parseFloat(opts.amount),
      });
      console.log(`HELOC repayment of $${parseFloat(opts.amount).toFixed(2)} applied`);
      printMortgage(res);
    });

  mtg
    .command("list <game-id> <player-id>")
    .description("List all mortgages (active and historical) for a player")
    .action(async (gameId, playerId, cmd) => {
      const mortgages = await client(cmd).getDebt(gameId, playerId);
      if (!mortgages.length) { console.log("No mortgages on record."); return; }
      const active = mortgages.filter(m => m.status === "active");
      const inactive = mortgages.filter(m => m.status !== "active");
      console.log(`\nActive (${active.length}):`);
      for (const m of active) printMortgage(m);
      if (inactive.length) {
        console.log(`\nInactive (${inactive.length}):`);
        for (const m of inactive) {
          console.log(`  ${m.id.slice(0, 8)} ${m.mortgage_type} ${m.status} balance=$${m.current_balance.toFixed(2)}`);
        }
      }
    });
}
