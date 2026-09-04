/**
 * @file src/routes/(app)/config/design-system/+page.server.ts
 * @description Server-side loader for the Design System (Appearance) workspace.
 *
 * Loads the current admin theme configuration and user admin status.
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { adminThemeService } from "@src/services/core/admin-theme-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { getFreshLayoutUser } from "@utils/server/layout-caches.server";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const sessionUser = getAuthenticatedUser(locals);
    const { isAdmin, tenantId } = locals;
    const user =
      (await getFreshLayoutUser(
        sessionUser,
        tenantId as import("@src/databases/db-interface").DatabaseId,
      )) ?? sessionUser;

    // All authenticated users can access design system settings
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
    logger.error("Error loading design system page:", err);
    throw error(500, "Failed to load design system settings");
  }
};
