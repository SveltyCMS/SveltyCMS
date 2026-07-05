/**
 * @file src/routes/(app)/config/design-system/+page.server.ts
 * @description Server loader for the interactive admin design system playground.
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

    let adminTheme = null;
    try {
      adminTheme = await adminThemeService.getAdminTheme(tenantId);
    } catch (err) {
      logger.warn("Could not load admin theme for design system playground:", err);
    }

    return {
      user: { ...user, _id: user._id?.toString() },
      isAdmin: isAdmin ?? false,
      adminTheme,
    };
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    logger.error("Error loading design system playground:", err);
    throw error(500, "Failed to load design system playground");
  }
};
