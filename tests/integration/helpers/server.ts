/**
 * @file tests/integration/helpers/server.ts
 * @description Consolidated helpers for integration tests.
 * safeFetch, server health, auth session, DB seed/reset, config-domain HTTP helpers.
 */
import { expect } from "vitest";
import { startIntegrationServer } from "../harness";

// Base URL constant for tests (alias for getApiBaseUrl for compatibility)
export const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";

// Returns the API base URL from environment or default.
export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || "http://127.0.0.1:4173";
}

// Pings the server health endpoint to ensure it's ready.
export async function checkServer(): Promise<boolean> {
  const url = `${getApiBaseUrl()}/api/system/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });

    // The health endpoint uses 533 while warming up and may return 503/202
    // during setup or degraded test scenarios. We still need the JSON body.
    if (![200, 202, 503, 533].includes(response.status)) {
      const text = await response.text().catch(() => "");
      console.log(`[checkServer] Unhandled Status: ${response.status}, Body: ${text}`);
      return false;
    }

    const data = await response.json();
    const payload = data?.data && typeof data.data === "object" ? data.data : data;

    const status = payload?.overallStatus || payload?.status || "";
    // INITIALIZING is a transitional boot state after process restart — the server
    // is listening and will reach READY/SETUP once migrations finish. Treating it
    // as dead caused Phase-2 isolated setup tests to fail after 60s of healthy boots.
    const isHealthy = [
      "READY",
      "SETUP",
      "WARMED",
      "WARMING",
      "DEGRADED",
      "HEALTHY",
      "IDLE",
      "INITIALIZING",
      "RECOVERY",
    ].includes(status.toUpperCase());

    if (!isHealthy) {
      console.log(`[checkServer] Unhealthy state: ${status} (HTTP ${response.status})`);
    }
    return isHealthy;
  } catch (err: any) {
    console.log(`[checkServer] Fetch failed: ${err.message}`);
    return false;
  }
}

// Waits for the server to become healthy with a timeout.
// Server must be pre-started via scripts/start-integration-server.ts or
// bun run test:integration (which handles this automatically).
// On Windows, bun test cannot spawn child processes, so the server
// MUST be running before bun test starts.
export async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const startTime = Date.now();

  // Poll for health before giving up — server may be mid-reset/warmup from a prior test
  while (Date.now() - startTime < timeoutMs) {
    if (await checkServer()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Try once via harness (works on non-Windows / when bun test CAN spawn)
  console.log(`ℹ️ Server not healthy at ${baseUrl}; trying harness...`);
  try {
    await startIntegrationServer();
    if (await checkServer()) {
      console.log("✅ Server started by harness.");
      return;
    }
  } catch {
    // Harness failed to start server (expected on Windows + bun test)
  }

  console.error(
    `\n❌ Server not running at ${baseUrl}.` +
      "\n   Start it manually:  PORT=4173 TEST_MODE=true node build/index.js" +
      "\n   Or use:             bun run test:integration\n",
  );
  throw new Error(`Server not reachable at ${baseUrl}`);
}

/**
 * Safely performs a fetch with retries to handle server re-initialization flickers.
 * Automatically adds the Origin header and x-test-secret to bypass security/CSRF in tests.
 *
 * ### Contract
 * - Non-stream bodies are buffered so callers can `.json()`/`.text()` after retries.
 * - SSE (`text/event-stream`) is returned live (never arrayBuffer — hangs forever).
 * - Uses default HTTP/1.1 keep-alive (avoids undici arrayBuffer + close race).
 */
export async function safeFetch(
  url: string,
  init?: RequestInit & { skipTestSecret?: boolean },
  maxRetries = 5,
  delay = 2000,
): Promise<Response> {
  const headers = new Headers(init?.headers || {});

  // Ensure Origin and Referer headers are present to satisfy CSRF protection in hooks
  if (!headers.has("Origin")) {
    headers.set("Origin", BASE_URL);
  }
  if (!headers.has("Referer")) {
    headers.set("Referer", `${BASE_URL}/`);
  }
  // Let Node.js undici use default HTTP/1.1 keep-alive. Explicit `Connection: close`
  // creates a race: the server closes the socket while undici reads the body via
  // arrayBuffer(), producing "socket connection was closed unexpectedly" errors.
  // Server restarts mid-suite are handled by the retry loop below.
  // Use the testing secret for bootstrap/setup calls, but keep cookie-authenticated
  // requests black-box once we have a real session.
  if (!init?.skipTestSecret && !headers.has("Cookie") && !headers.has("cookie")) {
    const testSecret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    headers.set("x-test-secret", testSecret);
  }

  // 🚨 Node 24's built-in fetch fails on zstd-compressed responses (e.g. /api/metrics).
  // In unsandboxed environments, 'undici:zlib' throws ZstdDecompressionError because
  // Node's native zstd support expects dictionaries, not bare compression.
  // Sending Accept-Encoding: identity tells the server NOT to compress the response.
  if (!headers.has("Accept-Encoding")) {
    headers.set("Accept-Encoding", "identity");
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Fresh signal per attempt — reusing an aborted signal fails immediately.
    const signal = init?.signal || AbortSignal.timeout(attempt === 0 ? 60_000 : 30_000);

    try {
      const resp = await fetch(url, { ...init, headers, signal });

      if (!resp) {
        throw new Error(`Server at ${url} returned an undefined response.`);
      }

      if (!resp.headers) {
        throw new Error(`Server at ${url} returned a response without headers.`);
      }

      // SSE / long-lived streams never end — buffering arrayBuffer() hangs until abort.
      const contentType = resp.headers.get("Content-Type") || "";
      const isStreaming =
        contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson");

      if (isStreaming) {
        return resp;
      }

      // Capture Set-Cookie before body read (some runtimes drop them after consume)
      const setCookies =
        typeof resp.headers.getSetCookie === "function" ? resp.headers.getSetCookie() : [];

      let bodyBuf: ArrayBuffer;
      try {
        bodyBuf = await resp.arrayBuffer();
      } catch (decompressError: unknown) {
        // Zstd-compressed responses (e.g. /api/metrics) fail in Node's built-in fetch
        const decompressMsg =
          decompressError instanceof Error ? decompressError.message : String(decompressError);
        if (
          decompressMsg.includes("Decompression") ||
          decompressMsg.includes("zstd") ||
          decompressMsg.includes("Zstd")
        ) {
          process.stderr.write(`[safeFetch] Decompression error at ${url} — returning 502\n`);
          return new Response(
            JSON.stringify({ error: "Decompression failed", detail: decompressMsg }),
            {
              status: 502,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        throw decompressError;
      }
      const bodyText = new TextDecoder().decode(bodyBuf);

      // Only log server errors (5xx) — client errors (4xx) are often expected test scenarios
      if (!resp.ok && resp.status >= 500) {
        const logMsg =
          `\n[safeFetch] Server error: ${url}\n` +
          `[safeFetch]    Status: ${resp.status}\n` +
          `[safeFetch]    Body: ${bodyText.slice(0, 300)}\n`;
        process.stderr.write(logMsg);
      }

      // Rebuild Response so callers can re-read the body; re-attach Set-Cookie
      const outHeaders = new Headers(resp.headers);
      for (const c of setCookies) {
        try {
          outHeaders.append("set-cookie", c);
        } catch {
          /* Headers may forbid set-cookie in some runtimes */
        }
      }
      // Fallback: single set-cookie header string for login cookie parsing
      if (setCookies.length === 0) {
        const sc = resp.headers.get("set-cookie");
        if (sc) outHeaders.set("set-cookie", sc);
      }

      return new Response(bodyBuf, {
        status: resp.status,
        statusText: resp.statusText,
        headers: outHeaders,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      // ZstdDecompressionError: Node 24's fetch fails on zstd-compressed responses
      // Return a synthetic 502 instead of crashing the entire suite
      if (
        message.includes("Decompression") ||
        message.includes("zstd") ||
        message.includes("Zstd")
      ) {
        process.stderr.write(`[safeFetch] Decompression error at ${url} — returning 502\n`);
        return new Response(JSON.stringify({ error: "Decompression failed" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      const isTransient =
        message.includes("ConnectionRefused") ||
        message.includes("failed to fetch") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ECONNRESET") ||
        message.includes("socket connection closed") ||
        message.includes("socket connection was closed") ||
        message.includes("Unable to connect") ||
        message.includes("other side closed") ||
        message.includes("undici");

      if (isTransient && attempt < maxRetries) {
        console.log(
          `⏳ Server flicker detected at ${url}. Retrying (${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      let guidance = "";
      if (isTransient) {
        guidance =
          "\n\n💡 FIX: Preview may be down or build is corrupt (missing chunks).\n" +
          "   1. COMPILE_ALL_ADAPTERS=true bun run build\n" +
          "   2. bun run test:integration (starts server + suite)\n" +
          "   3. Remove leftover build-saved/ / .svelte-kit/output-saved if present";
      }

      throw new Error(
        `Failed to reach server at ${url}.${guidance}\n\nTechnical Error: ${message}`,
      );
    }
  }
  throw new Error(`Failed to reach server at ${url} after ${maxRetries} retries.`);
}

