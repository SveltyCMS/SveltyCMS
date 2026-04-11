/**
 * @file tests/integration/helpers/db-helper.ts
 * @description Database helper functions for integration tests using black-box API approach.
 */

import { getApiBaseUrl } from "./server";

const API_BASE_URL = getApiBaseUrl();

/**
 * Drops the test database via the testing API.
 */
export async function dropDatabase(): Promise<void> {
  const secret = (globalThis as any).process?.env?.TEST_API_SECRET || "";
  const response = await fetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": secret,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({ action: "reset" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to drop database: ${response.status} ${text}`);
  }
}

/**
 * Gets a user by email via the API.
 */
export async function getUser(email: string): Promise<Record<string, unknown> | null> {
  const secret = (globalThis as any).process?.env?.TEST_API_SECRET || "";
  const response = await fetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": secret,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({ action: "get-user", email }),
  });

  if (!response.ok) return null;
  const result = await response.json();
  return result.user || null;
}

/**
 * Gets the count of users in the database.
 */
export async function getUserCount(): Promise<number> {
  const secret = (globalThis as any).process?.env?.TEST_API_SECRET || "";
  const response = await fetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": secret,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({ action: "get-user-count" }),
  });

  if (!response.ok) return 0;
  const result = await response.json();
  return result.count || 0;
}

/**
 * Checks if a user exists.
 */
export async function userExists(email: string): Promise<boolean> {
  const user = await getUser(email);
  return user !== null;
}

/**
 * Waits for a condition to be true.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 500,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
