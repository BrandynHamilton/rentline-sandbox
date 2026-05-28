#!/usr/bin/env node
import {
  DEFAULT_API_URL,
  loadConfig,
  saveConfig
} from "./chunk-AS634Y3M.js";
import {
  createClient
} from "./chunk-IEOCAGIJ.js";

// src/setup.ts
import { createInterface } from "readline";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
function parseSetupArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--key" || a === "-k") opts.key = args[++i];
    else if (a === "--url" || a === "-u") opts.url = args[++i];
    else if (a === "--name") opts.name = args[++i];
    else if (a === "--client" || a === "-c") opts.client = args[++i];
    else if (a === "--scope") opts.scope = args[++i];
    else if (a === "--yes" || a === "-y") opts.yes = true;
  }
  return opts;
}
async function runSetup(opts) {
  console.log("\nRentline Sandbox \u2014 MCP Setup\n");
  const rl = opts.yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, fallback = "") => {
    if (opts.yes || !rl) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      rl.question(q, (ans) => resolve(ans.trim() || fallback));
    });
  };
  let apiKey = opts.key;
  if (!apiKey) {
    const existing2 = loadConfig();
    if (existing2?.api_key && opts.yes) {
      apiKey = existing2.api_key;
    } else {
      apiKey = await ask(
        `Enter your sandbox API key${existing2?.api_key ? " (press Enter to keep existing)" : ""}: `,
        existing2?.api_key ?? ""
      );
    }
  }
  if (!apiKey) {
    console.error("API key is required. Get one from your sandbox-api admin.");
    process.exit(1);
  }
  const existing = loadConfig();
  const apiUrl = opts.url ?? await ask(
    `Sandbox API URL [${existing?.api_url ?? DEFAULT_API_URL}]: `,
    existing?.api_url ?? DEFAULT_API_URL
  );
  const displayName = opts.name ?? await ask(
    `Your default display name [${existing?.display_name ?? "Player"}]: `,
    existing?.display_name ?? "Player"
  );
  process.stdout.write("Verifying connectivity\u2026 ");
  try {
    const c = createClient({ apiUrl, apiKey });
    const h = await c.health();
    console.log(`OK (${h.service})`);
  } catch (e) {
    console.log("FAILED");
    console.error(`Cannot reach ${apiUrl}: ${e}`);
    if (!opts.yes) {
      const cont = await ask("Save config anyway? [y/N]: ", "n");
      if (cont.toLowerCase() !== "y") {
        rl?.close();
        process.exit(1);
      }
    }
  }
  saveConfig({ api_key: apiKey, api_url: apiUrl, display_name: displayName, created_at: (/* @__PURE__ */ new Date()).toISOString() });
  console.log("Credentials saved.\n");
  let clientName = opts.client ?? detectClient();
  if (!clientName) {
    console.log("Which MCP client do you use?");
    const clients = ["claude-code", "claude-desktop", "cursor", "windsurf", "opencode", "zed", "cline", "other"];
    clients.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const choice = await ask("Enter number or name: ", "other");
    const idx = parseInt(choice);
    clientName = isNaN(idx) ? choice : clients[idx - 1] ?? "other";
  }
  await installForClient(clientName, opts.scope ?? "user", apiKey, apiUrl, displayName);
  rl?.close();
  console.log("\nSetup complete. Restart your AI client to load the Rentline Sandbox MCP server.\n");
}
function detectClient() {
  const env = process.env;
  if (env.CLAUDE_CODE || env.ANTHROPIC_CLAUDE_CODE) return "claude-code";
  if (env.CURSOR_TRACE_ID || env.CURSOR_SESSION_ID) return "cursor";
  if (env.WINDSURF_SESSION) return "windsurf";
  if (env.OPENCODE_PROJECT || env.OPENCODE_SESSION) return "opencode";
  return void 0;
}
var MCP_SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "rentline-sandbox"],
  env: {}
};
function mcpEntry(apiKey, apiUrl) {
  return {
    ...MCP_SERVER_ENTRY,
    env: {
      SANDBOX_API_KEY: apiKey,
      SANDBOX_API_URL: apiUrl
    }
  };
}
async function installForClient(clientName, scope, apiKey, apiUrl, displayName) {
  const entry = mcpEntry(apiKey, apiUrl);
  switch (clientName) {
    case "claude-code": {
      const { execSync } = await import("child_process");
      const envFlags = Object.entries(entry.env ?? {}).map(([k, v]) => `-e ${k}=${v}`).join(" ");
      const cmd = `claude mcp add rentline-sandbox --scope ${scope} ${envFlags} -- npx -y rentline-sandbox`;
      try {
        execSync(cmd, { stdio: "pipe" });
        console.log(`Installed via claude CLI (scope=${scope})`);
      } catch {
        const file = join(homedir(), ".claude.json");
        patchMcpJson(file, "rentline-sandbox", entry, "mcpServers");
        console.log(`Patched ${file}`);
      }
      const skillSrc = join(__dirname, "../SKILL.md");
      if (existsSync(skillSrc)) {
        const targets = [
          join(homedir(), ".claude", "skills", "rentline-sandbox"),
          join(homedir(), ".agents", "skills", "rentline-sandbox")
        ];
        for (const dir of targets) {
          mkdirSync(dir, { recursive: true });
          copyFileSync(skillSrc, join(dir, "SKILL.md"));
          console.log(`SKILL.md \u2192 ${dir}`);
        }
      }
      break;
    }
    case "claude-desktop": {
      const file = platform() === "win32" ? join(process.env.APPDATA ?? homedir(), "Claude", "claude_desktop_config.json") : join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
      patchMcpJson(file, "rentline-sandbox", entry, "mcpServers");
      console.log(`Patched ${file}`);
      break;
    }
    case "cursor": {
      const file = scope === "project" ? join(process.cwd(), ".cursor", "mcp.json") : join(homedir(), ".cursor", "mcp.json");
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
      const file = scope === "project" ? join(process.cwd(), "opencode.json") : join(homedir(), ".config", "opencode", "config.json");
      patchMcpJson(file, "rentline-sandbox", entry, "mcp");
      console.log(`Patched ${file}`);
      const skillSrc = join(__dirname, "../SKILL.md");
      if (existsSync(skillSrc)) {
        const targets = [
          join(homedir(), ".config", "opencode", "skills", "rentline-sandbox"),
          join(homedir(), ".claude", "skills", "rentline-sandbox"),
          join(homedir(), ".agents", "skills", "rentline-sandbox")
        ];
        for (const dir of targets) {
          mkdirSync(dir, { recursive: true });
          copyFileSync(skillSrc, join(dir, "SKILL.md"));
          console.log(`SKILL.md \u2192 ${dir}`);
        }
      }
      break;
    }
    case "zed":
    case "cline":
    case "warp":
    case "other":
    default: {
      console.log(`
Add the following to your MCP client config:
`);
      console.log(JSON.stringify({ "rentline-sandbox": entry }, null, 2));
      break;
    }
  }
}
function patchMcpJson(filePath, serverName, entry, key) {
  mkdirSync(dirname(filePath), { recursive: true });
  let config = {};
  if (existsSync(filePath)) {
    try {
      config = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
    }
  }
  const servers = config[key] ?? {};
  servers[serverName] = entry;
  config[key] = servers;
  writeFileSync(filePath, JSON.stringify(config, null, 2));
}
export {
  parseSetupArgs,
  runSetup
};
//# sourceMappingURL=setup-2SML24ZN.js.map