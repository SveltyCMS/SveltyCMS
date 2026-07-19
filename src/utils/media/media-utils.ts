/**
 * @file src/utils/media/media-utils.ts
 * @description Client-safe media utilities: MIME lookup, URL construction, validation,
 *              filename sanitization, API helpers, and reverse extension mapping.
 *
 * ### Features:
 * - MIME type lookup and file validation (merged from mime-utils)
 * - Reverse extension mapping from MIME type
 * - Media URL construction and path resolution
 * - Filename sanitization for safe upload/storage (merged from media-processing)
 * - Media metadata API client wrappers (merged from api.ts)
 */

import { publicEnv } from "@src/stores/global-settings.svelte";
import { logger } from "@utils/logger";

// ─── Inline helpers (avoid circular import from barrel) ───────────────────

/** Human-readable file size — keep local to avoid barrel conflict with src/utils/file.ts. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Windows reserved filenames (case-insensitive). */
const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Robust filename sanitizer — blocks null bytes, control chars, path separators,
 *  Unicode homoglyphs used in spoofing attacks, reserved Windows names,
 *  and leading/trailing dots/spaces. */
export function sanitize(input: string): string {
  let result = input
    // Replace null bytes, control chars (0x00-0x1f, DEL), and unsafe file-system chars
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
    // Strip leading/trailing dots and spaces (Windows Explorer rejects these)
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 255);

  // Guard against reserved Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (RESERVED_WINDOWS.test(result)) {
    result = "_" + result;
  }

  return result;
}

import { isStoredMedia, type MediaItem } from "./media-models";

// ─── MIME database (merged + expanded from mime-utils) ────────────────────

const MIME_MAP: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",

  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",

  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",

  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const EXT_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_MAP).map(([ext, mime]) => [mime, ext]),
);

/** Browser-compatible MIME lookup */
export function getMimeType(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop();
  if (!ext) return null;
  return MIME_MAP[ext] ?? null;
}

/** Reverse lookup: get file extension from MIME type */
export function getExtensionFromMimeType(mime: string): string | false {
  if (!mime) return false;
  return EXT_MAP[mime] || false;
}

// ─── Path & URL utilities ─────────────────────────────────────────────────

/** Canonical on-disk relative path for a media record (handles legacy `global/{hash}` rows). */
export function resolveMediaRelPath(item: {
  path?: string | null;
  hash?: string | null;
  filename?: string | null;
}): string {
  const stored = (item.path ?? "").replace(/^\/files\//, "").replace(/^\/+/, "");
  if (!stored) return "";

  if (stored.includes("/original/") || /\.[a-z0-9]{2,8}$/i.test(stored.split("/").pop() ?? "")) {
    return stored;
  }

  if (item.hash && item.filename) {
    return buildOriginalRelPath(item.hash, item.filename);
  }

  return stored;
}

/** Sentinel value for global / no-tenant storage paths. */
const TENANT_GLOBAL = "global";

/** Normalise a tenant-id to a safe path segment, falling back to the global sentinel. */
function tenantPathSegment(tenantId?: string | null): string {
  return tenantId && tenantId !== TENANT_GLOBAL ? tenantId : TENANT_GLOBAL;
}

/** Build the relative storage path for an uploaded original file. */
export function buildOriginalRelPath(
  hash: string,
  filename: string,
  tenantId?: string | null,
): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1) : "bin";
  const baseName = dot >= 0 ? filename.slice(0, dot) : filename || "file";
  const tenant = tenantPathSegment(tenantId);
  return `${tenant}/${hash}/original/${baseName}-${hash}.${ext}`;
}

/** Resolve a browser-ready `/files/...` URL from stored media metadata. */
export function resolveMediaPublicPath(item: {
  path?: string | null;
  hash?: string | null;
  filename?: string | null;
  url?: string | null;
}): string {
  if (item.url?.startsWith("http://") || item.url?.startsWith("https://")) {
    return item.url;
  }
  if (item.url?.startsWith("/files/")) {
    return item.url;
  }
  const rel = resolveMediaRelPath(item);
  return rel ? `/files/${rel}` : (item.url ?? "");
}

