/**
 * @file src/routes/api/[...path]/handlers/system/system-shared.ts
 * @description Shared authorization and tenant helpers for the split system
 * handler modules.
 *
 * ### Features:
 * - `requireAdmin` — 403 for unauthenticated and non-admin (legacy contract)
 * - `requireAuthenticatedUser` / `requireAdminUser` — 401 before 403, returns the user
 * - `requireTenant` / `resolveRequestTenant` — multi-tenant requirement + super-admin override
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import { isAdmin } from "@src/databases/auth/constants";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";

export type AuthenticatedUser = NonNullable<RequestEvent["locals"]["user"]>;

/**
 * Validates admin authorization against the standardized SvelteKit locals context.
 *
 * Kept for callers whose contract is a bare 403 (no session distinction).
 * New handlers should prefer `requireAdminUser()`.
 */
export function requireAdmin(event: RequestEvent): void {
  const { locals } = event;
  if (locals.isAdmin || isAdmin(locals.user)) return;
  throw new AppError("Admin access required", 403, "FORBIDDEN");
}

/** Requires a session and returns the authenticated user (401 when absent). */
export function requireAuthenticatedUser(event: RequestEvent): AuthenticatedUser {
  const user = event.locals.user;
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return user;
}

/**
 * Requires a session and an admin role (401 before 403) and returns the user so
 * callers can apply super-admin tenant overrides without re-reading locals.
 */
export function requireAdminUser(
  event: RequestEvent,
  message = "Admin access required",
): AuthenticatedUser {
  const user = requireAuthenticatedUser(event);
  if (event.locals.isAdmin || isAdmin(user)) return user;
  throw new AppError(message, 403, "FORBIDDEN");
}

/** Requires a tenant id whenever multi-tenancy is enabled. */
export function requireTenant(tenantId: string | null | undefined): string {
  const tid = tenantId ? String(tenantId) : "";
  if (isMultiTenantEnabled() && !tid) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  return tid;
}

/**
 * Resolves the effective request tenant:
 * `?tenantId=` may only differ from the session tenant for super-admins.
 */
export function resolveRequestTenant(
  event: RequestEvent,
  tenantId: string | null | undefined,
  user: Pick<AuthenticatedUser, "role"> | null | undefined,
): string {
  let effective = tenantId ? String(tenantId) : "";
  const queryTenantId = event.url.searchParams.get("tenantId");

  if (queryTenantId && queryTenantId !== effective) {
    if (String(user?.role ?? "").toLowerCase() === "super-admin") {
      effective = queryTenantId;
    } else {
      throw new AppError("Forbidden: Cannot access other tenants", 403, "FORBIDDEN");
    }
  }

  return requireTenant(effective);
}