// ── Test fixtures (admin/editor credentials) ────────────────────────────────
// Keep both shapes: adminUser/editorUser (preferred) and users.admin (legacy).

const adminUser = {
  email: "admin@example.com",
  password: "Password123!",
  username: "admin",
  role: "admin" as const,
};

const editorUser = {
  email: "editor@example.com",
  password: "EditorPass456!",
  username: "editor",
  role: "editor" as const,
};

const developerUser = {
  email: "dev@example.com",
  password: "DevPass789!",
  username: "developer",
  role: "developer" as const,
};

export const testFixtures = {
  adminUser,
  editorUser,
  developerUser,
  password: adminUser.password,
  /** Legacy alias used by older API suites (`testFixtures.users.admin`). */
  users: {
    admin: adminUser,
    editor: editorUser,
    developer: developerUser,
  },
};

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

// Prefer orchestrator-pinned env (run-integration / start-integration-server).
// Fallback matches scripts/integration-harness DEFAULT — never a fresh UUID.
const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as any).process?.env?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

export async function cleanupTestDatabase(): Promise<void> {
  console.log("🧹 Cleaning up test database...");
  const response = await safeFetch(`${getApiBaseUrl()}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
      Origin: getApiBaseUrl(),
    },
    body: JSON.stringify({ action: "reset" }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to reset database: ${error}`);
  }
}

