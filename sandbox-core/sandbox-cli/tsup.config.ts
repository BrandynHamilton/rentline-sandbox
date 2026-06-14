import { defineConfig } from "tsup";

export default defineConfig([
  // ── CLI entry (needs shebang so `sandbox` works as a bin) ──────────────────
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "es2022",
    sourcemap: false,
    clean: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // ── MCP server entry (also needs shebang for direct invocation) ────────────
  {
    entry: { server: "src/server.ts" },
    format: ["esm"],
    target: "es2022",
    sourcemap: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
