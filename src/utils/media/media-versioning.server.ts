/**
 * @file src/utils/media/media-versioning.server.ts
 * @description File version lifecycle management and snapshotting for MediaService.
 *
 * Features:
 * - Version snapshot construction preserving active derivative configurations
 * - Safe file replacement with SVG sanitization and MIME verification
 * - Seamless rollback to historical media versions without losing audit trail
 * - Mass-assignment defense for media replace payloads
 */

import { logger } from "@src/utils/logger";
import { nowISODateString } from "@src/utils/date";
import { AppError, raise } from "@utils/error-handling";
import { API_MAX_BODY_SIZE_BYTES, bodyTooLargeMessage } from "@utils/api-body-limits";
import { sanitizeSvgMarkup } from "@src/utils/sanitize-html.server";
import {
  buildOriginalRelPath,
  getMimeType,
  isAllowedUploadMime,
  normalizeMime,
} from "./media-utils";
import { assertMimeAgreement, sniffMimeType } from "./slim-sniffer.server";
import { isRasterImage } from "./media-lifecycle.server";
import { MediaProcessingStatus, type MediaItem } from "./media-models";
import type {
  DatabaseError,
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
  MediaItem as DbMediaItem,
} from "@src/databases/db-interface";
import { processImageWithPresets, type ImageVariant } from "@src/services/media/image-processor";

/** Maximum SVG upload size (bytes). SVGs are always fully buffered + sanitized. */
export const MAX_SVG_BYTES = 5 * 1024 * 1024; // 5 MiB

export function sanitizeSvg(svg: string): string {
  return sanitizeSvgMarkup(svg);
}

export function isSvgFile(mimeType: string, filename: string): boolean {
  return normalizeMime(mimeType) === "image/svg+xml" || filename.toLowerCase().endsWith(".svg");
}

/**
 * Same byte ceiling a new API upload uses (`API_MAX_BODY_SIZE_BYTES`).
 */
export function assertMediaReplaceSize(
  file: { type: string; name: string; size: number },
  byteLength?: number,
): void {
  if (isSvgFile(file.type, file.name)) return;
  const bytes = byteLength ?? file.size;
  if (bytes > API_MAX_BODY_SIZE_BYTES) {
    throw new AppError(bodyTooLargeMessage(bytes), 413, "PAYLOAD_TOO_LARGE");
  }
}

/**
 * Buffer + sanitize an SVG upload. Always required — never stream raw SVG to disk.
 */
export async function bufferAndSanitizeSvg(file: {
  name: string;
  type: string;
  size: number;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  stream?: () => ReadableStream;
}): Promise<Buffer> {
  if (file.size > MAX_SVG_BYTES) {
    throw new Error(
      `SVG files must be ≤ ${MAX_SVG_BYTES / (1024 * 1024)}MB and are always sanitized before storage`,
    );
  }
  if (typeof file.arrayBuffer !== "function") {
    throw new Error("SVG uploads require a bufferable file object for sanitization");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_SVG_BYTES) {
    throw new Error(
      `SVG files must be ≤ ${MAX_SVG_BYTES / (1024 * 1024)}MB and are always sanitized before storage`,
    );
  }
  const raw = bytes.toString("utf-8");
  return Buffer.from(sanitizeSvg(raw), "utf-8");
}

export function validateMime(mimeType: string, filename: string): void {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && ["html", "htm", "xhtml", "xht", "js", "mjs", "cjs", "wasm", "css"].includes(ext)) {
    raise(415, "Blocked file extension: ." + ext, "UNSUPPORTED_MEDIA_TYPE");
  }
  if (!mimeType) return;
  const normalized = normalizeMime(mimeType);
  if (!normalized || normalized === "application/octet-stream") return;
  if (!isAllowedUploadMime(normalized)) {
    raise(415, "MIME not allowed: " + normalized, "UNSUPPORTED_MEDIA_TYPE");
  }
}

