/**
 * @file src/utils/test-bypass.server.ts
 * @description Hardened test/benchmark bypass gate + Testing API access guard.
 *
 * ### Hardening:
 * - Production hard-gate: NODE_ENV=production exits immediately, regardless of env flags
 * - Runtime env reads — no module-load freezing of TEST_API_SECRET (test runners
 *   may set the env after module evaluation)
 * - Unified secret resolution via getMasterSecret(): env → DB setting → getTestSecret()
 * - Constant-time SHA-256 pre-hashed comparison (no length side-channel)
 * - Tenant sanitization: regex validates x-tenant-id before injection
 * - Same fail-closed gate for `/api/testing` (assertTestingApiAllowed)
 * - **BENCHMARK is NOT an allowlisted flag**: benchmark servers run in production
 *   mode (real sessions, no test bypasses). Only TEST_MODE / VITE_TEST_MODE /
 *   PLAYWRIGHT_TEST open the testing gate outside production.
 *
 * Test credentials are accepted ONLY when an explicit test env flag is set
 * AND the secret matches via constant-time comparison. No hardcoded fallback secrets.
 */

import { createHash, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import type { RequestEvent } from "@sveltejs/kit";
import { getTestSecret } from "@utils/server/setup-check";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

// ── Shared test-secret resolution (single source for middleware gates) ─────
// Moved here from handle-security.ts so the rate-limit hook does not depend on
// the whole security handler module graph (v8, metrics, response-service).

let cachedMasterSecret: string | null = null;

/**
 * Resolve the master test secret at RUNTIME — process.env is read per call, so
 * a secret set after module evaluation (test runners, harness bootstrap, HMR)
 * is picked up instead of staying undefined forever.
 *
 * Precedence: process.env → DB setting (cached) → getTestSecret() (e2e file /
 * generated). The DB setting is consulted BEFORE getTestSecret so a configured
 * database-driven secret is never shadowed by the file/random fallback.
 */
export function getMasterSecret(): string | undefined {
  const env = (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env ?? {};
  const envSecret = env.TEST_API_SECRET || env.VITE_TEST_API_SECRET;
  if (envSecret) return envSecret;

  if (cachedMasterSecret) return cachedMasterSecret;
  try {
    const settingsSecret = getPrivateSettingSync("TEST_API_SECRET");
    if (settingsSecret) {
      cachedMasterSecret = settingsSecret;
      return settingsSecret;
    }
  } catch {}
  cachedMasterSecret = "";

  try {
    return getTestSecret();
  } catch {
    return undefined;
  }
}

/**
 * Constant-time string comparison via SHA-256 pre-hashing: both inputs become
 * fixed 32-byte digests, so timingSafeEqual never short-circuits on a length
 * mismatch — there is no length-oracle side channel against the secret.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return nodeTimingSafeEqual(hashA, hashB);
}

/** Async alias (backwards-compatible signature) for callers that await. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  return constantTimeCompare(a, b);
}

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
 * Does **not** treat bare `NODE_ENV=test` as sufficient (must set TEST_MODE /
 * VITE_TEST_MODE / PLAYWRIGHT_TEST).
 * BENCHMARK is deliberately absent: benchmark runs are production-mode and must
 * not open any test bypass — they authenticate via real sessions.
 */
export function isTestOrBenchmarkEnvironment(): boolean {
  if (isProductionNodeEnv()) return false;

  const env = (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env ?? {};
  return (
    env.TEST_MODE === "true" || env.VITE_TEST_MODE === "true" || env.PLAYWRIGHT_TEST === "true"
  );
}

export type TestingApiGateResult =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; message: string; code: string };

/**
 * Fail-closed gate for `/api/testing` (and aliases). Used by handleTestingRoutes.
 *
 * Requires:
 * 1. Not production NODE_ENV
 * 2. Explicit test env flag (TEST_MODE / VITE_TEST_MODE / PLAYWRIGHT_TEST — NOT
 *    BENCHMARK, and not bare NODE_ENV=test)
 * 3. Matching x-test-secret (constant-time) against getMasterSecret()
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

  const expected = getMasterSecret();
  if (!expected || !constantTimeCompare(incoming, expected)) {
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

  // 3. Expected secret — same unified chain as assertTestingApiAllowed
  const expected = getMasterSecret();
  if (!expected || !constantTimeCompare(incoming, expected)) return false;

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
