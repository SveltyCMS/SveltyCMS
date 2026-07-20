/**
 * @file tests/e2e/helpers/api.ts
 * @description Consolidated API/seed helpers for E2E tests.
 *
 * All helpers call /api/testing which delegates to the real server logic.
 * No duplicate seed logic — just thin HTTP wrappers.
 */
import type { APIRequestContext, Page } from "@playwright/test";

// ── Shared constants ───────────────────────────────────────────────────

export const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as any).process?.env?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

export const TEST_API_HEADERS: Record<string, string> = {
  "x-test-mode": "true",
  "x-test-secret": TEST_API_SECRET,
  "x-test-worker-index": process.env.TEST_WORKER_INDEX || "0",
};

// ── Low-level /api/testing caller ──────────────────────────────────────

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

// ── Database reset/seed ────────────────────────────────────────────────

const ADMIN_CREDENTIALS = { email: "admin@example.com", password: "Password123!" };

export async function resetAndSeedDatabase(page: Page) {
  const reset = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "reset" },
  });
  if (!reset.ok()) throw new Error(`reset failed: ${reset.status()}`);

  const seed = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "seed",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });
  if (!seed.ok()) throw new Error(`seed failed: ${seed.status()}`);
}

// ── Session management ─────────────────────────────────────────────────

const SESSION_COOKIE_RE = /auth_sessions|__Host-auth_sessions|__Secure-auth_sessions/i;

function parseSetCookieHeader(header: string): Array<{ name: string; value: string }> {
  if (!header) return [];
  const parts = header.split(/,(?=\s*[^;,]+=[^;,])/);
  const out: Array<{ name: string; value: string }> = [];
  for (const part of parts) {
    const nv = part.split(";")[0]?.trim() ?? "";
    const eq = nv.indexOf("=");
    if (eq <= 0) continue;
    let name = nv.slice(0, eq).trim();
    let value = nv.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name && value) out.push({ name, value });
  }
  return out;
}

export async function applySessionCookie(
  page: Page,
  response: {
    headers(): Record<string, string>;
    headersArray?: () => Array<{ name: string; value: string }>;
    url(): string;
  },
  hostname = "127.0.0.1",
): Promise<boolean> {
  try {
    let pairs: Array<{ name: string; value: string }> = [];
    if (typeof response.headersArray === "function") {
      for (const h of response.headersArray()) {
        if (h.name.toLowerCase() === "set-cookie") pairs.push(...parseSetCookieHeader(h.value));
      }
    }
    if (pairs.length === 0) pairs = parseSetCookieHeader(response.headers()["set-cookie"] ?? "");
    let sessionPairs = pairs.filter((p) => SESSION_COOKIE_RE.test(p.name));
    if (sessionPairs.length === 0) {
      const sid = response.headers()["x-test-session-id"];
      if (sid) sessionPairs = [{ name: "auth_sessions", value: sid }];
    }
    const toApply = sessionPairs.length > 0 ? sessionPairs : pairs.slice(0, 1);
    if (toApply.length === 0) return false;
    let hostPort = hostname;
    try {
      const u = new URL(response.url());
      hostPort = u.host || u.hostname || hostPort;
    } catch {
      /* */
    }
    const domainOnly = hostPort.replace(/^\[|\]$/g, "").split(":")[0] || "127.0.0.1";
    let anyOk = false;
    for (const { name, value } of toApply) {
      const isHost = name.startsWith("__Host-");
      const secure = isHost || name.startsWith("__Secure-");
      try {
        await page.context().addCookies([
          {
            name,
            value: decodeURIComponent(value),
            url: `${secure ? "https" : "http"}://${hostPort}`,
            httpOnly: true,
            sameSite: "Lax",
            secure,
          },
        ]);
        anyOk = true;
      } catch {
        if (isHost) continue;
        try {
          await page.context().addCookies([
            {
              name,
              value: decodeURIComponent(value),
              domain: domainOnly,
              path: "/",
              httpOnly: true,
              sameSite: "Lax",
              secure,
            },
          ]);
          anyOk = true;
        } catch {
          /* skip */
        }
      }
    }
    return anyOk;
  } catch {
    return false;
  }
}

async function sessionLooksValid(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get("/api/user", { headers: { Accept: "application/json" } });
    if (res.status() === 401 || res.status() === 403) return false;
    return res.status() >= 200 && res.status() < 500;
  } catch {
    return false;
  }
}

