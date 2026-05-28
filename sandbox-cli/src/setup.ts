/**
 * setup.ts — MCP installer wizard
 *
 * Usage:
 *   sandbox setup                                    interactive
 *   sandbox setup --key <key> --url <url> --client claude-code --yes
 *   sandbox setup --client cursor --scope project
 *
 * Supported clients: claude-code, claude-desktop, cursor, windsurf, opencode, zed, cline, other
 */

import { createInterface } from "readline";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import { createClient } from "./client.js";
import { saveConfig, loadConfig, DEFAULT_API_URL } from "./config.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    if (a === "--key" || a === "-k") opts.key = args[++i];
    else if (a === "--url" || a === "-u") opts.url = args[++i];
    else if (a === "--name") opts.name = args[++i];
    else if (a === "--client" || a === "-c") opts.client = args[++i];
    else if (a === "--scope") opts.scope = args[++i] as "user" | "project";
    else if (a === "--yes" || a === "-y") opts.yes = true;
  }
  return opts;
}

export async function runSetup(opts: SetupOptions): Promise<void> {
  console.log("\nRentline Sandbox — MCP Setup\n");

  const rl = opts.yes
    ? null
    : createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string, fallback = ""): Promise<string> => {
    if (opts.yes || !rl) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      rl!.question(q, (ans) => resolve(ans.trim() || fallback));
    });
  };

  // 1 — API key
  let apiKey = opts.key;
  if (!apiKey) {
    const existing = loadConfig();
    if (existing?.api_key && opts.yes) {
      apiKey = existing.api_key;
    } else {
      apiKey = await ask(
        `Enter your sandbox API key${existing?.api_key ? " (press Enter to keep existing)" : ""}: `,
        existing?.api_key ?? ""
      );
    }
  }
  if (!apiKey) {
    console.error("API key is required. Get one from your sandbox-api admin.");
    process.exit(1);
  }

  // 2 — API URL
  const existing = loadConfig();
  const apiUrl =
    opts.url ??
    (await ask(
      `Sandbox API URL [${existing?.api_url ?? DEFAULT_API_URL}]: `,
      existing?.api_url ?? DEFAULT_API_URL
    ));

  // 3 — Display name
  const displayName =
    opts.name ??
    (await ask(`Your default display name [${existing?.display_name ?? "Player"}]: `,
      existing?.display_name ?? "Player"));

  // 4 — Verify connectivity
  process.stdout.write("Verifying connectivity… ");
  try {
    const c = createClient({ apiUrl, apiKey });
    const h = await c.health();
    console.log(`OK (${h.service})`);
  } catch (e) {
    console.log("FAILED");
    console.error(`Cannot reach ${apiUrl}: ${e}`);
    if (!opts.yes) {
      const cont = await ask("Save config anyway? [y/N]: ", "n");
      if (cont.toLowerCase() !== "y") { rl?.close(); process.exit(1); }
    }
  }

  // 5 — Save config
  saveConfig({ api_key: apiKey, api_url: apiUrl, display_name: displayName, created_at: new Date().toISOString() });
  console.log("Credentials saved.\n");

  // 6 — Detect or ask for client
  let clientName = opts.client ?? detectClient();
  if (!clientName) {
    console.log("Which MCP client do you use?");
    const clients = ["claude-code", "claude-desktop", "cursor", "windsurf", "opencode", "zed", "cline", "other"];
    clients.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const choice = await ask("Enter number or name: ", "other");
    const idx = parseInt(choice);
    clientName = isNaN(idx) ? choice : (clients[idx - 1] ?? "other");
  }

  // 7 — Install MCP config
  await installForClient(clientName, opts.scope ?? "user", apiKey, apiUrl, displayName);

  rl?.close();
  console.log("\nSetup complete. Restart your AI client to load the Rentline Sandbox MCP server.\n");
}

function detectClient(): string | undefined {
  const env = process.env;
  if (env.CLAUDE_CODE || env.ANTHROPIC_CLAUDE_CODE) return "claude-code";
  if (env.CURSOR_TRACE_ID || env.CURSOR_SESSION_ID) return "cursor";
  if (env.WINDSURF_SESSION) return "windsurf";
  if (env.OPENCODE_PROJECT || env.OPENCODE_SESSION) return "opencode";
  return undefined;
}

const MCP_SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "rentline-sandbox"],
  env: {},
};

