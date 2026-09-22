/**
 * @file src/routes/files/[...path]/+server.ts
 * @description Serves uploaded media files with streaming, cloud redirect support, cached
 * on-demand image transforms, and Range request handling.
 * Highly memory-efficient, secure, and cache-friendly.
 *
 * ### On-demand transforms (`?w=&h=&q=&fmt=`)
 * - Opt-in: handled only after the traversal guard, the tenant path gate and the signed-URL
 *   check have all passed, so a transform request can never bypass them.
 * - Only canonical originals (`{tenant}/{hash}/original/<file>`) with an encodable raster
 *   source MIME are transformed. SVG keeps its sanitised buffer path, GIF/TIFF/PDF/video and
 *   animated WebP/AVIF stream unchanged (`TRANSFORM_SOURCE_MIME`, `isAnimatedRaster`).
 * - `w`/`h` snap DOWN to `TRANSFORM_DIMENSION_STEPS` and `q` to `TRANSFORM_QUALITY_STEPS`
 *   (see `image-processor.ts`): no arbitrary resolutions, no one-file-per-pixel-width disk fill.
 * - Format: explicit `fmt`/`format` wins, otherwise `Accept` (`q=` ordered) is honoured and
 *   falls back to the source format. Wildcards mean "no preference".
 * - Serve-from-cache first; a miss is generated exactly once behind a process-local
 *   single-flight map (same coalescing idea as `CacheLockManager.coalesce` /
 *   `cacheService.coalesceQuery` in `routes/api/[...path]/handlers/media.ts`), written through
 *   `saveTransformVariant()` and then streamed. Variants are immutable → `immutable` + `Vary: Accept`.
 * - Any failure (oversized source, unsupported source, encoder error, disk error) falls back to
 *   streaming the original with a debug log — a bad `?w=` never breaks a page.
 * - `s3`/`cloudinary` keep the 302-to-CDN contract: transforms are not run in Node for cloud
 *   storage (the CDN owns them), so the query params stay inert on that path.
 */

