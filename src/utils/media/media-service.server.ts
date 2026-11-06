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
import { nowISODateString } from "@src/utils/date";
import { AppError, raise } from "@utils/error-handling";
import {
  fileExists,
  getFile,
  saveFile,
  saveResizedImages,
  buildDocumentPreview,
} from "./media-storage.server";
import {
  processImageWithPresets,
  MAX_OUTPUT_DIMENSION,
  type ImageVariant,
} from "@src/services/media/image-processor";
import type sharp from "sharp";
import { deleteAllVariants } from "@src/services/media/image-variant-storage";
import type {
  IDBAdapter,
  CmsMediaMetadata,
  DatabaseError,
  DatabaseId,
  DatabaseResult,
  MediaItem as DbMediaItem,
  EntityCreate,
  EntityUpdate,
} from "@src/databases/db-interface";
import { normalizeFocalPercent } from "./focal-point";
import { MediaProcessingStatus, mediaTypeFromMime, type MediaItem } from "./media-models";
import {
  buildOriginalRelPath,
  clampManipulatedDimensions,
  getMimeType,
  isAllowedUploadMime,
  normalizeMime,
  resolveMediaRelPath,
} from "./media-utils";
import { getUrl } from "./storage-adapters";
import { validateEgressUrl, safeFetch } from "../egress-guard";
import { assertMimeAgreement, resolveRemoteAssetMime, sniffMimeType } from "./slim-sniffer.server";
import { API_MAX_BODY_SIZE_BYTES, bodyTooLargeMessage } from "@utils/api-body-limits";
import { collectionTableName } from "@src/databases/core/collection-name";
import { getSharp, MAX_INPUT_PIXELS } from "./sharp-loader.server";
import type { SharpOverlayOptions } from "./sharp-loader.server";
import { MediaReferenceIndex, type MediaReference } from "./media-reference-index";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { sanitizeSvgMarkup } from "@src/utils/sanitize-html.server";
import { scheduleVariantJob } from "./variant-job-scheduler.server";
import { collectReferencedHashes, isRasterImage } from "./media-lifecycle.server";

/** Cached lazy handle to the engine server — one module-registry lookup instead of one per call. */
let engineServerModulePromise: Promise<typeof import("@src/content/engine.server")> | undefined;
function loadEngineServerModule(): Promise<typeof import("@src/content/engine.server")> {
  return (engineServerModulePromise ??= import("@src/content/engine.server"));
}

/* -------------------------------------------------------------------------- */
/* Security helpers for SVG attribute injection defense                       */
/* -------------------------------------------------------------------------- */

/** Only allow hex colours (#RGB, #RRGGBB, #RRGGBBAA) in dynamically-built SVG. */
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Only allow plain numeric strings (no expressions, no units) in SVG attributes. */
const SAFE_NUMBER = /^-?\d+(\.\d+)?$/;

type SharpPipeline = ReturnType<typeof sharp>;

