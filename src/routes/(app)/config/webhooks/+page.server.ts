/**
 * @file src/routes/(app)/config/webhooks/+page.server.ts
 * @description Server-side logic for the webhook management page.
 *
 * Responsibilities:
 * - Admin-only gate
 * - Load tenant-scoped webhooks via the in-process webhook service
 */

import { error } from "@sveltejs/kit";
import { webhookService } from "@src/services/background/webhook-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to webhooks (admin only)`);
      throw error(403, "Admin privileges required");
    }

    const webhooks = await webhookService.getWebhooks(locals.tenantId ?? undefined);
    return { isAdmin: true, webhooks };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load webhooks:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
