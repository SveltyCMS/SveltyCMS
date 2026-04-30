/**
 * @file tests/integration/helpers/test-setup.ts
 * @description
 * High-level orchestration for integration test environments.
 * Follows strict black-box principles using the /api/testing endpoint.
 */

import { getApiBaseUrl, safeFetch } from "./server";

const API_BASE_URL = getApiBaseUrl();

// Hardened secret resolution
const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as any).process?.env?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

const SKIP_DESTRUCTIVE_TEST_CLEANUP =
  process.env.SKIP_DESTRUCTIVE_TEST_CLEANUP === "true";

if (!TEST_API_SECRET) {
  console.warn("⚠️ [TestSetup] TEST_API_SECRET is not defined in the environment!");
}

/**
 * Test fixtures for reusing test data across tests
 */
export const testFixtures = {
  users: {
    admin: {
      email: "admin@example.com",
      password: "Password123!",
      username: "admin",
      role: "admin",
    },
    developer: {
      email: "developer@test.com",
      password: "Password123!",
      username: "developer",
      role: "developer",
    },
    editor: {
      email: "editor@test.com",
      password: "Password123!",
      username: "editor",
      role: "editor",
    },
  },
  adminUser: {
    email: "admin@example.com",
    password: "Password123!",
    username: "admin",
    role: "admin",
  },
  developerUser: {
    email: "developer@test.com",
    password: "Password123!",
    username: "developer",
    role: "developer",
  },
  editorUser: {
    email: "editor@test.com",
    password: "Password123!",
    username: "editor",
    role: "editor",
  },
};

/**
 * Reset the database through the public black-box testing endpoint.
 *
 * In the custom integration runner, the preview server stays alive while each test
 * file runs in a separate Bun process. Repeated reset calls can close/reset SQLite
 * while the running server still holds the previous connection.
 */
async function resetTestDatabase(): Promise<void> {
  console.log("🧹 Cleaning up test database...");

  const response = await safeFetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({ action: "reset" }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to reset database: ${error}`);
  }
}

/**
 * Seed the database through the public black-box testing endpoint.
 */
async function seedTestDatabase(): Promise<void> {
  console.log("🌱 Seeding test database...");

  const seedResp = await safeFetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({
      action: "seed",
      email: testFixtures.adminUser.email,
      password: testFixtures.adminUser.password,
    }),
  });

  if (!seedResp.ok) {
    const error = await seedResp.text();
    throw new Error(`Failed to seed database: ${error}`);
  }
}

/**
 * Resets the database to a clean state.
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (SKIP_DESTRUCTIVE_TEST_CLEANUP) {
    console.log("🧹 Skipping destructive database cleanup in integration runner");
    return;
  }

  await resetTestDatabase();
}

/**
 * Prepares a clean environment and returns an authenticated session cookie.
 */
export async function prepareAuthenticatedContext(): Promise<string> {
  if (SKIP_DESTRUCTIVE_TEST_CLEANUP) {
    console.log(
      "🧹 Skipping per-file reset/seed in integration runner; using runner-level seeded state",
    );
  } else {
    await resetTestDatabase();
    await seedTestDatabase();
  }

  // 🚀 HARDENING: Wait for system to settle and reach a READY state
  console.log("⏳ Waiting for system to settle and reach READY state...");
  let isReady = false;

  for (let i = 0; i < 10; i++) {
    const health = await safeFetch(`${API_BASE_URL}/api/system/health`, {
      headers: { "x-test-secret": TEST_API_SECRET },
    });

    if (health.ok) {
      const data = await health.json();
      if ((data.overallStatus || data.status || "").toUpperCase() === "READY") {
        isReady = true;
        break;
      }
    }

    console.log(`⏳ System not ready (attempt ${i + 1}/10). Waiting 2s...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!isReady) {
    console.warn("⚠️ System did not reach READY state, attempting login anyway...");
  }

  // 🚀 HARDENING: Obtain CSRF token first
  console.log("🛡️ Obtaining CSRF token...");
  const initialResp = await safeFetch(`${API_BASE_URL}/api/system/health`);
  const initialCookies = initialResp.headers.get("set-cookie") || "";
  const csrfCookie = initialCookies.split(";")[0];

  // Login as admin with retries and CSRF awareness
  console.log("🔑 Logging in as admin...");
  let loginResp: Response | null = null;

  for (let i = 0; i < 5; i++) {
    try {
      loginResp = await safeFetch(`${API_BASE_URL}/api/user/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
          Origin: API_BASE_URL,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({
          email: testFixtures.adminUser.email,
          password: testFixtures.adminUser.password,
        }),
      });

      if (loginResp.ok) {
        break;
      }

      const errText = await loginResp.text();
      console.log(
        `⏳ Login attempt ${i + 1} failed (HTTP ${loginResp.status}: ${errText}). Retrying...`,
      );
    } catch {
      console.log(`⏳ Login attempt ${i + 1} crashed. Retrying...`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (!loginResp || !loginResp.ok) {
    const error = loginResp ? await loginResp.text() : "No response";
    throw new Error(`Login failed after retries: ${error}`);
  }

  const setCookie = loginResp.headers.get("set-cookie") || "";

  if (!setCookie) {
    throw new Error("No session cookie returned");
  }

  // 🛡️ SECURITY: Capture all 'name=value' pairs from multiple Set-Cookie entries
  const sessionCookie = setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((cookie) => cookie.trim().split(";")[0])
    .join("; ");

  console.log(`🔑 Login successful. Session Cookie: ${sessionCookie}`);
  return sessionCookie;
}

/**
 * Compatibility alias for older tests.
 */
export async function initializeTestEnvironment(): Promise<void> {
  await cleanupTestDatabase();
}

/**
 * Compatibility alias for older tests.
 */
export async function cleanupTestEnvironment(): Promise<void> {
  await cleanupTestDatabase();
}