/** One encoder configuration for manipulated output and the optional cap pass. */
function encodeManipulatedOutput(
  pipeline: SharpPipeline,
  ext: string,
  isCircle: boolean,
): Promise<Buffer> {
  if (isCircle || ext === "png") return pipeline.png({ compressionLevel: 8 }).toBuffer();
  if (ext === "webp") return pipeline.webp({ quality: 90 }).toBuffer();
  if (ext === "avif") return pipeline.avif({ quality: 80 }).toBuffer();
  return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

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
 * 🛡️ SVG sanitizer — parser-based allowlist (`sanitizeSvgMarkup`).
 *
 * The htmlparser2 tree walk drops `script`, `foreignObject`, `iframe`, `object`,
 * `embed`, `style`, `animate`/`set`, every `on*` handler, and any
 * `href`/`xlink:href` whose value is not a same-document `#…` reference.
 * `viewBox` and camelCase SVG element names survive the round-trip.
 *
 * Defense-in-depth: the RichText/Sanitize display pipeline also applies DOMPurify client-side
 */
export function sanitizeSvg(svg: string): string {
  return sanitizeSvgMarkup(svg);
}

function isSvgFile(mimeType: string, filename: string): boolean {
  return mimeType === "image/svg+xml" || filename.toLowerCase().endsWith(".svg");
}

/**
 * Maximum SVG upload size (bytes). SVGs are always fully buffered + sanitized
 * before storage — oversized SVGs are rejected rather than streamed unsanitized
 * (stored-XSS class: large-file streaming used to skip sanitizeSvg).
 */
export const MAX_SVG_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * Same byte ceiling a new API upload uses (`API_MAX_BODY_SIZE_BYTES`).
 * SVG stays on the tighter {@link MAX_SVG_BYTES} cap inside `bufferAndSanitizeSvg`.
 * `byteLength` is the buffered size when `file.size` can under-report.
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
 * Rejects files above MAX_SVG_BYTES to bound memory and block sanitizer bypass.
 */
async function bufferAndSanitizeSvg(file: {
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

function validateMime(mimeType: string, filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && ["html", "js", "wasm"].includes(ext)) throw new Error("Blocked: ." + ext);
  if (!mimeType) return; // sniff + allowlist run after magic-byte inspection
  const normalized = normalizeMime(mimeType);
  if (!normalized || normalized === "application/octet-stream") return;
  if (!isAllowedUploadMime(normalized)) {
    throw new Error("MIME not allowed: " + mimeType);
  }
}

/* -------------------------------------------------------------------------- */
/* Media manipulation options (typed replacement for `any`)                   */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a stored/derived media reference to a storage-relative path.
 * Absolute (CDN) references cannot be probed for existence and yield `null`.
 */
function toStorageRelPath(ref?: string): string | null {
  if (!ref) return null;
  if (ref.startsWith("http://") || ref.startsWith("https://")) return null;
  const stripped = ref.startsWith("/files/") ? ref.slice(7) : ref.replace(/^\/+/, "");
  return stripped.length > 0 ? stripped : null;
}

/** Shape accepted by enrichMediaWithUrl (path/url/thumbnails/metadata/versions). */
interface EnrichableRecord {
  path?: string;
  url?: string;
  thumbnails?: Record<string, { path?: string; url?: string; [key: string]: unknown } | undefined>;
  metadata?: {
    versions?: Array<{ path?: string; url?: string; [key: string]: unknown }>;
    /** Written by the deferred variant job (see generateVariantsForStreamedFile). */
    imageVariants?: Array<ImageVariant & { url?: string }>;
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
  /** Derivative set captured with this version so restore can reinstate it. */
  thumbnails?: Record<string, unknown>;
  imageVariants?: ImageVariant[];
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
  /** Fine-tune sliders — mapped with the same approximations as the canvas preview. */
  exposure?: number;
  highlights?: number;
  shadows?: number;
  clarity?: number;
  vibrance?: number;
  tint?: number;
  sharpness?: number;
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

/* -------------------------------------------------------------------------- */
/* Client update allowlist (mass-assignment defense)                          */
/* -------------------------------------------------------------------------- */

/**
 * Fields a client may write through `PATCH /api/media/:id`.
 *
 * Managed columns are deliberately absent: `_id`, `tenantId`, `createdBy`,
 * `updatedBy`, `createdAt`, `updatedAt`, `storagePath`, `url`, `size`,
 * `mimeType`, `hash`, `isDeleted`, `path`, `bucket`, `provider`, etc. must
 * never be client-writable, whatever the payload claims.
 */
export const MEDIA_UPDATE_FIELDS = [
  "alt",
  "caption",
  "description",
  "tags",
  "title",
  "focalPoint",
  "metadata",
] as const;

/**
 * Keys a client may write inside `metadata`.
 *
 * Includes the editorial/accessibility fields the admin UI edits, the
 * technical fields it round-trips from a read, and the server-owned keys the
 * UI echoes back on save (`imageVariants`, `versions`, `sharedLinks`). The
 * latter are preserved so a normal metadata save never destroys derived data;
 * they are still confined to the metadata blob and can never become columns.
 */
export const MEDIA_UPDATE_METADATA_FIELDS = [
  "advancedMetadata",
  "aiTags",
  "alt",
  "altText",
  "author",
  "camera",
  "caption",
  "codec",
  "copyright",
  "description",
  "dominantColor",
  "duration",
  "exif",
  "focalPoint",
  "format",
  "hasAlpha",
  "hasProfile",
  "height",
  "imageVariants",
  "iptc",
  "keywords",
  "location",
  "name",
  "originalFilename",
  "placeholder",
  "processingError",
  "processingStatus",
  "processingTimeMs",
  "sharedLinks",
  "software",
  "tags",
  "title",
  "uploadTimestamp",
  "uploadedBy",
  "versions",
  "watermarkApplied",
  "width",
  "xmp",
] as const;

const MEDIA_UPDATE_FIELD_SET: ReadonlySet<string> = new Set(MEDIA_UPDATE_FIELDS);
const MEDIA_UPDATE_METADATA_FIELD_SET: ReadonlySet<string> = new Set(MEDIA_UPDATE_METADATA_FIELDS);

/** Prototype-pollution keys are discarded at every depth we walk. */
const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce index-signature values (`unknown`) back to the string/number shape a version entry stores. */
function textOr(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function firstText(...values: unknown[]): string {
  for (const value of values) if (typeof value === "string" && value) return value;
  return "";
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Build a historical version snapshot from the currently active media record. */
function buildVersionSnapshot(
  existing: EnrichableRecord,
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
    thumbnails: (existing.thumbnails as Record<string, unknown>) || {},
    imageVariants: Array.isArray(existing.metadata?.imageVariants)
      ? (existing.metadata.imageVariants as ImageVariant[])
      : [],
  };
}

/**
 * Reduce a client-supplied media PATCH body to the fields the UI actually owns.
 *
 * - Unknown top-level keys (including `tenantId`, `_id`, `storagePath`, `url`)
 *   are dropped, not forwarded.
 * - Prototype-pollution keys are dropped at every walked depth.
 * - `metadata` is validated against the explicit nested allowlist; an unknown
 *   metadata key is a client error (400), never a silent write.
 */
export function sanitizeMediaUpdatePayload(input: unknown): Record<string, unknown> {
  if (!isPlainRecord(input)) {
    raise(400, "Media update payload must be an object", "INVALID_MEDIA_UPDATE");
  }

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (UNSAFE_OBJECT_KEYS.has(key) || !MEDIA_UPDATE_FIELD_SET.has(key)) continue;
    if (key === "metadata") {
      payload.metadata = sanitizeMediaUpdateMetadata(value);
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function sanitizeMediaUpdateMetadata(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    raise(400, "Media metadata must be an object", "INVALID_MEDIA_METADATA");
  }

  const metadata: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    if (!MEDIA_UPDATE_METADATA_FIELD_SET.has(key)) {
      raise(400, `Unsupported media metadata field: ${key}`, "INVALID_MEDIA_METADATA_FIELD");
    }
    // Server-owned pipeline state may be round-tripped but never invented.
    if (key === "processingStatus") {
      if (entry === "processing" || entry === "ready" || entry === "failed") {
        metadata[key] = entry;
      }
      continue;
    }
    if (key === "processingError") {
      if (typeof entry === "string") metadata[key] = entry.slice(0, 500);
      continue;
    }
    metadata[key] = entry;
  }
  return metadata;
}

export interface MediaManipulation {
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  crop?: CropOptions;
  /** Explicit output size (batch resize). Applied after composites so overlay coordinates stay in source space. */
  resize?: { width?: number; height?: number };
  filters?: FilterOptions;
  blurRegions?: BlurRegion[];
  watermarks?: Watermark[];
  annotations?: Annotation[];
  /** Subject point as a percentage of the image, 0–100. Stored on media metadata. */
  focalPoint?: { x: number; y: number };
  saveBehavior?: "overwrite" | "new";
}

/* -------------------------------------------------------------------------- */

export class MediaService {
  private readonly db: IDBAdapter;
  private static hookRegistered = false;
  private registeredHookId: string | null = null;

  /**
   * Re-entrancy guard for the before:delete hook. `deleteMedia()` performs its own
   * crud.delete, which re-fires the hook → deleteMedia → crud.delete → … without a
   * base case. Each level allocates async frames + re-runs variant cleanup, so the
   * recursion grows until the process OOMs. Skipping ids already in flight cuts the
   * loop at the outermost call.
   */
  private static inFlightDeletes = new Set<string>();
  private static contentListenerRegistered = false;

  /**
   * Shared per-tenant in-memory reverse-index for O(1) media-reference lookups.
   * Kept static so per-request `new MediaService(db)` calls reuse the warm index
   * instead of re-scanning all collections and leaking `eventBus` listeners.
   */
  private static tenantIndexState = new Map<
    string,
    {
      referenceIndex: MediaReferenceIndex;
      entryStatusMap: Map<string, string>;
      entryNameMap: Map<string, string>;
      rebuildInflight: Promise<void> | null;
    }
  >();

  private getTenantState(tenantId?: DatabaseId | null) {
    const key = tenantId ? String(tenantId) : "global";
    let state = MediaService.tenantIndexState.get(key);
    if (!state) {
      state = {
        referenceIndex: new MediaReferenceIndex(),
        entryStatusMap: new Map<string, string>(),
        entryNameMap: new Map<string, string>(),
        rebuildInflight: null,
      };
      MediaService.tenantIndexState.set(key, state);
    }
    return state;
  }

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
            if (!id) return;
            const idStr = id.toString();
            // Re-entrancy guard — see inFlightDeletes doc. The hook must not re-enter
            // deleteMedia for the same row while deleteMedia is already deleting it.
            if (MediaService.inFlightDeletes.has(idStr)) return;
            MediaService.inFlightDeletes.add(idStr);
            try {
              await this.deleteMedia(idStr, query?.tenantId as DatabaseId | null | undefined);
            } catch (e) {
              logger.error(`[Hooks] Media cleanup failed:`, e);
            } finally {
              MediaService.inFlightDeletes.delete(idStr);
            }
          }
        },
      });
    }

    // 🔁 Auto-invalidate reference index on any content mutation (register once per process)
    if (!MediaService.contentListenerRegistered) {
      MediaService.contentListenerRegistered = true;
      eventBus.on(SystemEvents.CONTENT_UPDATE, () => {
        MediaService.tenantIndexState.clear();
      });
    }
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
   * Fire-and-forget variant generation for streamed (large file) uploads and
   * storage repairs. Schedules through the single-flight coalescer: identical
   * concurrent uploads share one pipeline run, bulk imports are FIFO-bounded
   * instead of saturating libvips, and the record update happens per
   * subscriber once the shared run resolves.
   */
  private generateVariantsForStreamedFile(
    hash: string,
    relPath: string,
    _mimeType: string,
    _filename: string,
    recordId: DatabaseId | null | undefined,
    tenantId?: DatabaseId | null,
  ): void {
    if (!recordId) return;
    scheduleVariantJob({
      hash,
      relPath,
      tenantId,
      onVariants: async (variants) => {
        try {
          // Patch only the keys this job owns. A whole-blob write here raced
          // share-link creation and other metadata edits: the job's snapshot
          // predated them, so writing it back silently deleted their keys.
          const patch: Record<string, unknown> = {
            processingStatus:
              variants.length > 0 ? MediaProcessingStatus.Ready : MediaProcessingStatus.Failed,
          };
          if (variants.length > 0) {
            patch.imageVariants = variants.map((v) => ({
              preset: v.preset,
              width: v.width,
              height: v.height,
              format: v.format,
              quality: v.quality,
              path: v.path,
              size: v.size,
            }));
            patch.processingError = null;
          } else {
            patch.processingError = "No variants generated";
          }

          await this.patchMetadata(String(recordId), patch, tenantId);
          logger.debug("[Media] Variants generated for streamed upload", {
            hash: hash.slice(0, 12),
            count: variants.length,
            status: variants.length > 0 ? "ready" : "failed",
          });
        } catch (err) {
          logger.warn(
            "[Media] Background variant generation for streamed upload failed — original intact",
            {
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      },
    });
  }

  /**
   * Queue the `process-media` background job for work the synchronous upload
   * path cannot cover: documents streamed above the buffering threshold and
   * videos (which get no preview during upload).
   *
   * Loaded dynamically — `job-queue-service` imports every job handler, so a
   * static import here would pull the worker graph into the upload module.
   * Fire-and-forget: the record already exists, so a queue failure only means
   * the tile keeps its file icon until the next processing attempt.
   */
  private queueMediaProcessing(
    recordId: DatabaseId | null | undefined,
    tenantId?: DatabaseId | null,
  ): void {
    if (!recordId) return;
    void (async () => {
      try {
        const { jobQueue } = await import("@src/services/background/jobs/job-queue-service");
        await jobQueue.dispatch(
          "process-media",
          { fileId: String(recordId), basePath: tenantId || "global" },
          tenantId ? String(tenantId) : undefined,
        );
      } catch (err) {
        logger.warn("[Media] Failed to queue process-media job — original intact", {
          fileId: String(recordId),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
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
    // Verify with a cache-bypassing lookup — the pre-write check above cached a
    // "negative" result (10s TTL) that would otherwise mask the successful write.
    if (!(await fileExists(relPath, { refresh: true }))) {
      throw new Error(`Media file was not persisted to disk: ${relPath}`);
    }
    return relPath;
  }

  /**
   * A dedupe hit may only be reused while the files it advertises are still there:
   * `remove()` unlinks files (not directories) and a GC sweep can drop them behind the
   * row's back, so handing the record back unchanged would serve URLs that 404. Verifies
   * the original plus every derivative path (SIZES ladder + responsive variants) with a
   * cache-bypassing lookup — the same pattern `ensureOriginalOnDisk` uses after a write.
   *
   * Checking a handful of paths is orders of magnitude cheaper than the re-encode it
   * replaces: a stat against ~20 encodes for a 1080p upload.
   *
   * @returns the first missing storage path, or `null` when every file resolves.
   */
  private async findMissingStoredFile(record: DbMediaItem): Promise<string | null> {
    const uniqueRelPaths = new Set<string>();
    const original = resolveMediaRelPath(record as unknown as Record<string, unknown>);
    if (original) uniqueRelPaths.add(original);

    const enrichable = record as unknown as EnrichableRecord;
    for (const thumb of Object.values(enrichable.thumbnails ?? {})) {
      const p = toStorageRelPath(thumb?.path);
      const u = toStorageRelPath(thumb?.url);
      if (p) uniqueRelPaths.add(p);
      if (u) uniqueRelPaths.add(u);
    }
    for (const variant of enrichable.metadata?.imageVariants ?? []) {
      const p = toStorageRelPath(variant.path);
      const u = toStorageRelPath(variant.url);
      if (p) uniqueRelPaths.add(p);
      if (u) uniqueRelPaths.add(u);
    }

    if (uniqueRelPaths.size === 0) return null;
    const paths = Array.from(uniqueRelPaths);
    const checks = await Promise.all(paths.map((rel) => fileExists(rel, { refresh: true })));
    for (let i = 0; i < paths.length; i++) {
      if (!checks[i]) return paths[i];
    }
    return null;
  }

  /**
   * Reuse an existing record for byte-identical content: apply the dedupe patch
   * (storage path + folder) and hand back the enriched record. Shared by every dedupe
   * site (SVG, buffered raster, streamed raster) so the reuse contract stays identical
   * across upload paths.
   */
  private async adoptExistingRecord(
    record: DbMediaItem,
    relPath: string,
    folderId: string | undefined,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    const patch: Record<string, unknown> = {};
    if (record.path !== relPath) patch.path = relPath;
    if (folderId !== record.folderId) patch.folderId = folderId;
    if (Object.keys(patch).length > 0) {
      const updateResult = await this.db.crud.update(
        "media_items",
        record._id,
        patch as unknown as EntityUpdate<DbMediaItem>,
        { tenantId: tenantId },
      );
      if (!updateResult.success) {
        logger.warn(
          "[Media] Dedup-path metadata update failed",
          updateResult.error ?? updateResult.message,
        );
      } else {
        Object.assign(record, patch);
      }
    }
    return {
      success: true,
      data: this.enrichMediaWithUrl(record as unknown as EnrichableRecord) as unknown as MediaItem,
    };
  }

  /**
   * Repair path for a dedupe hit whose files are gone: the original was just rewritten by
   * `ensureOriginalOnDisk`, this re-derives the SIZES ladder and persists both onto the row
   * that already exists — identical bytes never get a second row. `metadata` is merged
   * rather than replaced, so fields this repair does not own (`versions`, focal point,
   * AI tags) survive.
   */
  private async repairExistingRecord(
    record: DbMediaItem,
    relPath: string,
    folderId: string | undefined,
    metadata: Record<string, unknown>,
    thumbnails: Record<string, unknown>,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    const patch: Record<string, unknown> = {
      path: relPath,
      metadata: { ...((record.metadata ?? {}) as Record<string, unknown>), ...metadata },
      thumbnails,
    };
    if (folderId !== record.folderId) patch.folderId = folderId;

    const updateResult = await this.db.crud.update(
      "media_items",
      record._id,
      patch as unknown as EntityUpdate<DbMediaItem>,
      { tenantId: tenantId },
    );
    if (!updateResult.success) {
      logger.warn(
        "[Media] Dedupe repair update failed",
        updateResult.error ?? updateResult.message,
      );
    } else {
      Object.assign(record, patch);
    }
    return {
      success: true,
      data: this.enrichMediaWithUrl(record as unknown as EnrichableRecord) as unknown as MediaItem,
    };
  }

  /**
   * Document families `buildDocumentPreview()` can render (PDF, CSV/TSV, Office).
   *
   * The gate stays on the service side so images, video and audio never cross
   * into the preview helpers — their upload path is the derivative ladder alone.
   */
  private hasPreviewableDocumentType(filename: string, mimeType: string): boolean {
    const lower = filename.toLowerCase();
    const mime = mimeType.split(";")[0]!.trim().toLowerCase();
    if (
      mime === "application/pdf" ||
      mime === "text/csv" ||
      mime === "application/csv" ||
      mime === "text/tab-separated-values" ||
      mime.includes("officedocument") ||
      mime.startsWith("application/vnd.oasis.opendocument")
    ) {
      return true;
    }
    return /\.(pdf|csv|tsv|docx|xlsx|pptx|odt|ods|odp)$/i.test(lower);
  }

  /** True when an existing document row has no generated preview yet (pre-pipeline upload). */
  private needsDocumentPreview(record: DbMediaItem, filename: string, mimeType: string): boolean {
    if (!this.hasPreviewableDocumentType(filename, mimeType)) return false;
    const thumbnails = (record as unknown as EnrichableRecord).thumbnails ?? {};
    return Object.keys(thumbnails).length === 0;
  }

  /**
   * Read the source dimensions and write the operator's SIZES ladder for a raster upload.
   * Non-images and SVG return empty maps (SVG is never rasterised). Failure is logged and
   * swallowed — the original is already on disk, so derivatives must never fail an upload.
   */
  private async buildDerivativeSet(
    buffer: Buffer,
    hash: string,
    filename: string,
    effectiveType: string,
    tenantId?: DatabaseId | null,
  ): Promise<{ metadata: Record<string, unknown>; thumbnails: Record<string, unknown> }> {
    const metadata: Record<string, unknown> = {};
    let thumbnails: Record<string, unknown> = {};
    if (!effectiveType.startsWith("image/") || isSvgFile(effectiveType, filename)) {
      return { metadata, thumbnails };
    }
    try {
      const sharp = await getSharp();
      const imgMeta = await sharp(buffer, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: "none",
      }).metadata();
      if (imgMeta.width) metadata.width = imgMeta.width;
      if (imgMeta.height) metadata.height = imgMeta.height;
      const dotIdx = filename.lastIndexOf(".");
      const baseName = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
      const ext = dotIdx > 0 ? filename.slice(dotIdx + 1).toLowerCase() : "jpg";
      thumbnails = await saveResizedImages(
        buffer,
        hash,
        baseName,
        ext,
        tenantId || "global",
        imgMeta,
      );
    } catch (e) {
      logger.warn("[Media] Derivative generation skipped", e);
    }
    return { metadata, thumbnails };
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

      // 🛡️ SVG: ALWAYS buffer + sanitize — never take the streaming path (XSS bypass if skipped)
      const treatAsSvg = isSvgFile(file.type, file.name);
      if (treatAsSvg) {
        const buffer = await bufferAndSanitizeSvg(file);
        const effectiveType = "image/svg+xml";
        const hash = await hashFileContent(buffer);
        const relPath = await this.ensureOriginalOnDisk(hash, file.name, buffer, tenantId);

        const existing = await this.files.getByHash(hash, {
          tenantId: tenantId,
        });
        if (existing.success && existing.data) {
          // SVG has no derivative pipeline, so a plain reuse is already zero-work.
          return await this.adoptExistingRecord(existing.data, relPath, folderId, tenantId);
        }

        return (await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: effectiveType,
            size: buffer.length,
            hash,
            path: relPath,
            createdBy: _userId as DatabaseId,
            updatedBy: _userId as DatabaseId,
            metadata: {},
            thumbnails: {},
            access: _access,
            folderId,
            tenantId: tenantId,
          } as unknown as EntityCreate<DbMediaItem>,
          { tenantId: tenantId },
        )) as unknown as DatabaseResult<MediaItem>;
      }

      // For large non-SVG files, we use the stream to avoid OOM
      if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
        // Small file: Buffer is fine and faster for small items
        let buffer = Buffer.from(await file.arrayBuffer());

        // Binary MIME sniffing as defense-in-depth
        const sniffed = sniffMimeType(buffer.subarray(0, 2048));
        assertMimeAgreement({
          filename: file.name,
          declaredMime: file.type,
          sniffedMime: sniffed?.mime,
        });
        let effectiveType =
          sniffed?.mime || getMimeType(file.name) || file.type || "application/octet-stream";
        if (!isAllowedUploadMime(effectiveType)) {
          throw new Error("MIME not allowed: " + effectiveType);
        }

        // Defense-in-depth: sniffed SVG (misdeclared MIME) still must be sanitized
        if (isSvgFile(effectiveType, file.name) || isSvgFile(sniffed?.mime || "", file.name)) {
          if (buffer.length > MAX_SVG_BYTES) {
            throw new Error(
              `SVG files must be ≤ ${MAX_SVG_BYTES / (1024 * 1024)}MB and are always sanitized before storage`,
            );
          }
          buffer = Buffer.from(sanitizeSvg(buffer.toString("utf-8")), "utf-8");
          effectiveType = "image/svg+xml";
        }

        const hash = await hashFileContent(buffer);
        const relPath = buildOriginalRelPath(hash, file.name, tenantId);

        // 1. Content-hash dedupe BEFORE any derivative work (media pipeline plan §3 #2):
        //    re-uploading identical bytes must cost zero encodes and zero derivative writes.
        const existing = await this.files.getByHash(hash, {
          tenantId: tenantId,
        });
        const staleRecord = existing.success && existing.data ? existing.data : undefined;
        const missing = staleRecord ? await this.findMissingStoredFile(staleRecord) : null;
        // A byte-identical document uploaded before the preview pipeline landed would
        // otherwise dedupe to its row forever and never gain a thumbnail.
        const needsPreview = staleRecord
          ? this.needsDocumentPreview(staleRecord, file.name, effectiveType)
          : false;
        if (staleRecord && !missing && !needsPreview) {
          // A same-name re-upload short-circuits inside `ensureOriginalOnDisk` (file already
          // there) — that is what keeps the `size-mtime` ETag, and therefore client
          // re-downloads, stable. A different filename still gets its own copy so the
          // `path` patch applied by `adoptExistingRecord` never points at a missing file.
          await this.ensureOriginalOnDisk(hash, file.name, buffer, tenantId);
          return await this.adoptExistingRecord(staleRecord, relPath, folderId, tenantId);
        }
        if (staleRecord) {
          logger.warn("[Media] Dedupe hit needs repair", {
            hash: hash.slice(0, 12),
            missing: missing ?? "none",
            documentPreview: needsPreview,
          });
        }

        await this.ensureOriginalOnDisk(hash, file.name, buffer, tenantId);

        // Extract image dimensions + generate derivatives for image files.
        // Responsive variants are generated ASYNC after the record exists
        // (see generateVariantsForStreamedFile below) — the sharp work
        // (~60-100ms on a 1080p upload) must not block the response.
        const { metadata: imageMetadata, thumbnails: imageThumbnails } =
          await this.buildDerivativeSet(buffer, hash, file.name, effectiveType, tenantId);
        // Documents have no source pixels — render a first-page/table preview once
        // and run it through the same ladder. Images get empty maps here.
        const documentPreview = this.hasPreviewableDocumentType(file.name, effectiveType)
          ? await buildDocumentPreview(buffer, hash, file.name, effectiveType, tenantId)
          : { metadata: {}, thumbnails: {} };
        const previewMetadata = { ...imageMetadata, ...documentPreview.metadata };
        const previewThumbnails = { ...imageThumbnails, ...documentPreview.thumbnails };

        // Repair path: the row for these bytes exists, only its files did not. Re-derive
        // them onto that row instead of inserting a second row for identical content.
        if (staleRecord) {
          const repaired = await this.repairExistingRecord(
            staleRecord,
            relPath,
            folderId,
            previewMetadata,
            previewThumbnails,
            tenantId,
          );
          this.generateVariantsForStreamedFile(
            hash,
            relPath,
            effectiveType,
            file.name,
            repaired.success
              ? ((repaired.data as { _id?: DatabaseId } | undefined)?._id ?? null)
              : null,
            tenantId,
          );
          return repaired;
        }

        const uploadResult = (await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: effectiveType,
            size: file.size,
            hash,
            path: relPath,
            createdBy: _userId as DatabaseId,
            updatedBy: _userId as DatabaseId,
            metadata: {
              ...previewMetadata,
              processingStatus:
                effectiveType.startsWith("image/") && !isSvgFile(effectiveType, file.name)
                  ? MediaProcessingStatus.Processing
                  : MediaProcessingStatus.Ready,
            },
            thumbnails: previewThumbnails,
            access: _access,
            folderId,
            tenantId: tenantId,
          } as unknown as EntityCreate<DbMediaItem>,
          { tenantId: tenantId },
        )) as unknown as DatabaseResult<MediaItem>;

        // 🚀 DEFER responsive variant generation off the request path — the
        // sharp work (~60-100ms on a 1080p upload) must not block the upload
        // response. Same pattern as the streamed path
        // (generateVariantsForStreamedFile): the record is updated in place and
        // enrichMediaWithUrl serves the variants from the DB record.
        if (effectiveType.startsWith("image/") && !isSvgFile(effectiveType, file.name)) {
          this.generateVariantsForStreamedFile(
            hash,
            relPath,
            file.type,
            file.name,
            uploadResult.success
              ? ((uploadResult.data as { _id?: DatabaseId } | undefined)?._id ?? null)
              : null,
            tenantId,
          );
        }

        // Videos get no preview during upload — hand the record to `process-media`
        // so ffmpeg can capture a frame and the row settles its processing status.
        if (uploadResult.success && effectiveType.startsWith("video/")) {
          this.queueMediaProcessing(
            (uploadResult.data as { _id?: DatabaseId } | undefined)?._id ?? null,
            tenantId,
          );
        }

        return uploadResult;
      } else {
        // Large file: Stream it! (SVG never reaches here — handled above)
        if (isSvgFile(file.type, file.name)) {
          throw new Error("SVG uploads must be sanitized and cannot use the streaming path");
        }

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
        // Block SVG polyglots that declare a non-SVG type but contain SVG markup
        if (
          sniffedLarge?.mime === "image/svg+xml" ||
          headerBuffer.toString("utf-8", 0, Math.min(headerBuffer.length, 256)).includes("<svg")
        ) {
          throw new Error(
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
          throw new Error("MIME not allowed: " + largeType);
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
        const relPath = buildOriginalRelPath(hash, file.name, tenantId);

        // Content-hash dedupe BEFORE the (deferred) variant pipeline — media pipeline
        // plan §3 #2: identical bytes must not re-encode, and the variant job must not be
        // scheduled at all.
        const existing = await this.files.getByHash(hash, {
          tenantId: tenantId,
        });
        const staleRecord = existing.success && existing.data ? existing.data : undefined;
        const missing = staleRecord ? await this.findMissingStoredFile(staleRecord) : null;
        if (staleRecord) {
          // A no-op when the record's own file is already in place under this filename;
          // otherwise it is the cheap copy that keeps the `path` patch truthful.
          await this.ensureOriginalOnDisk(hash, file.name, s2, tenantId);
          // The tee'd branch is fully consumed (or dropped) at this point — cancelling
          // releases it instead of buffering the whole file for a write that never happens.
          await s2.cancel().catch(() => {});
          const reused = await this.adoptExistingRecord(staleRecord, relPath, folderId, tenantId);
          if (missing !== null) {
            // Repair: the original is back on disk and variant paths are hash-keyed, so the
            // background job only rewrites what was gone. It never re-encodes a complete set.
            logger.warn("[Media] Dedupe hit has files missing from storage — repairing", {
              hash: hash.slice(0, 12),
              missing,
            });
            if (largeType.startsWith("image/") && !isSvgFile(largeType, file.name)) {
              this.generateVariantsForStreamedFile(
                hash,
                relPath,
                largeType,
                file.name,
                reused.success
                  ? ((reused.data as { _id?: DatabaseId } | undefined)?._id ?? null)
                  : null,
                tenantId,
              );
            }
          }
          return reused;
        }

        await this.ensureOriginalOnDisk(hash, file.name, s2, tenantId);

        const uploadResult = await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: largeType,
            size: file.size,
            hash,
            path: relPath,
            createdBy: _userId as DatabaseId,
            updatedBy: _userId as DatabaseId,
            metadata: {
              processingStatus:
                largeType.startsWith("image/") && !isSvgFile(largeType, file.name)
                  ? MediaProcessingStatus.Processing
                  : MediaProcessingStatus.Ready,
            },
            thumbnails: {},
            access: _access,
            folderId,
            tenantId: tenantId,
          } as unknown as EntityCreate<DbMediaItem>,
          { tenantId: tenantId },
        );

        // For large streamed files, try variant generation by re-reading from storage.
        // This is fire-and-forget: failure does not affect the upload response.
        if (
          largeType.startsWith("image/") &&
          !isSvgFile(largeType, file.name) &&
          uploadResult.success
        ) {
          this.generateVariantsForStreamedFile(
            hash,
            relPath,
            largeType,
            file.name,
            uploadResult.success
              ? ((uploadResult.data as { _id?: DatabaseId } | undefined)?._id ?? null)
              : null,
            tenantId,
          );
        }

        // Documents streamed above the buffering threshold never reach the
        // synchronous preview builder, and videos get no preview at all — both are
        // handed to `process-media` once the record exists. Fire-and-forget: the
        // upload succeeds even when the queue or the converter is unavailable.
        if (uploadResult.success) {
          const recordId = (uploadResult.data as { _id?: DatabaseId } | undefined)?._id ?? null;
          const isDocument = this.hasPreviewableDocumentType(file.name, largeType);
          if (isDocument || largeType.startsWith("video/")) {
            this.queueMediaProcessing(recordId, tenantId);
          }
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

    // Process thumbnails — entries written by `saveResized`/`saveVariant` already carry the
    // adapter's URL (`/files/…` locally, the CDN URL in the cloud); only raw storage paths are
    // resolved here. Re-prefixing an existing URL produced `/files/files/…`, which 404s — and it
    // made the reuse path return different URLs than the insert path for the same asset.
    if (item.thumbnails) {
      for (const key in item.thumbnails) {
        const thumb = item.thumbnails[key];
        const raw = (thumb?.path || thumb?.url) as string | undefined;
        if (thumb && raw && !raw.startsWith("/files/") && !raw.startsWith("http")) {
          thumb.url = getUrl(raw, prefix);
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
    basePath?: string,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      // SSRF defense: validateEgressUrl + safeFetch re-check every redirect hop
      const allowHttp = process.env.NODE_ENV === "development";
      await validateEgressUrl(url, { allowHttp });
      const resp = await safeFetch(url, {
        allowHttp,
        timeoutMs: 30000,
        maxSizeBytes: 100 * 1024 * 1024,
      });
      if (!resp.success || (!resp.bodyBytes && !resp.body) || (resp.status && resp.status >= 400)) {
        throw new Error(`Failed to fetch remote media: ${resp.error || resp.status}`);
      }

      const declaredMime = resp.headers?.["content-type"]?.split(";")[0]?.trim() || null;
      const payload: BlobPart = resp.bodyBytes
        ? (resp.bodyBytes as BlobPart)
        : (resp.body as string);
      const name = (() => {
        try {
          const u = new URL(url);
          const last = u.pathname.split("/").filter(Boolean).pop();
          return last && last.length > 0 ? decodeURIComponent(last) : "remote-file";
        } catch {
          return url.split("/").pop() || "remote-file";
        }
      })();
      const buffer = Buffer.isBuffer(payload)
        ? payload
        : typeof payload === "string"
          ? Buffer.from(payload)
          : payload instanceof Blob
            ? Buffer.from(await payload.arrayBuffer())
            : payload instanceof ArrayBuffer
              ? Buffer.from(payload)
              : Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
      const remoteMime = resolveRemoteAssetMime({
        filename: name,
        declaredMime,
        buffer,
      });
      const file = new File([buffer], name, { type: remoteMime });

      return await this.saveMedia(file, userId, access as "public" | "private", tenantId, basePath);
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
    options: { internal?: boolean } = {},
  ): Promise<void> {
    // Client paths run through the explicit allowlist; internal maintenance
    // writes (versions, manipulation, restore) legitimately patch managed
    // columns and opt out. Tenant ownership is always an adapter option, never
    // body data — strip identity/tenant keys on both paths.
    const source = options.internal ? data : sanitizeMediaUpdatePayload(data);
    const safeData: Record<string, unknown> = { ...source };
    delete safeData.tenantId;
    delete safeData._id;
    for (const key of UNSAFE_OBJECT_KEYS) delete safeData[key];

    const res = await this.db.crud.update("media", mediaId as DatabaseId, safeData, {
      tenantId: tenantId,
    });
    if (!res.success) throw new Error(res.message);
  }

  /**
   * Merge a partial patch into the stored `metadata` blob.
   *
   * `updateMedia(id, { metadata })` is a whole-blob replace: any writer that
   * snapshots the blob and writes it back later (variant jobs, transcoders,
   * share links) silently drops keys another writer added in between. This
   * helper only touches the keys the caller owns. MongoDB does it with dotted
   * `$set` paths; the relational adapters re-read inside the same adapter call.
   *
   * Pass `null` to clear a key (`processingError`).
   */
  public async patchMetadata(
    mediaId: string,
    patch: Partial<Record<keyof CmsMediaMetadata, unknown>>,
    tenantId?: DatabaseId | null,
  ): Promise<void> {
    if (!mediaId) throw new AppError("Media ID is required", 400);
    const res = await this.db.media.files.updateMetadata(
      mediaId as DatabaseId,
      patch as Partial<CmsMediaMetadata>,
      { tenantId: tenantId as DatabaseId },
    );
    if (!res.success) throw new Error(res.message);
  }

  public async deleteMedia(fileId: string, tenantId?: DatabaseId | null): Promise<void> {
    // Collect every content hash this row owns BEFORE deleting it. Only hashes
    // that no other record (active or retained version) still points at are
    // released from storage — variants are content-addressed, so a shared hash
    // must survive a sibling row's deletion.
    let hashesToRelease: string[] = [];
    try {
      const existing = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: fileId as DatabaseId },
        { tenantId: tenantId },
      );
      if (existing.success && existing.data) {
        const record = existing.data as unknown as EnrichableRecord;
        const versions = (record.metadata?.versions as MediaVersionEntry[] | undefined) ?? [];
        hashesToRelease = [
          ...new Set(
            [existing.data.hash, ...versions.map((version) => version.hash ?? "")].filter(Boolean),
          ),
        ];
      }
    } catch (err: unknown) {
      logger.debug("[Media] Pre-delete variant lookup failed", {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const res = await this.files.delete(fileId as DatabaseId, {
      tenantId: tenantId,
    });
    if (!res.success) throw new Error(res.message);

    if (hashesToRelease.length > 0) {
      void (async () => {
        // One library scan for every hash this row owned, instead of one scan
        // per hash (multi-version assets previously paid O(N × versions)).
        const liveHashes = await collectReferencedHashes(this.db, tenantId);
        for (const hash of hashesToRelease) {
          try {
            if (liveHashes.has(hash)) continue;
            await deleteAllVariants(hash, tenantId?.toString());
          } catch (err: unknown) {
            logger.warn("[Media] Variant cleanup failed during delete", {
              fileId,
              hash: hash.slice(0, 12),
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      })();
    }
  }

  public async manipulateMedia(
    id: string,
    manipulations: MediaManipulation,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem> {
    const { hashFileContent } = await import("./media-processing.server");
    const sharp = await getSharp();

    // 1. Load existing record
    const res = await this.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: id as DatabaseId },
      { tenantId: tenantId },
    );
    if (!res.success || !res.data) throw new Error("Media not found");
    const existing = res.data;

    // 2. Read original file + get dimensions once (reused by blur/watermark)
    const originalBuffer = await getFile(existing.path);
    const meta = await sharp(originalBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "none",
    }).metadata();
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
      focalPoint,
    } = manipulations;

    const storedFocal = focalPoint ? normalizeFocalPercent(focalPoint) : undefined;

    // 3. Geometry — mirror the editor preview exactly: the canvas draws the
    //    SOURCE crop inside the flip/rotate transform, so crop first, then flip,
    //    then rotate. (The old order rotated first and extracted afterwards in
    //    rotated-canvas coordinates, which is why a crop preview never matched.)
    const cropRect =
      crop && crop.width > 0 && crop.height > 0
        ? (() => {
            const x = Math.min(Math.max(0, Math.round(crop.x)), imgW - 1);
            const y = Math.min(Math.max(0, Math.round(crop.y)), imgH - 1);
            return {
              x,
              y,
              width: Math.min(Math.max(1, Math.round(crop.width)), imgW - x),
              height: Math.min(Math.max(1, Math.round(crop.height)), imgH - y),
            };
          })()
        : null;

    const cropX = cropRect?.x ?? 0;
    const cropY = cropRect?.y ?? 0;
    const workW = cropRect?.width ?? imgW;
    const workH = cropRect?.height ?? imgH;

    const ext = (existing.filename.split(".").pop() ?? "jpg").toLowerCase();
    const isCircle = crop?.shape === "circle";
    const preservesAlpha = isCircle || ext === "png" || ext === "webp" || ext === "avif";

    // Crop + circle mask must run as their own stage: Sharp always applies
    // `composite` after `rotate`, so a crop-sized mask cannot share the main
    // chain once the canvas grows.
    let preparedBuffer = originalBuffer;
    if (cropRect) {
      let cropped = sharp(originalBuffer, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: "none",
      }).extract({
        left: cropRect.x,
        top: cropRect.y,
        width: cropRect.width,
        height: cropRect.height,
      });

      if (isCircle) {
        // True circle even if the crop drifted slightly off-square.
        const radius = Math.min(cropRect.width, cropRect.height) / 2;
        const circleSvg = Buffer.from(
          `<svg width="${cropRect.width}" height="${cropRect.height}"><circle cx="${cropRect.width / 2}" cy="${cropRect.height / 2}" r="${radius}" fill="#ffffff"/></svg>`,
        );
        cropped = cropped.ensureAlpha().composite([{ input: circleSvg, blend: "dest-in" }]);
      }

      // Lossless intermediate keeps JPEG source quality through stage 2.
      preparedBuffer = await cropped.png({ compressionLevel: 8 }).toBuffer();
    }

    // Sharp applies flips BEFORE rotation regardless of call order; the canvas
    // preview rotates first, then flips. Negating the angle for a single flip
    // makes the pipelines equivalent (Fx∘R(θ) = R(−θ)∘Fx).
    const effectiveRotation = (rotation ?? 0) * (flipH !== flipV ? -1 : 1);

    let pipeline = sharp(preparedBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "none",
    });
    if (flipH) pipeline = pipeline.flop();
    if (flipV) pipeline = pipeline.flip();
    if (rotation) {
      pipeline = pipeline.rotate(effectiveRotation, {
        // Canvas shows transparency; JPEG has no alpha, so fill white.
        background: preservesAlpha
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : { r: 255, g: 255, b: 255, alpha: 1 },
      });
    }

    // — Colour filters —
    // Every slider the editor exposes must survive the round-trip. The preview
    // approximates the photographic controls with CSS filter primitives; the
    // factors below mirror those formulas exactly so preview == saved.
    if (filters) {
      const {
        brightness = 0,
        contrast = 0,
        saturation = 0,
        grayscale = 0,
        sepia = 0,
        temperature = 0,
        exposure = 0,
        highlights = 0,
        shadows = 0,
        clarity = 0,
        vibrance = 0,
        tint = 0,
        sharpness = 0,
      } = filters;

      let brightnessFactor = 1 + brightness / 100;
      let saturationFactor = 1 + saturation / 100;
      let contrastFactor = 1 + contrast / 100;
      let hueShift = 0;

      if (exposure !== 0) brightnessFactor *= 1 + (exposure * 1.2) / 100;
      if (vibrance !== 0) saturationFactor *= 1 + (vibrance * 0.7) / 100;

      // Clarity — contrast/saturation/brightness lift (same constants as the canvas).
      if (clarity !== 0) {
        if (clarity > 0) {
          contrastFactor *= 1 + (clarity * 0.42) / 100;
          saturationFactor *= 1 + (clarity * 0.18) / 100;
          brightnessFactor *= 1 - (clarity * 0.05) / 100;
        } else {
          const softness = Math.abs(clarity);
          contrastFactor *= 1 - (softness * 0.26) / 100;
          brightnessFactor *= 1 + (softness * 0.1) / 100;
          saturationFactor *= 1 - (softness * 0.08) / 100;
        }
      }

      if (highlights !== 0) {
        if (highlights > 0) {
          brightnessFactor *= 1 + (highlights * 0.25) / 100;
          contrastFactor *= 1 - (highlights * 0.08) / 100;
        } else {
          const lift = Math.abs(highlights);
          contrastFactor *= 1 + (lift * 0.12) / 100;
          brightnessFactor *= 1 - (lift * 0.08) / 100;
        }
      }

      if (shadows !== 0) {
        if (shadows > 0) {
          brightnessFactor *= 1 + (shadows * 0.2) / 100;
          contrastFactor *= 1 - (shadows * 0.05) / 100;
        } else {
          const depth = Math.abs(shadows);
          brightnessFactor *= 1 - (depth * 0.18) / 100;
          contrastFactor *= 1 + (depth * 0.1) / 100;
        }
      }

      // Temperature (CSS approximation): warm = partial sepia + slight cool hue
      // rotation, cool = hue rotation only.
      let temperatureSepia = 0;
      if (temperature > 0) {
        temperatureSepia = Math.min(1, (temperature * 0.3) / 100);
        hueShift -= temperature * 0.2;
      } else if (temperature < 0) {
        hueShift += Math.abs(temperature) * 0.3;
      }

      // Tint (green/magenta) is a hue rotation in the preview.
      if (tint !== 0) hueShift += tint * 1.5;

      const brightnessValue = Math.max(0, brightnessFactor);
      const saturationValue = Math.max(0, saturationFactor);
      if (brightnessValue !== 1 || saturationValue !== 1 || hueShift !== 0) {
        pipeline = pipeline.modulate({
          brightness: brightnessValue,
          saturation: saturationValue,
          ...(hueShift !== 0 ? { hue: hueShift } : {}),
        });
      }

      // CSS `contrast(x%)` is a linear transform around mid-grey.
      const contrastValue = Math.max(0, contrastFactor);
      if (contrastValue !== 1) {
        pipeline = pipeline.linear(contrastValue, 128 * (1 - contrastValue));
      }

      // Grayscale (full desaturate)
      if (grayscale > 0) pipeline = pipeline.grayscale();

      const sepiaMatrix = (
        strength: number,
      ): [[number, number, number], [number, number, number], [number, number, number]] => {
        const s = Math.min(1, Math.max(0, strength));
        return [
          [0.393 * s + 1 * (1 - s), 0.769 * s, 0.189 * s],
          [0.349 * s, 0.686 * s + 1 * (1 - s), 0.168 * s],
          [0.272 * s, 0.534 * s, 0.131 * s + 1 * (1 - s)],
        ];
      };

      // Sepia slider (batch presets) + the warm half of the temperature slider.
      const sepiaStrength = Math.min(1, sepia / 100) + temperatureSepia;
      if (sepiaStrength > 0) pipeline = pipeline.recomb(sepiaMatrix(sepiaStrength));

      // Detail: the preview runs a 3×3 unsharp mask where positive strength
      // sharpens and negative softens. Sharp's convolution is the closest native
      // equivalent; the sigma range keeps the visual radius comparable.
      const detailStrength = sharpness / 72 + clarity / 92;
      if (detailStrength > 0) {
        pipeline = pipeline.sharpen({ sigma: 0.5 + Math.min(1, detailStrength) * 1.5 });
      } else if (detailStrength < 0) {
        pipeline = pipeline.blur(0.3 + Math.min(1, Math.abs(detailStrength)) * 1.7);
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
            {
              "<": "&lt;",
              ">": "&gt;",
              "&": "&amp;",
              '"': "&quot;",
            } as Record<string, string>
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
              const wmBuf = await sharp(Buffer.from(wm.imageUrl.split(",")[1] ?? "", "base64"), {
                limitInputPixels: MAX_INPUT_PIXELS,
                failOn: "none",
              })
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
    const encoded = await encodeManipulatedOutput(pipeline, ext, isCircle);

    let outputBuffer: Buffer = encoded;
    let outputW = workW;
    let outputH = workH;

    // Rotation grows the canvas (auto-sized bounding box), so the mathematical
    // crop size no longer describes the output — read the real dimensions.
    if (rotation || cropRect) {
      const encodedMeta = await sharp(encoded, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      outputW = encodedMeta.width ?? outputW;
      outputH = encodedMeta.height ?? outputH;
    }

    // 5a. Explicit resize (editor/batch). A second encode is deliberate: Sharp
    // applies `resize` before `composite` regardless of chain order, so resizing
    // in the main pipeline would shift watermark/annotation coordinates.
    const requestedResize = manipulations.resize;
    if (requestedResize && (requestedResize.width || requestedResize.height)) {
      const clampDimension = (value: number | undefined) =>
        value === undefined
          ? undefined
          : Math.min(Math.max(Math.round(value), 32), MAX_OUTPUT_DIMENSION);
      const resized = sharp(outputBuffer, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: "none",
      }).resize({
        width: clampDimension(requestedResize.width),
        height: clampDimension(requestedResize.height),
        fit: "inside",
        withoutEnlargement: true,
      });
      outputBuffer = await encodeManipulatedOutput(resized, ext, isCircle);
      const resizedMeta = await sharp(outputBuffer).metadata();
      outputW = resizedMeta.width ?? outputW;
      outputH = resizedMeta.height ?? outputH;
      logger.debug(`[manipulateMedia] Explicit resize → ${outputW}x${outputH}`);
    }

    // SECURITY: cap the editor output at the same ceiling as on-demand transforms.
    // A second pass is deliberate — Sharp applies `resize` before `composite`
    // regardless of chain order, so resizing after the overlay build would shift
    // watermark/annotation coordinates. Normal-size outputs still encode once.
    const capped = clampManipulatedDimensions(outputW, outputH, MAX_OUTPUT_DIMENSION);
    if (capped.width !== outputW || capped.height !== outputH) {
      const downscaled = sharp(encoded, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: "none",
      }).resize({
        width: capped.width,
        height: capped.height,
        fit: "inside",
        withoutEnlargement: true,
      });
      outputBuffer = await encodeManipulatedOutput(downscaled, ext, isCircle);
      logger.debug(
        `[manipulateMedia] Capped output ${outputW}x${outputH} → ${capped.width}x${capped.height} (max ${MAX_OUTPUT_DIMENSION}px)`,
      );
    }

    // 6. Hash, persist, update DB
    // Circular crop outputs PNG — rename file accordingly
    const outputFilename =
      isCircle && !existing.filename.endsWith(".png")
        ? existing.filename.replace(/\.[^.]+$/, ".png")
        : existing.filename;
    const outputMime = isCircle ? "image/png" : existing.mimeType;
    const newHash = await hashFileContent(outputBuffer);
    const relPath = buildOriginalRelPath(newHash, outputFilename, tenantId);
    await saveFile(outputBuffer, relPath);
    const now = nowISODateString();

    // Rebuild the derivative set for the edited bytes. Without this the record
    // kept the pre-edit ladder/thumbnail URLs after `thumbnails: {}` was written,
    // so the gallery served renditions of the replaced original.
    const { metadata: derivativeMetadata, thumbnails: derivativeThumbnails } =
      await this.buildDerivativeSet(outputBuffer, newHash, outputFilename, outputMime, tenantId);
    let editedVariants: ImageVariant[] = [];
    try {
      editedVariants = await processImageWithPresets(
        outputBuffer,
        newHash,
        ["thumbnail", "card", "default"],
        tenantId,
      );
    } catch (variantErr) {
      logger.warn("[Media] Variant generation failed during image edit — original intact", {
        error: variantErr instanceof Error ? variantErr.message : String(variantErr),
      });
    }
    const editedVariantMetadata = editedVariants.map((v) => ({
      preset: v.preset,
      width: v.width,
      height: v.height,
      format: v.format,
      quality: v.quality,
      path: v.path,
      size: v.size,
    }));
    const editedStatus =
      editedVariantMetadata.length > 0 ? MediaProcessingStatus.Ready : MediaProcessingStatus.Failed;

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
          metadata: {
            ...derivativeMetadata,
            versions: [],
            ...(storedFocal ? { focalPoint: storedFocal } : {}),
            imageVariants: editedVariantMetadata,
            processingStatus: editedStatus,
            ...(editedStatus === MediaProcessingStatus.Failed
              ? { processingError: "No variants generated" }
              : {}),
          },
          thumbnails: derivativeThumbnails,
          access: existing.access || "public",
          folderId: existing.folderId ?? undefined,
          originalId: id,
          tenantId: tenantId,
        } as unknown as EntityCreate<DbMediaItem>,
        { tenantId: tenantId },
      );
      if (!uploadResult.success || !uploadResult.data)
        throw new Error("Failed to create new media record");
      return this.enrichMediaWithUrl(
        uploadResult.data as unknown as EnrichableRecord,
      ) as unknown as MediaItem;
    }

    // overwrite: push current file to version history, update record in place
    const versions = (existing.metadata?.versions as MediaVersionEntry[] | undefined) || [];
    const overwritePatch = {
      hash: newHash,
      path: relPath,
      size: outputBuffer.byteLength,
      thumbnails: derivativeThumbnails,
      updatedBy: userId,
      updatedAt: now,
      metadata: {
        ...existing.metadata,
        ...derivativeMetadata,
        ...(storedFocal ? { focalPoint: storedFocal } : {}),
        imageVariants: editedVariantMetadata,
        processingStatus: editedStatus,
        ...(editedStatus === MediaProcessingStatus.Failed
          ? { processingError: "No variants generated" }
          : {}),
        versions: [
          ...versions,
          buildVersionSnapshot(
            existing as unknown as EnrichableRecord,
            versions.length + 1,
            userId,
            "edit",
            now,
          ),
        ],
      },
    };
    await this.updateMedia(id, overwritePatch, tenantId, { internal: true });

    return this.enrichMediaWithUrl({
      ...(existing as unknown as EnrichableRecord),
      ...overwritePatch,
    } as unknown as EnrichableRecord) as unknown as MediaItem;
  }

  public async batchProcessImages(
    ids: string[],
    config: MediaManipulation,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem[]> {
    if (ids.length === 0) return [];
    const concurrency = Math.min(4, ids.length);
    const ordered: Array<MediaItem | undefined> = Array.from(
      { length: ids.length },
      () => undefined,
    );
    let cursor = 0;

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < ids.length) {
          const idx = cursor++;
          const id = ids[idx];
          try {
            ordered[idx] = await this.manipulateMedia(id, config, userId, tenantId);
          } catch (err) {
            logger.error(`Batch processing failed for ${id}:`, err);
          }
        }
      }),
    );

    return ordered.filter((item): item is MediaItem => item !== undefined);
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
  private async ensureReferenceIndex(tenantId?: DatabaseId | null) {
    const state = this.getTenantState(tenantId);
    if (state.referenceIndex.isBuilt()) return state;
    if (!state.rebuildInflight) {
      state.rebuildInflight = this.rebuildReferenceIndex(tenantId, state).finally(() => {
        state.rebuildInflight = null;
      });
    }
    await state.rebuildInflight;
    return state;
  }

  public async getMediaReferences(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaReference[]> {
    try {
      // Rebuild once per cache lifetime — empty refs for an unknown mediaId
      // must NOT re-scan all collections (caused OOM on DELETE nonexistent).
      const state = await this.ensureReferenceIndex(tenantId);
      return this.enrichReferences(state.referenceIndex.getReferences(mediaId), state.entryNameMap);
    } catch (err) {
      logger.error(`[MediaService] Error scanning usage references:`, err);
      return [];
    }
  }

  /**
   * Gallery load helper: one rebuild, then O(1) lookups per id.
   */
  public async getPublishedReferencedIds(
    mediaIds: string[],
    tenantId?: DatabaseId | null,
  ): Promise<string[]> {
    if (mediaIds.length === 0) return [];
    try {
      const state = await this.ensureReferenceIndex(tenantId);
      return state.referenceIndex.collectPublishedIds(
        mediaIds,
        (entryId) => state.entryStatusMap.get(entryId) === "publish",
      );
    } catch (err) {
      logger.error(`[MediaService] Error collecting published media ids:`, err);
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
      const state = await this.ensureReferenceIndex(tenantId);
      // Filter to published-only references by checking the status map
      const allRefs = state.referenceIndex.getReferences(mediaId);
      return this.enrichReferences(
        allRefs.filter((ref) => state.entryStatusMap.get(ref.entryId) === "publish"),
        state.entryNameMap,
      );
    } catch (err) {
      logger.error(`[MediaService] Error scanning published references:`, err);
      return [];
    }
  }

  /**
   * Rebuilds the in-memory reference index by scanning all collection entries in parallel.
   */
  private async rebuildReferenceIndex(
    tenantId: DatabaseId | null | undefined,
    state: {
      referenceIndex: MediaReferenceIndex;
      entryStatusMap: Map<string, string>;
      entryNameMap: Map<string, string>;
    },
  ): Promise<void> {
    const { scanCompiledCollections } = await loadEngineServerModule();
    const schemas = await scanCompiledCollections();
    const allEntries: Array<{
      collectionId: string;
      collectionName: string;
      entryId: string;
      data: Record<string, unknown>;
      status?: string;
    }> = [];

    await Promise.all(
      schemas.map(async (schema) => {
        // 🐛 FIX (BUG-01): canonical physical name — manual `collection_${id}`
        // breaks for hyphenated ids; collectionTableName normalizes (idempotent).
        const collectionName = collectionTableName(schema._id as string);
        const collectionLabel = schema.name || schema._id || "";
        try {
          const res = await this.db.crud.findMany(collectionName, {}, { tenantId: tenantId });
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
              state.entryNameMap.set(entryId, String(entryName));
              if (entryAny.status) {
                state.entryStatusMap.set(entryId, entryAny.status as string);
              }
            }
          }
        } catch (err) {
          logger.error(`[MediaService] Error scanning ${collectionName} for references:`, err);
        }
      }),
    );

    state.referenceIndex.rebuild(allEntries);
    // Even with zero entries, mark built so empty lookups stay O(1)
    state.referenceIndex.markBuilt();
  }

  /** Enrich index references with legacy fields for backward compatibility. */
  private enrichReferences(
    refs: MediaReference[],
    entryNameMap: Map<string, string>,
  ): MediaReference[] {
    for (const ref of refs) {
      ref.fieldName = ref.fieldPath.split(".")[0] || ref.fieldPath;
      ref.entryName = entryNameMap.get(ref.entryId) || ref.entryId;
    }
    return refs;
  }

  /** Manually clear the reference-index cache. */
  public invalidateReferenceCache(): void {
    MediaService.tenantIndexState.clear();
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
      assertMediaReplaceSize(file);
      // 1. Get the existing media record
      const res = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId },
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
      // 🛡️ SVG versions: always sanitize — never stream unsanitized SVG
      if (isSvgFile(file.type, file.name)) {
        buffer = await bufferAndSanitizeSvg(file);
        hash = await hashFileContent(buffer);
      } else if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
        buffer = Buffer.from(await file.arrayBuffer());
        assertMediaReplaceSize(file, buffer.length);
        hash = await hashFileContent(buffer);
      } else {
        const { hashStream } = await import("./media-processing.server");
        const [s1] = file.stream().tee();
        hash = await hashStream(s1, API_MAX_BODY_SIZE_BYTES);
      }

      const isRaster = file.type.startsWith("image/") && !isSvgFile(file.type, file.name);

      // Generate derivatives for small files (buffer available). The same set is
      // written under the new content hash so the gallery can render the new
      // version immediately — and captured on the OLD version entry so a later
      // restore reinstates the matching derivatives instead of the replaced ones.
      let versionVariants: ImageVariant[] = [];
      let versionThumbnails: Record<string, unknown> = {};
      let versionImageMetadata: Record<string, unknown> = {};
      if (buffer && isRaster) {
        try {
          const { metadata, thumbnails } = await this.buildDerivativeSet(
            buffer,
            hash,
            file.name,
            file.type,
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
      // Write straight to the canonical content-addressed path. The previous
      // implementation inserted a staging media row only to reuse the adapter
      // upload path, then deleted it — an extra DB round-trip and a transient
      // gallery row for every version upload.
      if (buffer) {
        await this.ensureOriginalOnDisk(hash, file.name, buffer, tenantId);
      } else if (typeof file.stream === "function") {
        await this.ensureOriginalOnDisk(hash, file.name, file.stream(), tenantId);
      } else if (typeof file.arrayBuffer === "function") {
        await this.ensureOriginalOnDisk(
          hash,
          file.name,
          Buffer.from(await file.arrayBuffer()),
          tenantId,
        );
      } else {
        throw new Error("Version upload requires a readable file stream");
      }

      // 3. Create version record from the OLD properties
      const existingR = existing as unknown as EnrichableRecord;
      const versions = (existingR.metadata?.versions as MediaVersionEntry[] | undefined) || [];
      const now = nowISODateString();
      const oldVersionEntry = buildVersionSnapshot(
        existingR,
        versions.length + 1,
        userId,
        "replace",
        now,
      );

      // Push old version to the history array
      const updatedVersions = [...versions, oldVersionEntry];

      // 4. Update the existing database record with the new file properties
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
        mimeType: file.type,
        size: file.size,
        hash,
        path: newRelPath,
        thumbnails: versionThumbnails,
        metadata: updatedMetadata,
        updatedBy: userId,
        updatedAt: now,
      };

      await this.updateMedia(mediaId, updateData, tenantId, { internal: true });

      // Large streamed images never had a buffer — generate their derivatives
      // off the request path and flip `processingStatus` when they land.
      if (isRaster && !buffer) {
        this.generateVariantsForStreamedFile(
          hash,
          newRelPath,
          file.type,
          file.name,
          mediaId as DatabaseId,
          tenantId,
        );
      }

      // Return the updated media item enriched directly without a redundant DB round-trip
      return {
        success: true,
        data: this.enrichMediaWithUrl({
          ...existingR,
          ...updateData,
        } as unknown as EnrichableRecord) as unknown as MediaItem,
      };
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
        { tenantId: tenantId },
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
      const now = nowISODateString();
      const currentVersionEntry = buildVersionSnapshot(
        existingR,
        versions.length + 1,
        userId,
        "restore",
        now,
      );

      // 3. Update the active record to point back to the restored version
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
      // Legacy entries predate derivative capture: never keep the replaced
      // version's renditions — clear them and regenerate from the restored bytes.
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

      await this.updateMedia(mediaId, updateData, tenantId, { internal: true });

      if (needsDerivativeRepair && restoredHash && targetVersion.path) {
        this.generateVariantsForStreamedFile(
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
        data: this.enrichMediaWithUrl({
          ...existingR,
          ...updateData,
        } as unknown as EnrichableRecord) as unknown as MediaItem,
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
}
