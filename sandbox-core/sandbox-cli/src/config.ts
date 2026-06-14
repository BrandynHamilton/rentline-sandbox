/**
 * config.ts — credential and preferences storage
 *
 * Credentials file: ~/.rentline-sandbox/credentials.json
 * Config schema:
 *   {
 *     "api_key": "sb_...",         // admin API key OR user session key
 *     "api_url": "http://...",     // sandbox-api base URL
 *     "display_name": "Alice",    // default player display name
 *     "created_at": "2026-..."
 *   }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

// Paths to well-known OpenCode config files that may contain an MCP environment block.
const OPENCODE_CONFIG_PATHS = [
  join(homedir(), ".config", "opencode", "opencode.json"),
  join(homedir(), ".config", "opencode", "config.json"),
];

const CONFIG_DIR = join(homedir(), ".rentline-sandbox");
const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");

export const DEFAULT_API_URL = "https://sandbox-api.rentline.xyz";

export interface SandboxConfig {
  api_key: string;
  api_url: string;
  display_name?: string;
  created_at: string;
}

export function loadConfig(): SandboxConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as SandboxConfig;
  } catch {
    return null;
  }
}

export function requireConfig(): SandboxConfig {
  const cfg = loadConfig();
  if (!cfg) {
    console.error(
      "Not authenticated. Run:\n\n  sandbox auth login --key <your-api-key>\n"
    );
    process.exit(1);
  }
  return cfg;
}

export function saveConfig(cfg: SandboxConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {}
}

export function deleteConfig(): void {
  try { unlinkSync(CONFIG_FILE); } catch {}
}

/**
 * Patch SANDBOX_API_KEY inside the `environment` block of any OpenCode config
 * files that already have a rentline-sandbox MCP entry. Silently skips files
 * that don't exist or don't have the entry (setup was not run for that client).
 * Returns the list of files that were updated.
 */
export function updateOpenCodeKey(newKey: string): string[] {
  const updated: string[] = [];
  for (const filePath of OPENCODE_CONFIG_PATHS) {
    if (!existsSync(filePath)) continue;
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      continue;
    }
    const mcp = config.mcp as Record<string, unknown> | undefined;
    const entry = mcp?.["rentline-sandbox"] as Record<string, unknown> | undefined;
    if (!entry) continue; // not set up for opencode, skip
    const env = (entry.environment ?? {}) as Record<string, string>;
    env["SANDBOX_API_KEY"] = newKey;
    entry.environment = env;
    try {
      writeFileSync(filePath, JSON.stringify(config, null, 2));
      updated.push(filePath);
    } catch {
      // Non-fatal — credentials.json is the source of truth
    }
  }
  return updated;
}

export function getApiUrl(override?: string): string {
  const cfg = loadConfig();
  return override || process.env.SANDBOX_API_URL || cfg?.api_url || DEFAULT_API_URL;
}

export function getApiKey(override?: string): string | undefined {
  const cfg = loadConfig();
  return override || process.env.SANDBOX_API_KEY || cfg?.api_key;
}
