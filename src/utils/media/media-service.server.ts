/**
 * @file src/utils/media/media-service.server.ts
 * @description Standard media service for SveltyCMS.
 *
 * Features:
 * - Media deduplication via hash
 * - URL enrichment with tenant prefixes
 * - Transformation & Manipulation (Sharp)
 * - Batch processing
 */

import { error } from "@sveltejs/kit";
import { logger } from "@src/utils/logger";
import { AppError } from "@utils/error-handling";
import { fileExists, getFile, saveFile, saveResizedImages } from "./media-storage.server";
import { processImageWithPresets, type ImageVariant } from "@src/services/media/image-processor";
import type {
  IDBAdapter,
  DatabaseError,
  DatabaseId,
  DatabaseResult,
  MediaItem as DbMediaItem,
  EntityCreate,
  EntityUpdate,
} from "@src/databases/db-interface";
import { mediaTypeFromMime, type MediaItem } from "./media-models";
import { buildOriginalRelPath, resolveMediaRelPath } from "./media-utils";
import { getUrl } from "./cloud-storage";
import { validateEgressUrl, safeFetch } from "../egress-guard";
import { sniffMimeType } from "./slim-sniffer.server";
import type { SharpFactory, SharpOverlayOptions } from "./sharp-pipeline";
import { MediaReferenceIndex, type MediaReference } from "./media-reference-index";
import { eventBus, SystemEvents } from "@utils/event-bus";

/* -------------------------------------------------------------------------- */
/* Security helpers for SVG attribute injection defense                       */
/* -------------------------------------------------------------------------- */

/** Only allow hex colours (#RGB, #RRGGBB, #RRGGBBAA) in dynamically-built SVG. */
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Only allow plain numeric strings (no expressions, no units) in SVG attributes. */
const SAFE_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Validate a value against a regex; return a safe fallback when it fails.
 * Used to harden dynamically-built SVG markup (watermark text colour, annotation
 * stroke/fill, font-size, stroke-width, etc.).
 */
function guardAttr(value: string, pattern: RegExp, fallback: string): string {
  if (pattern.test(value)) return value;
  logger.warn(`[MediaService] Rejected unsafe SVG attribute value: "${value}"`);
  return fallback;
}

/**
 * Like guardAttr but for numeric values — converts to string first,
 * returns the original number on match or the numeric fallback.
 */
function guardNumeric(value: number, fallback: number): number {
  if (SAFE_NUMBER.test(String(value))) return value;
  logger.warn(`[MediaService] Rejected unsafe SVG numeric value: ${value}`);
  return fallback;
}

/* -------------------------------------------------------------------------- */

/**
 * 🛡️ Lightweight SVG sanitizer — strips dangerous elements and attributes
 * without requiring a DOM parser (zero additional runtime deps).
 *
 * Strips: script, foreignObject, iframe, object, embed tags (with content)
 * Strips: all on* event handlers, javascript:/data: URIs in href/xlink:href
 * Strips: CDATA blocks, XML processing instructions, DOCTYPE declarations
 *
 * Defense-in-depth: the RichText/Sanitize display pipeline also applies DOMPurify client-side
 */
export function sanitizeSvg(svg: string): string {
  let cleaned = svg;
  let previous = "";

  // Iterative scrubbing — prevents XML label-nesting bypass attacks
  // (same defense as sanitize-html.ts)
  while (cleaned !== previous) {
    previous = cleaned;

    // 1. Strip dangerous tags (with their content, including self-closing variants)
    const DANGEROUS_TAGS = ["script", "foreignObject", "iframe", "object", "embed"];
    for (const tag of DANGEROUS_TAGS) {
      cleaned = cleaned.replace(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi"), "");
      cleaned = cleaned.replace(new RegExp(`<${tag}[\\s>][\\s\\S]*?/>`, "gi"), "");
    }

    // 2. Strip inline event handlers — inside loop for defense-in-depth
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
  }

  // 3. Strip javascript: and data: protocols in href/xlink:href attributes
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*"\s*javascript\s*:/gi, '$1="#blocked"');
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*'\s*javascript\s*:/gi, "$1='#blocked'");
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*"\s*data\s*:/gi, '$1="#blocked"');
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*'\s*data\s*:/gi, "$1='#blocked'");

  // 4. Strip CDATA-wrapped scripts (potential XSS vectors)
  cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");

  // 5. Strip XML processing instructions (potential XXE vectors)
  cleaned = cleaned.replace(/<\?[\s\S]*?\?>/gi, "");

  // 6. Strip DOCTYPE declarations (external entity injection)
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, "");

  return cleaned;
}

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
];

function isSvgFile(mimeType: string, filename: string): boolean {
  return mimeType === "image/svg+xml" || filename.toLowerCase().endsWith(".svg");
}

function validateMime(mimeType: string, filename: string) {
  if (!mimeType) {
    // Fall back to extension-based lookup
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && ["svg", "html", "js", "wasm"].includes(ext)) throw new Error("Blocked: ." + ext);
    return; // Allow through — binary sniffing will run downstream
  }
  if (!ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && ["svg", "html", "js", "wasm"].includes(ext)) throw new Error("Blocked: ." + ext);
    throw new Error("MIME not allowed: " + mimeType);
  }
}

/* -------------------------------------------------------------------------- */
/* Media manipulation options (typed replacement for `any`)                   */
/* -------------------------------------------------------------------------- */

/** Shape accepted by enrichMediaWithUrl (path/url/thumbnails/metadata/versions). */
interface EnrichableRecord {
  path?: string;
  url?: string;
  thumbnails?: Record<string, { path?: string; url?: string; [key: string]: unknown } | undefined>;
  metadata?: {
    versions?: Array<{ path?: string; url?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  versions?: unknown[];
  [key: string]: unknown;
}

/** Minimal shape for database hook query parameters. */
interface HookQuery {
  _id?: unknown;
  tenantId?: unknown;
  [key: string]: unknown;
}

/** The subset of IDBAdapter needed by dispose() for hook management. */
interface HookableAdapter {
  unregisterHook?(id: string): void;
  hooks?: Array<{ id: string }>;
  hookCache?: { clear(): void };
  compiledHooks?: { clear(): void };
}

/** A media version entry stored in metadata.versions. */
interface MediaVersionEntry {
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
}

// MediaReference is now imported from ./media-reference-index

/* -------------------------------------------------------------------------- */

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: "circle" | "rect";
}

export interface FilterOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  grayscale?: number;
  sepia?: number;
  temperature?: number;
}

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  strength?: number;
}

