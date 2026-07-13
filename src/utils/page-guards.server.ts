/**
 * @file src/utils/page-guards.server.ts
 * @description Thin page-level guards that assume hooks already authenticated the request.
 *
 * `handleAuthentication` + `handleAuthorization` run before every `(app)` route.
 * Page loaders and actions should use these helpers for **resource permissions only**,
 * not session validation or login redirects.
 *
 * ### Features:
 * - getAuthenticatedUser — fail-closed 401 if hooks did not populate user
 * - requirePagePermission — RBAC check against locals.roles
 */

import type { User } from "@src/databases/auth/types";
import type { Role } from "@src/databases/auth/types";
import { error, redirect } from "@sveltejs/kit";

/**
 * Returns the authenticated user from hook-populated locals.
 * Redirects to /login if the session has expired or is missing,
 * optionally preserving the original URL so the user returns after signing in.
 */
export function getAuthenticatedUser(locals: App.Locals, returnUrl?: string): User {
  const user = locals.user;
  if (!user) {
    const loginUrl = returnUrl ? `/login?redirect=${encodeURIComponent(returnUrl)}` : "/login";
    throw redirect(302, loginUrl);
  }
  return user;
}

/**
 * Checks whether any role grants `permission` (e.g. `media:read`).
 */
export function hasPagePermission(
  locals: App.Locals,
  permission: string,
  roles: Role[] = locals.roles ?? [],
): boolean {
  if (locals.isAdmin) return true;
  return roles.some((role) => (role.permissions ?? []).includes(permission));
}

/**
 * Throws 403 unless the user has the given permission.
 */
export function requirePagePermission(
  locals: App.Locals,
  permission: string,
  message = "Insufficient permissions",
): void {
  getAuthenticatedUser(locals);
  if (!hasPagePermission(locals, permission)) {
    throw error(403, message);
  }
}
