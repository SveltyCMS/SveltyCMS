/**
 * @file src/routes/(app)/config/workflows/+page.server.ts
 * @description Server-side logic for the content workflow builder.
 *
 * Responsibilities:
 * - Admin-only gate
 * - Load tenant collections and roles for the builder chrome
 */

import { error } from "@sveltejs/kit";
import { contentSystem } from "@src/content/index.server";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to workflows (admin only)`);
      throw error(403, "Admin privileges required");
    }

    const tenantId = (locals.tenantId ?? undefined) as DatabaseId | undefined;

    // Builder chrome is auxiliary: a collections/roles lookup failure must not turn
    // the editor into a 500. A demo/large/legacy install can fail either query while
    // the builder itself would still render (the selectors just start empty).
    let collections: { _id: string; name: string }[] = [];
    try {
      collections = contentSystem
        .getCollections(tenantId)
        .filter((schema) => Boolean(schema._id))
        .map((schema) => ({ _id: String(schema._id), name: String(schema.name ?? schema._id) }));
    } catch (err) {
      logger.warn("Workflows: could not load collections for the builder chrome", err);
    }

    let roles: { _id: string; name: string }[] = [];
    try {
      const roleRows = await dbAdapter.auth.getAllRoles({ tenantId });
      roles = roleRows.map((role) => ({
        _id: String(role._id),
        name: String(role.name ?? role._id),
      }));
    } catch (err) {
      logger.warn("Workflows: could not load roles for the builder chrome", err);
    }

    return { isAdmin: true, collections, roles };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load workflows:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
