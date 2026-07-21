#!/usr/bin/env bun
/**
 * @file scripts/start-integration-server.ts
 * @description Starts the integration test preview server in the background.
 *
 * Run BEFORE `bun test tests/integration/`:
 *   bun run scripts/start-integration-server.ts
 *   bun test tests/integration/
 *
 * On Windows, bun test cannot reliably spawn child processes (execSync/spawn fail),
 * so the server must be started separately.
 */

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PORT = process.env.PORT ?? "4173";
const API_BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_TYPE = process.env.DB_TYPE ?? "sqlite";
const DB_NAME = process.env.DB_NAME ?? "sveltycms_test";
const entryPoint = join(ROOT, "build", "index.js");

if (!existsSync(entryPoint)) {
  console.error("❌ Build not found. Run: COMPILE_ALL_ADAPTERS=true bun run build");
  process.exit(1);
}

// Clean up stale SQLite test database
if (DB_TYPE === "sqlite") {
  const dbPath = join(ROOT, "config", "test-database", `${DB_NAME}.sqlite`);
  for (const p of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

const env = {
  ...process.env,
  PORT,
  API_BASE_URL,
  DB_TYPE,
  DB_NAME,
  TEST_MODE: "true",
  NODE_ENV: "test",
};

// Start server in background using spawn (avoids Node.js DEP0190 deprecation)
console.log(`🚀 Starting server on port ${PORT}...`);
const server = spawn("node", [entryPoint], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  shell: false,
});
server.unref();
const logStream = createWriteStream("preview.log", { flags: "a" });
server.stdout.pipe(logStream);
server.stderr.pipe(logStream);

// Wait for it to be ready
const maxAttempts = 30;
for (let i = 0; i < maxAttempts; i++) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/system/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json().catch(() => ({}));
    const status = (data.overallStatus ?? data.status ?? "").toString().toLowerCase();
    if (["ready", "healthy", "setup", "degraded"].includes(status)) {
      console.log(`✅ Server ready (state: ${status})`);
      process.exit(0);
    }
  } catch {
    /* waiting */
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.error("❌ Server not ready after 30s. Check preview.log");
process.exit(1);