export async function prepareAuthenticatedContext(
  options: { skipReset?: boolean } = {},
): Promise<string> {
  const isMongoDB = (process.env.DB_TYPE || "").toLowerCase() === "mongodb";
  if (!options.skipReset) {
    const maxSeedRetries = isMongoDB ? 5 : 3;
    for (let attempt = 0; attempt < maxSeedRetries; attempt++) {
      try {
        await cleanupTestDatabase();
        if (isMongoDB) {
          for (let w = 0; w < 30; w++) {
            try {
              const healthResp = await safeFetch(`${getApiBaseUrl()}/api/system/health`, {
                headers: { "x-test-secret": TEST_API_SECRET },
              });
              if (healthResp.ok) break;
            } catch {
              /* retry */
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        const seedResp = await safeFetch(`${getApiBaseUrl()}/api/testing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": TEST_API_SECRET,
            "x-test-mode": "true",
            Origin: getApiBaseUrl(),
          },
          body: JSON.stringify({
            action: "seed",
            email: testFixtures.adminUser.email,
            password: testFixtures.adminUser.password,
          }),
        });
        if (seedResp.ok) break;
        const error = await seedResp.text();
        if (attempt >= maxSeedRetries - 1) throw new Error(`Seed failed: ${error}`);
        await new Promise((r) => setTimeout(r, 3000));
      } catch (err: any) {
        if (attempt >= maxSeedRetries - 1) throw err;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  for (let i = 0; i < SYSTEM_SETTLE_ATTEMPTS; i++) {
    const health = await safeFetch(`${getApiBaseUrl()}/api/system/health`, {
      headers: { "x-test-secret": TEST_API_SECRET },
    });
    if (health.ok || health.status === 533) {
      const data = await health.json();
      const payload = data?.data && typeof data.data === "object" ? data.data : data;
      const status = (payload.overallStatus || payload.status || "").toUpperCase();
      if (HEALTHY_SYSTEM_STATES.includes(status)) break;
    }
    await new Promise((r) => setTimeout(r, SYSTEM_SETTLE_DELAY_MS));
  }

  const initialResp = await safeFetch(`${getApiBaseUrl()}/api/system/health`);
  const csrfCookie = (initialResp.headers.get("set-cookie") || "").split(";")[0];

  console.log(`🔑 Logging in as admin (DB: ${process.env.DB_TYPE || "unknown"})...`);
  let loginResp: Response | null = null;
  for (let i = 0; i < 5; i++) {
    try {
      loginResp = await safeFetch(`${getApiBaseUrl()}/api/user/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
          Origin: getApiBaseUrl(),
          Cookie: csrfCookie,
        },
        body: JSON.stringify({
          email: testFixtures.adminUser.email,
          password: testFixtures.adminUser.password,
        }),
      });
      if (loginResp.ok) break;
      await new Promise((r) => setTimeout(r, 3000));
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!loginResp || !loginResp.ok) {
    throw new Error("Login failed after retries");
  }

  const setCookie = loginResp.headers.get("set-cookie") || "";
  return setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((c) => c.trim().split(";")[0])
    .join("; ");
}

export async function testingAction(
  action: "reset" | "seed" | string,
  params?: string | Record<string, unknown>,
): Promise<any> {
  // Legacy: testingAction("seed", presetString)
  const preset = typeof params === "string" ? params : undefined;
  const extra = typeof params === "object" && params !== null ? params : {};

  const body: Record<string, unknown> = { action, ...extra };
  if (preset) body.preset = preset;
  if (action === "seed") {
    body.email = body.email ?? testFixtures.adminUser.email;
    body.password = body.password ?? testFixtures.adminUser.password;
  }
  const response = await safeFetch(`${getApiBaseUrl()}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
      "x-test-mode": "true",
      Origin: getApiBaseUrl(),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }
  if (!response.ok) {
    throw new Error(`Testing action ${action} failed: ${response.status} ${text.slice(0, 400)}`);
  }
  return parsed;
}

/** @deprecated Use cleanupTestDatabase */
export async function initializeTestEnvironment(): Promise<void> {
  await cleanupTestDatabase();
}
/** @deprecated Use cleanupTestDatabase */
export async function cleanupTestEnvironment(): Promise<void> {
  await cleanupTestDatabase();
}

// ── Config-domain HTTP helpers ─────────────────────────────────────────────

export function unwrapList(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.data)) return body.data.data;
  return [];
}

export function unwrapEntity(body: any): any {
  return body?.data?.data ?? body?.data ?? body?.webhook ?? body?.flow ?? body;
}

export async function loginAs(
  email: string,
  password: string,
): Promise<{ cookie: string; status: number }> {
  const res = await safeFetch(`${getApiBaseUrl()}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: getApiBaseUrl() },
    skipTestSecret: true,
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((c) => c.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
  return { cookie, status: res.status };
}

export async function ensureEditorUser(adminCookie: string): Promise<void> {
  await safeFetch(`${getApiBaseUrl()}/api/user/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie, Origin: getApiBaseUrl() },
    body: JSON.stringify({
      email: "editor@example.com",
      password: "EditorPass456!",
      username: "editor",
      role: "editor",
      confirmPassword: "EditorPass456!",
    }),
  }).catch(() => undefined);
}

export async function authGet(
  path: string,
  cookie?: string,
  opts?: { skipTestSecret?: boolean },
): Promise<{ status: number; body: any; raw: Response }> {
  const headers: Record<string, string> = { Accept: "application/json", Origin: getApiBaseUrl() };
  if (cookie) headers.Cookie = cookie;
  const res = await safeFetch(`${getApiBaseUrl()}${path}`, {
    headers,
    skipTestSecret: opts?.skipTestSecret ?? !cookie,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, raw: res };
}

export async function authJson(
  method: string,
  path: string,
  cookie: string | undefined,
  payload?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: getApiBaseUrl(),
    "Content-Type": "application/json",
  };
  if (cookie) headers.Cookie = cookie;
  const res = await safeFetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    skipTestSecret: !cookie,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export function expectDenied(status: number, label: string): void {
  expect(status, label).not.toBe(200);
  expect([401, 403], label).toContain(status);
}
