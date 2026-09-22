/**
 * @file src/utils/media/media-storage.server.ts
 * @description Core media storage operations, delegating to the unified StorageAdapter interface.
 *
 * Features:
 * - Resizing (sharp)
 * - Avatar processing
 * - Video thumbnail capturing (ffmpeg)
 * - PDF thumbnail generation (imagemagick)
 * - Bounded LRU for storage existence probes
 */

import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { LRUCache } from "lru-cache";
import { logger } from "@utils/logger";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { getStorageAdapter, getConfig } from "./storage-adapters";
import { getMimeType } from "./media-utils";
import type { ResizedImage } from "./media-models";
import type { SharpFactory } from "./media-processing.server";
import { nowISODateString } from "@src/utils/date";

/** Global lazy-loaded sharp instance to eliminate module resolution overhead */
let _sharp: SharpFactory | null = null;
async function getSharp(): Promise<SharpFactory> {
  if (!_sharp) {
    const mod = await import("sharp");
    _sharp = (mod.default || mod) as SharpFactory;
  }
  return _sharp;
}

/**
 * Helper to run a process and wait for completion.
 */
function spawnAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-200)}`));
      }
    });
  });
}

/** Maximum buffer size (500MB) allowed for temp file writes. */
const MAX_TEMP_BUFFER_SIZE = 500 * 1024 * 1024;

// Image sizes
const DEFAULT_SIZES = { sm: 600, md: 900, lg: 1200 } as const;
export const SIZES: Readonly<Record<string, number>> = Object.freeze({
  ...DEFAULT_SIZES,
  ...(getPublicSettingSync("IMAGE_SIZES") as Record<string, number> | undefined),
  original: 0,
  thumbnail: 200,
});

/** Get configured image sizes (returns a frozen, read-only copy). */
export function getImageSizes(): Readonly<typeof SIZES> {
  return SIZES;
}

/** Save buffer or stream to storage using adapter */
export async function saveFile(
  data: Buffer | ReadableStream | import("node:stream").Readable,
  relPath: string,
): Promise<string> {
  return await getStorageAdapter().upload(data, relPath);
}

/** Delete file from storage using adapter */
export async function deleteFile(url: string): Promise<void> {
  let rel = url;

  if (url.startsWith("http")) {
    rel = new URL(url).pathname;
  }

  const cfg = getConfig();
  if (
    cfg &&
    "prefix" in cfg &&
    typeof cfg.prefix === "string" &&
    rel.startsWith(`/${cfg.prefix}/`)
  ) {
    rel = rel.slice(cfg.prefix.length + 1);
  }

  if (rel.startsWith("/files/")) {
    rel = rel.slice(7);
  }
  rel = rel.replace(/^\/+/, "");

  await getStorageAdapter().remove(rel);
}

/** Alias for backward compatibility */
export const moveMediaToTrash = deleteFile;
export const saveAvatarImage = saveAvatar;
export const saveFileToDisk = saveFile;
export const saveResizedImages = saveResized;

/**
 * Bounded positive/negative cache for storage existence probes.
 *
 * A storage `exists()` call per request is expensive, so results are cached for
 * `SVELTY_FILE_EXISTS_CACHE_TTL_MS` (default 10 s). The cache is an LRU with a
 * hard entry cap (`SVELTY_FILE_EXISTS_CACHE_MAX`, default 5000): under a soak that
 * touches many distinct media paths an unbounded Map grows with the number of
 * paths ever probed (each entry keeps the full path string + a timestamp), which
 * shows up as unconditional RSS growth. Cap + LRU ordering bounds it; TTL
 * semantics are unchanged (`refresh: true` bypasses the read and re-stamps).
 */
const FILE_EXISTS_CACHE_TTL_MS = Number(process.env.SVELTY_FILE_EXISTS_CACHE_TTL_MS) || 10_000; // 10 s — stale negatives clear quickly
const FILE_EXISTS_CACHE_MAX = Number(process.env.SVELTY_FILE_EXISTS_CACHE_MAX) || 5_000;
const _fileExistsCache = new LRUCache<string, boolean>({
  max: FILE_EXISTS_CACHE_MAX,
  ttl: FILE_EXISTS_CACHE_TTL_MS,
});

/** Entry count of the existence-probe cache (diagnostics/tests). */
export function fileExistsCacheSize(): number {
  return _fileExistsCache.size;
}

/** Drop every cached existence probe (tests, storage reconfiguration). */
export function resetFileExistsCache(): void {
  _fileExistsCache.clear();
}

export async function fileExists(rel: string, opts?: { refresh?: boolean }): Promise<boolean> {
  if (!opts?.refresh) {
    const cached = _fileExistsCache.get(rel);
    if (cached !== undefined) return cached;
  }
  const exists = await getStorageAdapter().exists(rel);
  _fileExistsCache.set(rel, exists);
  return exists;
}

/** Get file buffer using adapter */
export async function getFile(rel: string): Promise<Buffer> {
  return await getStorageAdapter().download(rel);
}

/**
 * Resize & save image variants with multi-format optimization.
 *
 * Two invariants this function owns (media pipeline plan §3 #3):
 *
 * - **Never upscale.** A ladder step wider than the decoded source is dropped before
 *   any encode, and `withoutEnlargement` backstops the encoder, so a variant file can
 *   never be wider (and therefore taller) than the image it derives from. `metadata()`
 *   is read here anyway, so the clamp costs nothing extra. The recorded `width`/`height`
 *   come from the encoder output, not from the request, so the map never claims a size
 *   the file does not have.
 * - **One write per path.** The primary output and the WebP sidecar resolve to the same
 *   path whenever the primary is itself WebP (an already-WebP source, or a WebP
 *   `MEDIA_OUTPUT_FORMAT_QUALITY`). That pair is encoded and saved once instead of twice.
 *
 * `thumbnails` keys are unchanged (`{key}` for the primary, `{key}_webp` for the sidecar);
 * steps dropped by the clamp are simply absent, which `mediaUrl`/`mediaDisplayUrl`
 * already fall back from.
 */
export async function saveResized(
  buffer: Buffer,
  hash: string,
  baseName: string,
  ext: string,
  baseDir: string,
): Promise<Record<string, ResizedImage>> {
  const sharp = await getSharp();
  const baseInstance = sharp(buffer);
  const meta = await baseInstance.metadata();

  const formatConfig = getPublicSettingSync("MEDIA_OUTPUT_FORMAT_QUALITY") as
    | { format?: string; quality?: number }
    | undefined;
  const format = formatConfig?.format ?? "original";
  const quality = formatConfig?.quality ?? 80;

  // 🚀 PREMIUM FEATURE: Multi-format generation (AVIF + WebP), clamped to the source.
  // An unknown source width keeps the operator's ladder untouched — dropping every
  // step on a metadata miss would silently produce no derivatives at all.
  const sourceWidth = meta.width ?? 0;
  const variants = Object.entries(SIZES).filter(
    ([, w]) => w > 0 && (sourceWidth === 0 || w <= sourceWidth),
  );

  // Run all thumbnail sizes in parallel — each is an independent sharp pipeline.
  const tasks = variants.map(async ([key, w]) => {
    const baseVariant = baseInstance.clone().resize(w, null, {
      fit: "cover",
      position: "center",
      withoutEnlargement: true,
    });

    // 1. Original format (or configured default)
    let outExt = ext;
    let mimeType = getMimeType(`file.${ext}`) || "application/octet-stream";
    let instance = baseVariant.clone();

    if (format === "webp") {
      instance = instance.webp({ quality });
      outExt = "webp";
      mimeType = "image/webp";
    } else if (format === "avif") {
      instance = instance.avif({ quality });
      outExt = "avif";
      mimeType = "image/avif";
    } else if (format === "jpg") {
      instance = instance.jpeg({ quality });
      outExt = "jpg";
      mimeType = "image/jpeg";
    }

    const fileName = `${baseName}-${hash}.${outExt}`;
    const relPath = path.posix.join(baseDir, key, fileName);
    const webpRelPath = path.posix.join(baseDir, key, `${baseName}-${hash}.webp`);
    /** False when the primary output IS the WebP sidecar's target path. */
    const sidecarNeeded = webpRelPath !== relPath;

    // Fallbacks for a source whose height could not be read; a real encode reports its own.
    const fallbackHeight = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : w;

    // 2. Encode primary and webp variant in parallel (independent sharp pipelines)
    const primaryP = instance.toBuffer({ resolveWithObject: true });
    const webpP = sidecarNeeded
      ? baseVariant
          .clone()
          .webp({ quality: Math.max(quality, 75) })
          .toBuffer({ resolveWithObject: true })
      : Promise.resolve(null);

    const [primary, webp] = await Promise.all([primaryP, webpP]);

    // 3. Save files — primary always, WebP if generated
    const url = await saveFile(primary.data, relPath);

    const entries: [string, ResizedImage][] = [
      [
        key,
        {
          url,
          width: primary.info.width ?? w,
          height: primary.info.height ?? fallbackHeight,
          size: primary.info.size,
          mimeType,
        },
      ],
    ];

    if (webp) {
      const webpUrl = await saveFile(webp.data, webpRelPath);
      entries.push([
        `${key}_webp`,
        {
          url: webpUrl,
          width: webp.info.width ?? w,
          height: webp.info.height ?? fallbackHeight,
          size: webp.info.size,
          mimeType: "image/webp",
        },
      ]);
    }

    return entries;
  });

  const nested = await Promise.all(tasks);
  return Object.fromEntries(nested.flat());
}

/** Allowed extensions for avatar uploads */
const AVATAR_EXT_WHITELIST = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

/** Save avatar (200x200) with extension validation */
export async function saveAvatar(file: File, userId: string): Promise<string> {
  const rawExt = path.extname(file.name).toLowerCase();
  if (!rawExt || !AVATAR_EXT_WHITELIST.has(rawExt)) {
    throw new Error(
      `Invalid avatar file type: "${rawExt || "(none)"}". Allowed: ${[...AVATAR_EXT_WHITELIST].join(", ")}`,
    );
  }
  // Strip leading dot and sanitize (remove any path separators or special chars)
  const ext = "." + rawExt.replace(/^\./, "").replace(/[^a-z0-9]/g, "");

  const buf = Buffer.from(await file.arrayBuffer());
  const sharp = await getSharp();
  const resized = await sharp(buf)
    .resize(200, 200, { fit: "cover", position: "center" })
    .toBuffer();

  const rel = `avatars/${userId}${ext}`;
  return await saveFile(resized, rel);
}

/**
 * Captures a thumbnail from a video at the 1s mark using ffmpeg
 */
export async function captureVideoThumbnail(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length > MAX_TEMP_BUFFER_SIZE) {
    logger.error("Video buffer too large for thumbnail capture", { size: buffer.length });
    return null;
  }

  const tempInput = path.join(os.tmpdir(), `ffmpeg-input-${crypto.randomUUID()}.mp4`);
  const tempOutput = path.join(os.tmpdir(), `ffmpeg-output-${crypto.randomUUID()}.jpg`);
  try {
    await writeFile(tempInput, buffer);
    // Capture frame at 1s mark
    await spawnAsync("ffmpeg", [
      "-ss",
      "00:00:01",
      "-i",
      tempInput,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      tempOutput,
      "-y",
    ]);
    return await readFile(tempOutput);
  } catch (err) {
    logger.error("Error capturing video thumbnail", { error: err });
    return null;
  } finally {
    try {
      await unlink(tempInput);
    } catch {
      /* ignore */
    }
    try {
      await unlink(tempOutput);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Generates a thumbnail from the first page of a PDF using ImageMagick
 */
export async function generatePdfThumbnail(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length > MAX_TEMP_BUFFER_SIZE) {
    logger.error("PDF buffer too large for thumbnail generation", { size: buffer.length });
    return null;
  }

  const tempInput = path.join(os.tmpdir(), `pdf-input-${crypto.randomUUID()}.pdf`);
  const tempOutput = path.join(os.tmpdir(), `pdf-output-${crypto.randomUUID()}.jpg`);
  try {
    await writeFile(tempInput, buffer);
    // Use ImageMagick (magick) to extract the first page [0] at 150 DPI
    // -background white -flatten handles transparency
    await spawnAsync("magick", [
      "-density",
      "150",
      `${tempInput}[0]`,
      "-background",
      "white",
      "-flatten",
      "-alpha",
      "remove",
      "-quality",
      "90",
      tempOutput,
    ]);
    return await readFile(tempOutput);
  } catch (err) {
    const isMagickMissing =
      err instanceof Error &&
      (err.message.includes("not found") || err.message.includes("not recognized"));
    if (isMagickMissing) {
      logger.warn(
        'PDF thumbnail generation skipped: "magick" command not found. Install ImageMagick and Ghostscript to enable PDF previews.',
      );
    } else {
      logger.error("Error generating PDF thumbnail", { error: err });
    }
    return null;
  } finally {
    try {
      await unlink(tempInput);
    } catch {
      /* ignore */
    }
    try {
      await unlink(tempOutput);
    } catch {
      /* ignore */
    }
  }
}

// ─── Version history ─────────────────────────────────────────────────────────

import type { DatabaseId, ISODateString } from "@src/content/types";

export interface FileVersion {
  _id?: DatabaseId;
  action: "create" | "update" | "replace" | "metadata_update";
  changes: VersionChange[];
  createdAt: ISODateString;
  createdBy: DatabaseId;
  fileId: DatabaseId;
  hash: string;
  metadata?: { reason?: string; automated?: boolean; restorePoint?: boolean };
  path?: string;
  size: number;
  versionNumber: number;
}

export interface VersionChange {
  field: string;
  newValue?: unknown;
  oldValue?: unknown;
  type: "add" | "modify" | "remove";
}

export interface VersionComparison {
  changes: VersionChange[];
  contentChanged: boolean;
  fromVersion: number;
  metadataChanged: boolean;
  sizeDifference: number;
  toVersion: number;
}

export function createVersion(
  fileId: DatabaseId,
  userId: DatabaseId,
  action: FileVersion["action"],
  hash: string,
  size: number,
  changes: VersionChange[] = [],
  options: {
    path?: string;
    reason?: string;
    automated?: boolean;
    restorePoint?: boolean;
    nextVersionNumber?: number;
  } = {},
): FileVersion {
  return {
    fileId,
    versionNumber: options.nextVersionNumber ?? 1,
    createdAt: nowISODateString() as ISODateString,
    createdBy: userId,
    action,
    changes,
    hash,
    size,
    path: options.path,
    metadata: {
      reason: options.reason,
      automated: options.automated,
      restorePoint: options.restorePoint,
    },
  };
}

export function compareVersions(
  fromVersion: FileVersion,
  toVersion: FileVersion,
): VersionComparison {
  const contentChanged = fromVersion.hash !== toVersion.hash;
  const sizeDifference = toVersion.size - fromVersion.size;
  const changes = contentChanged
    ? toVersion.changes
    : toVersion.changes.filter((c) => c.field !== "content");
  const metadataChanged = changes.some((c) => c.field !== "content" && c.field !== "size");
  return {
    fromVersion: fromVersion.versionNumber,
    toVersion: toVersion.versionNumber,
    changes,
    contentChanged,
    metadataChanged,
    sizeDifference,
  };
}

export function detectChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  excludeFields: string[] = ["_id", "updatedAt", "updatedBy", "createdAt", "createdBy"],
): VersionChange[] {
  const changes: VersionChange[] = [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    if (excludeFields.includes(key)) continue;
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (oldVal === newVal) continue;
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
    if (oldVal === undefined) changes.push({ field: key, newValue: newVal, type: "add" });
    else if (newVal === undefined) changes.push({ field: key, oldValue: oldVal, type: "remove" });
    else changes.push({ field: key, oldValue: oldVal, newValue: newVal, type: "modify" });
  }
  return changes;
}

export function getVersionStats(versions: FileVersion[]) {
  if (!versions.length) return null;
  let totalSize = 0;
  let contentUpdates = 0;
  const userActivity: Record<string, number> = {};
  for (const v of versions) {
    totalSize += v.size;
    if (["create", "replace", "update"].includes(v.action)) contentUpdates++;
    userActivity[v.createdBy as string] = (userActivity[v.createdBy as string] || 0) + 1;
  }
  const mostActive = Object.entries(userActivity).sort((a, b) => b[1] - a[1])[0];
  return {
    totalVersions: versions.length,
    totalSize,
    avgSize: Math.round(totalSize / versions.length),
    contentUpdates,
    mostActiveUser: mostActive ? mostActive[0] : null,
  };
}
