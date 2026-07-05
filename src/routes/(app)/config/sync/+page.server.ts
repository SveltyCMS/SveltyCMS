/**
 * @file src/routes/(app)/config/sync/+page.server.ts
 * @description Server-side logic for the Configuration Sync page.
 *
 * This handler ensures that only authenticated users with administrative
 * privileges can access the configuration synchronization UI.
 *
 * Features:
 * - Redirects unauthenticated users to the login page.
 * - Verifies that the user has an 'admin' role.
 * - Returns a safe user object to the page for display.
 * - Leverages the central authentication logic from `hooks.server.ts`.
 */

import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const user = getAuthenticatedUser(locals);
  const { isAdmin } = locals;

  // Authorization Check: Ensure the user is an administrator.
  //    Configuration synchronization is a high-privilege operation.
  if (!isAdmin) {
    logger.warn(`Permission denied for user=${user._id} to access Configuration Manager.`);
    throw error(403, "Forbidden: You do not have permission to access this page.");
  }

  // 4. Return safe data to the UI.
  //    Only return non-sensitive information needed for display.
  return {
    user: {
      email: user.email,
    },
  };
};
