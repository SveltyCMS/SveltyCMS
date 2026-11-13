/**
 * @file src/routes/(app)/config/trash/+page.server.ts
 * @description Server-side logic for the global trash bin.
 *
 * Responsibilities:
 * - Admin-only gate
 * - Load soft-deleted entries across all tenant collections (same read path and
 *   projection as the `/api/trash` handler, without an HTTP hop)
 */

import { error } from "@sveltejs/kit";
import { contentSystem } from "@src/content/index.server";
import { collectionTableName } from "@src/databases/core/collection-name";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import { toTrashItem, type TrashItem } from "@utils/trash-item";
import type { PageServerLoad } from "./$types";

// SvelteKit rejects non-`_` extra exports from a route module; the unit suite
// imports this alias to pin the shared fallback chain.
export { toTrashItem as _toTrashItem } from "@utils/trash-item";

const TRASH_LIMIT = 50;

/** Display-name priority for a resolved actor: full name → username → email. */
function userDisplayName(user: {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
}): string | undefined {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || user.email || undefined;
}

/**
 * Resolve `deletedBy` user ids to display names.
 *
 * `deletedBy` is an id, and the trash rendered it verbatim. Lookups are bounded
 * to the distinct ids on the page and tenant-scoped; an id that no longer
 * resolves (deleted user, legacy row) stays unresolved and falls back to the id.
 */
async function resolveActorNames(
  items: readonly TrashItem[],
  tenantId: DatabaseId | undefined,
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const item of items) {
    const actor = item.deletedBy?.trim();
    if (actor && actor.toLowerCase() !== "system") ids.add(actor);
  }

  const names: Record<string, string> = {};
  const auth = dbAdapter?.auth;
  if (ids.size === 0 || !auth?.getUserById) return names;

  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const result = await auth.getUserById(id as DatabaseId, { tenantId });
        const user = result.success ? result.data : null;
        const name = user ? userDisplayName(user) : undefined;
        if (name) names[id] = name;
      } catch (err) {
        // A missing/renamed user must not fail the whole trash listing.
        logger.debug(`[Trash] Could not resolve actor ${id}`, err);
      }
    }),
  );

  return names;
}

export const load = (async ({ locals }) => {
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

    return { isAdmin: true, items, actorNames: await resolveActorNames(items, tenantId) };
  } catch (err) {
    rethrow(err);
    logger.error("Failed to load trash:", err);
    throw error(500, err instanceof Error ? err.message : String(err));
  }
}) satisfies PageServerLoad;
