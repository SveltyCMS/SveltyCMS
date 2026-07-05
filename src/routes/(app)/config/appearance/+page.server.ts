/**
 * @file src/routes/(app)/config/appearance/+page.server.ts
 * @description Server-side loader for the Admin Theme Settings page.
 *
 * Loads the current admin theme configuration and user admin status.
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { adminThemeService } from "@src/services/core/admin-theme-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const { isAdmin, tenantId } = locals;

    // All authenticated users can access appearance settings
    // Admin-only sections (Themes, Advanced) are hidden in the UI

    // Load current admin theme configuration
    let adminTheme = null;
    try {
      adminTheme = await adminThemeService.getAdminTheme(tenantId);
    } catch (err) {
      logger.warn("Could not load admin theme, using defaults:", err);
    }

    return {
      user: { ...user, _id: user._id?.toString() },
      isAdmin,
      adminTheme: adminTheme || null,
    };
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    logger.error("Error loading appearance page:", err);
    throw error(500, "Failed to load appearance settings");
  }
};
