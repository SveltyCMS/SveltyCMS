/**
 * @file src/routes/files/[...path]/+server.ts
 * @description Serves uploaded media files with streaming, cloud redirect support, and Range request handling.
 * Highly memory-efficient, secure, and cache-friendly.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { lookup } from "mime-types";

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { apiHandler } from "@utils/api-handler";
import { MEDIA_RESOURCE_HEADERS } from "@utils/security-constants";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

// Pre-compute headers once (shared across all responses)
const _baseHeaders = {
  ...MEDIA_RESOURCE_HEADERS,
  "Cache-Control": "public, max-age=31536000, immutable",
  "Accept-Ranges": "bytes",
};

// Lazy-load cloud storage module once
let _cloudStorage: {
  getMetadata: (p: string) => Promise<{ etag?: string; size?: number; lastModified?: Date } | null>;
} | null = null;
async function getCloudStorage() {
  if (!_cloudStorage) {
    _cloudStorage = await import("@src/utils/media/cloud-storage");
  }
  return _cloudStorage!;
}

// Compute resolved media base path once at first request
let _mediaBase: string | null = null;
let _mediaFolder: string | null = null;
function getMediaPaths() {
  if (!_mediaBase) {
    const mf = (getPublicSettingSync("MEDIA_FOLDER") || "mediaFolder")
      .replace(/^\.\//, "")
      .replace(/^\/+|\/+$/g, "");
    _mediaFolder = mf;
    _mediaBase = path.resolve(process.cwd(), mf);
  }
  return { folder: _mediaFolder!, base: _mediaBase! };
}

export const GET = apiHandler(async ({ params, request }) => {
  let filePath = params.path?.trim();
  if (!filePath) {
    throw new AppError("File path is required", 400, "MISSING_PATH");
  }

  filePath = filePath.replace(/^\/?files\//, "").replace(/^\/+/, "");

  const storageType = getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local";
  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");

  // ====================== CLOUD STORAGE REDIRECT ======================
  if (storageType !== "local") {
    const cloudPublicUrl =
      getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL");

    if (cloudPublicUrl) {
      const cloud = await getCloudStorage();
      let etag: string | undefined;
      try {
        const metadata = await cloud.getMetadata(filePath);
        etag = metadata?.etag;
      } catch {
        /* metadata optional */
      }

      if (etag && ifNoneMatch === etag) {
        return new Response(null, { status: 304 });
      }

      const { folder: normalizedFolder } = getMediaPaths();
      const baseUrl = cloudPublicUrl.replace(/\/+$/, "");
      const fullUrl = normalizedFolder
        ? `${baseUrl}/${normalizedFolder}/${filePath}`
        : `${baseUrl}/${filePath}`;

      return new Response(null, {
        status: 302,
        headers: {
          ...MEDIA_RESOURCE_HEADERS,
          Location: fullUrl,
          ...(etag && { ETag: etag }),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    throw new AppError("Cloud storage misconfigured", 500, "CLOUD_CONFIG_ERROR");
  }

  // ====================== LOCAL STORAGE SERVING ======================
  const { base: basePath } = getMediaPaths();
  const fullPath = path.join(basePath, filePath);
  const resolvedPath = path.resolve(fullPath);

  // Directory traversal guard
  const relative = path.relative(basePath, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    logger.warn("Directory traversal attempt blocked", { requested: filePath });
    throw new AppError("Access denied", 403, "ACCESS_DENIED");
  }

  let stats;
  try {
    stats = await stat(resolvedPath);
  } catch (err: any) {
    if (err.code === "ENOENT") throw new AppError("File not found", 404, "NOT_FOUND");
    throw new AppError("Internal server error", 500, "FILE_ACCESS_ERROR");
  }

  if (!stats.isFile()) throw new AppError("Not a file", 400, "INVALID_FILE");

  const etag = `W/"${stats.size}-${stats.mtimeMs}"`;
  const lastModified = stats.mtime.toUTCString();

  if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
    return new Response(null, { status: 304 });
  }

  const mimeType = lookup(resolvedPath) || "application/octet-stream";
  const range = request.headers.get("range");

  // Range Requests (video/audio seeking)
  if (range?.startsWith("bytes=")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

    if (start >= stats.size || end >= stats.size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stats.size}` },
      });
    }

    const chunksize = end - start + 1;
    const fileStream = createReadStream(resolvedPath, { start, end });
    const webStream = Readable.toWeb(fileStream);

    return new Response(webStream as any, {
      status: 206,
      headers: {
        ..._baseHeaders,
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Content-Length": chunksize.toString(),
        "Last-Modified": lastModified,
        ETag: etag,
      },
    });
  }

  // Full file stream
  const fileStream = createReadStream(resolvedPath);
  const webStream = Readable.toWeb(fileStream);

  return new Response(webStream as any, {
    status: 200,
    headers: {
      ..._baseHeaders,
      "Content-Type": mimeType,
      "Content-Length": stats.size.toString(),
      "Last-Modified": lastModified,
      ETag: etag,
    },
  });
});
