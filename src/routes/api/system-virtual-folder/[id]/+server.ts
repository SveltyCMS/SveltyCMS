/**
 * @file src/routes/api/systemVirtualFolder/[id]/+server.ts
 * @description API endpoint for individual system virtual folder operations with tenant isolation.
 */

import type { DatabaseId } from "@src/content/types";
import { dbAdapter } from "@src/databases/db";
import type { SystemVirtualFolder } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { constructMediaUrl } from "@utils/media/media-utils";

interface MediaDoc {
  _id?: string;
  filename?: string;
  thumbnailHeight?: number;
  thumbnailWidth?: number;
  virtualFolderId?: string | null;
  tenantId?: string;
  [key: string]: unknown;
}

// GET Handler for retrieving folder contents
export const GET = apiHandler(async ({ params, locals }) => {
  const { user, tenantId } = locals;
  const { id } = params;

  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  if (!dbAdapter) throw new AppError("Database unavailable", 500, "DB_UNAVAILABLE");

  try {
    let currentFolder: SystemVirtualFolder | null = null;
    let folders: SystemVirtualFolder[] = [];
    let files: MediaDoc[] = [];

    const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");
    const effectiveTenantId = isMultiTenant ? (tenantId as DatabaseId) : undefined;

    if (id === "root") {
      // Root level (scoped to tenant)
      const folderResult = await dbAdapter.system.virtualFolder.getByParentId(
        null,
        effectiveTenantId as DatabaseId,
      );
      folders = folderResult.success ? folderResult.data || [] : [];

      const fileQuery: Record<string, unknown> = { virtualFolderId: null };
      const queryOptions = { tenantId: effectiveTenantId as DatabaseId };

      const [imagesResult, documentsResult, audioResult, videosResult] = await Promise.all([
        dbAdapter.crud.findMany("media_images", fileQuery as any, queryOptions),
        dbAdapter.crud.findMany("media_documents", fileQuery as any, queryOptions),
        dbAdapter.crud.findMany("media_audio", fileQuery as any, queryOptions),
        dbAdapter.crud.findMany("media_videos", fileQuery as any, queryOptions),
      ]);

      files = [
        ...(imagesResult.success ? (imagesResult.data as unknown as MediaDoc[]) : []),
        ...(documentsResult.success ? (documentsResult.data as unknown as MediaDoc[]) : []),
        ...(audioResult.success ? (audioResult.data as unknown as MediaDoc[]) : []),
        ...(videosResult.success ? (videosResult.data as unknown as MediaDoc[]) : []),
      ];
    } else {
      // Specific folder (verify ownership)
      const folderResult = await dbAdapter.system.virtualFolder.getById(
        id as DatabaseId,
        effectiveTenantId as DatabaseId,
      );
      if (!(folderResult.success && folderResult.data)) {
        throw new AppError("Folder not found or access denied", 404, "NOT_FOUND");
      }
      currentFolder = folderResult.data;

      const subfolderResult = await dbAdapter.system.virtualFolder.getByParentId(
        id as DatabaseId,
        effectiveTenantId as DatabaseId,
      );
      folders = subfolderResult.success ? subfolderResult.data || [] : [];

      const fileQuery: Record<string, unknown> = { virtualFolderId: id };
      const queryOptions = { tenantId: effectiveTenantId as DatabaseId };

      const [imagesResult, documentsResult, audioResult, videosResult] = await Promise.all([
        dbAdapter.crud.findMany("media_images", fileQuery as any, queryOptions),
        dbAdapter.crud.findMany("media_documents", fileQuery as any, queryOptions),
        dbAdapter.crud.findMany("media_audio", fileQuery as any, queryOptions),
        dbAdapter.crud.findMany("media_videos", fileQuery as any, queryOptions),
      ]);

      files = [
        ...(imagesResult.success ? (imagesResult.data as unknown as MediaDoc[]) : []),
        ...(documentsResult.success ? (documentsResult.data as unknown as MediaDoc[]) : []),
        ...(audioResult.success ? (audioResult.data as unknown as MediaDoc[]) : []),
        ...(videosResult.success ? (videosResult.data as unknown as MediaDoc[]) : []),
      ];
    }

    // Process URLs
    const processedFiles = files.map((file) => ({
      ...file,
      url: constructMediaUrl(file as any, "original"),
      thumbnail: {
        url: constructMediaUrl(file as any, "thumbnail"),
        width: file.thumbnailWidth || 200,
        height: file.thumbnailHeight || 200,
      },
    }));

    return json({
      success: true,
      data: {
        currentFolder,
        contents: { files: processedFiles, folders },
      },
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error(`Error fetching folder ${id} for tenant ${tenantId}:`, e);
    throw new AppError("Failed to fetch folder contents", 500, "FETCH_FAILED");
  }
});

// PATCH Handler for updating a folder
export const PATCH = apiHandler(async ({ params, request, locals }) => {
  const { user, tenantId, isAdmin } = locals;
  const { id } = params;

  if (!user || !isAdmin) throw new AppError("Forbidden", 403, "FORBIDDEN");

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    const { name } = await request.json();
    if (!name) throw new AppError("Name is required", 400, "INVALID_DATA");

    if (!dbAdapter) throw new AppError("Database unavailable", 500, "DB_UNAVAILABLE");

    // 1. Verify ownership and get current state
    const currentRes = await dbAdapter.system.virtualFolder.getById(
      id as DatabaseId,
      tenantId as DatabaseId,
    );
    if (!(currentRes.success && currentRes.data)) {
      throw new AppError("Folder not found or access denied", 404, "NOT_FOUND");
    }
    const currentFolder = currentRes.data;

    // 2. Build new path
    let newPath = "";
    if (currentFolder.parentId) {
      const parentRes = await dbAdapter.system.virtualFolder.getById(
        currentFolder.parentId as DatabaseId,
        tenantId as DatabaseId,
      );
      if (parentRes.success && parentRes.data) {
        newPath = `${parentRes.data.path}/${name.trim()}`;
      } else {
        throw new AppError("Parent folder access denied", 403, "FORBIDDEN");
      }
    } else {
      newPath = `/${name.trim()}`;
    }

    // 3. Perform update
    const result = await dbAdapter.system.virtualFolder.update(
      id as DatabaseId,
      {
        name: name.trim(),
        path: newPath,
      },
      tenantId as DatabaseId,
    );

    if (!result.success) throw new Error(result.message);

    logger.info(`Updated system virtual folder ${id} for tenant ${tenantId}`);
    return json({ success: true, folder: result.data });
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error(`Error updating system virtual folder ${id} for tenant ${tenantId}:`, e);
    throw new AppError("Failed to update folder", 500, "UPDATE_FAILED");
  }
});

// DELETE Handler for removing a folder
export const DELETE = apiHandler(async ({ params, locals }) => {
  const { user, tenantId, isAdmin } = locals;
  const { id } = params;

  if (!user || !isAdmin) throw new AppError("Forbidden", 403, "FORBIDDEN");

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    if (!dbAdapter) throw new AppError("Database unavailable", 500, "DB_UNAVAILABLE");

    // 1. Verify ownership and check for children
    const folderRes = await dbAdapter.system.virtualFolder.getById(
      id as DatabaseId,
      tenantId as DatabaseId,
    );
    if (!(folderRes.success && folderRes.data)) {
      throw new AppError("Folder not found or access denied", 404, "NOT_FOUND");
    }

    const subfolders = await dbAdapter.system.virtualFolder.getByParentId(
      id as DatabaseId,
      tenantId as DatabaseId,
    );
    if (subfolders.success && subfolders.data.length > 0) {
      throw new AppError("Cannot delete folder with subfolders", 400, "HAS_CHILDREN");
    }

    // 2. Perform deletion
    const result = await dbAdapter.system.virtualFolder.delete(
      id as DatabaseId,
      tenantId as DatabaseId,
    );
    if (!result.success) throw new Error(result.message);

    logger.info(`Deleted system virtual folder ${id} for tenant ${tenantId}`);
    return json({ success: true, message: "Folder deleted successfully" });
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error(`Error deleting system virtual folder ${id} for tenant ${tenantId}:`, e);
    throw new AppError("Failed to delete folder", 500, "DELETE_FAILED");
  }
});
