/**
 * @file src/routes/(app)/config/access-management/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 */

// Auth - getAllPermissions is lightweight, no heavy queries needed
import { getAllPermissions } from "@src/databases/auth/permissions";
import { error, redirect } from "@sveltejs/kit";
// System Logger - Ensure logger is optimized for performance in production (e.g., disabled debug logs)
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const { user, roles: tenantRoles = [], tenantId, isAdmin: localsIsAdmin } = locals;

    // User authentication and permission checks already done by handleAuthorization hook
    if (!user) {
      logger.warn("User not authenticated, redirecting to login");
      throw redirect(302, "/login");
    }

    // Check if user is admin — admins use localsIsAdmin from hook
    if (!localsIsAdmin) {
      // For non-admins, check specific permission
      // You can add more granular permission checks here if needed
      const message = `User ${user._id} does not have permission to access access management`;
      logger.warn(message, { tenantId });
      throw error(403, message);
    }

    // Fetch permissions (lightweight operation)
    logger.debug("Fetching permissions...", { tenantId });
    const permissions = getAllPermissions();

    logger.debug(`Roles available: ${tenantRoles.length}`, { tenantId });
    logger.debug(`Permissions fetched: ${permissions.length}`, { tenantId });

    // Return minimal user data and reuse roles from locals (already cached by handleAuthorization)
    return {
      user: {
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      roles: tenantRoles, // Already cached and loaded by handleAuthorization hook
      permissions,
    };
  } catch (err: any) {
    // Differentiate between intentional redirects/errors and unexpected server errors
    if (err && typeof err === "object" && "status" in err) {
      // This is likely a redirect or an error we've already thrown (e.g., 403, 302)
      throw err;
    }
    const message = `Error in load function for Access Management: ${err.message}`;
    logger.error(message, { tenantId: locals.tenantId });
    throw error(500, message); // Generic 500 for unhandled server errors
  }
};
