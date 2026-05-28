#!/usr/bin/env node

// src/config.ts
import { readFileSync, writeFileSync, mkdirSync, chmodSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var CONFIG_DIR = join(homedir(), ".rentline-sandbox");
var CONFIG_FILE = join(CONFIG_DIR, "credentials.json");
var DEFAULT_API_URL = "http://localhost:6532";
function loadConfig() {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function requireConfig() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error(
      "Not authenticated. Run:\n\n  sandbox auth login --key <your-api-key>\n"
    );
    process.exit(1);
  }
  return cfg;
}
function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 384 });
  try {
    chmodSync(CONFIG_FILE, 384);
  } catch {
  }
}
function deleteConfig() {
  try {
    unlinkSync(CONFIG_FILE);
  } catch {
  }
}
function getApiUrl(override) {
  const cfg = loadConfig();
  return override || process.env.SANDBOX_API_URL || cfg?.api_url || DEFAULT_API_URL;
}
function getApiKey(override) {
  const cfg = loadConfig();
  return override || process.env.SANDBOX_API_KEY || cfg?.api_key;
}

export {
  DEFAULT_API_URL,
  loadConfig,
  requireConfig,
  saveConfig,
  deleteConfig,
  getApiUrl,
  getApiKey
};
//# sourceMappingURL=chunk-AS634Y3M.js.map