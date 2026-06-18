/**
 * @file src/routes/files/[...path]/+server.ts
 * @description Serves uploaded media files with streaming, cloud redirect support, and Range request handling.
 * Highly memory-efficient, secure, and cache-friendly.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { lookup } from "mime-types";

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { apiHandler } from "@utils/api-handler";
import { MEDIA_RESOURCE_HEADERS } from "@utils/security-constants";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

const withMediaResourcePolicy = (headers: Record<string, string>) => ({
  ...MEDIA_RESOURCE_HEADERS,
  ...headers,
});

export const GET = apiHandler(async ({ params, request }) => {
  let filePath = params.path?.trim();
  if (!filePath) {
    throw new AppError("File path is required", 400, "MISSING_PATH");
  }

  // Clean potential doubled prefix or leading slashes
  filePath = filePath.replace(/^\/?files\//, "").replace(/^\/+/, "");

  // Load settings once per request
  const storageType = getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local";
  const mediaFolder = getPublicSettingSync("MEDIA_FOLDER") || "mediaFolder";
  const cloudPublicUrl =
    getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL");

  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");

  // ====================== CLOUD STORAGE REDIRECT ======================
  if (storageType !== "local" && cloudPublicUrl) {
    const { getMetadata } = await import("@src/utils/media/cloud-storage");

    let etag: string | undefined;
    try {
      const metadata = await getMetadata(filePath);
      etag = metadata?.etag;
    } catch {
      // Metadata fetch failed → continue without ETag optimization
    }

    // Early return if browser already has the latest version
    if (etag && ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    const normalizedFolder = mediaFolder.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");

    const baseUrl = cloudPublicUrl.replace(/\/+$/, "");
    const fullUrl = normalizedFolder
      ? `${baseUrl}/${normalizedFolder}/${filePath}`
      : `${baseUrl}/${filePath}`;

    logger.debug("Redirecting media to cloud storage", { filePath, fullUrl });

    return new Response(null, {
      status: 302, // 302 is standard for temporary asset redirects
      headers: withMediaResourcePolicy({
        Location: fullUrl,
        ...(etag && { ETag: etag }),
        "Cache-Control": "public, max-age=31536000, immutable",
      }),
    });
  }

  if (storageType !== "local") {
    throw new AppError("Cloud storage misconfigured", 500, "CLOUD_CONFIG_ERROR");
  }

  // ====================== LOCAL STORAGE SERVING ======================
  const normalizedMediaFolder = mediaFolder.replace(/^\.\//, "").replace(/^\/+/, "");
  const fullPath = path.join(process.cwd(), normalizedMediaFolder, filePath);
  const resolvedPath = path.resolve(fullPath);
  const basePath = path.resolve(process.cwd(), normalizedMediaFolder);

  // Stronger directory traversal protection using path.relative
  const relative = path.relative(basePath, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    logger.warn("Directory traversal attempt blocked", {
      requested: filePath,
      resolved: resolvedPath,
    });
    throw new AppError("Access denied", 403, "ACCESS_DENIED");
  }

  // Get file stats (non-blocking)
  let stats;
  try {
    stats = await stat(resolvedPath);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      logger.debug("Media file not found", { path: filePath });
      throw new AppError("File not found", 404, "NOT_FOUND");
    }
    logger.error("Error accessing media file", { error: err });
    throw new AppError("Internal server error", 500, "FILE_ACCESS_ERROR");
  }

  if (!stats.isFile()) {
    throw new AppError("Not a file", 400, "INVALID_FILE");
  }

  // ETag & Last-Modified for caching
  const etag = `W/"${stats.size}-${stats.mtimeMs}"`;
  const lastModified = stats.mtime.toUTCString();

  // Browser cache optimization
  if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
    return new Response(null, { status: 304 });
  }

  const mimeType = lookup(resolvedPath) || "application/octet-stream";
  const range = request.headers.get("range");

  // Handle Range Requests (important for video/audio seeking)
  if (range && range.startsWith("bytes=")) {
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
      headers: withMediaResourcePolicy({
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": lastModified,
        ETag: etag,
      }),
    });
  }

  // Efficient streaming for full file
  const fileStream = createReadStream(resolvedPath);
  const webStream = Readable.toWeb(fileStream);

  return new Response(webStream as any, {
    status: 200,
    headers: withMediaResourcePolicy({
      "Content-Type": mimeType,
      "Content-Length": stats.size.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Last-Modified": lastModified,
      ETag: etag,
      "Accept-Ranges": "bytes",
    }),
  });
});