export async function ensureAuthenticated(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    window.localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({ responded: true, necessary: true }),
    );
    window.localStorage.setItem("sveltycms-welcome-seen", "true");
  });
  if (await sessionLooksValid(page)) return;
  for (const attempt of ["login", "seed+login", "reset+seed+login"]) {
    try {
      const res = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data:
          attempt === "login"
            ? {
                action: "login",
                email: ADMIN_CREDENTIALS.email,
                password: ADMIN_CREDENTIALS.password,
              }
            : {
                action: "seed",
                email: ADMIN_CREDENTIALS.email,
                password: ADMIN_CREDENTIALS.password,
              },
      });
      if (res.ok()) await applySessionCookie(page, res).catch(() => false);
      if (await sessionLooksValid(page)) return;
    } catch {
      /* retry */
    }
  }
  throw new Error("ensureAuthenticated: failed after all attempts");
}

// ── Seed individual entities ───────────────────────────────────────────

export async function seedWebhook(
  page: Requestish,
  options: { name?: string; url?: string; events?: string[]; active?: boolean; id?: string } = {},
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
  if (!wh?.id) throw new Error(`seed-webhook: missing id ${JSON.stringify(body).slice(0, 300)}`);
  return { id: String(wh.id), name: String(wh.name), url: String(wh.url) };
}

export async function deleteWebhook(page: Requestish, id: string) {
  await postTesting(page, { action: "delete-webhook", id });
}

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
  if (!flow?.id)
    throw new Error(`seed-automation: missing id ${JSON.stringify(body).slice(0, 300)}`);
  return { id: String(flow.id), name: String(flow.name) };
}

export async function deleteAutomation(page: Requestish, id: string) {
  await postTesting(page, { action: "delete-automation", id });
}

export async function seedWorkflow(
  page: Requestish,
  options: { collectionId?: string; id?: string; name?: string } = {},
): Promise<{ _id: string; collectionId: string }> {
  const stamp = Date.now().toString(36);
  const body = await postTesting(page, {
    action: "seed-workflow",
    collectionId: options.collectionId ?? `e2e_wf_${stamp}`,
    id: options.id,
    name: options.name ?? `E2E Workflow ${stamp}`,
  });
  const wf = body.workflow || body.data;
  if (!wf?._id && !wf?.id)
    throw new Error(`seed-workflow: missing id ${JSON.stringify(body).slice(0, 300)}`);
  return { _id: String(wf._id || wf.id), collectionId: String(wf.collectionId) };
}

export async function deleteWorkflow(page: Requestish, id: string) {
  await postTesting(page, { action: "delete-workflow", id });
}

export async function enablePlugin(page: Requestish, pluginId: string, enabled = true) {
  return postTesting(page, { action: "enable-plugin", pluginId, enabled });
}

/** Seed a password_reset token that is already expired (for TOKEN_EXPIRED toast E2E). */
export async function seedExpiredPasswordReset(
  page: Requestish,
  options: { email?: string } = {},
): Promise<{ token: string; email: string; userId: string; expires: string }> {
  const body = await postTesting(page, {
    action: "seed-expired-password-reset",
    email: options.email ?? ADMIN_CREDENTIALS.email,
  });
  if (!body.token || !body.email) {
    throw new Error(
      `seed-expired-password-reset missing token/email: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  return {
    token: String(body.token),
    email: String(body.email),
    userId: String(body.userId || ""),
    expires: String(body.expires || ""),
  };
}

/** Seed media rows with distinct metadata for ?jsonPath= filter tests. */
export async function seedMediaWithMetadata(
  page: Requestish,
  options: { email?: string; items?: Record<string, unknown>[] } = {},
): Promise<{
  items: Array<{ _id: string; hash: string; filename: string; metadata: unknown }>;
  matchingHash: string;
  nonMatchingHash: string;
}> {
  const body = await postTesting(page, {
    action: "seed-media-with-metadata",
    email: options.email,
    items: options.items,
  });
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 2) {
    throw new Error(
      `seed-media-with-metadata expected ≥2 items: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  return {
    items,
    matchingHash: String(body.matchingHash || items[0]?.hash),
    nonMatchingHash: String(body.nonMatchingHash || items[1]?.hash),
  };
}

// ── State orchestration ────────────────────────────────────────────────

export async function seedReadyState(baseUrl?: string) {
  const url =
    (baseUrl || process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173") + "/api/testing";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "reset-to-state",
      state: "ready",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    }),
  });
  if (!res.ok) throw new Error(`seedReadyState failed: ${res.status} ${await res.text()}`);
}

export async function resetToSetupMode(baseUrl?: string) {
  const url =
    (baseUrl || process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173") + "/api/testing";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "reset-to-state", state: "setup" }),
  });
  if (!res.ok) throw new Error(`resetToSetupMode failed: ${res.status} ${await res.text()}`);
}

// Re-export for convenience
export { ADMIN_CREDENTIALS };
