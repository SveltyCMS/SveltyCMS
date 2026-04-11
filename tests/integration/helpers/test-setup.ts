/**
 * @file tests/integration/helpers/testSetup.ts
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
export async function prepareAuthenticatedContext(): Promise<string> {
  // 1. Reset database
  await cleanupTestDatabase();

  // 2. Seed database
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

  // Small delay to ensure DB state is stable
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 3. Login as admin
  console.log("🔑 Logging in as admin...");
  const loginResp = await safeFetch(`${API_BASE_URL}/api/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({
      email: testFixtures.adminUser.email,
      password: testFixtures.adminUser.password,
    }),
  });

  if (!loginResp.ok) {
    const error = await loginResp.text();
    throw new Error(`Login failed: ${error}`);
  }

  const setCookie = loginResp.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No session cookie returned");
  }

  // Extract only the 'name=value' part, ignoring Path, HttpOnly, etc.
  const cookieMatch = setCookie.match(/^([^;]+)/);
  if (!cookieMatch) {
    throw new Error(`Failed to parse session cookie: ${setCookie}`);
  }

  return cookieMatch[1];
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
