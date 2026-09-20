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

function isTestMode(): boolean {
  return (
    process.env.TEST_MODE === "true" ||
    process.env.PLAYWRIGHT_TEST === "true" ||
    process.env.NODE_ENV === "test"
  );
}

/**
 * Effective tenant for a request: the test-mode header override when present,
 * otherwise the tenant the session was resolved with.
 */
export function resolveRequestTenant(
  request: Request,
  sessionTenant: DatabaseId | null | undefined,
): DatabaseId | null {
  if (isTestMode()) {
    const header = request.headers.get("x-test-tenant-id") ?? request.headers.get("x-tenant-id");
    if (header && header !== "null" && TENANT_ID_RE.test(header)) {
      return header as DatabaseId;
    }
  }
  return sessionTenant ?? null;
}
