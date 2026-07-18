/**
 * @file tests/e2e/helpers/seed.ts
 * @description Testing-API seed helpers for E2E. Prefer these over soft-skips when
 * a control-map route needs data (empty install must not hide regressions).
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";

type Requestish = Pick<Page, "request"> | { request: APIRequestContext };

async function postTesting(page: Requestish, data: Record<string, unknown>) {
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data,
  });
  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok()) {
    throw new Error(
      `POST /api/testing action=${data.action} failed: ${response.status()} ${text.slice(0, 400)}`,
    );
  }
  if (body.success === false) {
    throw new Error(
      `POST /api/testing action=${data.action} unsuccessful: ${body.message || body.code || text.slice(0, 300)}`,
    );
  }
  return body;
}

/** Seed a webhook definition (preferences-backed). Returns webhook with id. */
export async function seedWebhook(
  page: Requestish,
  options: {
    name?: string;
    url?: string;
    events?: string[];
    active?: boolean;
    id?: string;
  } = {},
): Promise<{ id: string; name: string; url: string }> {
  const stamp = Date.now().toString(36);
  const body = await postTesting(page, {
    action: "seed-webhook",
    name: options.name ?? `E2E Webhook ${stamp}`,
    url: options.url ?? `https://example.com/e2e-hook/${stamp}`,
    events: options.events ?? ["entry:publish"],
    active: options.active !== false,
    id: options.id,
  });
  const wh = body.webhook || body.data;
  if (!wh?.id) {
    throw new Error(`seed-webhook: missing id in response ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { id: String(wh.id), name: String(wh.name), url: String(wh.url) };
}

export async function deleteWebhook(page: Requestish, id: string) {
  await postTesting(page, { action: "delete-webhook", id });
}

/** Seed an automation flow. Returns flow with id. */
export async function seedAutomation(
  page: Requestish,
  options: {
    name?: string;
    description?: string;
    active?: boolean;
    id?: string;
    trigger?: Record<string, unknown>;
    operations?: unknown[];
  } = {},
): Promise<{ id: string; name: string }> {
  const stamp = Date.now().toString(36);
  const body = await postTesting(page, {
    action: "seed-automation",
    name: options.name ?? `E2E Automation ${stamp}`,
    description: options.description ?? "Seeded for E2E",
    active: options.active !== false,
    id: options.id,
    trigger: options.trigger,
    operations: options.operations,
  });
  const flow = body.flow || body.data;
  if (!flow?.id) {
    throw new Error(
      `seed-automation: missing id in response ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  return { id: String(flow.id), name: String(flow.name) };
}

export async function deleteAutomation(page: Requestish, id: string) {
  await postTesting(page, { action: "delete-automation", id });
}

/**
 * Enable a core plugin for the current tenant. Throws on failure (no soft-skip).
 * Use only for plugins expected in CI; external fixture plugins may return 503.
 */
export async function enablePlugin(page: Requestish, pluginId: string, enabled = true) {
  return postTesting(page, {
    action: "enable-plugin",
    pluginId,
    enabled,
  });
}

/** Soft-deleted entry for trash restore E2E. */
export async function seedTrash(
  page: Requestish,
  options: { collectionId?: string; entryId?: string; title?: string } = {},
): Promise<{ collectionId: string; entryId: string; title: string }> {
  const body = await postTesting(page, {
    action: "seed-trash",
    collectionId: options.collectionId,
    entryId: options.entryId,
    title: options.title,
  });
  if (!body.entryId || !body.collectionId) {
    throw new Error(`seed-trash: incomplete response ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    collectionId: String(body.collectionId),
    entryId: String(body.entryId),
    title: String(body.title || options.title || body.entryId),
  };
}

/** Permanent purge of a trash fixture (cleanup). */
export async function purgeTrash(
  page: Requestish,
  collectionId: string,
  entryId: string,
): Promise<void> {
  await postTesting(page, { action: "purge-trash", collectionId, entryId });
}

/**
 * Optional external infrastructure (e.g. Postgres UDH).
 * - If REQUIRE_OPTIONAL_INFRA=true → hard-fail (throw).
 * - Else → skip with annotated optional-infra reason (not empty-install soft-skip).
 */
export function handleOptionalInfraUnavailable(
  code: string,
  message: string,
  skipFn: (condition: boolean, description: string) => void,
): void {
  const require = process.env.REQUIRE_OPTIONAL_INFRA === "true";
  const full = `[optional-infra:${code}] ${message}`;
  if (require) {
    throw new Error(full);
  }
  skipFn(true, full);
}

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
/**
 * Force a private system setting (e.g. USE_2FA) for E2E fixtures.
 */
export async function setTestSetting(page: Page, key: string, value: unknown) {
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "set-setting", key, value },
  });
  if (!response.ok()) {
    throw new Error(`set-setting ${key} failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

/**
 * Create many users so admin table pagination is non-trivial.
 */
export async function seedBulkUsers(
  page: Page,
  count = 12,
  options: { role?: string; prefix?: string } = {},
) {
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "bulk-create-users",
      count,
      role: options.role || "editor",
      prefix: options.prefix || `page_${Date.now()}`,
    },
  });
  if (!response.ok()) {
    throw new Error(`bulk-create-users failed: ${response.status()} ${await response.text()}`);
  }
  return response.json() as Promise<{ success: boolean; created: number; emails: string[] }>;
}

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
