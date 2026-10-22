/**
 * @file src/routes/(app)/config/automations/[id]/+page.server.ts
 * @description Server-side logic for the automation editor.
 *
 * Responsibilities:
 * - Admin-only gate
 * - Load a tenant-scoped flow by id (404 when it does not exist)
 * - Treat the `new` route param as a blank editor (no server read)
 */

import { error, isHttpError } from "@sveltejs/kit";
import { automationService } from "@src/services/background/automation/automation-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
  try {
    const user = getAuthenticatedUser(locals);
    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to automation editor (admin only)`);
      throw error(403, "Admin privileges required");
    }

    if (params.id === "new") {
      return { isNew: true, flow: null };
    }

    const flow = await automationService.getFlow(params.id, locals.tenantId ?? undefined);
    if (!flow) {
      throw error(404, "Automation not found");
    }

    return { isNew: false, flow };
  } catch (err) {
    rethrow(err);
    if (isHttpError(err)) throw err;
    logger.error(`Failed to load automation ${params.id}:`, err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
