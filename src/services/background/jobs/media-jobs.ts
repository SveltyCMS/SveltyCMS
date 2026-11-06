/**
 * @file src/services/background/jobs/media-jobs.ts
 * @description Job handlers for background media processing.
 */

import { getDb } from "@src/databases/db";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import {
  saveResizedImages,
  getFile,
  captureVideoThumbnail,
  buildDocumentPreview,
} from "@src/utils/media/media-storage.server";
import path from "node:path";
import type { DatabaseId } from "@src/databases/db-interface";

/**
 * Task handler for 'process-media'
 * Generates thumbnails and extracts metadata for a MediaItem.
 */
export async function processMediaHandler(payload: { fileId: string; basePath?: string }) {
  const { fileId, basePath = "global" } = payload;
  const db = getDb();

  if (!db) throw new Error("Database not initialized");

  logger.info(`[MediaJob] Starting processing for file: ${fileId}`);

  const dbId = fileId as DatabaseId;

  // 1. Fetch the media item
  const result = await db.media.files.getMetadata([dbId]);
  if (!result.success || !result.data[fileId]) {
    throw new Error(`Media item ${fileId} not found`);
  }

  // Need the full media document, not just metadata — read via crud.findOne.
  const mediaResult = await db.crud.findOne("media", { _id: dbId } as any);
  if (!mediaResult.success || !mediaResult.data) {
    throw new Error(`Media item ${fileId} not found via CRUD`);
  }

  const media = mediaResult.data as any;
  // Tenant scope for the metadata patch: multi-tenant mode rejects an unscoped write.
  const tenantId = (media as { tenantId?: DatabaseId | null }).tenantId as DatabaseId;
  let processingError: string | null = null;

  try {
    // 2. Load the original file buffer
    const buffer = await getFile(media.path);
    const mimeType = media.mimeType;

    // 3. Generate thumbnails
    const ext = path.extname(media.filename).slice(1) || "jpg";
    const baseName = path.basename(media.filename, `.${ext}`);

    let thumbnails: Record<string, unknown> = {};

    if (mimeType.startsWith("image/") && !mimeType.includes("svg")) {
      logger.debug(`[MediaJob] Generating image thumbnails for ${media.filename}`);
      thumbnails = await saveResizedImages(buffer, media.hash, baseName, ext, basePath);
    } else if (mimeType.startsWith("video/")) {
      logger.debug(`[MediaJob] Capturing video thumbnail for ${media.filename}`);
      const thumbBuffer = await captureVideoThumbnail(buffer);
      if (thumbBuffer) {
        thumbnails = await saveResizedImages(
          thumbBuffer,
          media.hash,
          `${baseName}-thumb`,
          "jpg",
          basePath,
        );
      }
    } else {
      // PDF, CSV/TSV and Office documents share the upload pipeline's helper, so
      // the job produces exactly the same `-thumb` ladder as a buffered upload.
      logger.debug(`[MediaJob] Generating document thumbnail for ${media.filename}`);
      const documentPreview = await buildDocumentPreview(
        buffer,
        media.hash,
        media.filename,
        mimeType,
        basePath,
      );
      thumbnails = documentPreview.thumbnails;
    }

    // 4. Update the database record with thumbnails
    if (Object.keys(thumbnails).length > 0) {
      const update = await db.crud.update("media", dbId, {
        thumbnails: { ...media.thumbnails, ...thumbnails },
        updatedAt: nowISODateString(),
      } as any);
      if (!update.success) {
        throw new Error(update.message || "Thumbnail update failed");
      }
    }

    logger.info(`[MediaJob] Completed processing for file: ${fileId}`);
  } catch (error) {
    processingError = error instanceof Error ? error.message : String(error);
    logger.error(`[MediaJob] Failed to process media ${fileId}:`, error);
    throw error;
  } finally {
    // `media` was read before thumbnail generation; writing its whole metadata
    // blob back would delete keys added in the meantime (share links, editor
    // fields). Patch the one key this job owns, scoped to the row's own tenant.
    //
    // Always settle: a host without ffmpeg/LibreOffice produces no thumbnail but
    // the original is perfectly servable, so the row must leave "processing"
    // instead of staying stuck there forever.
    const statusUpdate = await db.media.files.updateMetadata(
      dbId,
      processingError
        ? { processingStatus: "failed", processingError }
        : { processingStatus: "ready", processingError: null },
      { tenantId },
    );
    if (!statusUpdate.success) {
      logger.warn("[MediaJob] Status update failed", statusUpdate.message);
    }
  }
}