/** Coerce index-signature values (`unknown`) back to the string/number shape a version entry stores. */
export function textOr(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

export function firstText(...values: unknown[]): string {
  for (const value of values) if (typeof value === "string" && value) return value;
  return "";
}

export function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A media version entry stored in metadata.versions. */
export interface MediaVersionEntry {
  version: number;
  url?: string;
  path?: string;
  hash?: string;
  size?: number;
  filename?: string;
  mimeType?: string;
  createdAt?: string;
  createdBy?: string;
  action?: string;
  thumbnails?: Record<string, unknown>;
  imageVariants?: ImageVariant[];
}

export interface VersioningRecord {
  path?: string;
  url?: string;
  hash?: unknown;
  size?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  updatedBy?: unknown;
  createdBy?: unknown;
  thumbnails?: Record<string, unknown>;
  metadata?: {
    versions?: MediaVersionEntry[];
    imageVariants?: ImageVariant[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Build a historical version snapshot from the currently active media record. */
export function buildVersionSnapshot(
  existing: VersioningRecord,
  version: number,
  userId: string,
  action: "edit" | "replace" | "restore",
  fallbackTimestamp: string,
): MediaVersionEntry {
  return {
    version,
    url: existing.url || "",
    path: existing.path || "",
    hash: textOr(existing.hash),
    size: numberOr(existing.size),
    filename: textOr(existing.filename),
    mimeType: textOr(existing.mimeType),
    createdAt: firstText(existing.updatedAt, existing.createdAt, fallbackTimestamp),
    createdBy: firstText(existing.updatedBy, existing.createdBy, userId),
    action,
    thumbnails: existing.thumbnails || {},
    imageVariants: Array.isArray(existing.metadata?.imageVariants)
      ? (existing.metadata.imageVariants as ImageVariant[])
      : [],
  };
}

export interface VersioningContext {
  db: IDBAdapter;
  updateMedia(
    id: string,
    data: Record<string, unknown>,
    tenantId?: DatabaseId | null,
    options?: { internal?: boolean },
  ): Promise<void>;
  enrichMediaWithUrl(item: Record<string, unknown>, prefix?: string): Record<string, unknown>;
  ensureOriginalOnDisk(
    hash: string,
    filename: string,
    data: Buffer | ReadableStream | import("node:stream").Readable,
    tenantId?: string | null,
  ): Promise<string>;
  buildDerivativeSet(
    buffer: Buffer,
    hash: string,
    filename: string,
    effectiveType: string,
    tenantId?: DatabaseId | null,
  ): Promise<{ metadata: Record<string, unknown>; thumbnails: Record<string, unknown> }>;
  generateVariantsForStreamedFile(
    hash: string,
    relPath: string,
    mimeType: string,
    originalFilename: string,
    mediaId?: DatabaseId,
    tenantId?: DatabaseId | null,
  ): void;
  mapFileSystemError(err: unknown): void;
}

/**
 * Uploads a new version of an existing file.
 */
export async function executeUploadNewVersion(
  ctx: VersioningContext,
  mediaId: string,
  file:
    | File
    | {
        name: string;
        type: string;
        size: number;
        stream: () => ReadableStream;
        arrayBuffer?: () => Promise<ArrayBuffer>;
      },
  userId: string,
  tenantId?: DatabaseId | null,
): Promise<DatabaseResult<MediaItem>> {
  try {
    assertMediaReplaceSize(file);
    const res = await ctx.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: mediaId as DatabaseId },
      { tenantId: tenantId },
    );
    if (!res.success || !res.data) {
      throw new Error("Original media item not found");
    }
    const existing = res.data;

    const { hashFileContent } = await import("./media-processing.server");
    let hash = "";
    let buffer: Buffer | null = null;
    // The verified type drives derivatives and the persisted row — never the
    // client-declared one (a PNG labelled octet-stream would never get thumbnails).
    let effectiveMime = normalizeMime(file.type) || "application/octet-stream";
    validateMime(file.type, file.name);
    const treatAsSvg = isSvgFile(file.type, file.name);
    if (treatAsSvg) {
      // The declared type already claims SVG; assert it against the branch that
      // will sanitize instead of re-typing arbitrary bytes as SVG downstream.
      assertMimeAgreement({
        filename: file.name,
        declaredMime: file.type,
        sniffedMime: "image/svg+xml",
      });
      if (!isAllowedUploadMime("image/svg+xml")) {
        raise(415, "MIME not allowed: image/svg+xml", "UNSUPPORTED_MEDIA_TYPE");
      }
      buffer = await bufferAndSanitizeSvg(file);
      effectiveMime = "image/svg+xml";
      hash = await hashFileContent(buffer);
    } else if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
      buffer = Buffer.from(await file.arrayBuffer());
      assertMediaReplaceSize(file, buffer.length);
      const sniffed = sniffMimeType(buffer.subarray(0, 2048));
      assertMimeAgreement({
        filename: file.name,
        declaredMime: file.type,
        sniffedMime: sniffed?.mime,
      });
      effectiveMime =
        sniffed?.mime || getMimeType(file.name) || file.type || "application/octet-stream";
      if (!isAllowedUploadMime(effectiveMime)) {
        raise(415, `MIME not allowed: ${effectiveMime}`, "UNSUPPORTED_MEDIA_TYPE");
      }
      if (isSvgFile(effectiveMime, file.name) || isSvgFile(sniffed?.mime || "", file.name)) {
        buffer = Buffer.from(sanitizeSvg(buffer.toString("utf-8")), "utf-8");
        effectiveMime = "image/svg+xml";
      }
      hash = await hashFileContent(buffer);
    } else {
      // Large file (>5 MB): the buffered verification above is skipped, so the
      // client-declared MIME cannot be trusted. Sniff the header before a byte
      // is hashed or stored — mirror the new-upload streaming path.
      if (isSvgFile(file.type, file.name)) {
        raise(400, "SVG uploads must be sanitized and cannot use the streaming path");
      }
      const headerBuffer =
        typeof (file as File).slice === "function"
          ? Buffer.from(await (file as File).slice(0, 2048).arrayBuffer())
          : null;
      // Fail-closed: without a sniffable header we cannot verify the type.
      if (!headerBuffer || headerBuffer.length === 0) {
        raise(
          400,
          "Cannot validate file type: file object does not support slicing for header inspection",
        );
      }
      const sniffedLarge = sniffMimeType(headerBuffer);
      if (
        sniffedLarge?.mime === "image/svg+xml" ||
        headerBuffer.toString("utf-8", 0, Math.min(headerBuffer.length, 256)).includes("<svg")
      ) {
        raise(
          400,
          "SVG content cannot use the streaming upload path — upload as image/svg+xml (≤5MB, sanitized)",
        );
      }
      assertMimeAgreement({
        filename: file.name,
        declaredMime: file.type,
        sniffedMime: sniffedLarge?.mime,
      });
      const largeType =
        sniffedLarge?.mime || getMimeType(file.name) || file.type || "application/octet-stream";
      if (!isAllowedUploadMime(largeType)) {
        raise(415, `MIME not allowed: ${largeType}`, "UNSUPPORTED_MEDIA_TYPE");
      }
      effectiveMime = largeType;
      const { hashStream } = await import("./media-processing.server");
      hash = await hashStream(file.stream(), API_MAX_BODY_SIZE_BYTES);
    }

    const isRaster = effectiveMime.startsWith("image/") && effectiveMime !== "image/svg+xml";

    let versionVariants: ImageVariant[] = [];
    let versionThumbnails: Record<string, unknown> = {};
    let versionImageMetadata: Record<string, unknown> = {};
    if (buffer && isRaster) {
      try {
        const { metadata, thumbnails } = await ctx.buildDerivativeSet(
          buffer,
          hash,
          file.name,
          effectiveMime,
          tenantId,
        );
        versionImageMetadata = metadata;
        versionThumbnails = thumbnails;
        versionVariants = await processImageWithPresets(
          buffer,
          hash,
          ["thumbnail", "card", "default"],
          tenantId,
        );
        if (versionVariants.length > 0) {
          logger.debug("[Media] Variants generated for version upload", {
            hash: hash.slice(0, 12),
            count: versionVariants.length,
          });
        }
      } catch (variantErr) {
        logger.warn("[Media] Variant generation failed during version upload — original intact", {
          error: variantErr instanceof Error ? variantErr.message : String(variantErr),
        });
      }
    }

    const versionVariantsMetadata = versionVariants.map((v) => ({
      preset: v.preset,
      width: v.width,
      height: v.height,
      format: v.format,
      quality: v.quality,
      path: v.path,
      size: v.size,
    }));

    const versionMetadata = {
      ...versionImageMetadata,
      ...(versionVariantsMetadata.length > 0 ? { imageVariants: versionVariantsMetadata } : {}),
      processingStatus: isRaster
        ? versionVariantsMetadata.length > 0 || buffer
          ? versionVariantsMetadata.length > 0
            ? MediaProcessingStatus.Ready
            : MediaProcessingStatus.Failed
          : MediaProcessingStatus.Processing
        : MediaProcessingStatus.Ready,
    };

    const newRelPath = buildOriginalRelPath(hash, file.name, tenantId);
    if (buffer) {
      await ctx.ensureOriginalOnDisk(hash, file.name, buffer, tenantId);
    } else if (typeof file.stream === "function") {
      await ctx.ensureOriginalOnDisk(hash, file.name, file.stream(), tenantId);
    } else if (typeof file.arrayBuffer === "function") {
      await ctx.ensureOriginalOnDisk(
        hash,
        file.name,
        Buffer.from(await file.arrayBuffer()),
        tenantId,
      );
    } else {
      throw new Error("Version upload requires a readable file stream");
    }

    const existingR = existing as unknown as VersioningRecord;
    const versions = (existingR.metadata?.versions as MediaVersionEntry[] | undefined) || [];
    const now = nowISODateString();
    const oldVersionEntry = buildVersionSnapshot(
      existingR,
      versions.length + 1,
      userId,
      "replace",
      now,
    );

    const updatedVersions = [...versions, oldVersionEntry];
    const updatedMetadata: Record<string, unknown> = {
      ...(existingR.metadata as Record<string, unknown>),
      ...versionImageMetadata,
      versions: updatedVersions,
      imageVariants: versionVariantsMetadata,
      processingStatus: versionMetadata.processingStatus,
    };
    if (versionVariantsMetadata.length === 0 && isRaster && buffer) {
      updatedMetadata.processingError = "No variants generated";
    } else {
      delete updatedMetadata.processingError;
    }

    const updateData = {
      filename: file.name,
      originalFilename: file.name,
      mimeType: effectiveMime,
      size: buffer ? buffer.length : file.size,
      hash,
      path: newRelPath,
      thumbnails: versionThumbnails,
      metadata: updatedMetadata,
      updatedBy: userId,
      updatedAt: now,
    };

    await ctx.updateMedia(mediaId, updateData, tenantId, { internal: true });

    if (isRaster && !buffer) {
      ctx.generateVariantsForStreamedFile(
        hash,
        newRelPath,
        effectiveMime,
        file.name,
        mediaId as DatabaseId,
        tenantId,
      );
    }

    return {
      success: true,
      data: ctx.enrichMediaWithUrl({
        ...existingR,
        ...updateData,
      }) as unknown as MediaItem,
    };
  } catch (err: unknown) {
    ctx.mapFileSystemError(err);
    const e = err as Error;
    logger.error(`[MediaService] Error uploading new version:`, err);
    return {
      success: false,
      message: e.message,
      error: err as DatabaseError,
    };
  }
}

/**
 * Restores an existing file version to be the active one.
 */
export async function executeRestoreVersion(
  ctx: VersioningContext,
  mediaId: string,
  versionNumber: number,
  userId: string,
  tenantId?: DatabaseId | null,
): Promise<DatabaseResult<MediaItem>> {
  try {
    const res = await ctx.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: mediaId as DatabaseId },
      { tenantId: tenantId },
    );
    if (!res.success || !res.data) {
      throw new Error("Media item not found");
    }
    const existingR = res.data as unknown as VersioningRecord;

    const versions = (existingR.metadata?.versions as MediaVersionEntry[] | undefined) || [];
    const targetVersion = versions.find((v: MediaVersionEntry) => v.version === versionNumber);
    if (!targetVersion) {
      throw new Error(`Version ${versionNumber} not found`);
    }

    const now = nowISODateString();
    const currentVersionEntry = buildVersionSnapshot(
      existingR,
      versions.length + 1,
      userId,
      "restore",
      now,
    );

    const updatedVersions = [...versions, currentVersionEntry];
    const restoredHash = textOr(targetVersion.hash, textOr(existingR.hash));
    const isRaster = isRasterImage(
      targetVersion.mimeType || textOr(existingR.mimeType),
      targetVersion.filename,
    );
    const restoredVariants = Array.isArray(targetVersion.imageVariants)
      ? targetVersion.imageVariants
      : [];
    const restoredThumbnails =
      targetVersion.thumbnails && typeof targetVersion.thumbnails === "object"
        ? targetVersion.thumbnails
        : {};
    const needsDerivativeRepair = isRaster && restoredVariants.length === 0;
    const updatedMetadata: Record<string, unknown> = {
      ...(existingR.metadata as Record<string, unknown>),
      versions: updatedVersions,
      imageVariants: restoredVariants,
      processingStatus: !isRaster
        ? MediaProcessingStatus.Ready
        : needsDerivativeRepair
          ? MediaProcessingStatus.Processing
          : MediaProcessingStatus.Ready,
    };
    if (!needsDerivativeRepair) delete updatedMetadata.processingError;

    const updateData = {
      filename: targetVersion.filename || textOr(existingR.filename),
      originalFilename: targetVersion.filename || textOr(existingR.filename),
      mimeType: targetVersion.mimeType || textOr(existingR.mimeType),
      size: targetVersion.size ?? numberOr(existingR.size),
      hash: restoredHash,
      path: targetVersion.path,
      thumbnails: restoredThumbnails,
      metadata: updatedMetadata,
      updatedBy: userId,
      updatedAt: now,
    };

    await ctx.updateMedia(mediaId, updateData, tenantId, { internal: true });

    if (needsDerivativeRepair && restoredHash && targetVersion.path) {
      ctx.generateVariantsForStreamedFile(
        restoredHash,
        targetVersion.path,
        targetVersion.mimeType || textOr(existingR.mimeType) || "image/*",
        targetVersion.filename || textOr(existingR.filename) || "restored",
        mediaId as DatabaseId,
        tenantId,
      );
    }

    return {
      success: true,
      data: ctx.enrichMediaWithUrl({
        ...existingR,
        ...updateData,
      }) as unknown as MediaItem,
    };
  } catch (err: unknown) {
    const e = err as Error;
    logger.error(`[MediaService] Error restoring version:`, err);
    return {
      success: false,
      message: e.message,
      error: err as DatabaseError,
    };
  }
}
