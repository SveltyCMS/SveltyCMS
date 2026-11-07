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
import { AppError, raise } from "@utils/error-handling";
import {
  fileExists,
  saveFile,
  saveResizedImages,
  buildDocumentPreview,
} from "./media-storage.server";
import { type ImageVariant } from "@src/services/media/image-processor";
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
import { MediaProcessingStatus, mediaTypeFromMime, type MediaItem } from "./media-models";
import {
  buildOriginalRelPath,
  getMimeType,
  isAllowedUploadMime,
  resolveMediaRelPath,
} from "./media-utils";
import { getUrl } from "./storage-adapters";
import { validateEgressUrl, safeFetch } from "../egress-guard";
import { assertMimeAgreement, resolveRemoteAssetMime, sniffMimeType } from "./slim-sniffer.server";
import { getSharp, MAX_INPUT_PIXELS } from "./sharp-loader.server";
import { MediaReferenceIndex, type MediaReference } from "./media-reference-index";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { scheduleVariantJob } from "./variant-job-scheduler.server";
import { collectReferencedHashes } from "./media-lifecycle.server";

import {
  MAX_SVG_BYTES,
  sanitizeSvg,
  assertMediaReplaceSize,
  isSvgFile,
  validateMime,
  bufferAndSanitizeSvg,
  executeUploadNewVersion,
  executeRestoreVersion,
  type MediaVersionEntry,
} from "./media-versioning.server";
export { MAX_SVG_BYTES, sanitizeSvg, assertMediaReplaceSize, type MediaVersionEntry };

import {
  executeMediaManipulation,
  executeBatchProcessImages,
  type CropOptions,
  type FilterOptions,
  type BlurRegion,
  type TextWatermark,
  type ImageWatermark,
  type Watermark,
  type Annotation,
  type MediaManipulation,
} from "./media-manipulation.server";
export type {
  CropOptions,
  FilterOptions,
  BlurRegion,
  TextWatermark,
  ImageWatermark,
  Watermark,
  Annotation,
  MediaManipulation,
};

import {
  executeGetMediaReferences,
  executeGetPublishedReferencedIds,
  executeIsReferencedByPublishedContent,
  executeGetPublishedReferences,
  type ReferenceIndexTenantState,
} from "./media-references.server";

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

/* -------------------------------------------------------------------------- */

export class MediaService {
  public readonly db: IDBAdapter;
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

  public getTenantState(tenantId?: DatabaseId | null): ReferenceIndexTenantState {
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
  public mapFileSystemError(err: unknown): void {
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
  public generateVariantsForStreamedFile(
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

  public async ensureOriginalOnDisk(
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
  public async buildDerivativeSet(
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
    return executeMediaManipulation(this, id, manipulations, userId, tenantId);
  }

  public async batchProcessImages(
    ids: string[],
    config: MediaManipulation,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem[]> {
    return executeBatchProcessImages(
      this.manipulateMedia.bind(this),
      ids,
      config,
      userId,
      tenantId,
    );
  }

  /**
   * Determine media category from MIME type.
   * Delegates to the canonical `mediaTypeFromMime` helper in media-models.
   */
  public getMediaType(mime: string): "image" | "video" | "audio" | "document" {
    return mediaTypeFromMime(mime) as "image" | "video" | "audio" | "document";
  }

  public async getMediaReferences(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaReference[]> {
    return executeGetMediaReferences(this, mediaId, tenantId);
  }

  public async getPublishedReferencedIds(
    mediaIds: string[],
    tenantId?: DatabaseId | null,
  ): Promise<string[]> {
    return executeGetPublishedReferencedIds(this, mediaIds, tenantId);
  }

  public async isReferencedByPublishedContent(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<{ referenced: boolean; references: MediaReference[] }> {
    return executeIsReferencedByPublishedContent(this, mediaId, tenantId);
  }

  public async getPublishedReferences(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaReference[]> {
    return executeGetPublishedReferences(this, mediaId, tenantId);
  }

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
    return executeUploadNewVersion(this, mediaId, file, userId, tenantId);
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
    return executeRestoreVersion(this, mediaId, versionNumber, userId, tenantId);
  }
}