import { createReadStream } from "node:fs";
import type { Stats } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import {
  MAX_CONCURRENT_TRANSFORMS,
  MAX_TRANSFORM_SOURCE_BYTES,
  isAnimatedRaster,
  parseTransformParams,
  renderTransformVariant,
  transformFormatToMime,
} from "@src/services/media/image-processor";
import {
  getTransformVariantRelPath,
  saveTransformVariant,
  transformVariantExists,
} from "@src/services/media/image-variant-storage";
import { resolveConfiguredMediaFolder } from "@src/utils/media/storage-adapters";
import { resolveMimeTypeFromPath } from "@src/utils/media/slim-sniffer.server";
import { apiHandler } from "@utils/api-handler";
import { MEDIA_RESOURCE_HEADERS } from "@utils/security/constants";
import { AppError, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";

// Pre-compute headers once (shared across all responses)
const _baseHeaders = {
  ...MEDIA_RESOURCE_HEADERS,
  "Cache-Control": "public, max-age=31536000, immutable",
  "Accept-Ranges": "bytes",
};

/**
 * Defense-in-depth for SVG responses: even if storage sanitization is bypassed,
 * block script execution when the browser treats the SVG as a document.
 */
function headersForMime(mimeType: string): Record<string, string> {
  if (mimeType === "image/svg+xml" || mimeType.startsWith("image/svg")) {
    return {
      ..._baseHeaders,
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      // Prefer download over navigable document when opened directly
      "Content-Disposition": "inline",
    };
  }
  return _baseHeaders;
}

// Lazy-load storage adapter once
let _storageAdapter: {
  getMetadata: (p: string) => Promise<{ etag?: string; size?: number; lastModified?: Date } | null>;
} | null = null;
async function getStorage() {
  if (!_storageAdapter) {
    const { getStorageAdapter } = await import("@src/utils/media/storage-adapters");
    _storageAdapter = getStorageAdapter();
  }
  return _storageAdapter!;
}

// Compute resolved media base path once at first request
let _mediaBase: string | null = null;
let _mediaFolder: string | null = null;
function getMediaPaths() {
  if (!_mediaBase) {
    // Same resolution as the write path (storage-adapters): under any
    // benchmark/test harness, process.env.MEDIA_FOLDER (the sandbox) wins
    // over a stale DB setting — otherwise uploads land in the sandbox but
    // /files serves from ./mediaFolder → 404. Sync + memoized: zero cost on
    // the file-serving hot path.
    const mf = (resolveConfiguredMediaFolder() || "mediaFolder")
      .replace(/^\.\//, "")
      .replace(/^\/+|\/+$/g, "");
    _mediaFolder = mf;
    _mediaBase = path.resolve(process.cwd(), mf);
  }
  return { folder: _mediaFolder!, base: _mediaBase! };
}

// ─── Streaming ──────────────────────────────────────────────────────────────

interface FileStreamOptions {
  resolvedPath: string;
  size: number;
  mtime: Date;
  mimeType: string;
  etag: string;
  request: Request;
  /** Extra response headers (e.g. `Vary: Accept` for negotiated variants). */
  headers?: Record<string, string>;
}

/**
 * Stream a file with Range / 206 / 416 support and client-abort teardown.
 * Shared by original responses and cached transform variants so both keep the
 * exact same caching and range semantics.
 */
function streamFile(options: FileStreamOptions): Response {
  const { resolvedPath, size, mtime, mimeType, etag, request } = options;
  const mimeHeaders = { ...headersForMime(mimeType), ...options.headers };
  const lastModified = mtime.toUTCString();
  const range = request.headers.get("range");

  // Range Requests (video/audio seeking)
  if (range?.startsWith("bytes=")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

    if (start >= size || end >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const chunksize = end - start + 1;
    const fileStream = createReadStream(resolvedPath, { start, end });
    // Destroy the fs stream when the client disconnects — otherwise every aborted
    // thumbnail/video range request leaks an open handle + async frames (FSReqPromise
    // pile-up under parallel workers).
    request.signal.addEventListener("abort", () => fileStream.destroy(), { once: true });

    return new Response(Readable.toWeb(fileStream) as unknown as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        ...mimeHeaders,
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": chunksize.toString(),
        "Last-Modified": lastModified,
        ETag: etag,
      },
    });
  }

  // Full file stream
  const fileStream = createReadStream(resolvedPath);
  // Destroy the fs stream when the client disconnects (aborted thumbnails/assets
  // would otherwise keep the file descriptor + async frames alive).
  request.signal.addEventListener("abort", () => fileStream.destroy(), { once: true });

  return new Response(Readable.toWeb(fileStream) as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      ...mimeHeaders,
      "Content-Type": mimeType,
      "Content-Length": size.toString(),
      "Last-Modified": lastModified,
      ETag: etag,
    },
  });
}

// ─── On-demand variant generation ───────────────────────────────────────────

/**
 * Coalesce concurrent generations of the same variant into one execution
 * (single-flight). Mirrors `CacheLockManager.coalesce` without the distributed
 * locking — the generation only writes a deterministic cache file, so losing a
 * race is harmless and a rejected generation retries on the next request.
 */
function coalesceByKey<T>(
  map: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key);
  if (existing) return existing;

  const task = factory().finally(() => {
    if (map.get(key) === task) map.delete(key);
  });
  map.set(key, task);
  return task;
}

/** In-flight on-demand generations keyed by variant storage path. */
const _inflightTransforms = new Map<string, Promise<void>>();

