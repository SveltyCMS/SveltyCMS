/**
 * @file src/routes/(app)/config/sync/+page.server.ts
 * @description Server-side logic for the Configuration Sync page.
 *
 * This handler ensures that only authenticated users with administrative
 * privileges can access the configuration synchronization UI, and provides the
 * initial drift status so the page renders server-side.
 *
 * Features:
 * - Redirects unauthenticated users to the login page.
 * - Verifies that the user has an 'admin' role.
 * - Loads the tenant-scoped config sync status via the in-process service.
 * - Uses the central authentication logic from `hooks.server.ts`.
 */

import { error } from "@sveltejs/kit";
import { configService } from "@src/services/core/config-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const { isAdmin } = locals;

    // Authorization Check: Ensure the user is an administrator.
    //    Configuration synchronization is a high-privilege operation.
    if (!isAdmin) {
      logger.warn(`Permission denied for user=${user._id} to access Configuration Manager.`);
      throw error(403, "Forbidden: You do not have permission to access this page.");
    }

    const status = await configService.getStatus(locals.tenantId ?? undefined);

    // NOTE: Do NOT return a `user` key here — the (app) layout already provides the
    // authoritative data.user, and shadowing it with a partial shape (no _id/id) makes
    // floatingNavStore.bindUser() alternate ids and trip Svelte's effect_update_depth_exceeded.
    return { status };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load configuration sync status:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
