/**
 * @file src/routes/(app)/config/system-settings/+page.server.ts
 * @description Server-side logic for System Settings page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the System Settings page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Checks user permissions for system settings access.
 * - Returns user data if authentication and authorization are successful.
 * - Handles cases of unauthenticated users or insufficient permissions.
 */

import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { error, isHttpError } from "@sveltejs/kit";
// System Logs
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

// Side-effect import: registers remote command with SvelteKit metadata for client build
import "./admin.remote";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const isAdmin = !!(locals.isAdmin || (user as any)?.isAdmin || user.role === "admin");
    const tenantRoles = locals.roles ?? [];

    // Log successful session validation
    logger.trace(`User authenticated successfully for user: ${user._id}`);

    const hasSystemSettingsPermission =
      isAdmin || hasPermissionWithRoles(user, "config:settings", tenantRoles);

    if (!hasSystemSettingsPermission) {
      const message = `User ${user._id} does not have permission to access system settings`;
      logger.warn(message, {
        userRole: user.role,
        isAdmin,
      });
      throw error(403, "Insufficient permissions");
    }

    // Return user data with isAdmin flag for settings filtering
    const { _id, ...rest } = user;
    return {
      user: {
        _id: _id.toString(),
        ...rest,
      },
      isAdmin,
    };
  } catch (err) {
    if (isHttpError(err)) {
      throw err;
    }
    const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};
