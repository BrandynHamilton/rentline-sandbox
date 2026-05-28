#!/usr/bin/env node
import {
  getApiKey,
  getApiUrl,
  requireConfig
} from "./chunk-AS634Y3M.js";
import {
  createClient
} from "./chunk-IEOCAGIJ.js";

// src/commands/trade.ts
function client(cmd) {
  const opts = cmd.optsWithGlobals();
  const cfg = requireConfig();
  return createClient({ apiUrl: getApiUrl(opts.url), apiKey: getApiKey(opts.apiKey) ?? cfg.api_key });
}
function registerTrade(program) {
  const trade = program.command("trade").description("Buy and sell property tokens");
  trade.command("buy <game-id>").description("Buy fractional property tokens (cash purchase, no mortgage)").requiredOption("--property <id>", "Property ID from the game pool").requiredOption("--tokens <n>", "Number of tokens to buy (fractions allowed)").action(async (gameId, opts, cmd) => {
    const res = await client(cmd).trade(gameId, {
      property_id: opts.property,
      direction: "buy",
      tokens: parseFloat(opts.tokens)
    });
    console.log(`BUY  ${res.tokens} tokens @ $${res.price_per_token_usd?.toFixed(2)}`);
    console.log(`Cost: $${res.amount_usdc?.toFixed(2)}`);
    console.log(`Transaction: ${res.transaction_id}`);
  });
  trade.command("sell <game-id>").description("Sell fractional property tokens back to the pool").requiredOption("--property <id>", "Property ID").requiredOption("--tokens <n>", "Number of tokens to sell").action(async (gameId, opts, cmd) => {
    const res = await client(cmd).trade(gameId, {
      property_id: opts.property,
      direction: "sell",
      tokens: parseFloat(opts.tokens)
    });
    console.log(`SELL ${res.tokens} tokens @ $${res.price_per_token_usd?.toFixed(2)}`);
    console.log(`Proceeds: $${res.amount_usdc?.toFixed(2)}`);
    console.log(`Transaction: ${res.transaction_id}`);
  });
  program.command("portfolio <game-id> <player-id>").description("Show holdings, P&L, NAV, and leverage for a player").action(async (gameId, playerId, cmd) => {
    const p = await client(cmd).getPortfolio(gameId, playerId);
    console.log(`
Portfolio: ${p.display_name}`);
    console.log(`${"\u2500".repeat(70)}`);
    console.log(`Cash balance:    $${p.usdc_balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    console.log(`Total debt:     -$${p.total_debt.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    console.log(`Gross assets:    $${p.gross_asset_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    console.log(`NAV:             $${p.nav.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    console.log(`Leverage ratio:  ${(p.leverage_ratio * 100).toFixed(1)}%`);
    if (p.holdings.length) {
      console.log(`
Holdings:`);
      console.log(`${"Property".padEnd(30)}${"Tokens".padStart(10)}${"Value".padStart(14)}${"P&L".padStart(12)}${"Yield".padStart(10)}`);
      console.log("\u2500".repeat(76));
      for (const h of p.holdings) {
        const pnlSign = h.unrealized_pnl_usd >= 0 ? "+" : "";
        console.log(
          `${(h.property_name ?? h.property_id).slice(0, 28).padEnd(30)}${h.tokens_held.toFixed(2).padStart(10)}$${h.current_value_usd.toFixed(2).padStart(13)}${pnlSign}$${h.unrealized_pnl_usd.toFixed(2).padStart(11)}$${h.total_rent_received_usd.toFixed(2).padStart(9)}`
        );
      }
    } else {
      console.log("\nNo holdings yet.");
    }
  });
}
export {
  registerTrade
};
//# sourceMappingURL=trade-BP7XBG27.js.map