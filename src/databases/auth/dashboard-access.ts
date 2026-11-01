/**
 * @file src/databases/auth/dashboard-access.ts
 * @description Which permission opens the dashboard page and its endpoints.
 *
 * The catalog carries two ids for the same surface:
 * - `dashboard:read` (permission-catalog.ts, "View dashboard widgets and their
 *   metrics") — the id the `/api/dashboard` endpoint map requires;
 * - `system:dashboard` ("Access to the main administration dashboard") — the id
 *   every seeded non-admin role carries (DEFAULT_ROLE_GRANTS.developer/editor)
 *   and the one the admin UI shows for the page (config/+page.svelte).
 *
 * The dashboard page guard demanded `dashboard:read` only, so a seeded
 * `developer`/`editor` — and therefore every invited user, who lands on
 * `DEFAULT_AUTH_LANDING_PATH` — got `403` from `/dashboard` (measured: all three
 * seeded roles). Treating both ids as the grant keys the page and the endpoint
 * agree, and a role seeded with either one can actually use the CMS.
 */
import { resolvePermissionId } from "./permission-catalog";

/** The widget/metrics permission the `/api/dashboard` endpoints require. */
export const DASHBOARD_READ_PERMISSION = "dashboard:read";

/** The access grant seeded roles carry (legacy spelling of the same surface). */
export const SYSTEM_DASHBOARD_PERMISSION = "system:dashboard";

/** Any of these grants opens the dashboard page and its endpoints. */
export const DASHBOARD_ACCESS_PERMISSION_IDS = [
  DASHBOARD_READ_PERMISSION,
  SYSTEM_DASHBOARD_PERMISSION,
] as const;

const DASHBOARD_ACCESS_IDS: ReadonlySet<string> = new Set(DASHBOARD_ACCESS_PERMISSION_IDS);

/** True for a canonical dashboard id or any alias of one. */
export function isDashboardAccessPermission(permissionId: string): boolean {
  return DASHBOARD_ACCESS_IDS.has(resolvePermissionId(permissionId));
}

/**
 * True when any of `roles` grants dashboard access. Reads the same role rows the
 * page guard already has in `locals.roles` — no DB lookup, no allocation beyond
 * the walk itself.
 */
export function rolesGrantDashboardAccess(
  roles: readonly { permissions?: readonly string[] | null }[] | null | undefined,
): boolean {
  if (!roles) return false;
  for (const role of roles) {
    const permissions = role?.permissions;
    if (!permissions) continue;
    for (const permission of permissions) {
      if (isDashboardAccessPermission(permission)) return true;
    }
  }
  return false;
}