export interface TextWatermark {
  type: "text";
  text: string;
  color?: string;
  fontSize?: number;
  opacity?: number;
  x: number;
  y: number;
}

export interface ImageWatermark {
  type: "image";
  imageUrl: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export type Watermark = TextWatermark | ImageWatermark;

export interface Annotation {
  type: "rect" | "circle" | "text" | "arrow" | "line";
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  fontSize?: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
}

export interface MediaManipulation {
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  crop?: CropOptions;
  filters?: FilterOptions;
  blurRegions?: BlurRegion[];
  watermarks?: Watermark[];
  annotations?: Annotation[];
  saveBehavior?: "overwrite" | "new";
}

/* -------------------------------------------------------------------------- */

export class MediaService {
  private readonly db: IDBAdapter;
  private static hookRegistered = false;
  private registeredHookId: string | null = null;

  /** In-memory reverse-index for O(1) media-reference lookups. */
  private referenceIndex = new MediaReferenceIndex();

  /** Tracks entry statuses populated during index rebuild for publish filtering. */
  private entryStatusMap = new Map<string, string>();

  /** Maps entryId to a human-readable name for reference summaries. */
  private entryNameMap = new Map<string, string>();

  constructor(db: IDBAdapter) {
    this.db = db;
    if (!this.db) {
      throw error(500, "Database adapter not available");
    }

    // 🚀  Register automatic cleanup hook
    if (!MediaService.hookRegistered && this.db.registerHook) {
      MediaService.hookRegistered = true;
      this.registeredHookId = "media-cleanup";
      this.db.registerHook({
        id: this.registeredHookId,
        type: "before",
        action: "delete",
        handler: async (collection: string, query: HookQuery) => {
          if (
            collection === "media_items" ||
            collection === "mediaItems" ||
            collection === "media"
          ) {
            const id = query?._id;
            if (id) {
              try {
                await this.deleteMedia(
                  id.toString(),
                  query?.tenantId as DatabaseId | null | undefined,
                );
              } catch (e) {
                logger.error(`[Hooks] Media cleanup failed:`, e);
              }
            }
          }
        },
      });
    }

    // 🔁 Auto-invalidate reference index on any content mutation
    eventBus.on(SystemEvents.CONTENT_UPDATE, () => {
      this.referenceIndex.clear();
      this.entryStatusMap.clear();
      this.entryNameMap.clear();
    });
  }

  /**
   * 🧹 Dispose – unregisters the DB hook to prevent orphaned hooks on
   * tenant-switch or test teardown. Safe to call multiple times.
   */
  public dispose(): void {
    if (!this.registeredHookId) return;

    MediaService.hookRegistered = false;
    const adapter = this.db as unknown as HookableAdapter;

    if (typeof adapter.unregisterHook === "function") {
      adapter.unregisterHook(this.registeredHookId);
    } else if (Array.isArray(adapter.hooks)) {
      // BaseAdapter stores hooks in a plain array keyed by id
      adapter.hooks = adapter.hooks.filter((h: { id: string }) => h.id !== this.registeredHookId);
      adapter.hookCache?.clear();
      adapter.compiledHooks?.clear();
    }

    this.registeredHookId = null;
  }

  public get files() {
    return this.db.media.files;
  }

  /**
   * Maps Node.js filesystem error codes to meaningful AppError responses.
   * Call this in catch blocks where filesystem writes may fail.
   */
  private mapFileSystemError(err: unknown): void {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (!code) return; // Not a Node.js system error — let caller handle normally

    switch (code) {
      case "ENOSPC":
        throw new AppError("Storage quota exceeded", 507, "STORAGE_FULL");
      case "EACCES":
      case "EPERM":
        throw new AppError("Permission denied", 403, "STORAGE_ACCESS_DENIED");
      case "EFBIG":
        throw new AppError("File too large", 413, "FILE_TOO_LARGE");
      default:
        // Unknown filesystem error — let caller handle normally
        return;
    }
  }

