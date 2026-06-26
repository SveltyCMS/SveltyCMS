/**
 * @file src/widgets/core/media-upload/process-upload.ts
 * @description Server-side media upload processing extracted from widget definition.
 *
 * Keeps the widget definition free of server-only imports (MediaService, dbAdapter).
 * Called from modifyRequest when a File is detected in the field value.
 *
 * ### Features:
 * - Single and multi-file upload processing with consistent return shape
 * - Dynamic folder resolution (field.folder → collectionName → tenantId → global)
 * - Configurable media visibility (private by default, public for CDN-optimized)
 * - Consistent error handling — returns empty array on failure, never throws
 * - Pass-through for existing media IDs (non-File values)
 */

import { logger } from "@utils/logger";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { DatabaseId } from "@src/content/types";

/** Minimal user shape needed for upload attribution */
interface UploadUser {
  _id: DatabaseId;
}

/** Context passed from the widget's modifyRequest */
export interface UploadContext {
  /** The field configuration from the widget schema */
  field: {
    folder?: string;
    multiupload?: boolean;
  };
  /** Authenticated user (for attribution) */
  user: UploadUser;
  /** Tenant identifier */
  tenantId: string;
  /** Collection name for automatic folder derivation */
  collectionName?: string;
}

/** Result of processing an upload value */
export interface UploadResult {
  /** Array of resolved media IDs */
  ids: DatabaseId[];
  /** Whether this was a multi-file upload */
  isMulti: boolean;
}

/** Resolves the storage folder path for uploaded media */
function resolveFolderPath(ctx: UploadContext): string {
  return (
    ctx.field.folder ||
    (ctx.collectionName
      ? `collections/${ctx.collectionName.toLowerCase()}`
      : ctx.tenantId || "global")
  );
}

/**
 * Processes a single File upload and returns the saved media ID.
 * Returns `null` if the upload fails (caller should skip the entry).
 */
async function processSingleFile(
  file: File,
  ctx: UploadContext,
  service: any, // MediaService — dynamically imported
): Promise<DatabaseId | null> {
  const folderPath = resolveFolderPath(ctx);
  const saved = await service.saveMedia(file, String(ctx.user._id), "private", folderPath);
  if (saved.success) {
    return saved.data._id;
  }
  logger.warn("[MediaUpload] Failed to save media", {
    fileName: file.name,
    size: file.size,
  });
  return null;
}

/**
 * Processes all File objects in the value and returns an array of media IDs.
 * Non-File values (existing IDs) are passed through unchanged.
 */
async function processMultiFiles(
  files: unknown[],
  ctx: UploadContext,
  service: any,
): Promise<DatabaseId[]> {
  const folderPath = resolveFolderPath(ctx);
  const ids: DatabaseId[] = [];

  for (const item of files) {
    if (item instanceof File) {
      const saved = await service.saveMedia(item, String(ctx.user._id), "private", folderPath);
      if (saved.success) {
        ids.push(saved.data._id);
      }
    } else {
      ids.push(item as DatabaseId);
    }
  }
  return ids;
}

/**
 * Main entry point — processes a media upload value.
 *
 * Called from the widget's modifyRequest when running on the server.
 * Dynamically imports MediaService and dbAdapter to keep the widget
 * definition import tree free of server-only modules.
 *
 * @returns UploadResult with resolved media IDs and multi-file flag.
 */
export async function processMediaUpload(
  value: unknown,
  ctx: UploadContext,
): Promise<UploadResult> {
  const empty = { ids: [], isMulti: false };

  if (!value) return empty;

  try {
    const { MediaService } = await import("@src/utils/media/media-service.server");
    const { dbAdapter } = await import("@src/databases/db");

    if (!dbAdapter) {
      logger.error("[MediaUpload] Database adapter not available for upload");
      return empty;
    }

    const service = new MediaService(dbAdapter as IDBAdapter);

    // Single file upload
    if (value instanceof File) {
      const id = await processSingleFile(value, ctx, service);
      return { ids: id ? [id] : [], isMulti: false };
    }

    // Multi-file upload
    if (Array.isArray(value)) {
      const ids = await processMultiFiles(value, ctx, service);
      return { ids, isMulti: ctx.field.multiupload ?? false };
    }

    // Already an ID string — pass through
    if (typeof value === "string" && value.length > 0) {
      return { ids: [value as DatabaseId], isMulti: false };
    }

    return empty;
  } catch (err) {
    logger.error("[MediaUpload] Upload processing failed", err);
    return empty;
  }
}
