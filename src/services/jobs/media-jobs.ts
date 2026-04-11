/**
 * @file src/services/jobs/media-jobs.ts
 * @description Job handlers for background media processing.
 */

import { getDb } from "@src/databases/db";
import { logger } from "@utils/logger.server";
import {
  saveResizedImages,
  getFile,
  captureVideoThumbnail,
  generatePdfThumbnail,
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

  // We need the full object, not just metadata.
  // The getMetadata helper only returns the metadata field.
  // Let's use crud.findOne instead.
  const mediaResult = await db.crud.findOne("media", { _id: dbId } as any);
  if (!mediaResult.success || !mediaResult.data) {
    throw new Error(`Media item ${fileId} not found via CRUD`);
  }

  const media = mediaResult.data as any;

  try {
    // 2. Load the original file buffer
    const buffer = await getFile(media.path);
    const mimeType = media.mimeType;

    // 3. Generate thumbnails
    const ext = path.extname(media.filename).slice(1) || "jpg";
    const baseName = path.basename(media.filename, `.${ext}`);

    let thumbnails: any = {};

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
    } else if (mimeType === "application/pdf") {
      logger.debug(`[MediaJob] Generating PDF thumbnail for ${media.filename}`);
      const thumbBuffer = await generatePdfThumbnail(buffer);
      if (thumbBuffer) {
        thumbnails = await saveResizedImages(
          thumbBuffer,
          media.hash,
          `${baseName}-thumb`,
          "jpg",
          basePath,
        );
      }
    }

    // 4. Update the database record with thumbnails
    if (Object.keys(thumbnails).length > 0) {
      await db.crud.update("media", dbId, {
        thumbnails: { ...media.thumbnails, ...thumbnails },
        updatedAt: new Date().toISOString(),
      } as any);
    }

    logger.info(`[MediaJob] Completed processing for file: ${fileId}`);
  } catch (error) {
    logger.error(`[MediaJob] Failed to process media ${fileId}:`, error);
    throw error;
  }
}
