/**
 * setup.ts — MCP installer wizard
 *
 * Mirrors the HTTPayer MCP setup pattern:
 * - Saves credentials to ~/.rentline-sandbox/credentials.json
 * - Server reads credentials from file at startup (no env vars needed in MCP config)
 * - MCP entry is just: { command: "npx", args: ["-y", "rentline-sandbox"] }
 */

import { createInterface } from "readline";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { saveConfig, loadConfig, DEFAULT_API_URL } from "./config.js";
import { createClient } from "./client.js";

const SKILL_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "SKILL.md");

// ─── MCP entry — credentials come from ~/.rentline-sandbox/credentials.json ──
// @latest ensures npx always bypasses stale cache and runs the current version.
// On Windows, npx must be invoked as npx.cmd (full path) since AI clients spawn
// processes without a shell, so PATH-based resolution of .cmd files fails.
function getNpxCommand(): string {
  if (platform() === "win32") {
    // Common Node install locations on Windows
    const candidates = [
      "C:\\Program Files\\nodejs\\npx.cmd",
      "C:\\Program Files (x86)\\nodejs\\npx.cmd",
    ];
    // Try to find via PATH too
    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      const found = execSync("where npx.cmd", { encoding: "utf8" }).trim().split("\n")[0].trim();
      if (found) return found;
    } catch {}
    for (const c of candidates) {
      try { require("fs").accessSync(c); return c; } catch {}
    }
  }
  return "npx";
}

const NPX = getNpxCommand();
const MCP_ENTRY = {
  command: NPX,
  args: ["-y", "rentline-sandbox@latest"],
};

// ─── Client config paths ──────────────────────────────────────────────────────

function openCodePath(scope: "user" | "project"): string {
  if (scope === "project") return join(process.cwd(), "opencode.json");
  // Global: prefer opencode.json, fall back to config.json
  const a = join(homedir(), ".config", "opencode", "opencode.json");
  const b = join(homedir(), ".config", "opencode", "config.json");
  return existsSync(b) && !existsSync(a) ? b : a;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function patchMcpJson(
  filePath: string,
  serverName: string,
  entry: Record<string, unknown>,
  key: "mcpServers" | "mcp",
  environment?: Record<string, string>
): void {
  let config: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try { config = JSON.parse(readFileSync(filePath, "utf-8")); } catch {}
  }
  mkdirSync(dirname(filePath), { recursive: true });
  if (key === "mcp") {
    if (!config["$schema"]) config["$schema"] = "https://opencode.ai/config.json";
    const mcp = (config.mcp ?? {}) as Record<string, unknown>;
    const mcpEntry: Record<string, unknown> = {
      type: "local",
      command: entry.args ? [entry.command, ...(entry.args as string[])] : [entry.command],
      enabled: true,
    };
    // OpenCode spawns MCP servers without inheriting the user's shell environment,
    // so os.homedir()-based credential file lookup is unreliable on Windows.
    // Passing the key explicitly via environment is the only reliable mechanism.
    if (environment && Object.keys(environment).length > 0) {
      mcpEntry.environment = environment;
    }
    mcp[serverName] = mcpEntry;
    config.mcp = mcp;
  } else {
    const servers = (config[key] ?? {}) as Record<string, unknown>;
    servers[serverName] = entry;
    config[key] = servers;
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2));
}

function installSkill(dirs: string[]): void {
  if (!existsSync(SKILL_SRC)) return;
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(SKILL_SRC, join(dir, "SKILL.md"));
    console.log(`SKILL.md → ${dir}`);
  }
}

// ─── Per-client install ───────────────────────────────────────────────────────

