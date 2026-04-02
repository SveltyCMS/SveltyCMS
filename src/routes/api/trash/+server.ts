/**
 * @file src/routes/api/trash/+server.ts
 * @description API endpoint for cross-collection Trash management.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { contentManager } from "@src/content";
import { getPrivateSettingSync } from "@src/services/settings-service";
import type { DatabaseId } from "@src/databases/db-interface";

const normalizeCollectionName = (id: string) => `collection_${id.replace(/-/g, "")}`;

/**
 * GET /api/trash
 * Lists soft-deleted items across all collections for the current tenant.
 */
export const GET = apiHandler(async ({ locals, url }) => {
  const { user, tenantId, dbAdapter } = locals;

  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  if (!dbAdapter) throw new AppError("Database service unavailable", 503, "SERVICE_UNAVAILABLE");

  const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");
  if (isMultiTenant && !tenantId) throw new AppError("Tenant ID missing", 400, "TENANT_MISSING");

  // 1. Get all collections
  const schemas = await contentManager.getCollections(tenantId);
  const allDeletedItems: any[] = [];

  // 2. Fetch deleted items from each collection
  // In a real high-scale system, we might want a dedicated 'trash' collection
  // or a background aggregation, but for now, we query each.
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  for (const schema of schemas) {
    if (!schema._id) continue;
    const collectionName = normalizeCollectionName(schema._id);

    const result = await dbAdapter.crud.findMany(
      collectionName,
      {},
      {
        tenantId: tenantId as DatabaseId,
        includeDeleted: true,
        limit, // Limit per collection to keep it sane
      },
    );

    if (result.success && result.data) {
      const deletedOnly = result.data.filter((item: any) => item.isDeleted === true);
      allDeletedItems.push(
        ...deletedOnly.map((item) => ({
          ...item,
          collectionId: schema._id,
          collectionName: schema.name,
        })),
      );
    }
  }

  // Sort by deletedAt desc
  allDeletedItems.sort((a, b) => {
    return new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime();
  });

  return json({
    success: true,
    data: allDeletedItems.slice(0, limit),
  });
});

/**
 * POST /api/trash/restore
 * Restores a specific item from the trash.
 */
export const POST = apiHandler(async ({ locals, request }) => {
  const { user, tenantId, dbAdapter } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  if (!dbAdapter) throw new AppError("Database service unavailable", 503, "SERVICE_UNAVAILABLE");

  const { collectionId, entryId } = await request.json();
  if (!collectionId || !entryId) {
    throw new AppError("collectionId and entryId are required", 400, "BAD_REQUEST");
  }

  const schema = await contentManager.getCollectionById(collectionId, tenantId);
  if (!schema || !schema._id) {
    throw new AppError("Collection not found", 404, "NOT_FOUND");
  }

  const collectionName = normalizeCollectionName(schema._id);

  const result = await dbAdapter.crud.restore(collectionName, entryId as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });

  if (!result.success) {
    const code = (result as any).error?.code === "COLLISION" ? 409 : 500;
    throw new AppError(result.message || "Restore failed", code as any, "RESTORE_ERROR");
  }

  // Invalidate cache for this collection
  const { cacheService } = await import("@src/databases/cache/cache-service");
  const cachePattern = `collection:${collectionId}:*`;
  await cacheService.clearByPattern(cachePattern, tenantId).catch(() => {});

  return json({
    success: true,
    message: "Item restored successfully",
  });
});
