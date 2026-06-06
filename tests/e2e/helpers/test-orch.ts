/**
 * @file tests/e2e/helpers/test-orch.ts
 * @description Orchestrator for the God-Mode /api/testing endpoint to manage test state.
 *
 * Self-contained — no project imports. Runs in Playwright's Node context.
 */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";
const SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

async function orchRequest(action: string, payload?: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "x-test-mode": "true",
      "x-test-secret": SECRET,
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

/** Resets the database and seeds an admin user so E2E can skip the wizard UI. */
export async function seedReadyState() {
  await orchRequest("reset");
  await orchRequest("seed", {
    email: "admin@test.com",
    password: "Password123!",
  });
}

/** Resets database to clean state (forces setup wizard). */
export async function resetToSetupMode() {
  await orchRequest("reset");
}
