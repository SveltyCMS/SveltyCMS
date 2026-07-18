import type { Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";

export const TEST_USERS = {
  developer: {
    email: "developer@example.com",
    password: "Developer123!",
    role: "developer",
  },
  editor: {
    email: "editor@example.com",
    password: "Editor123!",
    role: "editor",
  },
} as const;

type TestUserKey = keyof typeof TEST_USERS;

/**
 * Create a registration invite token via the admin session (cookie jar on page).
 * Used so token E2E never soft-skips on empty tables.
 */
export async function seedInviteToken(
  page: Page,
  options: { email?: string; role?: string; expiresIn?: string } = {},
): Promise<{ token: string; email: string }> {
  const email = options.email ?? `invite_seed_${Date.now()}@example.com`;
  const role = options.role ?? "editor";
  const expiresIn = options.expiresIn ?? "2 days";

  const response = await page.request.post("/api/token/create-token", {
    headers: {
      ...TEST_API_HEADERS,
      "Content-Type": "application/json",
    },
    data: {
      email,
      role,
      expiresIn,
      type: "invite-token",
    },
  });

  if (!response.ok()) {
    // Fallback path used by some adapters
    const fallback = await page.request.post("/api/token", {
      headers: {
        ...TEST_API_HEADERS,
        "Content-Type": "application/json",
      },
      data: { email, role, expiresIn, type: "invite-token" },
    });
    if (!fallback.ok()) {
      throw new Error(
        `seedInviteToken failed: ${response.status()} ${await response.text()} / fallback ${fallback.status()} ${await fallback.text()}`,
      );
    }
    const body = await fallback.json();
    const token = body?.token?.value || body?.token || body?.data?.token || body?.data || "";
    if (!token || typeof token !== "string") {
      throw new Error(
        `seedInviteToken: no token in response ${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    return { token: String(token), email };
  }

  const body = await response.json();
  const token = body?.token?.value || body?.token || body?.data?.token || body?.data || "";
  if (!token || typeof token !== "string") {
    throw new Error(`seedInviteToken: no token in response ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { token: String(token), email };
}

/**
 * Seeds the database with additional test users (Developer, Editor)
 * using the Testing API. This is cleaner and more robust for E2E.
 */
export async function seedTestUsers(page: Page) {
  for (const [key, user] of Object.entries(TEST_USERS)) {
    console.log(`Seeding user: ${user.email}...`);

    // Use the Testing API bypass
    const response = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "create-user",
        email: user.email,
        password: user.password,
        role: user.role,
        username: key.charAt(0).toUpperCase() + key.slice(1), // Developer, Editor
      },
    });

    if (response.ok()) {
      console.log(`✅ User ${user.email} created.`);
    } else if (response.status() === 400 || (await response.text()).includes("exists")) {
      console.log(`ℹ️ User ${user.email} already exists.`);
    } else {
      console.error(
        `❌ Failed to create user ${user.email}: ${response.status()} ${await response.text()}`,
      );
    }
  }
}

/**
 * Idempotently ensures a test user exists and is unblocked.
 * Safe to call before each bulk-action test (including Playwright retries).
 */
export async function prepareTestUser(page: Page, key: TestUserKey) {
  const user = TEST_USERS[key];
  const username = key.charAt(0).toUpperCase() + key.slice(1);

  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "prepare-test-user",
      email: user.email,
      password: user.password,
      role: user.role,
      username,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `prepare-test-user failed for ${user.email}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = await response.json();
  if (!body.success) {
    throw new Error(`prepare-test-user returned failure for ${user.email}`);
  }

  return body.user as { _id: string; email: string; blocked?: boolean };
}
