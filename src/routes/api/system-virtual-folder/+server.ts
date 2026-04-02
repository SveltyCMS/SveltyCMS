/**
 * @file src/routes/api/systemVirtualFolder/+server.ts
 * @description API endpoint for system virtual folder operations with tenant isolation.
 */

import type { DatabaseId } from "@src/content/types";
import { dbAdapter } from "@src/databases/db";
import type { SystemVirtualFolder } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

// GET Handler for retrieving folders
export const GET = apiHandler(async ({ locals, url }) => {
  const { user, tenantId } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  if (!dbAdapter) throw new AppError("Database unavailable", 500, "DB_UNAVAILABLE");

  const folderPath = url.searchParams.get("path");

  try {
    if (folderPath) {
      // Get contents of a specific folder (scoped to tenant)
      const result = await dbAdapter.system.virtualFolder.getContents(
        folderPath,
        tenantId as DatabaseId,
      );
      if (!result.success) throw new AppError(result.message, 404, "NOT_FOUND");
      return json({ success: true, data: result.data });
    }

    // Get all folders (scoped to tenant)
    const result = await dbAdapter.system.virtualFolder.getAll(tenantId as DatabaseId);
    if (!result.success) throw new Error(result.message);
    return json({ success: true, data: result.data });
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error(`Error fetching system virtual folders for tenant ${tenantId}:`, e);
    throw new AppError("Failed to fetch folders", 500, "FETCH_FAILED");
  }
});

// POST Handler for creating a new virtual folder
export const POST = apiHandler(async ({ request, locals }) => {
  const { user, tenantId, isAdmin } = locals;
  if (!user || !isAdmin) throw new AppError("Forbidden", 403, "FORBIDDEN");

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    const { name, parentId } = await request.json();
    if (!name) throw new AppError("Name is required", 400, "INVALID_DATA");

    if (!dbAdapter) throw new AppError("Database unavailable", 500, "DB_UNAVAILABLE");

    // Build path based on parent (scoped to tenant)
    let folderPath = "";
    if (parentId) {
      const parentResult = await dbAdapter.system.virtualFolder.getById(
        parentId as DatabaseId,
        tenantId as DatabaseId,
      );
      if (parentResult.success && parentResult.data) {
        folderPath = `${parentResult.data.path}/${name.trim()}`;
      } else {
        throw new AppError("Parent folder not found or access denied", 404, "PARENT_NOT_FOUND");
      }
    } else {
      folderPath = `/${name.trim()}`;
    }

    const folderData: Omit<SystemVirtualFolder, "_id" | "createdAt" | "updatedAt"> = {
      name: name.trim(),
      path: folderPath,
      type: "folder",
      parentId: parentId ? (parentId as DatabaseId) : null,
      order: 0,
    };

    const result = await dbAdapter.system.virtualFolder.create(folderData, tenantId as DatabaseId);
    if (!result.success) throw new Error(result.message);

    logger.info(`System virtual folder created: ${result.data.name} for tenant ${tenantId}`);
    return json({ success: true, data: result.data }, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error(`Error creating system virtual folder for tenant ${tenantId}:`, e);
    throw new AppError("Failed to create folder", 500, "CREATE_FAILED");
  }
});

// PATCH Handler for reordering folders
export const PATCH = apiHandler(async ({ request, locals }) => {
  const { user, tenantId, isAdmin } = locals;
  if (!user || !isAdmin) throw new AppError("Forbidden", 403, "FORBIDDEN");

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    const { action, orderUpdates } = await request.json();
    if (action !== "reorder" || !Array.isArray(orderUpdates)) {
      throw new AppError("Invalid request data", 400, "INVALID_DATA");
    }

    if (!dbAdapter) throw new AppError("Database unavailable", 500, "DB_UNAVAILABLE");

    const results = await Promise.all(
      orderUpdates.map(
        async (update: { folderId: string; order: number; parentId?: string | null }) => {
          const { folderId, order, parentId: newParentId } = update;

          // Verify ownership and get current data
          const current = await dbAdapter!.system.virtualFolder.getById(
            folderId as DatabaseId,
            tenantId as DatabaseId,
          );
          if (!(current.success && current.data)) return { success: false };

          const updateData: Partial<SystemVirtualFolder> = { order };

          if (newParentId !== undefined) {
            updateData.parentId = newParentId ? (newParentId as DatabaseId) : null;
            if (newParentId) {
              const parent = await dbAdapter!.system.virtualFolder.getById(
                newParentId as DatabaseId,
                tenantId as DatabaseId,
              );
              updateData.path =
                parent.success && parent.data
                  ? `${parent.data.path}/${current.data.name}`
                  : `/${current.data.name}`;
            } else {
              updateData.path = `/${current.data.name}`;
            }
          }

          return dbAdapter!.system.virtualFolder.update(
            folderId as DatabaseId,
            updateData,
            tenantId as DatabaseId,
          );
        },
      ),
    );

    if (results.some((r) => !r.success))
      throw new AppError("Some updates failed", 500, "REORDER_FAILED");

    logger.info(`System virtual folders reordered for tenant ${tenantId}`);
    return json({ success: true });
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error(`Error reordering folders for tenant ${tenantId}:`, e);
    throw new AppError("Failed to reorder folders", 500, "REORDER_FAILED");
  }
});
