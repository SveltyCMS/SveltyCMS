/**
 * @file src/routes/(app)/config/redirects/+page.server.ts
 * @description Server-side logic for global redirect management.
 *
 * Responsibilities:
 * - Authenticate user and require admin privileges
 * - Load tenant-scoped redirect rules via LocalCMS
 */

import type { RequestEvent } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import { error, isHttpError } from "@sveltejs/kit";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { logger } from "@utils/logger";

export const load = async ({ locals }: RequestEvent) => {
  try {
    const user = getAuthenticatedUser(locals);
    const { tenantId, isAdmin } = locals;

    if (!isAdmin) {
      logger.warn(`User ${user._id} denied access to redirect manager (admin only)`);
      throw error(403, "Admin privileges required");
    }

    if (!dbAdapter) throw error(500, "Database not initialized");

    const cms = new LocalCMS(dbAdapter, { user, tenantId });

    // Fetch redirects for this tenant
    const result = await cms.collections.find("redirects", { tenantId });

    return {
      redirects: result.success ? result.data : [],
      isAdmin: true,
    };
  } catch (err) {
    if (isHttpError(err)) throw err;
    const message = `Error loading redirects: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};
