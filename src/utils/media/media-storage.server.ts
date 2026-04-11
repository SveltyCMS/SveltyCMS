/**
 * @file src/utils/media/media-storage.server.ts
 * @description Core media storage (local + cloud) with resizing & avatar handling
 *
 * Features:
 * - Unified local/cloud save/delete
 * - Sharp-based resizing
 * - Avatar processing (200x200)
 * - Safe path handling
 * - No DB logic
 */

import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { getPublicSettingSync } from "@src/services/settings-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
import mime from "mime-types";
import { logger } from "@utils/logger.server";

import { exists, getConfig, getUrl, isCloud, remove, upload, download } from "./cloud-storage";

import type { ResizedImage } from "./media-models";

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
// Image sizes
const DEFAULT_SIZES = { sm: 600, md: 900, lg: 1200 } as const;
const SIZES = {
  ...DEFAULT_SIZES,
  ...publicEnv.IMAGE_SIZES,
  original: 0,
  thumbnail: 200,
};

/** Get configured image sizes */
export function getImageSizes() {
  return SIZES;
}

const MEDIA_ROOT = getPublicSettingSync("MEDIA_FOLDER") ?? "mediaFolder";

/** Save buffer to storage (local or cloud) */
export async function saveFile(buffer: Buffer, relPath: string): Promise<string> {
  const MEDIA_ROOT_FULL = path.resolve(process.cwd(), MEDIA_ROOT) + path.sep;
  const fullRelPath = path.resolve(process.cwd(), MEDIA_ROOT, relPath);

  if (!fullRelPath.startsWith(MEDIA_ROOT_FULL)) {
    throw new Error("Invalid path: Potential traversal attack");
  }

  if (isCloud()) {
    await upload(buffer, relPath);
    return getUrl(relPath);
  }

  // Local
  const fs = await import("node:fs/promises");
  await fs.mkdir(path.dirname(fullRelPath), { recursive: true });
  await fs.writeFile(fullRelPath, buffer);

  return `/files/${relPath}`;
}

/** Delete file from storage */
export async function deleteFile(url: string): Promise<void> {
  let rel = url;

  if (url.startsWith("http")) {
    rel = new URL(url).pathname;
  }

  if (isCloud()) {
    // Strip prefix if needed (cloud handles full key)
    const cfg = getConfig();
    if (
      cfg &&
      "prefix" in cfg &&
      typeof cfg.prefix === "string" &&
      rel.startsWith(`/${cfg.prefix}/`)
    ) {
      rel = rel.slice(cfg.prefix.length + 1);
    }
    await remove(rel);
    return;
  }

  // Local
  if (rel.startsWith("/files/")) {
    rel = rel.slice(7);
  }
  rel = rel.replace(/^\/+/, "");

  // Path Traversal Protection
  const MEDIA_ROOT_FULL = path.resolve(process.cwd(), MEDIA_ROOT) + path.sep;
  const full = path.resolve(process.cwd(), MEDIA_ROOT, rel);

  if (!full.startsWith(MEDIA_ROOT_FULL)) {
    const { logger } = await import("@utils/logger.server");
    logger.error("Attempted path traversal delete blocked", {
      path: rel,
      resolved: full,
    });
    return;
  }

  const fs = await import("node:fs/promises");
  const fullPath = path.join(process.cwd(), MEDIA_ROOT, rel);
  await fs.unlink(fullPath).catch(() => {}); // best effort
}

/** Alias for backward compatibility */
export const moveMediaToTrash = deleteFile;
export const saveAvatarImage = saveAvatar;
export const saveFileToDisk = saveFile;
export const saveResizedImages = saveResized;

/** Check if file exists */
export async function fileExists(rel: string): Promise<boolean> {
  if (rel.includes("..")) return false;
  if (isCloud()) {
    return await exists(rel);
  }
  const fs = await import("node:fs/promises");
  const full = path.join(process.cwd(), MEDIA_ROOT, rel);
  try {
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

/** Get file buffer */
export async function getFile(rel: string): Promise<Buffer> {
  if (isCloud()) {
    return await download(rel);
  }

  const MEDIA_ROOT_FULL = path.resolve(process.cwd(), MEDIA_ROOT) + path.sep;
  const fullPath = path.resolve(process.cwd(), MEDIA_ROOT, rel);

  if (!fullPath.startsWith(MEDIA_ROOT_FULL)) {
    throw new Error("Invalid path: Potential traversal attack");
  }

  const fs = await import("node:fs/promises");
  return await fs.readFile(fullPath);
}

/** Resize & save image variants */
export async function saveResized(
  buffer: Buffer,
  hash: string,
  baseName: string,
  ext: string,
  baseDir: string,
): Promise<Record<string, ResizedImage>> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer).metadata();
  const result: Record<string, ResizedImage> = {};

  const format = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.format ?? "original";
  const quality = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.quality ?? 80;

  for (const [key, w] of Object.entries(SIZES)) {
    if (w === 0) {
      continue; // skip original
    }

    let instance = sharp(buffer).resize(w, null, {
      fit: "cover",
      position: "center",
    });

    let outExt = ext;
    let mimeType = mime.lookup(ext) || "application/octet-stream";

    if (format !== "original") {
      instance = instance.toFormat(format as "webp" | "avif", { quality });
      outExt = format;
      mimeType = `image/${format}`;
    }

    const fileName = `${baseName}-${hash}.${outExt}`;
    const relPath = path.posix.join(baseDir, key, fileName);

    const resizedBuf = await instance.toBuffer();
    const url = await saveFile(resizedBuf, relPath);

    const height = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : undefined;

    result[key] = {
      url,
      width: w,
      height: height ?? w,
      size: resizedBuf ? (resizedBuf as any).length : 0,
      mimeType,
    };
  }

  return result;
}

/** Save avatar (200x200) */
export async function saveAvatar(file: File, userId: string): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".jpg";

  const sharp = (await import("sharp")).default;
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
