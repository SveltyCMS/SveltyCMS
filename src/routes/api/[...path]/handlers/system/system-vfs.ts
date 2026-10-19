/**
 * @file src/routes/api/[...path]/handlers/system/system-vfs.ts
 * @description Virtual folder CRUD and recursive path maintenance.
 */

import { AppError } from "@utils/error-handling";
import { buildFolderParentMap, folderMoveCreatesCycle } from "@utils/media/folder-tree";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { cacheService } from "@src/databases/cache/cache-service";

// The mediagallery breadcrumb/folder-tree load uses a 5-min SWR cache
// (`mediagallery:virtualFolders:<tenantId>`) keyed the same way here — must be
// invalidated on any folder mutation or newly created/renamed/deleted folders
// stay invisible client-side until the cache naturally expires.
async function invalidateVirtualFolderCache(tenantId: DatabaseId) {
  await cacheService.delete(`mediagallery:virtualFolders:${tenantId || "global"}`);
}

export async function handleSystemVirtualFolderRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request, url } = event;

  const tenantOpts = { tenantId };

  if (request.method === "GET") {
    const result = await cms.db.system.virtualFolder.getAll(tenantOpts);
    return successResponse(event, result);
  }

  if (request.method === "POST") {
    const { name, parent } = await request.json().catch(() => ({}));
    if (!name) {
      throw new AppError("Folder name is required", 400);
    }

    let parentId: DatabaseId | null = null;
    let path = `/${name}`;

    if (parent) {
      const parentResult = await cms.db.system.virtualFolder.getById(
        parent as DatabaseId,
        tenantOpts,
      );
      if (!parentResult.success || !parentResult.data) {
        throw new AppError("Parent folder not found", 404);
      }
      parentId = parentResult.data._id;
      path = parentResult.data.path === "/" ? `/${name}` : `${parentResult.data.path}/${name}`;
    }

    const result = await cms.db.system.virtualFolder.create(
      {
        name,
        path,
        parentId,
        order: 0,
        type: "folder",
      },
      tenantOpts,
    );
    await invalidateVirtualFolderCache(tenantId);
    return successResponse(event, result);
  }

  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === "reorder") {
      const { parentId, orderUpdates } = body;
      if (!Array.isArray(orderUpdates)) {
        throw new AppError("orderUpdates array is required for reordering", 400);
      }
      if (orderUpdates.length > 100) {
        throw new AppError("orderUpdates exceeds maximum limit of 100 items", 400);
      }

      // One snapshot for the whole request: cycle checks are O(depth), and the
      // map is updated after each accepted move so later updates in the same
      // batch cannot introduce a cycle either.
      const allFoldersResult = await cms.db.system.virtualFolder.getAll(tenantOpts);
      if (!allFoldersResult.success || !allFoldersResult.data) {
        throw new AppError("Unable to validate the folder hierarchy", 500);
      }
      const parentById = buildFolderParentMap(allFoldersResult.data);

      for (const update of orderUpdates) {
        const folderId = update.folderId;
        if (!folderId) continue;
        const targetParentId = parentId !== undefined ? parentId : update.parentId;
        const movingId = String(folderId);
        const targetId = targetParentId ? String(targetParentId) : null;

        if (folderMoveCreatesCycle(parentById, movingId, targetId)) {
          throw new AppError("Cannot move a folder into itself or one of its descendants", 400);
        }

        const folderResult = await cms.db.system.virtualFolder.getById(
          folderId as DatabaseId,
          tenantOpts,
        );
        if (!folderResult.success || !folderResult.data) {
          continue;
        }

        let newPath = `/${folderResult.data.name}`;
        if (targetParentId) {
          const parentFolder = await cms.db.system.virtualFolder.getById(
            targetParentId as DatabaseId,
            tenantOpts,
          );
          if (parentFolder.success && parentFolder.data) {
            newPath =
              parentFolder.data.path === "/"
                ? `/${folderResult.data.name}`
                : `${parentFolder.data.path}/${folderResult.data.name}`;
          }
        }

        await cms.db.system.virtualFolder.update(
          folderId as DatabaseId,
          {
            parentId: targetParentId ? (targetParentId as DatabaseId) : null,
            order: update.order,
            path: newPath,
          },
          tenantOpts,
        );
        parentById.set(movingId, targetId);

        await updateFolderPathsRecursive(cms, folderId as DatabaseId, newPath, tenantId);
      }

      await invalidateVirtualFolderCache(tenantId);
      return successResponse(event, { success: true });
    }

    const { folderId, name } = body;
    if (!folderId || !name) {
      throw new AppError("folderId and name are required for rename", 400);
    }

    const folderResult = await cms.db.system.virtualFolder.getById(
      folderId as DatabaseId,
      tenantOpts,
    );
    if (!folderResult.success || !folderResult.data) {
      throw new AppError("Folder not found", 404);
    }

    let parentPath = "/";
    if (folderResult.data.parentId) {
      const parentFolder = await cms.db.system.virtualFolder.getById(
        folderResult.data.parentId as DatabaseId,
        tenantOpts,
      );
      if (parentFolder.success && parentFolder.data) {
        parentPath = parentFolder.data.path;
      }
    }

    const newPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;

    const result = await cms.db.system.virtualFolder.update(
      folderId as DatabaseId,
      {
        name,
        path: newPath,
      },
      tenantOpts,
    );

    await updateFolderPathsRecursive(cms, folderId as DatabaseId, newPath, tenantId);

    await invalidateVirtualFolderCache(tenantId);
    return successResponse(event, result);
  }

  if (request.method === "DELETE") {
    let folderId = url.searchParams.get("folderId");
    if (!folderId) {
      const body = await request.json().catch(() => ({}));
      folderId = body.folderId;
    }

    if (!folderId) {
      throw new AppError("folderId is required for deletion", 400);
    }

    const result = await cms.db.system.virtualFolder.delete(folderId as DatabaseId, tenantOpts);
    await invalidateVirtualFolderCache(tenantId);
    return successResponse(event, result);
  }

  throw new AppError(`Method ${request.method} not allowed for system-virtual-folder`, 405);
}

/**
 * Recursively update paths of child folders when parent changes path or name.
 */
async function updateFolderPathsRecursive(
  cms: LocalCMS,
  parentId: DatabaseId,
  parentPath: string,
  tenantId: DatabaseId,
) {
  const tenantOpts = { tenantId };
  const allFoldersResult = await cms.db.system.virtualFolder.getAll(tenantOpts);
  if (!allFoldersResult.success || !allFoldersResult.data) {
    return;
  }
  const allFolders = allFoldersResult.data;

  async function updateChildren(currentParentId: DatabaseId, currentParentPath: string) {
    // Guard against a pre-existing corrupt cycle: without this, a folder whose
    // ancestor chain loops would recurse until the stack overflowed.
    const visitedKey = String(currentParentId);
    if (visited.has(visitedKey)) return;
    visited.add(visitedKey);

    const children = allFolders.filter(
      (f) => f.parentId && f.parentId.toString() === currentParentId.toString(),
    );
    for (const child of children) {
      const newChildPath =
        currentParentPath === "/" ? `/${child.name}` : `${currentParentPath}/${child.name}`;
      await cms.db.system.virtualFolder.update(child._id, { path: newChildPath }, tenantOpts);
      await updateChildren(child._id, newChildPath);
    }
  }

  const visited = new Set<string>();
  await updateChildren(parentId, parentPath);
}