  /**
   * Fire-and-forget variant generation for streamed (large file) uploads.
   * Re-reads the file from storage, generates responsive variants, and
   * updates the media record with variant metadata asynchronously.
   */
  private generateVariantsForStreamedFile(
    hash: string,
    relPath: string,
    _mimeType: string,
    _filename: string,
    uploadResult: DatabaseResult<MediaItem>,
    tenantId?: DatabaseId | null,
  ): void {
    // Defer to microtask to avoid blocking the response
    Promise.resolve().then(async () => {
      try {
        const { getFile } = await import("./media-storage.server");
        const fileBuffer = await getFile(relPath);
        const { processImageWithPresets } = await import("@src/services/media/image-processor");
        const variants = await processImageWithPresets(
          fileBuffer,
          hash,
          ["thumbnail", "card", "default"],
          tenantId,
        );

        if (!uploadResult.success) {
          logger.warn("[MediaService] Cannot generate variants — upload result indicates failure");
          return;
        }
        if (variants.length > 0 && uploadResult.data) {
          const recordId = (uploadResult.data as any)._id;
          if (recordId) {
            await this.db.crud.update(
              "media_items",
              recordId as DatabaseId,
              {
                metadata: {
                  imageVariants: variants.map((v) => ({
                    preset: v.preset,
                    width: v.width,
                    height: v.height,
                    format: v.format,
                    quality: v.quality,
                    path: v.path,
                    size: v.size,
                  })),
                },
              } as unknown as EntityUpdate<DbMediaItem>,
            );
            logger.info("[Media] Variants generated for streamed upload", {
              hash: hash.slice(0, 12),
              count: variants.length,
            });
          }
        }
      } catch (err) {
        logger.warn(
          "[Media] Background variant generation for streamed upload failed — original intact",
          {
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    });
  }

  private async ensureOriginalOnDisk(
    hash: string,
    filename: string,
    data: Buffer | ReadableStream | import("node:stream").Readable,
    tenantId?: string | null,
  ): Promise<string> {
    const relPath = buildOriginalRelPath(hash, filename, tenantId);
    if (await fileExists(relPath)) {
      return relPath;
    }

    try {
      await saveFile(data, relPath);
    } catch (err: unknown) {
      this.mapFileSystemError(err);
      throw err;
    }
    if (!(await fileExists(relPath))) {
      throw new Error(`Media file was not persisted to disk: ${relPath}`);
    }
    return relPath;
  }

  /**
   * 🚀 AGNOSTIC CORE: Saves a media item to the database and physical storage.
   */
  public async saveMedia(
    file:
      | File
      | {
          name: string;
          type: string;
          size: number;
          stream: () => ReadableStream;
          arrayBuffer?: () => Promise<ArrayBuffer>;
        },
    _userId: string,
    _access: "public" | "private" = "public",
    tenantId?: DatabaseId | null,
    _basePath?: string,
    _watermarkOptions?: unknown,
    _userContext?: unknown,
    _skipResizing?: boolean,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      validateMime(file.type, file.name);
      const folderId = _basePath && _basePath !== "global" ? _basePath : undefined;
      const { hashFileContent } = await import("./media-processing.server");

      // For large files, we use the stream to avoid OOM
      if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
        // Small file: Buffer is fine and faster for small items
        let buffer = Buffer.from(await file.arrayBuffer());

        // Binary MIME sniffing as defense-in-depth
        const sniffed = sniffMimeType(buffer.subarray(0, 2048));
        const effectiveType = file.type || sniffed?.mime || "application/octet-stream";

        // 🛡️ SVG Sanitization: strip scripts, event handlers, and foreignObject before storage
        if (isSvgFile(effectiveType, file.name)) {
          const raw = buffer.toString("utf-8");
          const sanitized = sanitizeSvg(raw);
          buffer = Buffer.from(sanitized, "utf-8");
        }

        const hash = await hashFileContent(buffer);
        const relPath = await this.ensureOriginalOnDisk(hash, file.name, buffer, tenantId);

        // Extract image dimensions + generate derivatives for image files
        let imageMetadata: Record<string, unknown> = {};
        let imageThumbnails: Record<string, unknown> = {};
        let imageVariants: ImageVariant[] = [];
        if (effectiveType.startsWith("image/") && !isSvgFile(effectiveType, file.name)) {
          try {
            const sharpMod = await import("sharp");
            const sharp: SharpFactory = (sharpMod.default || sharpMod) as SharpFactory;
            const imgMeta = await sharp(buffer).metadata();
            if (imgMeta.width) imageMetadata.width = imgMeta.width;
            if (imgMeta.height) imageMetadata.height = imgMeta.height;
            const dotIdx = file.name.lastIndexOf(".");
            const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
            const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1).toLowerCase() : "jpg";
            imageThumbnails = await saveResizedImages(
              buffer,
              hash,
              baseName,
              ext,
              tenantId || "global",
            );

            // 🚀 Generate responsive image variants (resilient — original already saved)
            try {
              imageVariants = await processImageWithPresets(
                buffer,
                hash,
                ["thumbnail", "card", "default"],
                tenantId,
              );
              if (imageVariants.length > 0) {
                logger.info("[Media] Responsive variants generated", {
                  hash: hash.slice(0, 12),
                  count: imageVariants.length,
                });
              }
            } catch (variantErr) {
              logger.warn("[Media] Responsive variant generation failed — original intact", {
                error: variantErr instanceof Error ? variantErr.message : String(variantErr),
              });
              // Continue — the original file is already saved and users can still access it.
            }
          } catch (e) {
            logger.warn("[Media] Derivative generation skipped", e);
          }
        }

        // 1. Check for existing file by hash (Deduplication)
        const existing = await this.files.getByHash(hash, {
          tenantId: tenantId ?? undefined,
        });
        if (existing.success && existing.data) {
          const record = existing.data;
          const patch: Record<string, unknown> = {};
          if (record.path !== relPath) patch.path = relPath;
          if (folderId !== record.folderId) patch.folderId = folderId;
          if (Object.keys(patch).length > 0) {
            await this.db.crud.update(
              "media_items",
              record._id,
              patch as unknown as EntityUpdate<DbMediaItem>,
            );
            Object.assign(record, patch);
          }
          return {
            success: true,
            data: this.enrichMediaWithUrl(
              record as unknown as EnrichableRecord,
            ) as unknown as MediaItem,
          };
        }
        const recordMetadata =
          imageVariants.length > 0
            ? {
                ...imageMetadata,
                imageVariants: imageVariants.map((v) => ({
                  preset: v.preset,
                  width: v.width,
                  height: v.height,
                  format: v.format,
                  quality: v.quality,
                  path: v.path,
                  size: v.size,
                })),
              }
            : imageMetadata;
        return (await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: file.type,
            size: file.size,
            hash,
            path: relPath,
            createdBy: _userId as DatabaseId,
            updatedBy: _userId as DatabaseId,
            metadata: recordMetadata,
            thumbnails: imageThumbnails,
            access: _access,
            folderId,
            tenantId: tenantId ?? undefined,
          } as unknown as EntityCreate<DbMediaItem>,
          { tenantId: tenantId ?? undefined },
        )) as unknown as DatabaseResult<MediaItem>;
      } else {
        // Large file: Stream it!
        // MIME sniffing for large files — read first 2048 bytes for validation
        const headerBuffer =
          typeof (file as File).slice === "function"
            ? Buffer.from(await (file as File).slice(0, 2048).arrayBuffer())
            : null;

        // 🛡️ Fail-closed: if we cannot sniff the header (no slice support and no
        // fallback), refuse the upload so we never silently pass the MIME check.
        if (!headerBuffer || headerBuffer.length === 0) {
          throw new Error(
            "Cannot validate file type: file object does not support slicing for header inspection",
          );
        }

        const sniffedLarge = sniffMimeType(headerBuffer);
        if (
          sniffedLarge &&
          sniffedLarge.mime !== "application/octet-stream" &&
          file.type &&
          sniffedLarge.mime.split("/")[0] !== file.type.split("/")[0]
        ) {
          throw new Error(
            `MIME type mismatch: client sent "${file.type}", binary signature indicates "${sniffedLarge.mime}"`,
          );
        }

        // We tee the stream: one for hashing, one for uploading
        const { hashStream } = await import("./media-processing.server");

        const stream = file.stream();
        const [s1, s2] = stream.tee();

        // Start hashing in parallel
        const hashPromise = hashStream(s1);

        // We need the hash for deduplication, so we have to wait for it
        // OR we upload to a temp name and then rename.
        // For Performance Tweaks, let's assume we want to avoid double-upload.
        const hash = await hashPromise;
        const relPath = await this.ensureOriginalOnDisk(hash, file.name, s2, tenantId);

        const existing = await this.files.getByHash(hash, {
          tenantId: tenantId ?? undefined,
        });
        if (existing.success && existing.data) {
          const record = existing.data;
          const patch: Record<string, unknown> = {};
          if (record.path !== relPath) patch.path = relPath;
          if (folderId !== record.folderId) patch.folderId = folderId;
          if (Object.keys(patch).length > 0) {
            await this.db.crud.update(
              "media_items",
              record._id,
              patch as unknown as EntityUpdate<DbMediaItem>,
            );
            Object.assign(record, patch);
          }
          return {
            success: true,
            data: this.enrichMediaWithUrl(
              record as unknown as EnrichableRecord,
            ) as unknown as MediaItem,
          };
        }

        const uploadResult = await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: file.type,
            size: file.size,
            hash,
            path: relPath,
            createdBy: _userId as DatabaseId,
            updatedBy: _userId as DatabaseId,
            metadata: {},
            thumbnails: {},
            access: _access,
            folderId,
            tenantId: tenantId ?? undefined,
          } as unknown as EntityCreate<DbMediaItem>,
          { tenantId: tenantId ?? undefined },
        );

