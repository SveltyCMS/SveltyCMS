/**
 * @file src/utils/test-bypass.server.ts
 * @description Hardened test/benchmark bypass gate.
 *
 * ### Hardening (audit 2026-07):
 * - Production hard-gate: IS_PROD exits immediately, regardless of env flags
 * - Case-insensitive headers: Fetch API handles this natively, removed redundant fallback
 * - Tenant sanitization: regex validates x-tenant-id before injection
 * - Simplified secret retrieval: single source (TEST_API_SECRET or getTestSecret)
 *
 * Test credentials are accepted ONLY when an explicit test/benchmark env flag is set
 * AND the secret matches via timing-safe comparison. No hardcoded fallback secrets.
 *
 * ### Features:
 * - Environment-gated bypass (TEST_MODE, PLAYWRIGHT, BENCHMARK)
 * - timingSafeEqual secret verification
 * - Single injection point for system admin test user
 */

import { timingSafeEqual } from "node:crypto";
import type { RequestEvent } from "@sveltejs/kit";
import { getTestSecret } from "@utils/server/setup-check";

// 🛡️ Hardened Production Guard — never active in production
const IS_PROD = process.env.NODE_ENV === "production";

type BypassLocals = App.Locals & {
  user?: App.Locals["user"];
  isAdmin?: boolean;
  tenantId?: App.Locals["tenantId"];
  __testBypass?: boolean;
};

/**
 * Strict environment check.
 * If NODE_ENV is production, this utility returns false immediately.
 */
export function isTestOrBenchmarkEnvironment(): boolean {
  if (IS_PROD) return false;

  const env = process.env;
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

/**
 * Validates x-test-secret and injects a system admin user into locals.
 * Returns true when bypass was applied. No-op in production (no env flags).
 */
export function applyTestBypassFromRequest(
  request: Request,
  locals: BypassLocals,
  options?: { setBypassFlag?: boolean },
): boolean {
  // 1. Double-check guard — IS_PROD exits immediately
  if (IS_PROD || !isTestOrBenchmarkEnvironment()) return false;
  if (locals.__testBypass) return true;

  // 2. Header extraction — Fetch API is case-insensitive
  const incoming = request.headers.get("x-test-secret");
  if (!incoming) return false;

  // 3. Expected secret retrieval
  const expected = process.env.TEST_API_SECRET || getTestSecret();
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

  // 5. Tenant Injection — sanitized
  const tenantHeader = request.headers.get("x-tenant-id");
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
