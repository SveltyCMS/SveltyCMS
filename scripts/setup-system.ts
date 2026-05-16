#!/usr/bin/env bun
/**
 * @file scripts/setup-system.ts
 * @description Fast, reliable system setup for SveltyCMS in CI/Testing.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ========================= CONFIG =========================
const cfg = {
  apiBase: process.env.API_BASE_URL ?? "http://localhost:4173",
  apiSecret: process.env.TEST_API_SECRET || getFallbackSecret(),
  rootDir: process.cwd(),
  db: {
    type: process.env.DB_TYPE ?? "sqlite",
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    name: process.env.DB_NAME ?? "SveltyCMS_test",
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
  },
  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    email: process.env.ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.ADMIN_PASSWORD ?? "Password123!",
  },
  system: {
    multiTenant: process.env.MULTI_TENANT === "true",
    demoMode: process.env.DEMO === "true",
    useRedis: process.env.USE_REDIS === "true",
    preset: process.env.PRESET ?? "blog",
  },
  timeouts: {
    script: Number(process.env.SETUP_TIMEOUT_MS ?? 300_000),
    fetch: Number(process.env.FETCH_TIMEOUT_MS ?? 25_000),
    wait: Number(process.env.WAIT_TIMEOUT_MS ?? 60_000),
  },
  retry: {
    maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS ?? 8),
    baseMs: Number(process.env.RETRY_BASE_MS ?? 800),
  },
  flags: {
    clean: process.argv.includes("--clean"),
    overwrite: process.argv.includes("--overwrite"),
    verbose: process.argv.includes("--verbose"),
  },
} as const;

// ========================= HELPERS =========================
function getFallbackSecret(): string {
  try {
    const secretPath = join(process.cwd(), "tests/e2e/.auth/test-secret.txt");
    if (existsSync(secretPath)) {
      return require("node:fs").readFileSync(secretPath, "utf8").trim();
    }
  } catch {}
  return "SVELTYCMS_TEST_SECRET_2026";
}

function fatal(msg: string, err?: unknown): never {
  console.error(`❌ ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ========================= HTTP =========================
async function postAction(action: string, payload: Record<string, any>) {
  const form = new FormData();

  // completeSetup expects the entire payload in a single 'data' field
  if (action === "completeSetup") {
    form.append("data", JSON.stringify(payload));
  } else {
    // Other actions (testDatabase, seedDatabase) expect individual fields
    for (const [key, value] of Object.entries(payload)) {
      form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }

  for (let attempt = 1; attempt <= cfg.retry.maxAttempts; attempt++) {
    try {
      const res = await fetch(`${cfg.apiBase}/setup?/${action}`, {
        method: "POST",
        body: form,
        headers: {
          "x-sveltekit-action": "true",
          "x-test-secret": cfg.apiSecret,
          Origin: cfg.apiBase,
          Referer: `${cfg.apiBase}/setup`,
        },
        signal: AbortSignal.timeout(cfg.timeouts.fetch),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();

      // 🚀 HARDENING: SvelteKit actions return JSON with "type" and "data"
      // "data" is often a JSON string that we need to parse to check internal success.
      let result = json;
      if (typeof json.data === "string") {
        try {
          result = JSON.parse(json.data);
        } catch {
          // data is not a JSON string, use the outer object
        }
      } else if (json.data) {
        result = json.data;
      }

      if (json.type === "failure" || result.success === false) {
        throw new Error(result.message || result.error || "Action failed without message");
      }

      return result;
    } catch (err: any) {
      if (attempt === cfg.retry.maxAttempts) throw err;

      const delay = Math.min(cfg.retry.baseMs * 2 ** (attempt - 1), 8000);
      console.warn(
        `[${action}] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }
}

// ========================= MAIN STEPS =========================
async function waitForServer() {
  console.log(`Waiting for server at ${cfg.apiBase}...`);
  const deadline = Date.now() + cfg.timeouts.wait;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${cfg.apiBase}/api/system/health`, {
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json().catch(() => ({}));
      if (["READY", "WARMED", "SETUP"].includes(data.overallStatus ?? data.status)) {
        console.log(`Server ready (status: ${data.overallStatus || data.status})`);
        return;
      }
    } catch {}
    await sleep(800);
  }
  fatal("Server did not become ready in time.");
}

async function main() {
  console.log("🚀 Starting SveltyCMS System Setup...");

  // Ensure config directory
  mkdirSync(join(cfg.rootDir, "config"), { recursive: true });

  await waitForServer();

  if (cfg.flags.clean) {
    console.log("🧹 Cleaning previous state...");
  }

  // Test DB Connection
  console.log("🔌 Testing database connection...");
  await postAction("testDatabase", {
    config: cfg.db,
    createIfMissing: true,
    allowOverwrite: cfg.flags.overwrite,
  });

  // Seed Data
  console.log(`🌱 Seeding database (preset: ${cfg.system.preset})...`);
  await postAction("seedDatabase", { config: cfg.db, system: cfg.system });

  // Complete Setup
  console.log("🔧 Completing system setup...");
  await postAction("completeSetup", {
    database: cfg.db,
    admin: cfg.admin,
    system: cfg.system,
  });

  console.log("✅ System setup completed successfully.");
}

if (import.meta.main) {
  main().catch((err) => fatal("Setup failed", err));
}
