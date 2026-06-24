/**
 * @file src/plugins/smart-importer/utils/migrated-media.server.ts
 * @description Persists migrated remote assets through the core CMS media pipeline.
 *
 * Uses the same storage + `saveResizedImages` variant generation as gallery uploads
 * (`media-storage.server.ts` / `process-media` job), including format conversion
 * from `MEDIA_OUTPUT_FORMAT_QUALITY` and auto-WebP sidecars.
 */

import path from "node:path";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import type { ResizedImage } from "@src/utils/media/media-models";
import { buildOriginalRelPath } from "@src/utils/media/media-utils";
import { saveFile, saveResizedImages } from "@src/utils/media/media-storage.server";
import { hashFileContent } from "@src/utils/media/media-processing.server";
import { generateAltText } from "./media-optimize";

export interface PersistMigratedAssetParams {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  altText?: string;
  userId?: string;
  tenantId?: string | null;
  /** Thumbnail base directory (default: `migrated`, separate from user `global` uploads) */
  variantBaseDir?: string;
}

function isRasterImage(mimeType: string, filename: string): boolean {
  return (
    mimeType.startsWith("image/") &&
    !mimeType.includes("svg") &&
    !filename.toLowerCase().endsWith(".svg")
  );
}

function hasMediaFilesApi(dbAdapter: unknown): dbAdapter is {
  media: {
    files: {
      upload: (
        file: Record<string, unknown>,
        tenantId?: string | null,
      ) => Promise<{ success: boolean; data?: { _id: string } }>;
      getByHash?: (
        hash: string,
        tenantId?: string | null,
      ) => Promise<{ success: boolean; data?: { _id: string } | null }>;
    };
  };
} {
  return (
    typeof (dbAdapter as { media?: { files?: { upload?: unknown } } })?.media?.files?.upload ===
    "function"
  );
}

/**
 * Save a downloaded migration asset with CMS-native thumbnails and deduplication.
 * Returns the media record `_id`, or null on failure.
 */
export async function persistMigratedAsset(
  dbAdapter: unknown,
  params: PersistMigratedAssetParams,
): Promise<string | null> {
  const {
    buffer,
    filename,
    mimeType,
    altText,
    userId = "migration",
    tenantId = null,
    variantBaseDir = "migrated",
  } = params;

  try {
    const hash = await hashFileContent(buffer);
    const relPath = buildOriginalRelPath(hash, filename);
    await saveFile(buffer, relPath);

    const ext = path.extname(filename).slice(1) || "jpg";
    const baseName = path.basename(filename, `.${ext}`);
    const resolvedAlt = altText || generateAltText(filename);

    let thumbnails: Record<string, ResizedImage> = {};
    if (isRasterImage(mimeType, filename)) {
      thumbnails = await saveResizedImages(buffer, hash, baseName, ext, variantBaseDir);
    }

    const mediaPayload = {
      filename,
      originalFilename: filename,
      mimeType,
      size: buffer.byteLength,
      hash,
      path: relPath,
      createdBy: userId,
      updatedBy: userId,
      metadata: { altText: resolvedAlt, source: "smart-importer" },
      thumbnails,
      access: "public" as const,
      tenantId: tenantId ?? undefined,
      type: "image" as const,
      createdAt: nowISODateString(),
      updatedAt: nowISODateString(),
    };

    if (hasMediaFilesApi(dbAdapter)) {
      if (dbAdapter.media.files.getByHash) {
        const existing = await dbAdapter.media.files.getByHash(hash, tenantId);
        if (existing.success && existing.data?._id) {
          return String(existing.data._id);
        }
      }

      const uploaded = await dbAdapter.media.files.upload(mediaPayload, tenantId);
      if (uploaded.success && uploaded.data?._id) {
        return String(uploaded.data._id);
      }
      logger.warn("[MigratedMedia] media.files.upload failed:", uploaded);
      return null;
    }

    // Unit-test / minimal mock adapter fallback
    const crud = (
      dbAdapter as {
        crud?: {
          insert: (...args: unknown[]) => Promise<{ success: boolean; data?: { _id: string } }>;
        };
      }
    ).crud;
    if (!crud?.insert) return null;

    const mediaResult = await crud.insert("media", {
      ...mediaPayload,
      altText: resolvedAlt,
      binary: buffer,
      absolutePath: `/media/migrated/${filename}`,
    });
    if (mediaResult.success && mediaResult.data?._id) {
      return String(mediaResult.data._id);
    }

    return null;
  } catch (err) {
    logger.error("[MigratedMedia] Failed to persist migrated asset:", err);
    return null;
  }
}
