/**
 * @file src/routes/(app)/config/redirects/+page.server.ts
 * @description Server-side logic for global redirect management.
 *
 * Responsibilities:
 * - Authenticate user and require admin privileges
 * - Load tenant-scoped redirect rules (redirectsMV primary)
 */

import type { RequestEvent } from "@sveltejs/kit";
import { error, isHttpError } from "@sveltejs/kit";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { logger } from "@utils/logger";
import { listRedirects } from "./redirects.server";

export const load = async ({ locals }: RequestEvent) => {
  try {
    getAuthenticatedUser(locals);
    const { isAdmin } = locals;

    if (!isAdmin) {
      throw error(403, "Admin privileges required");
    }

    const redirects = await listRedirects(locals as App.Locals);

    return {
      redirects,
      isAdmin: true,
    };
  } catch (err) {
    if (isHttpError(err)) throw err;
    const message = `Error loading redirects: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};
