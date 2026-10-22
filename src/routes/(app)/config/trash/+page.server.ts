/**
 * @file src/routes/(app)/config/trash/+page.server.ts
 * @description Server-side logic for the global trash bin.
 *
 * Responsibilities:
 * - Admin-only gate
 * - Load soft-deleted entries across all tenant collections (same read path as
 *   the `/api/trash` handler, without an HTTP hop)
 */

import { error } from "@sveltejs/kit";
import { contentSystem } from "@src/content/index.server";
import { collectionTableName } from "@src/databases/core/collection-name";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";
import type { TrashItem } from "./trash-api";

const TRASH_LIMIT = 50;

/** Coerce one soft-deleted row into the row shape the page renders. */
function toTrashItem(raw: unknown, collectionId: string, collectionName: string): TrashItem {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    _id: String(row._id ?? row.id ?? ""),
    title: typeof row.title === "string" ? row.title : undefined,
    name: typeof row.name === "string" ? row.name : undefined,
    collectionId,
    collectionName,
    deletedAt: typeof row.deletedAt === "string" ? row.deletedAt : undefined,
    deletedBy: typeof row.deletedBy === "string" ? row.deletedBy : undefined,
  };
}

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to trash (admin only)`);
      throw error(403, "Admin privileges required");
    }

    const tenantId = (locals.tenantId ?? undefined) as DatabaseId | undefined;
    const schemas = await contentSystem.getCollections(tenantId);

    const results = await Promise.all(
      schemas
        .filter((schema) => Boolean(schema._id))
        .map(async (schema) => {
          const collectionId = String(schema._id);
          const result = await dbAdapter.crud.findMany(
            collectionTableName(collectionId),
            { isDeleted: true },
            { tenantId, includeDeleted: true, limit: TRASH_LIMIT * 2 },
          );
          return result.success && Array.isArray(result.data)
            ? result.data.map((item) =>
                toTrashItem(item, collectionId, schema.name || collectionId),
              )
            : [];
        }),
    );

    const items = results
      .flat()
      .sort((a, b) => new Date(b.deletedAt ?? 0).getTime() - new Date(a.deletedAt ?? 0).getTime())
      .slice(0, TRASH_LIMIT);

    return { isAdmin: true, items };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load trash:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
