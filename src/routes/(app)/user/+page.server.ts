/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - Form validation for adding users and changing passwords
 * - Preparing data for client-side rendering
 *
 * Features:
 * - User and role information retrieval from event.locals
 * - Form handling
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles form validation for the client-side rendering.
 */

import type { PermissionConfig } from "@src/databases/auth/permissions";
import type { Role } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
// System Logger
import { getUntypedSetting } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { getFreshLayoutUser } from "@utils/server/layout-caches.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  try {
    const sessionUser = getAuthenticatedUser(event.locals);
    const roles: Role[] = event.locals.roles || [];
    const isFirstUser: boolean = event.locals.isFirstUser;
    const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

    // Use isAdmin from authorization hook (handles multi-tenant fallback correctly)
    const isAdmin = event.locals.isAdmin === true;

    // 🛡️ Stale-session self-heal: the session snapshot can reference a user id
    // that no longer resolves (wizard reset / re-seed recreates the account
    // under a new id). Refresh from the DB — resolving by email when the id
    // misses — so the profile page never renders a stale cached snapshot.
    const user =
      (await getFreshLayoutUser(sessionUser, event.locals.tenantId as DatabaseId)) ?? sessionUser;
    const activeUser = user;

    // Resolve display permissions: prefer hook-populated locals, then user record, then role
    const rolePermissions =
      roles.find((r) => r._id?.toString() === activeUser.role || r.name === activeUser.role)
        ?.permissions ?? [];
    let displayPermissions: string[] = Array.isArray(event.locals.permissions)
      ? (event.locals.permissions as string[])
      : Array.isArray(activeUser.permissions) && activeUser.permissions.length > 0
        ? activeUser.permissions
        : rolePermissions;
    // Admins always see a non-empty grant list for transparency in the Security card
    if (isAdmin && displayPermissions.length === 0) {
      displayPermissions = ["system:admin", "user:read", "user:write", "config:settings"];
    }

    // Prepare user object for return, ensuring _id is a string and including admin status
    const rawId = (activeUser as any)?._id;
    const userIdStr =
      typeof rawId === "string"
        ? rawId
        : rawId && typeof rawId.toString === "function"
          ? rawId.toString()
          : rawId
            ? String(rawId)
            : "";

    const safeUser = {
      ...activeUser,
      _id: userIdStr,
      password: "[REDACTED]", // Ensure password is not sent to client
      isAdmin, // Add the properly calculated admin status
      permissions: displayPermissions,
    };

    // Admin data will now be fetched on-demand via API endpoints
    // This improves initial page load performance significantly
    let adminData: any = null;

    if (isAdmin || hasManageUsersPermission) {
      // No longer pre-loading allUsers and allTokens here
      // The AdminArea component will fetch this data via API calls
      adminData = {
        users: [], // Empty arrays - data loaded on demand
        tokens: [],
      };
    }

    // Provide manageUsersPermissionConfig to the client
    const manageUsersPermissionConfig: PermissionConfig = {
      contextId: "config/userManagement",
      action: "manage",
      contextType: "system",
      name: "User Management",
      description: "Manage user accounts and roles",
    };

    // Return data to the client
    return {
      user: safeUser,
      roles: roles.map((role) => ({
        ...role,
        _id: role?._id != null ? role._id.toString() : "",
      })),
      isFirstUser,
      is2FAEnabledGlobal: Boolean(await getUntypedSetting("USE_2FA")),
      manageUsersPermissionConfig,
      adminData,
      // Total system users — the Multibutton gates the destructive delete
      // action on this count ("isLastUser"), NOT on the filtered table's
      // totalItems. Without it, searching (filtered totalItems = 1) made the
      // delete action disabled for every non-admin user.
      totalUsers: isAdmin || hasManageUsersPermission ? await getTotalUserCount(event) : 0,
      permissions: {
        "config/adminArea": {
          hasPermission: isAdmin || hasManageUsersPermission,
        },
      },
      isAdmin, // Pass isAdmin to client for PermissionGuard
    };
  } catch (err) {
    // 🚀 RE-THROW REDIRECTS: SvelteKit uses throw redirect() as control flow (e.g. /login)
    if (err instanceof Error && "status" in err) throw err;
    logger.error("Error during load function (ErrorCode: USER_LOAD_500):", err);
    return {
      user: null,
      roles: [],
      isFirstUser: false,
      is2FAEnabledGlobal: false,
      manageUsersPermissionConfig: {
        contextId: "config/userManagement",
        requiredRole: "admin",
        action: "manage",
        contextType: "system",
      },
      adminData: null,
      permissions: {
        "config/adminArea": { hasPermission: false },
      },
      isAdmin: false,
      error: "Internal Server Error. Please try again later.",
    };
  }
};

/** Total user count across tenants (single-tenant: all users). */
async function getTotalUserCount(event: Parameters<PageServerLoad>[0]): Promise<number> {
  try {
    const { dbAdapter } = await import("@src/databases/db");
    if (!dbAdapter?.auth) return 0;
    const res = await dbAdapter.auth.getUserCount(
      {},
      { tenantId: event.locals.tenantId as DatabaseId },
    );
    // DatabaseResult<number> envelope on all adapters; tolerate a raw number too.
    const count = typeof res === "number" ? res : (res as { data?: unknown })?.data;
    return typeof count === "number" && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}