        // For large streamed files, try variant generation by re-reading from storage.
        // This is fire-and-forget: failure does not affect the upload response.
        if (
          file.type.startsWith("image/") &&
          !isSvgFile(file.type, file.name) &&
          uploadResult.success
        ) {
          this.generateVariantsForStreamedFile(
            hash,
            relPath,
            file.type,
            file.name,
            uploadResult as unknown as DatabaseResult<MediaItem>,
            tenantId,
          );
        }

        return uploadResult as unknown as DatabaseResult<MediaItem>;
      }
    } catch (err: unknown) {
      this.mapFileSystemError(err);
      const e = err as Error;
      return {
        success: false,
        message: e.message,
        error: err as DatabaseError,
      };
    }
  }

  /**
   * Enriches a media item with a full URL including optional tenant prefix.
   */
  public enrichMediaWithUrl(item: EnrichableRecord, prefix?: string): EnrichableRecord {
    if (!item) return item;

    const rel = resolveMediaRelPath(item as unknown as Record<string, unknown>);
    const p: string | undefined = rel || item.path || item.url;
    if (p && !p.startsWith("http")) {
      item.url = getUrl(p, prefix);
    }

    // Process thumbnails
    if (item.thumbnails) {
      for (const key in item.thumbnails) {
        const thumb = item.thumbnails[key];
        if (thumb && (thumb.path || thumb.url)) {
          thumb.url = getUrl((thumb.path || thumb.url) as string, prefix);
        }
      }
    }

    // Process versions from metadata
    if (item.metadata?.versions) {
      item.versions = item.metadata.versions.map((v: Record<string, unknown>) => {
        const enriched = { ...v };
        if (enriched.path && (!enriched.url || !(enriched.url as string).startsWith("http"))) {
          enriched.url = getUrl(enriched.path as string, prefix);
        }
        return enriched;
      }) as unknown[];
    } else {
      item.versions = [];
    }

    // Process responsive image variants from metadata
    if (item.metadata?.imageVariants) {
      const enrichedVariants = (item.metadata.imageVariants as ImageVariant[]).map(
        (v: ImageVariant) => ({
          ...v,
          url: getUrl(v.path, prefix),
        }),
      );
      // Rebuild thumbnails entries for the variant paths so mediaUrl() can resolve them
      for (const variant of enrichedVariants) {
        const thumbKey = `${variant.preset}-${variant.width}`;
        if (!item.thumbnails?.[thumbKey]) {
          if (!item.thumbnails) item.thumbnails = {};
          (item.thumbnails as Record<string, any>)[thumbKey] = {
            url: variant.url,
            width: variant.width,
            height: variant.height,
          };
        }
      }
    }

    return item;
  }

  public async saveRemoteMedia(
    url: string,
    userId: string,
    access: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      validateEgressUrl(url, {
        allowHttp: process.env.NODE_ENV === "development",
      });
      const resp = await safeFetch(url, {
        timeoutMs: 30000,
        maxSizeBytes: 100 * 1024 * 1024,
      });
      if (!resp.success || !resp.body || (resp.status && resp.status >= 400))
        throw new Error(`Failed to fetch remote media: ${resp.error || resp.status}`);

      // Read real MIME from response headers instead of hardcoding
      const remoteMime = resp.headers?.["content-type"] || "application/octet-stream";
      const blob = new Blob([resp.body], { type: remoteMime });
      const name = url.split("/").pop() || "remote-file";
      const file = new File([blob], name, { type: blob.type });

      return await this.saveMedia(file, userId, access as "public" | "private", tenantId);
    } catch (err: unknown) {
      this.mapFileSystemError(err);
      const e = err as Error;
      return {
        success: false,
        message: e.message,
        error: err as DatabaseError,
      };
    }
  }

  public async updateMedia(
    mediaId: string,
    data: Record<string, unknown>,
    tenantId?: DatabaseId | null,
  ): Promise<void> {
    const res = await this.db.crud.update("media", mediaId as DatabaseId, data, {
      tenantId: tenantId ?? undefined,
    });
    if (!res.success) throw new Error(res.message);
  }

  public async deleteMedia(fileId: string, tenantId?: DatabaseId | null): Promise<void> {
    // Fetch the media record before deletion to get the hash for variant cleanup
    try {
      const existing = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: fileId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (existing.success && existing.data?.hash) {
        // Clean up responsive image variants asynchronously
        const { deleteAllVariants } = await import("@src/services/media/image-variant-storage");
        deleteAllVariants(existing.data.hash, tenantId?.toString()).catch((err) => {
          logger.warn("[Media] Variant cleanup failed during delete", {
            fileId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch {
      // Ignore errors during pre-delete lookup — the actual delete should still proceed
    }

    const res = await this.files.delete(fileId as DatabaseId, {
      tenantId: tenantId ?? undefined,
    });
    if (!res.success) throw new Error(res.message);
  }

  public async manipulateMedia(
    id: string,
    manipulations: MediaManipulation,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem> {
    const { hashFileContent } = await import("./media-processing.server");
    const sharpMod = await import("sharp");
    const sharp: SharpFactory = (sharpMod.default || sharpMod) as SharpFactory;

    // 1. Load existing record
    const res = await this.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: id as DatabaseId },
      { tenantId: tenantId ?? undefined },
    );
    if (!res.success || !res.data) throw new Error("Media not found");
    const existing = res.data;

    // 2. Read original file + get dimensions once (reused by blur/watermark)
    const originalBuffer = await getFile(existing.path);
    const meta = await sharp(originalBuffer).metadata();
    const imgW = meta.width ?? 1;
    const imgH = meta.height ?? 1;

    const {
      rotation,
      flipH,
      flipV,
      crop,
      filters,
      blurRegions,
      watermarks,
      annotations,
      saveBehavior,
    } = manipulations;

    // 3. Build Sharp pipeline — order matters: geometry first, then colour, then composites
    let pipeline = sharp(originalBuffer, { failOn: "none" });

    // — Geometry —
    if (rotation) pipeline = pipeline.rotate(rotation);
    if (flipH) pipeline = pipeline.flop();
    if (flipV) pipeline = pipeline.flip();

    // After rotation the canvas dimensions may swap — re-read them from the intermediate buffer
    let postRotW = imgW;
    let postRotH = imgH;
    if (rotation || flipH || flipV) {
      const rotBuf = await pipeline.clone().toBuffer();
      const rotMeta = await sharp(rotBuf).metadata();
      postRotW = rotMeta.width ?? imgW;
      postRotH = rotMeta.height ?? imgH;
    }

    // Clamp crop to the post-rotation canvas so Sharp never gets an out-of-bounds extract
    const cropX =
      crop && crop.width > 0 && crop.height > 0
        ? Math.min(Math.max(0, Math.round(crop.x)), postRotW - 1)
        : 0;
    const cropY =
      crop && crop.width > 0 && crop.height > 0
        ? Math.min(Math.max(0, Math.round(crop.y)), postRotH - 1)
        : 0;

    // Working dimensions after crop (used to clamp/size all composites)
    const workW =
      crop && crop.width > 0 ? Math.min(Math.round(crop.width), postRotW - cropX) : postRotW;
    const workH =
      crop && crop.height > 0 ? Math.min(Math.round(crop.height), postRotH - cropY) : postRotH;

    if (crop && crop.width > 0 && crop.height > 0) {
      pipeline = pipeline.extract({
        left: cropX,
        top: cropY,
        width: workW,
        height: workH,
      });

      if (crop.shape === "circle") {
        // Build circular alpha mask as raw RGBA pixels — no librsvg dependency
        const cx = workW / 2;
        const cy = workH / 2;
        const rx = workW / 2;
        const ry = workH / 2;
        const maskPixels = Buffer.alloc(workW * workH * 4, 0);
        for (let y = 0; y < workH; y++) {
          for (let x = 0; x < workW; x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            const inside = dx * dx + dy * dy <= 1;
            const idx = (y * workW + x) * 4;
            maskPixels[idx] = maskPixels[idx + 1] = maskPixels[idx + 2] = 255;
            maskPixels[idx + 3] = inside ? 255 : 0;
          }
        }
        const circleMask = await sharp(maskPixels, {
          raw: { width: workW, height: workH, channels: 4 },
        })
          .png()
          .toBuffer();
        pipeline = pipeline.ensureAlpha().composite([{ input: circleMask, blend: "dest-in" }]);
      }
    }

    // — Colour filters —
    if (filters) {
      const {
        brightness = 0,
        contrast = 0,
        saturation = 0,
        grayscale = 0,
        sepia = 0,
        temperature = 0,
      } = filters;

      // Brightness + saturation via modulate
      if (brightness !== 0 || saturation !== 0) {
        pipeline = pipeline.modulate({
          brightness: Math.max(0, 1 + brightness / 100),
          saturation: Math.max(0, 1 + saturation / 100),
        });
      }

      // Contrast via linear transform
      if (contrast !== 0) {
        const f = (259 * (contrast + 255)) / (255 * (259 - contrast));
        pipeline = pipeline.linear(f, -(128 * f) + 128);
      }

      // Grayscale (full desaturate)
      if (grayscale > 0) pipeline = pipeline.grayscale();

      // Sepia via colour matrix blend — partial sepia based on strength (0–100)
      if (sepia > 0) {
        const s = Math.min(sepia, 100) / 100;
        pipeline = pipeline.recomb([
          [0.393 * s + 1 * (1 - s), 0.769 * s, 0.189 * s],
          [0.349 * s, 0.686 * s + 1 * (1 - s), 0.168 * s],
          [0.272 * s, 0.534 * s, 0.131 * s + 1 * (1 - s)],
        ]);
      }

      // Temperature: warm (+) boosts red/reduces blue, cool (-) the reverse
      if (temperature !== 0) {
        const t = temperature / 100;
        pipeline = pipeline.recomb([
          [1 + t * 0.2, 0, 0],
          [0, 1, 0],
          [0, 0, 1 - t * 0.2],
        ]);
      }
    }

    // 4. Collect composites (blur regions + watermarks + annotations rendered as SVG)
    const composites: SharpOverlayOptions[] = [];

    // — Blur regions (coordinates are in original image space — offset by crop origin) —
    if (Array.isArray(blurRegions) && blurRegions.length > 0) {
      for (const region of blurRegions) {
        const rx = Math.max(0, Math.round(region.x));
        const ry = Math.max(0, Math.round(region.y));
        const rw = Math.min(Math.round(region.width), imgW - rx);
        const rh = Math.min(Math.round(region.height), imgH - ry);
        if (rw <= 0 || rh <= 0) continue;
        // Composite position is relative to the post-crop canvas
        const compositeLeft = Math.max(0, rx - cropX);
        const compositeTop = Math.max(0, ry - cropY);
        if (compositeLeft >= workW || compositeTop >= workH) continue;
        const blurBuf = await sharp(originalBuffer)
          .extract({ left: rx, top: ry, width: rw, height: rh })
          .blur(Math.max(0.3, (region.strength ?? 20) * 0.5))
          .toBuffer();
        composites.push({
          input: blurBuf,
          left: compositeLeft,
          top: compositeTop,
          blend: "over",
        });
      }
    }

    // — Watermarks —
    const escXml = (s: string) =>
      s.replace(
        /[<>&"]/g,
        (c: string) =>
          (
            ({
              "<": "&lt;",
              ">": "&gt;",
              "&": "&amp;",
              '"': "&quot;",
            }) as Record<string, string>
          )[c] ?? c,
      );

    if (Array.isArray(watermarks) && watermarks.length > 0) {
      for (const wm of watermarks) {
        if (wm.type === "text" && wm.text) {
          // 🛡️ Validate user-supplied SVG attributes against safe patterns
          const fontSize = guardNumeric(Math.round(wm.fontSize ?? 48), 48);
          const color = guardAttr(wm.color ?? "#ffffff", SAFE_COLOR, "#ffffff");
          const opacity = Math.round((wm.opacity ?? 0.8) * 255)
            .toString(16)
            .padStart(2, "0");
          const left = Math.max(0, Math.round(wm.x) - cropX);
          const top = Math.max(0, Math.round(wm.y) - cropY);
          const svgText = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${workW}" height="${workH}">` +
              `<text x="${left}" y="${top + fontSize}" font-size="${fontSize}" fill="${color}${opacity}" font-family="sans-serif">${escXml(wm.text)}</text>` +
              `</svg>`,
          );
          composites.push({ input: svgText, top: 0, left: 0, blend: "over" });
        } else if (wm.type === "image" && wm.imageUrl) {
          try {
            const wmLeft = Math.max(0, Math.round(wm.x) - cropX);
            const wmTop = Math.max(0, Math.round(wm.y) - cropY);
            const wmW = Math.min(Math.round(wm.width ?? 100), workW - wmLeft);
            const wmH = Math.min(Math.round(wm.height ?? 100), workH - wmTop);
            if (wmW > 0 && wmH > 0) {
              const wmBuf = await sharp(Buffer.from(wm.imageUrl.split(",")[1] ?? "", "base64"))
                .resize(wmW, wmH, { fit: "contain" })
                .ensureAlpha()
                .toBuffer();
              composites.push({
                input: wmBuf,
                left: wmLeft,
                top: wmTop,
                blend: "over",
              });
            }
          } catch {
            logger.warn(`[manipulateMedia] Skipping invalid watermark image`);
          }
        }
      }
    }

    // — Annotations rendered as SVG overlay (crop-relative coordinates) —
    if (Array.isArray(annotations) && annotations.length > 0) {
      const shapes = annotations
        .map((a: Annotation) => {
          // 🛡️ Validate user-supplied SVG attributes against safe patterns
          const stroke = guardAttr(a.stroke ?? "#ff0000", SAFE_COLOR, "#ff0000");
          const fill = a.fill === "none" ? "none" : guardAttr(a.fill ?? "none", SAFE_COLOR, "none");
          const sw = guardNumeric(a.strokeWidth ?? 2, 2);
          const ax = (a.x ?? 0) - cropX;
          const ay = (a.y ?? 0) - cropY;
          switch (a.type) {
            case "rect":
              return `<rect x="${ax}" y="${ay}" width="${a.width ?? 50}" height="${a.height ?? 50}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
            case "circle":
              return `<circle cx="${ax}" cy="${ay}" r="${a.radius ?? 25}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
            case "text":
              return `<text x="${ax}" y="${ay}" font-size="${guardNumeric(a.fontSize ?? 20, 20)}" fill="${stroke}" font-family="sans-serif">${escXml(String(a.text ?? ""))}</text>`;
            case "arrow":
            case "line":
              return `<line x1="${ax}" y1="${ay}" x2="${ax + (a.width ?? 50)}" y2="${ay + (a.height ?? 0)}" stroke="${stroke}" stroke-width="${sw}"/>`;
            default:
              return "";
          }
        })
        .filter(Boolean)
        .join("\n");

      if (shapes) {
        const svgOverlay = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${workW}" height="${workH}">${shapes}</svg>`,
        );
        composites.push({ input: svgOverlay, top: 0, left: 0, blend: "over" });
      }
    }

    if (composites.length > 0) pipeline = pipeline.composite(composites);

    // 5. Encode — circular crop forces PNG (needs alpha channel); otherwise preserve original format
    const ext = (existing.filename.split(".").pop() ?? "jpg").toLowerCase();
    const isCircle = crop?.shape === "circle";
    const outputBuffer: Buffer = await (() => {
      if (isCircle || ext === "png") return pipeline.png({ compressionLevel: 8 }).toBuffer();
      if (ext === "webp") return pipeline.webp({ quality: 90 }).toBuffer();
      if (ext === "avif") return pipeline.avif({ quality: 80 }).toBuffer();
      return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    })();

    // 6. Hash, persist, update DB
    // Circular crop outputs PNG — rename file accordingly
    const outputFilename =
      isCircle && !existing.filename.endsWith(".png")
        ? existing.filename.replace(/\.[^.]+$/, ".png")
        : existing.filename;
    const outputMime = isCircle ? "image/png" : existing.mimeType;
    const newHash = await hashFileContent(outputBuffer);
    const relPath = buildOriginalRelPath(newHash, outputFilename);
    await saveFile(outputBuffer, relPath);
    const now = new Date().toISOString();

    if (saveBehavior === "new") {
      const uploadResult = await this.files.upload(
        {
          filename: outputFilename,
          originalFilename: outputFilename,
          mimeType: outputMime,
          size: outputBuffer.byteLength,
          hash: newHash,
          path: relPath,
          createdBy: userId,
          updatedBy: userId,
          metadata: { versions: [] },
          thumbnails: {},
          access: existing.access || "public",
          folderId: existing.folderId ?? undefined,
          originalId: id,
          tenantId: tenantId ?? undefined,
        } as unknown as EntityCreate<DbMediaItem>,
        { tenantId: tenantId ?? undefined },
      );
      if (!uploadResult.success || !uploadResult.data)
        throw new Error("Failed to create new media record");
      return this.enrichMediaWithUrl(
        uploadResult.data as unknown as EnrichableRecord,
      ) as unknown as MediaItem;
    }

    // overwrite: push current file to version history, update record in place
    const versions = (existing.metadata?.versions as MediaVersionEntry[] | undefined) || [];
    await this.updateMedia(
      id,
      {
        hash: newHash,
        path: relPath,
        size: outputBuffer.byteLength,
        thumbnails: {},
        updatedBy: userId,
        updatedAt: now,
        metadata: {
          ...existing.metadata,
          versions: [
            ...versions,
            {
              version: versions.length + 1,
              url: (existing as unknown as EnrichableRecord).url || "",
              path: (existing as unknown as EnrichableRecord).path,
              hash: (existing as unknown as EnrichableRecord).hash,
              size: (existing as unknown as EnrichableRecord).size,
              filename: (existing as unknown as EnrichableRecord).filename,
              mimeType: (existing as unknown as EnrichableRecord).mimeType,
              createdAt:
                (existing as unknown as EnrichableRecord).updatedAt ||
                (existing as unknown as EnrichableRecord).createdAt ||
                now,
              createdBy:
                (existing as unknown as EnrichableRecord).updatedBy ||
                (existing as unknown as EnrichableRecord).createdBy ||
                userId,
              action: "edit",
            },
          ],
        },
      },
      tenantId,
    );

    const finalRes = await this.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: id as DatabaseId },
      { tenantId: tenantId ?? undefined },
    );
    if (!finalRes.success || !finalRes.data) throw new Error("Failed to retrieve updated media");
    return this.enrichMediaWithUrl(
      finalRes.data as unknown as EnrichableRecord,
    ) as unknown as MediaItem;
  }

  public async batchProcessImages(
    ids: string[],
    config: MediaManipulation,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem[]> {
    const results: MediaItem[] = [];
    for (const id of ids) {
      try {
        const res = await this.manipulateMedia(id, config, userId, tenantId);
        results.push(res);
      } catch (err) {
        logger.error(`Batch processing failed for ${id}:`, err);
      }
    }
    return results;
  }

  /**
   * Determine media category from MIME type.
   * Delegates to the canonical `mediaTypeFromMime` helper in media-models.
   */
  public getMediaType(mime: string): "image" | "video" | "audio" | "document" {
    return mediaTypeFromMime(mime) as "image" | "video" | "audio" | "document";
  }

  /**
   * Returns all collection entries referencing a specific mediaId.
   * Uses the in-memory reverse-index for O(1) lookups after an initial
   * O(n) rebuild on first access or after cache invalidation.
   */
  public async getMediaReferences(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaReference[]> {
    try {
      // Rebuild once per cache lifetime — empty refs for an unknown mediaId
      // must NOT re-scan all collections (caused OOM on DELETE nonexistent).
      if (!this.referenceIndex.isBuilt()) {
        await this.rebuildReferenceIndex(tenantId);
      }
      return this.enrichReferences(this.referenceIndex.getReferences(mediaId));
    } catch (err) {
      logger.error(`[MediaService] Error scanning usage references:`, err);
      return [];
    }
  }

  /**
   * Checks if a media item is referenced by any published content entries.
   * Uses the in-memory reverse-index for fast lookups.
   */
  public async isReferencedByPublishedContent(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<{ referenced: boolean; references: MediaReference[] }> {
    try {
      const references = await this.getPublishedReferences(mediaId, tenantId);
      return {
        referenced: references.length > 0,
        references,
      };
    } catch (err) {
      logger.error(`[MediaService] Error checking published references:`, err);
      return { referenced: false, references: [] };
    }
  }

  /**
   * Returns all published collection entries that reference a specific mediaId.
   * Uses the in-memory reverse-index — rebuilds on first access or after invalidation.
   */
  public async getPublishedReferences(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaReference[]> {
    try {
      if (!this.referenceIndex.isBuilt()) {
        await this.rebuildReferenceIndex(tenantId);
      }
      // Filter to published-only references by checking the status map
      const allRefs = this.referenceIndex.getReferences(mediaId);
      return this.enrichReferences(
        allRefs.filter((ref) => this.entryStatusMap.get(ref.entryId) === "publish"),
      );
    } catch (err) {
      logger.error(`[MediaService] Error scanning published references:`, err);
      return [];
    }
  }

  /**
   * 🛡️ Recursively checks whether `val` references the given mediaId or path.
   * Uses a WeakSet to detect circular references so malicious or malformed
   * payloads cannot cause infinite recursion.
   */
  private isMediaReferencedInValue(
    val: unknown,
    mediaId: string,
    path: string,
    seen: WeakSet<object> = new WeakSet(),
  ): boolean {
    if (val === mediaId || (path && val === path)) {
      return true;
    }
    if (Array.isArray(val)) {
      return val.some((item) => this.isMediaReferencedInValue(item, mediaId, path, seen));
    }
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      // 🛡️ Circular reference guard — stop recursion when we encounter a seen object
      if (seen.has(val)) return false;
      seen.add(val);

      if (
        obj._id === mediaId ||
        obj.id === mediaId ||
        (path && (obj.path === path || obj.url === path))
      ) {
        return true;
      }
      return Object.values(obj).some((item: unknown) =>
        this.isMediaReferencedInValue(item, mediaId, path, seen),
      );
    }
    if (typeof val === "string") {
      return val.includes(mediaId) || !!(path && val.includes(path));
    }
    return false;
  }

  /**
   * Rebuilds the in-memory reference index by scanning all collection entries.
   */
  private async rebuildReferenceIndex(tenantId?: DatabaseId | null): Promise<void> {
    const { scanCompiledCollections } = await import("@src/content/engine.server");
    const schemas = await scanCompiledCollections();
    const allEntries: Array<{
      collectionId: string;
      collectionName: string;
      entryId: string;
      data: Record<string, unknown>;
      status?: string;
    }> = [];

    for (const schema of schemas) {
      const collectionName = `collection_${schema._id}`;
      const collectionLabel = schema.name || schema._id || "";
      try {
        const res = await this.db.crud.findMany(
          collectionName,
          {},
          { tenantId: tenantId ?? undefined },
        );
        if (res.success && Array.isArray(res.data)) {
          for (const entry of res.data) {
            const entryAny = entry as unknown as Record<string, unknown>;
            const entryId = entryAny._id?.toString() ?? "";
            allEntries.push({
              collectionId: schema._id ?? "",
              collectionName: collectionLabel,
              entryId,
              data: entryAny,
              status: entryAny.status as string | undefined,
            });
            const entryName =
              entryAny.name || entryAny.title || entryAny.slug || entryAny._id || entryId;
            this.entryNameMap.set(entryId, String(entryName));
            if (entryAny.status) {
              this.entryStatusMap.set(entryId, entryAny.status as string);
            }
          }
        }
      } catch (err) {
        logger.error(`[MediaService] Error scanning ${collectionName} for references:`, err);
      }
    }
    this.referenceIndex.rebuild(allEntries);
    // Even with zero entries, mark built so empty lookups stay O(1)
    this.referenceIndex.markBuilt();
  }

  /** Enrich index references with legacy fields for backward compatibility. */
  private enrichReferences(refs: MediaReference[]): MediaReference[] {
    for (const ref of refs) {
      ref.fieldName = ref.fieldPath.split(".")[0] || ref.fieldPath;
      ref.entryName = this.entryNameMap.get(ref.entryId) || ref.entryId;
    }
    return refs;
  }

  /** Manually clear the reference-index cache. */
  public invalidateReferenceCache(): void {
    this.referenceIndex.clear();
    this.entryStatusMap.clear();
    this.entryNameMap.clear();
  }

  /**
   * Uploads a new version of an existing file.
   * Keeps the same mediaId, stores the old file parameters in versions history,
   * uploads the new file to physical storage, and updates the active DB record.
   */
  public async uploadNewVersion(
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
      // 1. Get the existing media record
      const res = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (!res.success || !res.data) {
        throw new Error("Original media item not found");
      }
      const existing = res.data;

      // 2. Upload the new file to storage
      // To bypass hash deduplication returning the existing record, we can temporarily save
      // the file under a new hash/path.
      const { hashFileContent } = await import("./media-processing.server");
      let hash = "";
      let buffer: Buffer | null = null;
      if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
        buffer = Buffer.from(await file.arrayBuffer());
        hash = await hashFileContent(buffer);
      } else {
        const { hashStream } = await import("./media-processing.server");
        const [s1] = file.stream().tee();
        hash = await hashStream(s1);
      }

      // Generate responsive variants for small files (buffer available)
      let versionVariants: ImageVariant[] = [];
      if (buffer && file.type.startsWith("image/") && !isSvgFile(file.type, file.name)) {
        try {
          const { processImageWithPresets } = await import("@src/services/media/image-processor");
          versionVariants = await processImageWithPresets(
            buffer,
            hash,
            ["thumbnail", "card", "default"],
            tenantId,
          );
          if (versionVariants.length > 0) {
            logger.info("[Media] Variants generated for version upload", {
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

      const versionMetadata =
        versionVariants.length > 0
          ? {
              imageVariants: versionVariants.map((v) => ({
                preset: v.preset,
                width: v.width,
                height: v.height,
                format: v.format,
                quality: v.quality,
                path: v.path,
                size: v.size,
              })),
            }
          : {};

      // Check if hash is exactly the same as current: if so, no-op or proceed.
      const uploadRes = await this.files.upload(
        {
          filename: file.name,
          originalFilename: file.name,
          mimeType: file.type,
          size: file.size,
          hash,
          path: buildOriginalRelPath(hash, file.name),
          createdBy: userId,
          updatedBy: userId,
          metadata: versionMetadata,
          thumbnails: {},
          access: existing.access || "public",
          tenantId: tenantId ?? undefined,
          stream: typeof file.stream === "function" ? file.stream.bind(file) : undefined,
          arrayBuffer:
            typeof file.arrayBuffer === "function" ? file.arrayBuffer.bind(file) : undefined,
        } as unknown as EntityCreate<DbMediaItem>,
        { tenantId: tenantId ?? undefined },
      );

      if (!uploadRes.success || !uploadRes.data) {
        const errMsg =
          !uploadRes.success && uploadRes.error
            ? String(uploadRes.error.message || uploadRes.error)
            : "Failed to upload new version file";
        throw new Error(errMsg);
      }
      const uploadedFile = uploadRes.data;

      // 3. Create version record from the OLD properties
      const existingR = existing as unknown as EnrichableRecord;
      const versions = (existingR.metadata?.versions as MediaVersionEntry[] | undefined) || [];
      const newVersionNum = versions.length + 1;
      const oldVersionEntry = {
        version: newVersionNum,
        url: existingR.url || "",
        path: existingR.path || "",
        hash: existingR.hash || "",
        size: existingR.size ?? 0,
        filename: existingR.filename || "",
        mimeType: existingR.mimeType || "",
        createdAt: existingR.updatedAt || existingR.createdAt || new Date().toISOString(),
        createdBy: existingR.updatedBy || existingR.createdBy || userId,
        action: "replace",
      };

      // Push old version to the history array
      const updatedVersions = [...versions, oldVersionEntry];

      // 4. Update the existing database record with the new file properties
      const updatedMetadata = {
        ...(existingR.metadata as Record<string, unknown>),
        versions: updatedVersions,
      };

      const updateData = {
        filename: file.name,
        originalFilename: file.name,
        mimeType: file.type,
        size: file.size,
        hash: uploadedFile.hash,
        path: uploadedFile.path,
        thumbnails: uploadedFile.thumbnails || {},
        metadata: updatedMetadata,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.updateMedia(mediaId, updateData, tenantId);

      // Return the updated media item enriched
      const finalRes = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (finalRes.success && finalRes.data) {
        return {
          success: true,
          data: this.enrichMediaWithUrl(
            finalRes.data as unknown as EnrichableRecord,
          ) as unknown as MediaItem,
        };
      }
      throw new Error("Failed to retrieve updated media item");
    } catch (err: unknown) {
      this.mapFileSystemError(err);
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
  public async restoreVersion(
    mediaId: string,
    versionNumber: number,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      // 1. Get the media item
      const res = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (!res.success || !res.data) {
        throw new Error("Media item not found");
      }
      const existingR = res.data as unknown as EnrichableRecord;

      const versions = (existingR.metadata?.versions as MediaVersionEntry[] | undefined) || [];
      const targetVersion = versions.find((v: MediaVersionEntry) => v.version === versionNumber);
      if (!targetVersion) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      // 2. Create a version entry from the CURRENT active state
      const currentVersionNum = versions.length + 1;
      const currentVersionEntry = {
        version: currentVersionNum,
        url: existingR.url || "",
        path: existingR.path || "",
        hash: existingR.hash || "",
        size: existingR.size ?? 0,
        filename: existingR.filename || "",
        mimeType: existingR.mimeType || "",
        createdAt: existingR.updatedAt || existingR.createdAt || new Date().toISOString(),
        createdBy: existingR.updatedBy || existingR.createdBy || userId,
        action: "restore",
      };

      // 3. Update the active record to point back to the restored version
      const updatedVersions = [...versions, currentVersionEntry];
      const updatedMetadata = {
        ...(existingR.metadata as Record<string, unknown>),
        versions: updatedVersions,
      };

      const updateData = {
        filename: targetVersion.filename || existingR.filename,
        originalFilename: targetVersion.filename || existingR.filename,
        mimeType: targetVersion.mimeType || existingR.mimeType,
        size: targetVersion.size || existingR.size,
        hash: targetVersion.hash,
        path: targetVersion.path,
        metadata: updatedMetadata,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.updateMedia(mediaId, updateData, tenantId);

      const finalRes = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (finalRes.success && finalRes.data) {
        return {
          success: true,
          data: this.enrichMediaWithUrl(
            finalRes.data as unknown as EnrichableRecord,
          ) as unknown as MediaItem,
        };
      }
      throw new Error("Failed to retrieve restored media item");
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
}
