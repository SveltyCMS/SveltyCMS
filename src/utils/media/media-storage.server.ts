/**
 * @file src/utils/media/media-storage.server.ts
 * @description Core media storage operations, delegating to the unified StorageAdapter interface.
 *
 * Features:
 * - Resizing (sharp)
 * - Avatar processing
 * - Video thumbnail capturing (ffmpeg)
 * - PDF thumbnail generation (imagemagick)
 */

import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { logger } from "@utils/logger";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { getStorageAdapter, getConfig } from "./storage-adapters";
import { getMimeType } from "./media-utils";
import type { ResizedImage } from "./media-models";
import type { SharpFactory } from "./sharp-pipeline";

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

/** Check if file exists using adapter */
export async function fileExists(rel: string): Promise<boolean> {
  return await getStorageAdapter().exists(rel);
}

/** Get file buffer using adapter */
export async function getFile(rel: string): Promise<Buffer> {
  return await getStorageAdapter().download(rel);
}

/** Resize & save image variants with multi-format optimization */
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

  // 🚀 PREMIUM FEATURE: Multi-format generation (AVIF + WebP)
  const variants = Object.entries(SIZES).filter(([_, w]) => w > 0);

  // Run all thumbnail sizes in parallel — each is an independent sharp pipeline.
  const tasks = variants.map(async ([key, w]) => {
    const baseVariant = baseInstance.clone().resize(w, null, {
      fit: "cover",
      position: "center",
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

    const height = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : w;

    // 2. Encode primary and webp variant in parallel (independent sharp pipelines)
    const primaryBufP = instance.toBuffer();
    const webpBufP =
      outExt !== "webp"
        ? baseVariant
            .clone()
            .webp({ quality: Math.max(quality, 75) })
            .toBuffer()
        : Promise.resolve(null);

    const [resizedBuf, webpBuf] = await Promise.all([primaryBufP, webpBufP]);

    // 3. Save files — primary always, WebP if generated
    const url = await saveFile(resizedBuf, relPath);

    const entries: [string, ResizedImage][] = [
      [
        key,
        {
          url,
          width: w,
          height,
          size: resizedBuf.length,
          mimeType,
        },
      ],
    ];

    if (webpBuf) {
      const webpFileName = `${baseName}-${hash}.webp`;
      const webpRelPath = path.posix.join(baseDir, key, webpFileName);
      const webpUrl = await saveFile(webpBuf, webpRelPath);
      entries.push([
        `${key}_webp`,
        {
          url: webpUrl,
          width: w,
          height,
          size: webpBuf.length,
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
    writeFileSync(tempInput, buffer);
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
    return readFileSync(tempOutput);
  } catch (err) {
    logger.error("Error capturing video thumbnail", { error: err });
    return null;
  } finally {
    try {
      unlinkSync(tempInput);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(tempOutput);
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
    writeFileSync(tempInput, buffer);
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
    return readFileSync(tempOutput);
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
      unlinkSync(tempInput);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(tempOutput);
    } catch {
      /* ignore */
    }
  }
}
