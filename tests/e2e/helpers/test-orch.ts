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
  return process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";
}

function getSecret(): string {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  try {
    const secretPath = join(process.cwd(), "tests/e2e/.auth/test-secret.txt");
    if (existsSync(secretPath)) return readFileSync(secretPath, "utf-8").trim();
  } catch {}
  return "SVELTYCMS_TEST_SECRET_2026";
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
export async function seedReadyState() {
  await orchRequest("reset-to-state", {
    state: "ready",
    email: "admin@test.com",
    password: "Password123!",
  });
}

/** Transition system to SETUP mode: DB wiped, config deleted, system state reset. */
export async function resetToSetupMode() {
  await orchRequest("reset-to-state", { state: "setup" });
}
