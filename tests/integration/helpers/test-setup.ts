/**
 * @file tests/integration/helpers/testSetup.ts
 * @description
 * High-level orchestration for integration test environments.
 * Follows strict black-box principles using the /api/testing endpoint.
 */

import { getApiBaseUrl, safeFetch } from "./server";

const API_BASE_URL = getApiBaseUrl();
const SYSTEM_SETTLE_ATTEMPTS = process.env.CI === "true" ? 5 : 3;
const SYSTEM_SETTLE_DELAY_MS = process.env.CI === "true" ? 1000 : 500;
const HEALTHY_SYSTEM_STATES = [
  "READY",
  "HEALTHY",
  "SETUP",
  "WARMED",
  "WARMING",
  "DEGRADED",
  "INITIALIZING",
  "OPERATIONAL",
  "IDLE",
];

// Hardened secret resolution
const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as any).process?.env?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

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
 * Resets the database to a clean state and seeds default fixtures.
 */
export async function cleanupTestDatabase(): Promise<void> {
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
 * Prepares a clean environment and returns an authenticated session cookie.
 */
export async function prepareAuthenticatedContext(
  options: { skipReset?: boolean } = {},
): Promise<string> {
  const isMongoDB = (process.env.DB_TYPE || "").toLowerCase() === "mongodb";

  if (!options.skipReset) {
    const maxSeedRetries = isMongoDB ? 5 : 3;
    let seedAttempt = 0;

    while (seedAttempt < maxSeedRetries) {
      seedAttempt++;
      try {
        // 1. Reset database
        await cleanupTestDatabase();

        // For MongoDB: wait for server to stabilize after collection drops
        if (isMongoDB) {
          console.log("\u23F3 MongoDB: waiting for server to stabilize after reset...");
          for (let w = 0; w < 30; w++) {
            try {
              const healthResp = await safeFetch(`${API_BASE_URL}/api/system/health`, {
                headers: { "x-test-secret": TEST_API_SECRET },
              });
              if (healthResp.ok) break;
            } catch {
              /* server still booting */
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
          // Extra settling time for Mongoose connection pool
          await new Promise((r) => setTimeout(r, 2000));
        }

        // 2. Seed database
        const dbType = process.env.DB_TYPE || "unknown";
        console.log(
          `Seeding test database (attempt ${seedAttempt}/${maxSeedRetries}, DB: ${dbType})...`,
        );
        const seedResp = await safeFetch(`${API_BASE_URL}/api/testing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": TEST_API_SECRET,
            "x-test-mode": "true",
            Origin: API_BASE_URL,
          },
          body: JSON.stringify({
            action: "seed",
            email: testFixtures.adminUser.email,
            password: testFixtures.adminUser.password,
          }),
        });

        if (seedResp.ok) {
          const seedBody = await seedResp.json().catch(() => ({}));
          console.log(`Seed succeeded: ${JSON.stringify(seedBody).slice(0, 200)}`);
          break; // Success
        }

        const error = await seedResp.text();
        if (seedAttempt >= maxSeedRetries) {
          console.error(
            `Seed FAILED after ${maxSeedRetries} attempts. DB: ${dbType}. HTTP ${seedResp.status}: ${error.slice(0, 500)}`,
          );
          throw new Error(`Failed to seed database after ${maxSeedRetries} attempts: ${error}`);
        }
        console.log(
          `Seed attempt ${seedAttempt} failed (HTTP ${seedResp.status}: ${error.slice(0, 200)}). Retrying in 3s...`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      } catch (err: any) {
        if (seedAttempt >= maxSeedRetries) {
          throw new Error(
            `Failed to seed database after ${maxSeedRetries} attempts: ${err.message}`,
          );
        }
        console.log(
          `\u23F3 Seed attempt ${seedAttempt} crashed (${err.message?.slice(0, 100)}). Retrying in 3s...`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  // Keep the pre-login settle check short; login itself already retries.
  // The older 10x2s loop was burning most of the CI budget even when login
  // succeeded immediately afterward.
  console.log("⏳ Waiting for system to settle before login...");
  let isReady = false;
  for (let i = 0; i < SYSTEM_SETTLE_ATTEMPTS; i++) {
    const health = await safeFetch(`${API_BASE_URL}/api/system/health`, {
      headers: { "x-test-secret": TEST_API_SECRET },
    });
    if (health.ok || health.status === 533) {
      const data = await health.json();
      const payload = data?.data && typeof data.data === "object" ? data.data : data;
      const status = (payload.overallStatus || payload.status || "").toUpperCase();
      if (HEALTHY_SYSTEM_STATES.includes(status)) {
        isReady = true;
        break;
      }
    }
    console.log(
      `⏳ System not ready (attempt ${i + 1}/${SYSTEM_SETTLE_ATTEMPTS}). Waiting ${SYSTEM_SETTLE_DELAY_MS}ms...`,
    );
    await new Promise((r) => setTimeout(r, SYSTEM_SETTLE_DELAY_MS));
  }

  if (!isReady) {
    console.warn("⚠️ System did not reach a serviceable state, attempting login anyway...");
  }

  // 🚀  Obtain CSRF token first
  console.log("🛡️ Obtaining CSRF token...");
  const initialResp = await safeFetch(`${API_BASE_URL}/api/system/health`);
  const initialCookies = initialResp.headers.get("set-cookie") || "";
  const csrfCookie = initialCookies.split(";")[0];

  // 3. Login as admin (with retries and CSRF awareness)
  const dbType = process.env.DB_TYPE || "unknown";
  console.log(`🔑 Logging in as admin (DB: ${dbType})...`);
  let loginResp: Response | null = null;
  for (let i = 0; i < 5; i++) {
    try {
      loginResp = await safeFetch(`${API_BASE_URL}/api/user/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
          Origin: API_BASE_URL,
          Cookie: csrfCookie, // Pass the CSRF token back
        },
        body: JSON.stringify({
          email: testFixtures.adminUser.email,
          password: testFixtures.adminUser.password,
        }),
      });
      if (loginResp.ok) break;

      const errText = await loginResp.text();
      // 🔍 Enhanced diagnostics for non-SQLite adapter failures
      if (dbType !== "sqlite") {
        const respHeaders: Record<string, string> = {};
        loginResp.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });
        console.log(
          `⏳ Login attempt ${i + 1} failed (HTTP ${loginResp.status}): ${errText.slice(0, 300)}`,
        );
        console.log(`   Response headers: ${JSON.stringify(respHeaders)}`);
        console.log(`   DB type: ${dbType}, API base: ${API_BASE_URL}`);
      } else {
        console.log(
          `⏳ Login attempt ${i + 1} failed (HTTP ${loginResp.status}: ${errText}). Retrying...`,
        );
      }
    } catch (err: any) {
      console.log(`⏳ Login attempt ${i + 1} crashed: ${err.message}. Retrying...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (!loginResp || !loginResp.ok) {
    const error = loginResp ? await loginResp.text() : "No response";
    console.error(`❌ Login FAILED after 5 retries. DB: ${dbType}. Error: ${error.slice(0, 500)}`);
    throw new Error(`Login failed after retries: ${error}`);
  }

  const setCookie = loginResp.headers.get("set-cookie") || "";
  if (!setCookie) {
    const body = await loginResp.text().catch(() => "N/A");
    process.stderr.write(`❌ Login failed (HTTP ${loginResp.status}): ${body}\n`);
    throw new Error("No session cookie returned");
  }

  // 🛡️ SECURITY: Capture all 'name=value' pairs from multiple Set-Cookie entries
  // Replaces comma-separated cookies with semicolon-separated pairs for the Cookie header
  const sessionCookie = setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/) // Split on commas that look like they start a new cookie
    .map((c) => c.trim().split(";")[0]) // Take only the name=value part
    .join("; ");

  console.log(`🔑 Login successful. Session Cookie: ${sessionCookie}`);
  return sessionCookie;
}

/**
 * Executes a testing action via the /api/testing endpoint.
 */
export async function testingAction(action: "reset" | "seed", preset?: string): Promise<void> {
  const body: any = { action, preset };
  if (action === "seed") {
    body.email = testFixtures.adminUser.email;
    body.password = testFixtures.adminUser.password;
  }

  const response = await safeFetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Testing action ${action} failed with HTTP ${response.status}: ${error}`);
  }

  const result = await response.json().catch(() => ({}));
  if (result && result.success === false) {
    throw new Error(`Testing action ${action} failed: ${result.message || JSON.stringify(result)}`);
  }
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
