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
    const [schemas, roles] = await Promise.all([
      contentSystem.getCollections(tenantId),
      dbAdapter.auth.getAllRoles({ tenantId }),
    ]);

    const collections = schemas
      .filter((schema) => Boolean(schema._id))
      .map((schema) => ({ _id: String(schema._id), name: schema.name }));

    return {
      isAdmin: true,
      collections,
      roles: roles.map((role) => ({
        _id: String(role._id),
        name: role.name,
      })),
    };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load workflows:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
