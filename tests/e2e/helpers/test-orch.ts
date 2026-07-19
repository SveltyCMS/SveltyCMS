/**
 * @file tests/e2e/helpers/test-orch.ts
 * @description Orchestrator for the God-Mode /api/testing endpoint to manage test state.
 *
 * Self-contained — no project imports. Runs in Playwright's Node context.
 *
 * Uses the deterministic `reset-to-state` endpoint to switch between SETUP and READY modes.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function getBaseUrl(): string {
  return process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:5173";
}

function getSecret(): string {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  try {
    const secretPath = join(process.cwd(), "tests/e2e/.auth/test-secret.txt");
    if (existsSync(secretPath)) return readFileSync(secretPath, "utf-8").trim();
  } catch {}
  // No env var or file found — write a deterministic secret to the file so the
  // server's setup-check.ts getTestSecret() can read the same value. Without
  // this, the server generates a random secret and the 401 is permanent.
  const { writeFileSync, mkdirSync } = require("node:fs");
  const fallback = "SVELTYCMS_TEST_SECRET_2026";
  const secretPath = join(process.cwd(), "tests/e2e/.auth/test-secret.txt");
  const secretDir = join(process.cwd(), "tests/e2e/.auth");
  try {
    if (!existsSync(secretDir)) mkdirSync(secretDir, { recursive: true });
    writeFileSync(secretPath, fallback, "utf-8");
    console.warn(`[test-orch] Wrote fallback secret to ${secretPath}`);
  } catch {}
  return fallback;
}

async function orchRequest(action: string, payload?: Record<string, unknown>, baseUrl?: string) {
  const url = (baseUrl || getBaseUrl()) + "/api/testing";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-test-mode": "true",
      "x-test-secret": getSecret(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Test orchestration failed: ${action} → HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

/** Transition system to READY mode: DB seeded with admin user, setup marked complete. */
export async function seedReadyState(baseUrl?: string) {
  // Identity must match @tests/harness ADMIN_CREDENTIALS / integration seed
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "Password123!";
  await orchRequest(
    "reset-to-state",
    {
      state: "ready",
      email,
      password,
    },
    baseUrl,
  );
}

/** Transition system to SETUP mode: DB wiped, config deleted, system state reset. */
export async function resetToSetupMode(baseUrl?: string) {
  await orchRequest("reset-to-state", { state: "setup" }, baseUrl);
}
