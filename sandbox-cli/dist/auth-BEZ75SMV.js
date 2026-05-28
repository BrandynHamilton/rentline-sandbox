#!/usr/bin/env node
import {
  DEFAULT_API_URL,
  deleteConfig,
  loadConfig,
  saveConfig
} from "./chunk-AS634Y3M.js";
import {
  createClient
} from "./chunk-IEOCAGIJ.js";

// src/commands/auth.ts
function registerAuth(program) {
  const auth = program.command("auth").description("Manage sandbox API credentials");
  auth.command("login").description("Save credentials for sandbox-api").requiredOption("--key <key>", "Sandbox admin or user API key").option("--url <url>", "Sandbox API base URL", DEFAULT_API_URL).option("--name <name>", "Your default display name in games", "Player").action(async (opts) => {
    const client = createClient({ apiUrl: opts.url, apiKey: opts.key });
    process.stdout.write("Verifying credentials\u2026 ");
    try {
      const health = await client.health();
      console.log(`OK (${health.service})`);
    } catch (e) {
      console.log(`FAILED`);
      console.error(`Could not reach ${opts.url}: ${e}`);
      console.error("Check that sandbox-api is running and the URL is correct.");
      process.exit(1);
    }
    saveConfig({
      api_key: opts.key,
      api_url: opts.url,
      display_name: opts.name,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log(`
Credentials saved to ~/.rentline-sandbox/credentials.json`);
    console.log(`API URL:      ${opts.url}`);
    console.log(`Display name: ${opts.name}`);
  });
  auth.command("logout").description("Remove saved credentials").action(() => {
    deleteConfig();
    console.log("Logged out. Credentials removed.");
  });
  auth.command("whoami").description("Show current credentials and API connectivity").action(async () => {
    const cfg = loadConfig();
    if (!cfg) {
      console.log("Not logged in. Run: sandbox auth login --key <key>");
      return;
    }
    console.log(`API URL:      ${cfg.api_url}`);
    console.log(`Display name: ${cfg.display_name ?? "(not set)"}`);
    console.log(`Key prefix:   ${cfg.api_key.slice(0, 8)}\u2026`);
    const client = createClient({ apiUrl: cfg.api_url, apiKey: cfg.api_key });
    process.stdout.write("Connectivity: ");
    try {
      const h = await client.health();
      console.log(`\u2713 ${h.service} is reachable`);
    } catch (e) {
      console.log(`\u2717 Cannot reach ${cfg.api_url}`);
    }
  });
}
export {
  registerAuth
};
//# sourceMappingURL=auth-BEZ75SMV.js.map