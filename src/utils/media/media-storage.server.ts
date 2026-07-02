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
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import mime from "mime-types";
import { logger } from "@utils/logger";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { getStorageAdapter, getConfig } from "./storage-adapters";
import type { ResizedImage } from "./media-models";

/** Global lazy-loaded sharp instance to eliminate module resolution overhead */
let _sharp: any = null;
async function getSharp(): Promise<any> {
  if (!_sharp) {
    const mod = await import("sharp");
    _sharp = mod.default || mod;
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

// Image sizes
const DEFAULT_SIZES = { sm: 600, md: 900, lg: 1200 } as const;
export const SIZES = {
  ...DEFAULT_SIZES,
  ...publicEnv.IMAGE_SIZES,
  original: 0,
  thumbnail: 200,
};

/** Get configured image sizes */
export function getImageSizes() {
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

  const format = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.format ?? "original";
  const quality = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.quality ?? 80;

  // 🚀 PREMIUM FEATURE: Multi-format generation (AVIF + WebP)
  const variants = Object.entries(SIZES).filter(([_, w]) => w > 0);
  const results: [string, ResizedImage][] = [];

  for (const [key, w] of variants) {
    const baseVariant = baseInstance.clone().resize(w, null, {
      fit: "cover",
      position: "center",
    });

    // 1. Original format (or configured default)
    let outExt = ext;
    let mimeType = mime.lookup(ext) || "application/octet-stream";
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
    const resizedBuf = await instance.toBuffer();
    const url = await saveFile(resizedBuf, relPath);

    const height = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : w;

    results.push([
      key,
      {
        url,
        width: w,
        height,
        size: resizedBuf.length,
        mimeType,
      },
    ]);

    // 2. ⚡ Auto-WebP generation (if not already WebP)
    if (outExt !== "webp") {
      const webpBuf = await baseVariant
        .clone()
        .webp({ quality: Math.max(quality, 75) })
        .toBuffer();
      const webpFileName = `${baseName}-${hash}.webp`;
      const webpRelPath = path.posix.join(baseDir, key, webpFileName);
      const webpUrl = await saveFile(webpBuf, webpRelPath);

      results.push([
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
  }

  return Object.fromEntries(results);
}

/** Save avatar (200x200) */
export async function saveAvatar(file: File, userId: string): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".jpg";

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
  const tempInput = path.join(os.tmpdir(), `ffmpeg-input-${Date.now()}.mp4`);
  const tempOutput = path.join(os.tmpdir(), `ffmpeg-output-${Date.now()}.jpg`);
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
      if (os.platform() !== "win32") {
        if (tempInput) {
          unlinkSync(tempInput);
        }
        if (tempOutput) {
          unlinkSync(tempOutput);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Generates a thumbnail from the first page of a PDF using ImageMagick
 */
export async function generatePdfThumbnail(buffer: Buffer): Promise<Buffer | null> {
  const tempInput = path.join(os.tmpdir(), `pdf-input-${Date.now()}.pdf`);
  const tempOutput = path.join(os.tmpdir(), `pdf-output-${Date.now()}.jpg`);
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
      if (os.platform() !== "win32") {
        if (tempInput) {
          unlinkSync(tempInput);
        }
        if (tempOutput) {
          unlinkSync(tempOutput);
        }
      }
    } catch {
      /* ignore */
    }
  }
}
