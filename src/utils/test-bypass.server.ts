/**
 * @file src/utils/test-bypass.server.ts
 * @description Centralized test/benchmark bypass gate — never active in production.
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
import { readRuntimeEnv } from "@utils/runtime-env";

type BypassLocals = App.Locals & {
  user?: App.Locals["user"];
  isAdmin?: boolean;
  tenantId?: App.Locals["tenantId"];
  __testBypass?: boolean;
};

/** True only when CI, Playwright, or benchmark env flags are explicitly set. */
export function isTestOrBenchmarkEnvironment(): boolean {
  return (
    readRuntimeEnv("TEST_MODE") === "true" ||
    readRuntimeEnv("VITE_TEST_MODE") === "true" ||
    readRuntimeEnv("PLAYWRIGHT_TEST") === "true" ||
    readRuntimeEnv("BENCHMARK") === "true" ||
    readRuntimeEnv("SVELTY_BENCHMARK_SUITE") === "true"
  );
}

function secretsMatch(incoming: string, expected: string): boolean {
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
  if (!isTestOrBenchmarkEnvironment()) return false;
  if (locals.__testBypass) return true;

  const incoming = request.headers.get("x-test-secret") || request.headers.get("X-Test-Secret");
  if (!incoming) return false;

  const expected =
    readRuntimeEnv("TEST_API_SECRET") || readRuntimeEnv("VITE_TEST_API_SECRET") || getTestSecret();
  if (!expected || !secretsMatch(incoming, expected)) return false;

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

  const tenantHeader = request.headers.get("x-tenant-id") || request.headers.get("X-Tenant-Id");
  if (tenantHeader) {
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
