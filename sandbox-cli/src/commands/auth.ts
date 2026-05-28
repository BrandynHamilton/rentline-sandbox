/**
 * auth.ts — `sandbox auth` command group
 *
 * sandbox auth login --key <api-key> [--url <api-url>] [--name <display-name>]
 * sandbox auth logout
 * sandbox auth whoami
 */

import { Command } from "commander";
import { saveConfig, deleteConfig, loadConfig, DEFAULT_API_URL } from "../config.js";
import { createClient } from "../client.js";

export function registerAuth(program: Command) {
  const auth = program.command("auth").description("Manage sandbox API credentials");

  auth
    .command("login")
    .description("Save credentials for sandbox-api")
    .requiredOption("--key <key>", "Sandbox admin or user API key")
    .option("--url <url>", "Sandbox API base URL", DEFAULT_API_URL)
    .option("--name <name>", "Your default display name in games", "Player")
    .action(async (opts) => {
      const client = createClient({ apiUrl: opts.url, apiKey: opts.key });
      process.stdout.write("Verifying credentials… ");
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
        created_at: new Date().toISOString(),
      });
      console.log(`\nCredentials saved to ~/.rentline-sandbox/credentials.json`);
      console.log(`API URL:      ${opts.url}`);
      console.log(`Display name: ${opts.name}`);
    });

  auth
    .command("logout")
    .description("Remove saved credentials")
    .action(() => {
      deleteConfig();
      console.log("Logged out. Credentials removed.");
    });

  auth
    .command("whoami")
    .description("Show current credentials and API connectivity")
    .action(async () => {
      const cfg = loadConfig();
      if (!cfg) {
        console.log("Not logged in. Run: sandbox auth login --key <key>");
        return;
      }
      console.log(`API URL:      ${cfg.api_url}`);
      console.log(`Display name: ${cfg.display_name ?? "(not set)"}`);
      console.log(`Key prefix:   ${cfg.api_key.slice(0, 8)}…`);
      const client = createClient({ apiUrl: cfg.api_url, apiKey: cfg.api_key });
      process.stdout.write("Connectivity: ");
      try {
        const h = await client.health();
        console.log(`✓ ${h.service} is reachable`);
      } catch (e) {
        console.log(`✗ Cannot reach ${cfg.api_url}`);
      }
    });
}