function mcpEntry(apiKey: string, apiUrl: string) {
  return {
    ...MCP_SERVER_ENTRY,
    env: {
      SANDBOX_API_KEY: apiKey,
      SANDBOX_API_URL: apiUrl,
    },
  };
}

async function installForClient(
  clientName: string,
  scope: "user" | "project",
  apiKey: string,
  apiUrl: string,
  displayName: string
): Promise<void> {
  const entry = mcpEntry(apiKey, apiUrl);

  switch (clientName) {
    case "claude-code": {
      // Try `claude mcp add` first
      const { execSync } = await import("child_process");
      const envFlags = Object.entries(entry.env ?? {})
        .map(([k, v]) => `-e ${k}=${v}`)
        .join(" ");
      const cmd = `claude mcp add rentline-sandbox --scope ${scope} ${envFlags} -- npx -y rentline-sandbox`;
      try {
        execSync(cmd, { stdio: "pipe" });
        console.log(`Installed via claude CLI (scope=${scope})`);
      } catch {
        // Fallback: patch ~/.claude.json
        const file = join(homedir(), ".claude.json");
        patchMcpJson(file, "rentline-sandbox", entry, "mcpServers");
        console.log(`Patched ${file}`);
      }
      // Install SKILL.md — claude-compat path (~/.claude/skills/) and agent-compat (~/.agents/skills/)
      const skillSrc = join(__dirname, "../SKILL.md");
      if (existsSync(skillSrc)) {
        const targets = [
          join(homedir(), ".claude", "skills", "rentline-sandbox"),
          join(homedir(), ".agents", "skills", "rentline-sandbox"),
        ];
        for (const dir of targets) {
          mkdirSync(dir, { recursive: true });
          copyFileSync(skillSrc, join(dir, "SKILL.md"));
          console.log(`SKILL.md → ${dir}`);
        }
      }
      break;
    }
    case "claude-desktop": {
      const file = platform() === "win32"
        ? join(process.env.APPDATA ?? homedir(), "Claude", "claude_desktop_config.json")
        : join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
      patchMcpJson(file, "rentline-sandbox", entry, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "cursor": {
      const file = scope === "project"
        ? join(process.cwd(), ".cursor", "mcp.json")
        : join(homedir(), ".cursor", "mcp.json");
      patchMcpJson(file, "rentline-sandbox", entry, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "windsurf": {
      const file = join(process.cwd(), ".windsurf", "mcp.json");
      patchMcpJson(file, "rentline-sandbox", entry, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "opencode": {
      // Patch MCP config
      const file = scope === "project"
        ? join(process.cwd(), "opencode.json")
        : join(homedir(), ".config", "opencode", "config.json");
      patchMcpJson(file, "rentline-sandbox", entry, "mcp");
      console.log(`Patched ${file}`);

      // Install SKILL.md to all three locations OpenCode auto-discovers:
      //   ~/.config/opencode/skills/rentline-sandbox/SKILL.md  (global, opencode-native)
      //   ~/.claude/skills/rentline-sandbox/SKILL.md           (global, claude-compat)
      //   ~/.agents/skills/rentline-sandbox/SKILL.md           (global, agent-compat)
      const skillSrc = join(__dirname, "../SKILL.md");
      if (existsSync(skillSrc)) {
        const targets = [
          join(homedir(), ".config", "opencode", "skills", "rentline-sandbox"),
          join(homedir(), ".claude", "skills", "rentline-sandbox"),
          join(homedir(), ".agents", "skills", "rentline-sandbox"),
        ];
        for (const dir of targets) {
          mkdirSync(dir, { recursive: true });
          copyFileSync(skillSrc, join(dir, "SKILL.md"));
          console.log(`SKILL.md → ${dir}`);
        }
      }
      break;
    }
    case "zed":
    case "cline":
    case "warp":
    case "other":
    default: {
      console.log(`\nAdd the following to your MCP client config:\n`);
      console.log(JSON.stringify({ "rentline-sandbox": entry }, null, 2));
      break;
    }
  }
}

function patchMcpJson(
  filePath: string,
  serverName: string,
  entry: object,
  key: "mcpServers" | "mcp"
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  let config: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try { config = JSON.parse(readFileSync(filePath, "utf-8")); } catch {}
  }
  const servers = (config[key] as Record<string, unknown>) ?? {};
  servers[serverName] = entry;
  config[key] = servers;
  writeFileSync(filePath, JSON.stringify(config, null, 2));
}
