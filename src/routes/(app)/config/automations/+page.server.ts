/**
 * @file src/routes/(app)/config/automations/+page.server.ts
 * @description Server-side logic for the workflow automations list page.
 *
 * Responsibilities:
 * - Admin-only gate
 * - Load tenant-scoped automation flows via the in-process automation service
 */

import { error } from "@sveltejs/kit";
import { automationService } from "@src/services/background/automation/automation-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to automations (admin only)`);
      throw error(403, "Admin privileges required");
    }

    const flows = await automationService.getFlows(locals.tenantId ?? undefined);
    return { isAdmin: true, flows };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load automations:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
