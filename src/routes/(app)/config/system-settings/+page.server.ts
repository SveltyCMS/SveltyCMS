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

import { error, redirect } from "@sveltejs/kit";
// System Logs
import { logger } from "@utils/logger.server";
import { contentService } from "@src/content/content-service.server";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const { user, isAdmin, roles: tenantRoles } = locals;

    // If validation fails, redirect the user to the login page
    if (!user) {
      logger.warn("User not authenticated, redirecting to login");
      throw redirect(302, "/login");
    }

    // Log successful session validation
    logger.trace(`User authenticated successfully for user: ${user._id}`);

    // Check user permission for system settings using cached tenantRoles from locals
    const hasSystemSettingsPermission =
      isAdmin ||
      tenantRoles.some((role) =>
        role.permissions?.some((p) => {
          const [resource, action] = p.split(":");
          return resource === "config" && action === "settings";
        }),
      );

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
    if (err instanceof Error && "status" in err) {
      // This is likely a redirect or an error we've already handled
      throw err;
    }
    const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};

export const actions: Actions = {
  repairContentCache: async ({ locals }) => {
    const { isAdmin, user } = locals;
    if (!isAdmin) {
      throw error(403, "Only administrators can repair the content cache.");
    }

    logger.info(`🛠️ Content Cache Repair triggered by user: ${user?._id}`);

    try {
      // 1. Clear any mtime/schema caches to force a fresh scan
      // (Optionally done here or inside fullReload)

      // 2. Trigger full structural reconciliation
      await contentService.fullReload();

      return {
        success: true,
        message: "Content structure cache rebuilt and synchronized successfully.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`❌ Content Cache Repair failed: ${msg}`);
      return {
        success: false,
        error: `Repair failed: ${msg}`,
      };
    }
  },
};
