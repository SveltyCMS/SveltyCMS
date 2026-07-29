#!/usr/bin/env bun
/**
 * @file scripts/provision-e2e.ts
 * @description Setup local environment for Playwright E2E testing.
 *
 * 1. Checks for a production build (runs 'bun run build' if missing).
 * 2. Ensures config/private.test.ts exists with correct test credentials.
 * 3. Starts preview server on :4173 with TEST_MODE=true.
 *
 * Usage: bun run scripts/provision-e2e.ts
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

console.log("━━━ SveltyCMS E2E Provisioning ━━━");

// 1. Check for production build
if (!existsSync(join(ROOT, "build"))) {
  console.log("⚠️ Production build not found. Running build...");
  try {
    execSync("bun run build", { stdio: "inherit", cwd: ROOT });
  } catch {
    console.error("❌ Build failed.");
    process.exit(1);
  }
}

// 2. Ensure config/private.test.ts exists
const testConfigPath = join(ROOT, "config", "private.test.ts");
if (!existsSync(testConfigPath)) {
  console.log("ℹ️ Creating config/private.test.ts...");
  mkdirSync(join(ROOT, "config"), { recursive: true });
  writeFileSync(
    testConfigPath,
    `export const privateEnv = {
  DB_TYPE: "sqlite",
  DB_HOST: "127.0.0.1",
  DB_NAME: "sveltycms_test",
  DB_USER: "",
  DB_PASSWORD: "",
  JWT_SECRET_KEY: "Integration-Test-JWT-Secret-Key-2026",
  ENCRYPTION_KEY: "Integration-Encryption-Key-2026-32ch",
  TEST_API_SECRET: "test-secret-123",
  ADMIN_PASSWORD: "Password123!",
  PORT: 4173,
  ORIGIN: "http://127.0.0.1:4173"
};\nexport const privateConfig = privateEnv;\nexport default privateEnv;\n`,
  );
}

// 3. Start preview server
console.log("🚀 Starting preview server on http://127.0.0.1:4173...");
console.log("Note: Server is running. Press Ctrl+C to stop.");

const server = spawn("node", ["build/index.js"], {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "4173",
    ORIGIN: "http://127.0.0.1:4173",
    TEST_MODE: "true",
  },
});

server.on("exit", (code) => {
  process.exit(code ?? 0);
});
