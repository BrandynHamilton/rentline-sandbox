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

const CONFIG_DIR = join(homedir(), ".rentline-sandbox");
const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");

export const DEFAULT_API_URL = "http://localhost:6532";

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

export function getApiUrl(override?: string): string {
  const cfg = loadConfig();
  return override || process.env.SANDBOX_API_URL || cfg?.api_url || DEFAULT_API_URL;
}

export function getApiKey(override?: string): string | undefined {
  const cfg = loadConfig();
  return override || process.env.SANDBOX_API_KEY || cfg?.api_key;
}
