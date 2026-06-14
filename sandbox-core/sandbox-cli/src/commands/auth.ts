/**
 * auth.ts — `sandbox auth` command group
 *
 * sandbox auth login [--key <api-key>] [--url <api-url>] [--name <display-name>]
 *   --key     Direct API key login (admin/dev flow)
 *   (no flag) Browser-based OAuth login via Clerk — opens sandbox.rentline.xyz/cli-auth
 *
 * sandbox auth logout
 * sandbox auth whoami
 */

import { Command } from "commander";
import { createInterface } from "readline";
import { saveConfig, deleteConfig, loadConfig, updateOpenCodeKey, DEFAULT_API_URL } from "../config.js";
import { createClient } from "../client.js";

const CLI_AUTH_URL = "https://sandbox.rentline.xyz/cli-auth";

/** Open a URL in the default browser, cross-platform. */
async function openBrowser(url: string): Promise<void> {
  const { platform } = process;
  const { spawn } = await import("child_process");
  const cmd =
    platform === "win32" ? "cmd" :
    platform === "darwin" ? "open" :
    "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

/** Prompt the user for a line of input from stdin. */
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function registerAuth(program: Command) {
  const auth = program.command("auth").description("Manage sandbox API credentials");

  auth
    .command("login")
    .description("Authenticate with sandbox-api (browser OAuth or direct API key)")
    .option("--key <key>", "API key for direct login (skips browser)")
    .option("--url <url>", "Sandbox API base URL")
    .option("--name <name>", "Your default display name in games")
    .action(async (opts) => {
      // ── Direct key login ────────────────────────────────────────────────────
      if (opts.key) {
        // Preserve existing url/name if not explicitly passed
        const existing = loadConfig();
        const apiUrl = opts.url ?? existing?.api_url ?? DEFAULT_API_URL;
        const displayName = opts.name ?? existing?.display_name ?? "Player";

        const client = createClient({ apiUrl, apiKey: opts.key });
        process.stdout.write("Verifying credentials… ");
        try {
          const health = await client.health();
          console.log(`OK (${health.service})`);
        } catch (e) {
          console.log(`FAILED`);
          console.error(`Could not reach ${apiUrl}: ${e}`);
          process.exit(1);
        }
        saveConfig({
          api_key: opts.key,
          api_url: apiUrl,
          display_name: displayName,
          created_at: new Date().toISOString(),
        });
        updateOpenCodeKey(opts.key);
        console.log(`\nCredentials saved.`);
        console.log(`Key prefix:   ${opts.key.slice(0, 8)}…`);
        console.log(`API URL:      ${apiUrl}`);
        console.log(`Display name: ${displayName}`);
        console.log(`\nRestart your AI client to pick up the new key.`);
        return;
      }

      // ── Browser OAuth login ─────────────────────────────────────────────────
      console.log("\nOpening browser to sign in with Clerk…");
      console.log(`\n  ${CLI_AUTH_URL}\n`);
      console.log("If the browser does not open automatically, visit the URL above.\n");

      try {
        await openBrowser(CLI_AUTH_URL);
      } catch {
        // Non-fatal — user can open manually
      }

      const rawKey = await prompt("Paste the key shown in the browser and press Enter: ");

      if (!rawKey || rawKey.length < 8) {
        console.error("No key provided. Login cancelled.");
        process.exit(1);
      }

      // Verify the pasted key actually works against the API
      const client = createClient({ apiUrl: opts.url, apiKey: rawKey });
      process.stdout.write("Verifying key… ");
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
        api_key: rawKey,
        api_url: opts.url,
        display_name: opts.name,
        created_at: new Date().toISOString(),
      });
      updateOpenCodeKey(rawKey);

      console.log(`\nLogged in. Credentials saved to ~/.rentline-sandbox/credentials.json`);
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
        console.log("Not logged in. Run: sandbox auth login");
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
      } catch {
        console.log(`✗ Cannot reach ${cfg.api_url}`);
      }
    });
}
