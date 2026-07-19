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
// System Logger
import { getUntypedSetting } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  try {
    const user = getAuthenticatedUser(event.locals);
    const roles: Role[] = event.locals.roles || [];
    const isFirstUser: boolean = event.locals.isFirstUser;
    const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

    // Use isAdmin from authorization hook (handles multi-tenant fallback correctly)
    const isAdmin = event.locals.isAdmin === true;

    // Resolve display permissions: prefer hook-populated locals, then user record, then role
    const rolePermissions =
      roles.find((r) => r._id?.toString() === user.role || r.name === user.role)?.permissions ?? [];
    let displayPermissions: string[] = Array.isArray(event.locals.permissions)
      ? (event.locals.permissions as string[])
      : Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : rolePermissions;
    // Admins always see a non-empty grant list for transparency in the Security card
    if (isAdmin && displayPermissions.length === 0) {
      displayPermissions = ["system:admin", "user:read", "user:write", "config:settings"];
    }

    // Prepare user object for return, ensuring _id is a string and including admin status
    const safeUser = {
      ...user,
      _id: user._id.toString(),
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
        _id: role._id.toString(),
      })),
      isFirstUser,
      is2FAEnabledGlobal: Boolean(getUntypedSetting("USE_2FA")),
      manageUsersPermissionConfig,
      adminData,
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
