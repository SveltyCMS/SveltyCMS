/**
 * @file src/utils/test-bypass.server.ts
 * @description Hardened test/benchmark bypass gate + Testing API access guard.
 *
 * ### Hardening (audit 2026-07):
 * - Production hard-gate: IS_PROD exits immediately, regardless of env flags
 * - Case-insensitive headers: Fetch API handles this natively, removed redundant fallback
 * - Tenant sanitization: regex validates x-tenant-id before injection
 * - Simplified secret retrieval: single source (TEST_API_SECRET or getTestSecret)
 * - **Same gate for `/api/testing`** (`assertTestingApiAllowed`) — no weaker NODE_ENV=test path
 *
 * Test credentials are accepted ONLY when an explicit test/benchmark env flag is set
 * AND the secret matches via timing-safe comparison. No hardcoded fallback secrets.
 *
 * ### Features:
 * - Environment-gated bypass (TEST_MODE, PLAYWRIGHT, BENCHMARK)
 * - timingSafeEqual secret verification
 * - Single injection point for system admin test user
 * - Shared fail-closed gate for seed/reset testing actions
 */

import { timingSafeEqual } from "node:crypto";
import type { RequestEvent } from "@sveltejs/kit";
import { getTestSecret } from "@utils/server/setup-check";

// 🛡️ Hardened Production Guard — never active in production
function isProductionNodeEnv(): boolean {
  return (
    (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env?.NODE_ENV ===
    "production"
  );
}

type BypassLocals = App.Locals & {
  user?: App.Locals["user"];
  isAdmin?: boolean;
  tenantId?: App.Locals["tenantId"];
  __testBypass?: boolean;
};

/**
 * Strict environment check.
 * If NODE_ENV is production, this utility returns false immediately.
 * Does **not** treat bare `NODE_ENV=test` as sufficient (must set TEST_MODE / PLAYWRIGHT / BENCHMARK).
 */
export function isTestOrBenchmarkEnvironment(): boolean {
  if (isProductionNodeEnv()) return false;

  const env = (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env ?? {};
  return (
    env.TEST_MODE === "true" ||
    env.VITE_TEST_MODE === "true" ||
    env.PLAYWRIGHT_TEST === "true" ||
    env.BENCHMARK === "true" ||
    env.SVELTY_BENCHMARK_SUITE === "true"
  );
}

/** Timing-safe comparison using Buffer lengths to prevent timing leaks. */
function secretsMatch(incoming: string, expected: string): boolean {
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TestingApiGateResult =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; message: string; code: string };

/**
 * Fail-closed gate for `/api/testing` (and aliases). Used by handleTestingRoutes.
 *
 * Requires:
 * 1. Not production NODE_ENV
 * 2. Explicit test/benchmark env flag (TEST_MODE / PLAYWRIGHT / BENCHMARK — not bare NODE_ENV=test)
 * 3. Matching x-test-secret (timing-safe) against TEST_API_SECRET / getTestSecret()
 *
 * Never opens on secret alone in production. Never opens on env flag alone without secret.
 */
export function assertTestingApiAllowed(request: Request): TestingApiGateResult {
  if (isProductionNodeEnv()) {
    return {
      allowed: false,
      status: 403,
      message: "Unauthorized: Testing endpoints are disabled in production",
      code: "TESTING_DISABLED_PRODUCTION",
    };
  }

  if (!isTestOrBenchmarkEnvironment()) {
    return {
      allowed: false,
      status: 401,
      message: "Unauthorized: Testing endpoints are disabled",
      code: "TESTING_DISABLED",
    };
  }

  const incoming =
    request.headers.get("x-test-secret") || request.headers.get("X-Test-Secret") || "";
  if (!incoming) {
    return {
      allowed: false,
      status: 401,
      message: "Unauthorized: Testing endpoints are disabled",
      code: "TESTING_SECRET_MISSING",
    };
  }

  const runtimeEnv = (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env;
  const expected = runtimeEnv?.TEST_API_SECRET || getTestSecret();
  if (!expected || !secretsMatch(incoming, expected)) {
    return {
      allowed: false,
      status: 401,
      message: "Unauthorized: Testing endpoints are disabled",
      code: "TESTING_SECRET_INVALID",
    };
  }

  return { allowed: true };
}

/**
 * Validates x-test-secret and injects a system admin user into locals.
 * Returns true when bypass was applied. No-op in production (no env flags).
 */
export function applyTestBypassFromRequest(
  request: Request,
  locals: BypassLocals,
  options?: { setBypassFlag?: boolean },
): boolean {
  // 1. Double-check guard — production + missing test env exit immediately
  if (isProductionNodeEnv() || !isTestOrBenchmarkEnvironment()) return false;
  if (locals.__testBypass) return true;

  // 2. Header extraction — Fetch API is case-insensitive
  const incoming = request.headers.get("x-test-secret");
  if (!incoming) return false;

  // 3. Expected secret retrieval
  const expected =
    (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env
      ?.TEST_API_SECRET || getTestSecret();
  if (!expected || !secretsMatch(incoming, expected)) return false;

  // 4. Inject Test Admin
  locals.user = {
    _id: "system",
    role: "admin",
    isAdmin: true,
    email: "system@sveltycms",
  } as BypassLocals["user"];
  locals.isAdmin = true;
  if (options?.setBypassFlag !== false) {
    locals.__testBypass = true;
  }

  // 5. Tenant Injection — sanitized (supports both x-tenant-id and x-test-tenant-id)
  const tenantHeader =
    request.headers.get("x-tenant-id") || request.headers.get("x-test-tenant-id");
  if (tenantHeader && /^[a-zA-Z0-9_-]+$/.test(tenantHeader)) {
    locals.tenantId = tenantHeader as BypassLocals["tenantId"];
  }

  return true;
}

export function applyTestBypassFromHeaders(
  event: RequestEvent,
  options?: { setBypassFlag?: boolean },
): boolean {
  return applyTestBypassFromRequest(event.request, event.locals as BypassLocals, options);
}