/** `stat` that returns null instead of throwing for missing/unreadable paths. */
async function statOrNull(targetPath: string): Promise<Stats | null> {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

/**
 * Multi-frame source check (animated WebP/AVIF) from the file header only —
 * transforming an animation would silently drop every frame but the first.
 */
async function hasAnimatedFrames(resolvedPath: string, mimeType: string): Promise<boolean> {
  if (mimeType !== "image/webp" && mimeType !== "image/avif") return false;

  const handle = await open(resolvedPath, "r");
  try {
    const head = Buffer.allocUnsafe(64);
    const { bytesRead } = await handle.read(head, 0, 64, 0);
    return isAnimatedRaster(head.subarray(0, bytesRead), mimeType);
  } finally {
    await handle.close();
  }
}

interface TransformContext {
  searchParams: URLSearchParams;
  request: Request;
  filePath: string;
  resolvedPath: string;
  size: number;
  mimeType: string;
  pathTenant: string;
  ifNoneMatch: string | null;
  ifModifiedSince: string | null;
}

/**
 * Serve a cached on-demand transform variant when the request asks for one.
 *
 * @returns the variant response, or null to let the caller stream the original
 *          (no transform requested, source not eligible, or generation failed).
 */
async function serveTransformVariant(ctx: TransformContext): Promise<Response | null> {
  const plan = parseTransformParams(
    ctx.searchParams,
    ctx.request.headers.get("accept"),
    ctx.mimeType,
  );
  if (!plan) return null;

  const segments = ctx.filePath.split("/");
  const hash = segments[1];
  // Only canonical originals carry a content hash → variant cache key.
  if (
    segments.length < 4 ||
    !hash ||
    segments[2] !== "original" ||
    !/^[a-f0-9]{16,64}$/i.test(hash)
  ) {
    logger.debug("[files] transform skipped: path is not a canonical original", {
      file: ctx.filePath,
    });
    return null;
  }

  const variantRelPath = getTransformVariantRelPath(hash, plan, ctx.pathTenant);
  const { base: basePath } = getMediaPaths();
  const variantPath = path.resolve(basePath, variantRelPath);

  // Defense-in-depth: the derived variant path must stay inside the media root.
  const relativeVariant = path.relative(basePath, variantPath);
  if (relativeVariant.startsWith("..") || path.isAbsolute(relativeVariant)) {
    logger.warn("[files] transform variant path escaped the media root", {
      requested: ctx.filePath,
    });
    return null;
  }

  try {
    // 1. Cache hit → stream the stored variant, no encoder work.
    let variantStats = await statOrNull(variantPath);

    // 2. Cache miss → eligibility checks, then generate exactly once.
    if (!variantStats) {
      if (ctx.size > MAX_TRANSFORM_SOURCE_BYTES) {
        logger.debug("[files] transform skipped: source exceeds the buffering limit", {
          file: ctx.filePath,
          size: ctx.size,
        });
        return null;
      }
      if (await hasAnimatedFrames(ctx.resolvedPath, ctx.mimeType)) {
        logger.debug("[files] transform skipped: animated source streams unchanged", {
          file: ctx.filePath,
        });
        return null;
      }

      // Bounded generation concurrency: joining an in-flight generation for this
      // variant is free, but starting a new one is capped so a burst of distinct
      // variants of large sources cannot buffer unbounded source images at once.
      if (
        !_inflightTransforms.has(variantRelPath) &&
        _inflightTransforms.size >= MAX_CONCURRENT_TRANSFORMS
      ) {
        logger.debug("[files] transform skipped: generation queue is full", {
          file: ctx.filePath,
          inFlight: _inflightTransforms.size,
        });
        return null;
      }

      await coalesceByKey(_inflightTransforms, variantRelPath, async () => {
        // Re-check inside the single-flight: a previous request may have just written it.
        if (await transformVariantExists(hash, plan, ctx.pathTenant)) return;

        const source = await readFile(ctx.resolvedPath);
        const variant = await renderTransformVariant(source, plan);
        await saveTransformVariant(variant, hash, plan, ctx.pathTenant);
        logger.debug("[files] on-demand variant generated", {
          variant: variantRelPath,
          bytes: variant.length,
        });
      });

      variantStats = await statOrNull(variantPath);
      if (!variantStats) {
        logger.debug("[files] transform variant missing after generation", {
          variant: variantRelPath,
        });
        return null;
      }
    }

    const variantMime = transformFormatToMime(plan.format);
    const variantEtag = `W/"${variantStats.size}-${variantStats.mtimeMs}"`;
    if (
      ctx.ifNoneMatch === variantEtag ||
      ctx.ifModifiedSince === variantStats.mtime.toUTCString()
    ) {
      return new Response(null, { status: 304 });
    }

    return streamFile({
      resolvedPath: variantPath,
      size: variantStats.size,
      mtime: variantStats.mtime,
      mimeType: variantMime,
      etag: variantEtag,
      request: ctx.request,
      headers: {
        // Same URL can yield a different format depending on Accept → keep caches honest.
        Vary: "Accept",
        "X-Media-Transform": `w${plan.width}h${plan.height}q${plan.quality}.${plan.format}`,
      },
    });
  } catch (err: unknown) {
    rethrow(err);
    logger.debug("[files] on-demand transform failed — serving original", {
      file: ctx.filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const GET = apiHandler(async ({ params, request, locals }) => {
  let filePath = params.path?.trim();
  if (!filePath) {
    throw new AppError("File path is required", 400, "MISSING_PATH");
  }

  filePath = filePath.replace(/^\/?files\//, "").replace(/^\/+/, "");

  const storageType = getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local";
  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");
  const requestUrl = new URL(request.url);

  // ====================== CLOUD STORAGE REDIRECT ======================
  if (storageType !== "local") {
    const cloudPublicUrl =
      getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL");

    if (cloudPublicUrl) {
      const storage = await getStorage();
      let etag: string | undefined;
      try {
        const metadata = await storage.getMetadata(filePath);
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

  // 🛡️ Tenant access control — extract tenant from file path
  // Path format: {tenantId}/{hash}/original/file.jpg or global/{hash}/original/file.jpg
  const pathTenant = filePath.split("/")[0];
  if (isMultiTenantEnabled() && pathTenant && pathTenant !== "global") {
    const userTenantId = (locals as any)?.tenantId;
    // Reject when: no tenantId (undefined/null), OR tenantId doesn't match path tenant and isn't "global" bypass
    if (!userTenantId || (userTenantId !== pathTenant && userTenantId !== "global")) {
      logger.warn("Cross-tenant file access blocked", {
        requested: filePath,
        userTenant: userTenantId,
        fileTenant: pathTenant,
      });
      throw new AppError("Access denied: tenant mismatch", 403, "TENANT_MISMATCH");
    }
  }

  // 🛡️ Signed URL enforcement (opt-in via MEDIA_SIGNED_URL_ENABLED)
  // Global files remain public; tenant-scoped files require a valid signature
  const signedUrlEnabled = getPublicSettingSync("MEDIA_SIGNED_URL_ENABLED");
  if (signedUrlEnabled && pathTenant !== "global") {
    const { validateSignedMediaUrl } = await import("@src/utils/media/signed-urls");
    const userTenantId = (locals as any)?.tenantId;
    const validation = validateSignedMediaUrl(requestUrl, filePath, userTenantId);
    if (!validation.valid) {
      logger.warn("Signed URL validation failed", {
        requested: filePath,
        reason: validation.reason,
      });
      throw new AppError("Signed URL required or invalid", 403, "SIGNATURE_REQUIRED");
    }
  }

  let stats;
  try {
    stats = await stat(resolvedPath);
  } catch (err: any) {
    if (err.code === "ENOENT") throw new AppError("File not found", 404, "NOT_FOUND");
    throw new AppError("Internal server error", 500, "FILE_ACCESS_ERROR");
  }

  if (!stats.isFile()) throw new AppError("Not a file", 400, "INVALID_FILE");

  // ====================== ON-DEMAND TRANSFORM (opt-in) ======================
  // Runs after the traversal guard, tenant gate and signature check above.
  if (pathTenant && (requestUrl.searchParams.has("w") || requestUrl.searchParams.has("h"))) {
    const transformed = await serveTransformVariant({
      searchParams: requestUrl.searchParams,
      request,
      filePath,
      resolvedPath,
      size: stats.size,
      mimeType: await resolveMimeTypeFromPath(resolvedPath),
      pathTenant,
      ifNoneMatch,
      ifModifiedSince,
    });
    if (transformed) return transformed;
  }

  // ====================== ORIGINAL (Range + conditional) ======================
  const etag = `W/"${stats.size}-${stats.mtimeMs}"`;
  const lastModified = stats.mtime.toUTCString();

  if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
    return new Response(null, { status: 304 });
  }

  return streamFile({
    resolvedPath,
    size: stats.size,
    mtime: stats.mtime,
    mimeType: await resolveMimeTypeFromPath(resolvedPath),
    etag,
    request,
  });
});
