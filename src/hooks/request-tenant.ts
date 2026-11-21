/**
 * @file src/hooks/request-tenant.ts
 * @description Per-request tenant resolution shared by every turbo fast path.
 *
 * Turbo paths hydrate `locals` from a session-keyed auth cache, so the tenant
 * they carry belongs to whichever request resolved the session first. A later
 * request on the same session that targets a different tenant (test-mode
 * `x-test-tenant-id`) would then read or write the wrong tenant — exactly the
 * cross-tenant leak the `tenant-isolation` integration suite guards against.
 * Every turbo path must therefore re-apply the per-request override.
 *
 * ### Features:
 * - Test-mode-only header override (never trusted in production)
 * - Charset-validated; rejects the literal `"null"`
 * - Falls back to the tenant the session was resolved with
 */

import type { DatabaseId } from "@src/content/types";

/** Tenant ids are opaque slugs — reject anything that is not a plain identifier. */
const TENANT_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Boot-time fast check: in normal production (`NODE_ENV=production` without
 * test-mode override), skip `process.env` lookups on the per-request hot path.
 */
const IS_PURE_PROD_NO_TEST =
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  process.env.TEST_MODE !== "true" &&
  process.env.PLAYWRIGHT_TEST !== "true" &&
  process.env.ALLOW_TEST_MODE_IN_PROD !== "true";

export function resolveRequestTenant(
  request: Request,
  sessionTenant: DatabaseId | null | undefined,
): DatabaseId | null {
  if (IS_PURE_PROD_NO_TEST) {
    return sessionTenant ?? null;
  }
  const env = process.env;
  const isProd = env.NODE_ENV === "production";
  const testModeAllowed =
    (env.TEST_MODE === "true" || env.PLAYWRIGHT_TEST === "true") &&
    (!isProd || Boolean(env.TEST_API_SECRET) || env.ALLOW_TEST_MODE_IN_PROD === "true");
  if (testModeAllowed) {
    const header = request.headers.get("x-test-tenant-id") ?? request.headers.get("x-tenant-id");
    if (header && header !== "null" && TENANT_ID_RE.test(header)) {
      return header as DatabaseId;
    }
  }
  return sessionTenant ?? null;
}