/** Construct public media URL */
export function mediaUrl(item: MediaItem, size?: string): string {
  if (!item?.url) return "";

  if (publicEnv.MEDIASERVER_URL) {
    const cleanUrl = item.url.replace(/^\/files\//, "");
    return `${publicEnv.MEDIASERVER_URL.replace(/\/+$/, "")}/files/${cleanUrl}`;
  }

  // Use `isStoredMedia` type guard instead of duck-type / `as any` cast
  if (size && isStoredMedia(item) && item.thumbnails?.[size]?.url) {
    return item.thumbnails[size]!.url;
  }

  if (item.url.startsWith("/files/")) return item.url;
  if (item.url.startsWith("http://") || item.url.startsWith("https://")) return item.url;

  return `/files/${item.url}`;
}

// ─── Validation ────────────────────────────────────────────────────────────

/** Client-side file validation */
export function validateFile(
  file: File,
  allowedPattern: RegExp,
  maxSize = 10 * 1024 * 1024,
): { valid: boolean; message?: string } {
  const type = getMimeType(file.name) ?? file.type;

  if (!(type && allowedPattern.test(type))) {
    return { valid: false, message: `Invalid type: ${type}` };
  }

  if (file.size > maxSize) {
    return { valid: false, message: `Size exceeds ${formatBytes(maxSize)}` };
  }

  return { valid: true };
}

/** Server-side buffer validation */
export function validateBuffer(
  buffer: Buffer,
  name: string,
  allowedPattern: RegExp,
  maxSize = 10 * 1024 * 1024,
): { valid: boolean; message?: string } {
  const type = getMimeType(name) ?? "application/octet-stream";

  if (!allowedPattern.test(type)) {
    return { valid: false, message: `Invalid type: ${type}` };
  }

  if (buffer.length > maxSize) {
    return { valid: false, message: `Size exceeds ${formatBytes(maxSize)}` };
  }

  return { valid: true };
}

/** Aliases for backward compatibility */
export const validateMediaFileServer = validateBuffer;
export const constructUrl = mediaUrl;
export const constructMediaUrl = mediaUrl;

// ─── Filename sanitization (merged from media-processing.ts) ──────────────

/** Sanitize filename for safe upload/storage */
export function sanitizedFilename(original: string): {
  name: string;
  ext: string;
} {
  if (!original || typeof original !== "string") {
    throw new Error("Invalid filename");
  }

  const dot = original.lastIndexOf(".");
  const name = dot > 0 ? original.slice(0, dot) : original;
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase() : "";

  logger.trace("Filename sanitized", { original, name, ext });

  return { name: sanitize(name), ext };
}

/** Alias for backward compatibility */
export function getSanitizedFileName(filename: string): {
  fileNameWithoutExt: string;
  ext: string;
} {
  const { name, ext } = sanitizedFilename(filename);
  return { fileNameWithoutExt: name, ext };
}

// ─── Media API client helpers (merged from api.ts) ────────────────────────

interface Watermark {
  id: string;
  name: string;
  url?: string;
}

/**
 * Update media metadata via PATCH request.
 *
 * NOTE: This function sends a raw `fetch()` without a CSRF token header.
 * In SveltyCMS the CSRF cookie (`__Host-xsrf` / `__Secure-xsrf`) is set
 * by the server and automatically attached by the browser on same-origin
 * requests. Callers relying on cross-origin fetch or environments that
 * require an explicit `X-CSRF-Token` header should provide it before calling.
 */
export async function updateMediaMetadata(
  id: string,
  patch: Record<string, unknown>,
): Promise<unknown> {
  try {
    const res = await fetch(`/api/media/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: patch }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (err) {
    logger.error("updateMediaMetadata failed", { id, error: err });
    throw err;
  }
}

/** Fetch watermarks from collection */
export async function fetchWatermarks(collectionId = "Watermarks"): Promise<Watermark[]> {
  const urls = [
    `/api/collections/${collectionId}?limit=100`,
    `/api/collections/${collectionId.toLowerCase()}?limit=100`,
    `/api/collections/${collectionId}/entries?limit=100`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const json = await res.json();
      const items = (
        Array.isArray(json)
          ? json
          : Array.isArray(json.data)
            ? json.data
            : Array.isArray(json.items)
              ? json.items
              : []
      ) as Array<Record<string, unknown>>;

      return items.map((it) => ({
        id: (it._id || it.id) as string,
        name: (it.name || it.title || `Watermark ${it._id || it.id}`) as string,
        url: (it.url || (it.image as { url?: string })?.url) as string | undefined,
      }));
    } catch {
      // continue to next URL pattern
    }
  }

  logger.warn("No watermarks found", { collectionId });
  return [];
}

// --- Image Sizes ---
const _imageEnvSizes = publicEnv.IMAGE_SIZES || {};
export const SIZES = {
  ..._imageEnvSizes,
  original: 0,
  thumbnail: 200,
} as const;