function installForClient(client: string, scope: "user" | "project", apiKey?: string): void {
  switch (client) {
    case "claude-code": {
      try {
        execSync(`claude mcp add rentline-sandbox --scope ${scope} -- npx -y rentline-sandbox`, { stdio: "pipe" });
        console.log(`Added via claude CLI (scope=${scope})`);
      } catch {
        const file = join(homedir(), ".claude.json");
        patchMcpJson(file, "rentline-sandbox", MCP_ENTRY, "mcpServers");
        console.log(`Patched ${file}`);
      }
      installSkill([
        join(homedir(), ".claude", "skills", "rentline-sandbox"),
        join(homedir(), ".agents", "skills", "rentline-sandbox"),
      ]);
      break;
    }
    case "claude-desktop": {
      const file = platform() === "win32"
        ? join(process.env.APPDATA ?? homedir(), "Claude", "claude_desktop_config.json")
        : platform() === "darwin"
        ? join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")
        : join(homedir(), ".config", "Claude", "claude_desktop_config.json");
      patchMcpJson(file, "rentline-sandbox", MCP_ENTRY, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "cursor": {
      const file = scope === "project"
        ? join(process.cwd(), ".cursor", "mcp.json")
        : join(homedir(), ".cursor", "mcp.json");
      patchMcpJson(file, "rentline-sandbox", MCP_ENTRY, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "windsurf": {
      const file = platform() === "win32"
        ? join(process.env.APPDATA ?? homedir(), ".codeium", "windsurf", "mcp_config.json")
        : join(homedir(), ".codeium", "windsurf", "mcp_config.json");
      patchMcpJson(file, "rentline-sandbox", MCP_ENTRY, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "opencode": {
      const file = openCodePath(scope);
      patchMcpJson(file, "rentline-sandbox", MCP_ENTRY, "mcp", apiKey ? { SANDBOX_API_KEY: apiKey } : undefined);
      console.log(`Patched ${file}`);
      installSkill([
        join(homedir(), ".config", "opencode", "skills", "rentline-sandbox"),
        join(homedir(), ".claude", "skills", "rentline-sandbox"),
        join(homedir(), ".agents", "skills", "rentline-sandbox"),
      ]);
      break;
    }
    case "zed": {
      console.log("\nAdd to your Zed settings.json:");
      console.log(JSON.stringify({ context_servers: { "rentline-sandbox": { command: { path: "npx", args: ["-y", "rentline-sandbox"] } } } }, null, 2));
      break;
    }
    default: {
      console.log("\nAdd to your MCP client config:");
      console.log(JSON.stringify({ mcpServers: { "rentline-sandbox": MCP_ENTRY } }, null, 2));
      break;
    }
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SetupOptions {
  key?: string;
  url?: string;
  name?: string;
  client?: string;
  scope?: "user" | "project";
  yes?: boolean;
}

export function parseSetupArgs(args: string[]): SetupOptions {
  const opts: SetupOptions = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--key" || a === "-k") && args[i+1]) opts.key = args[++i];
    else if ((a === "--url" || a === "-u") && args[i+1]) opts.url = args[++i];
    else if (a === "--name" && args[i+1]) opts.name = args[++i];
    else if ((a === "--client" || a === "-c") && args[i+1]) opts.client = args[++i];
    else if (a === "--scope" && args[i+1]) opts.scope = args[++i] as "user" | "project";
    else if (a === "--yes" || a === "-y") opts.yes = true;
  }
  return opts;
}

function detectClient(): string | undefined {
  const e = process.env;
  if (e.CLAUDE_CODE || e.ANTHROPIC_CLAUDE_CODE) return "claude-code";
  if (e.CURSOR_TRACE_ID || e.CURSOR_SESSION_ID) return "cursor";
  if (e.WINDSURF_EXTENSION_ID || e.CODEIUM_API_KEY) return "windsurf";
  if (e.OPENCODE_SESSION || e.OPENCODE_PROJECT) return "opencode";
  if (e.ZED_TERM) return "zed";
  return undefined;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runSetup(opts: SetupOptions = {}): Promise<void> {
  const rl = opts.yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, fallback = ""): Promise<string> => {
    if (opts.yes || !rl) return Promise.resolve(fallback);
    return new Promise(resolve => rl!.question(q, ans => resolve(ans.trim() || fallback)));
  };

  console.log("\nRentline Sandbox — MCP Setup\n");

  // 1 — API key
  const existing = loadConfig();
  let apiKey = opts.key ?? (opts.yes ? existing?.api_key : undefined);
  if (!apiKey) {
    apiKey = await ask(
      `API key${existing?.api_key ? " (Enter to keep existing)" : " (get one at sandbox.rentline.xyz/cli-auth)"}: `,
      existing?.api_key ?? ""
    );
  }
  if (!apiKey) {
    console.error("API key required. Get one at: https://sandbox.rentline.xyz/cli-auth");
    rl?.close(); process.exit(1);
  }

  // 2 — API URL
  const apiUrl = opts.url ?? (await ask(
    `API URL [${existing?.api_url ?? DEFAULT_API_URL}]: `,
    existing?.api_url ?? DEFAULT_API_URL
  ));

  // 3 — Display name
  const displayName = opts.name ?? (await ask(
    `Display name [${existing?.display_name ?? "Player"}]: `,
    existing?.display_name ?? "Player"
  ));

  // 4 — Verify
  process.stdout.write("Verifying connectivity… ");
  try {
    const h = await createClient({ apiUrl, apiKey }).health();
    console.log(`OK (${h.service})`);
  } catch (e) {
    console.log("FAILED");
    console.error(`Cannot reach ${apiUrl}: ${e}`);
    if (!opts.yes) {
      const cont = await ask("Save anyway? [y/N]: ", "n");
      if (cont.toLowerCase() !== "y") { rl?.close(); process.exit(1); }
    }
  }

  // 5 — Save credentials (server reads these at startup — no env vars in MCP config needed)
  saveConfig({ api_key: apiKey, api_url: apiUrl, display_name: displayName, created_at: new Date().toISOString() });
  console.log("Credentials saved to ~/.rentline-sandbox/credentials.json\n");

  // 6 — Detect client
  let client = opts.client ?? detectClient();
  if (!client) {
    const clients = ["claude-code", "claude-desktop", "cursor", "windsurf", "opencode", "zed", "cline", "other"];
    console.log("Which MCP client do you use?");
    clients.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const choice = await ask("Enter number or name: ", "other");
    const idx = parseInt(choice);
    client = isNaN(idx) ? choice : (clients[idx - 1] ?? "other");
  }

  // 7 — Install
  installForClient(client, opts.scope ?? "user", apiKey);

  rl?.close();
  console.log("\nSetup complete. Restart your AI client to load the Rentline Sandbox MCP server.\n");
}
