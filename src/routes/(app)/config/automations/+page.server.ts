/**
 * @file src/routes/(app)/config/automations/+page.server.ts
 * @description Admin-only gate for workflow automations list page.
 */

import { error, isHttpError } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to automations (admin only)`);
      throw error(403, "Admin privileges required");
    }
    return { isAdmin: true };
  } catch (err) {
    if (isHttpError(err)) throw err;
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
