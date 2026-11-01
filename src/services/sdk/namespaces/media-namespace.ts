/**
 * @file src/services/sdk/namespaces/media-namespace.ts
 * @description Media namespace for LocalCMS SDK.
 *
 * Features:
 * - Tenant-isolated media queries and mutations
 * - Request-level FastLRU deduplication
 * - Standardized SDK error envelopes via safeCall
 */
import { withSystemScope } from "@src/databases/system-tenant-scope";

import { MediaService } from "@utils/media/media-service.server";
import {
  cleanupMediaVersions,
  syncMediaProcessingStatus,
  type MediaCleanupOptions,
  type MediaCleanupResult,
  type MediaStatusSyncOptions,
  type MediaStatusSyncResult,
} from "@utils/media/media-lifecycle.server";
import { AppError } from "@utils/error-handling";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { FastLRU } from "@utils/native-utils";
import type { DatabaseId, IDBAdapter, DatabaseResult } from "@src/databases/db-interface";
import type { MediaItem } from "@utils/media/media-models";
import { safeCall } from "../safe-call";

function isFileLike(value: unknown): value is File {
  return (
    value != null &&
    typeof value === "object" &&
    "arrayBuffer" in value &&
    typeof (value as any).arrayBuffer === "function" &&
    "name" in value
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaAccess = "public" | "private";

const MEDIA_SORT_FIELDS = new Set(["size", "filename", "updatedAt", "createdAt", "mimeType"]);

/** Allow-listed media sort. Anything else stays on `updatedAt` (no new index). */
export function allowMediaSortField(
  field: unknown,
): "size" | "filename" | "updatedAt" | "createdAt" | "mimeType" {
  if (typeof field === "string" && MEDIA_SORT_FIELDS.has(field)) {
    return field as "size" | "filename" | "updatedAt" | "createdAt" | "mimeType";
  }
  return "updatedAt";
}

export function allowMediaSortDirection(direction: unknown): "asc" | "desc" {
  return direction === "asc" ? "asc" : "desc";
}

interface FindOptions {
  tenantId?: DatabaseId | null;
  limit?: number;
  folderId?: string;
  recursive?: boolean;
  prefix?: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
}

interface FindByIdOptions {
  tenantId?: DatabaseId | null;
  prefix?: string;
}

interface TenantOptions {
  tenantId?: DatabaseId | null;
}

interface UploadOptions extends TenantOptions {
  userId: string;
  access?: MediaAccess;
  watermarkOptions?: any;
  folder?: string;
  skipResizing?: boolean;
}

interface RemoteOptions extends TenantOptions {
  userId: string;
  access?: MediaAccess;
}

interface ManipulateOptions extends TenantOptions {
  userId: string;
}

interface BatchProcessOptions extends TenantOptions {
  userId: string;
  [key: string]: any;
}

// ─── MediaNamespace ───────────────────────────────────────────────────────────

/**
 * Media Namespace
 */
export class MediaNamespace {
  private mediaService: MediaService;

  // Mirror the pattern used in CollectionsNamespace: static LRU for request-level dedup
  private static _requestCache = new FastLRU<string, any>({
    max: 500,
    ttl: 60_000,
  });

  constructor(private _dbAdapter: IDBAdapter) {
    this.mediaService = new MediaService(_dbAdapter);
  }

  private invalidateCache(tenantId?: DatabaseId | null, fileId?: string, folderId?: string) {
    const prefix = `${tenantId ?? "global"}:media:`;
    if (fileId) {
      MediaNamespace._requestCache.delete(`${prefix}${fileId}`);
    }
    if (folderId) {
      const folderPrefix = `${prefix}folder:${folderId}`;
      for (const key of MediaNamespace._requestCache.keys()) {
        if (key.startsWith(folderPrefix)) MediaNamespace._requestCache.delete(key);
      }
    } else if (!fileId) {
      for (const key of MediaNamespace._requestCache.keys()) {
        if (key.startsWith(prefix)) MediaNamespace._requestCache.delete(key);
      }
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async find(options: FindOptions = {}): Promise<DatabaseResult<any>> {
    const { tenantId, limit = 100, folderId, recursive = false, prefix } = options;
    const sortField = allowMediaSortField(options.sortField);
    const sortDirection = allowMediaSortDirection(options.sortDirection);

    // Mirror collections-namespace: fail closed when multi-tenant and no tenant scope
    if (isMultiTenantEnabled() && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const cacheKey = `${tenantId ?? "global"}:media:folder:${folderId ?? "root"}:${limit}:${recursive}:${sortField}:${sortDirection}`;
    if (MediaNamespace._requestCache.has(cacheKey)) {
      return MediaNamespace._requestCache.get(cacheKey);
    }

    const getByFolder = this._dbAdapter?.media?.files?.getByFolder;
    if (typeof getByFolder !== "function") {
      throw new AppError(
        "Media adapter is not available (media.files.getByFolder missing)",
        503,
        "MEDIA_ADAPTER_UNAVAILABLE",
      );
    }

    const result = await getByFolder(folderId as DatabaseId, {
      pageSize: limit,
      page: 1,
      sortField,
      sortDirection,
      recursive,
      tenantId: tenantId as DatabaseId,
    });

    if (result.success && result.data?.items) {
      result.data.items = result.data.items.map(
        (item: any) => this.mediaService.enrichMediaWithUrl(item, prefix) as any,
      );
      MediaNamespace._requestCache.set(cacheKey, result);
    }

    return result;
  }

  async findById(
    fileId: string,
    options: FindByIdOptions = {},
  ): Promise<DatabaseResult<MediaItem | null>> {
    if (!fileId) throw new AppError("File ID is required", 400);

    const { tenantId, prefix } = options;
    if (isMultiTenantEnabled() && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }
    const cacheKey = `${tenantId ?? "global"}:media:${fileId}`;

    if (MediaNamespace._requestCache.has(cacheKey)) {
      return MediaNamespace._requestCache.get(cacheKey);
    }

    // Use crud.findOne as getById might be missing from some adapters
    const result = await this._dbAdapter.crud.findOne<MediaItem>(
      "media",
      { _id: fileId as DatabaseId },
      { tenantId: tenantId as DatabaseId },
    );

    if (result.success && result.data) {
      result.data = this.mediaService.enrichMediaWithUrl(result.data as any, prefix) as any;
      MediaNamespace._requestCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Hydrate many media documents by id in ONE query.
   *
   * The Media widget's display pillar renders one cell per list row; going
   * through `findById` per cell cost one request (and one point read) per row.
   * Documents already in the per-request cache are served from there, the rest
   * come from a single `findMany` — enriched exactly like `findById` so callers
   * cannot tell the two apart.
   */
  async findManyByIds(
    fileIds: readonly string[],
    options: FindByIdOptions = {},
  ): Promise<DatabaseResult<MediaItem[]>> {
    const { tenantId, prefix } = options;
    if (isMultiTenantEnabled() && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const ids = [...new Set(fileIds.filter((id): id is string => Boolean(id)))];
    const items: MediaItem[] = [];
    const missing: string[] = [];

    for (const id of ids) {
      const cached = MediaNamespace._requestCache.get(`${tenantId ?? "global"}:media:${id}`);
      const cachedItem = cached?.success ? (cached.data as MediaItem | null) : null;
      if (cachedItem) items.push(cachedItem);
      else missing.push(id);
    }

    if (missing.length === 0) return { success: true, data: items };

    const result = await this._dbAdapter.crud.findMany<MediaItem>(
      "media",
      { _id: { $in: missing as any } },
      { tenantId: tenantId as DatabaseId },
    );

    if (!result.success || !Array.isArray(result.data))
      return result as DatabaseResult<MediaItem[]>;

    for (const item of result.data) {
      const enriched = this.mediaService.enrichMediaWithUrl(
        item as any,
        prefix,
      ) as unknown as MediaItem;
      items.push(enriched);
      MediaNamespace._requestCache.set(`${tenantId ?? "global"}:media:${enriched._id}`, {
        success: true,
        data: enriched,
      });
    }

    return { success: true, data: items };
  }

  async exists(url: string, tenantId?: DatabaseId | null): Promise<boolean> {
    if (!url) return false;
    // 🚀 AGNOSTIC FIX: Handle both 'url' (Mongo) and 'path' (SQL) field names
    const isRelational = this._dbAdapter.type !== "mongodb";
    const filter: any = isRelational ? { path: url } : { url };

    const result = await this._dbAdapter.crud.findMany("media", filter, {
      tenantId: tenantId as DatabaseId,
      limit: 1,
    });
    return result.success && Array.isArray(result.data) && result.data.length > 0;
  }

  async getMetadata(file: File) {
    if (!isFileLike(file)) throw new AppError("Valid file is required", 400);
    const { mediaProcessingService } = await import("@src/utils/media/media-processing.server");
    const buffer = Buffer.from(await file.arrayBuffer());
    return mediaProcessingService.getMetadata(buffer);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async upload(file: File, options: UploadOptions): Promise<DatabaseResult<MediaItem>> {
    const {
      userId,
      access = "private",
      tenantId,
      watermarkOptions,
      folder = "global",
      skipResizing = false,
    } = options;

    return safeCall(async () => {
      if (!userId) throw new AppError("User ID is required for upload", 400);
      if (!isFileLike(file)) throw new AppError("A valid File object is required", 400);

      const result = await this.mediaService.saveMedia(
        file,
        userId,
        access,
        tenantId as any as DatabaseId,
        folder,
        watermarkOptions,
        null,
        skipResizing,
      );

      this.invalidateCache(tenantId);
      return result;
    });
  }

  async remote(url: string, options: RemoteOptions): Promise<DatabaseResult<MediaItem>> {
    const { userId, access = "private", tenantId } = options;
    return safeCall(async () => {
      if (!url) throw new AppError("URL is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);

      const result = await this.mediaService.saveRemoteMedia(
        url,
        userId,
        access,
        tenantId as DatabaseId,
      );

      this.invalidateCache(tenantId);
      return result;
    });
  }

  async update(
    mediaId: string,
    data: any,
    options: TenantOptions = {},
  ): Promise<DatabaseResult<void>> {
    return safeCall(async () => {
      if (!mediaId) throw new AppError("Media ID is required", 400);

      await this.mediaService.updateMedia(mediaId, data, options.tenantId as DatabaseId);

      this.invalidateCache(options.tenantId, mediaId);
    });
  }

  /**
   * Patch only the metadata keys the caller owns (share links, processing
   * state, transcoder output). Unlike {@link update}, concurrent writers cannot
   * drop each other's keys because the stored blob is never replaced wholesale.
   */
  async patchMetadata(
    mediaId: string,
    patch: Record<string, unknown>,
    options: TenantOptions = {},
  ): Promise<DatabaseResult<void>> {
    return safeCall(async () => {
      await this.mediaService.patchMetadata(mediaId, patch, options.tenantId as DatabaseId);
      this.invalidateCache(options.tenantId, mediaId);
    });
  }

  async delete(fileId: string, options: TenantOptions = {}): Promise<DatabaseResult<void>> {
    return safeCall(async () => {
      if (!fileId) throw new AppError("File ID is required", 400);

      await this.mediaService.deleteMedia(fileId, options.tenantId as DatabaseId);

      this.invalidateCache(options.tenantId, fileId);
    });
  }

  /**
   * Move one or more media assets into a virtual folder (or root when targetFolderId is null/undefined).
   * Updates folderId only — physical storage paths are unchanged.
   */
  async move(
    fileIds: string[],
    targetFolderId?: string | null,
    options: TenantOptions = {},
  ): Promise<DatabaseResult<{ movedCount: number }>> {
    return safeCall(async () => {
      // Dedup in one pass — `filter` + `Set` + spread built two throwaway arrays.
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const id of fileIds ?? []) {
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      if (ids.length === 0) throw new AppError("At least one media ID is required", 400);

      const { tenantId } = options;
      // Root destination: null clears folderId (virtual root)
      const result = await this._dbAdapter.media.files.move(
        ids as DatabaseId[],
        (targetFolderId || null) as DatabaseId,
        tenantId != null ? { tenantId: tenantId as DatabaseId } : withSystemScope("bootstrap"),
      );

      // `invalidateCache(tenantId)` already drops every key under the tenant
      // prefix — the folder-scoped sweep below it was a redundant O(n) pass.
      if (result.success) this.invalidateCache(tenantId);

      return result;
    });
  }

  async manipulate(
    id: string,
    manipulations: any,
    options: ManipulateOptions,
  ): Promise<DatabaseResult<MediaItem>> {
    const { userId, tenantId } = options;
    return safeCall(async () => {
      if (!id) throw new AppError("Media ID is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);

      const result = await this.mediaService.manipulateMedia(
        id,
        manipulations,
        userId,
        tenantId as DatabaseId,
      );
      return result;
    });
  }

  async batchProcess(
    ids: string[],
    options: BatchProcessOptions,
  ): Promise<DatabaseResult<MediaItem[]>> {
    const { userId, tenantId, ...config } = options;
    return safeCall(async () => {
      return await this.mediaService.batchProcessImages(
        ids,
        config,
        userId,
        tenantId as DatabaseId,
      );
    });
  }

  async references(mediaId: string, options: TenantOptions = {}): Promise<DatabaseResult<any[]>> {
    return safeCall(async () => {
      if (!mediaId) throw new AppError("Media ID is required", 400);
      const refs = await this.mediaService.getMediaReferences(
        mediaId,
        options.tenantId as DatabaseId,
      );
      return refs.map((r) => ({
        ...r,
        entryName: r.entryName ?? r.entryId,
        fieldName: r.fieldName ?? r.fieldPath,
      }));
    });
  }

  /**
   * Returns all published collection entries that reference a specific mediaId.
   * Filters entries to only those with status "publish".
   */
  async getPublishedReferences(
    mediaId: string,
    options: TenantOptions = {},
  ): Promise<
    {
      collectionId: string;
      collectionName: string;
      entryId: string;
      entryName: string;
      fieldName: string;
    }[]
  > {
    if (!mediaId) throw new AppError("Media ID is required", 400);
    const refs = await this.mediaService.getPublishedReferences(
      mediaId,
      options.tenantId as DatabaseId,
    );
    return refs.map((r) => ({
      ...r,
      entryName: r.entryName ?? r.entryId,
      fieldName: r.fieldName ?? r.fieldPath,
    }));
  }

  async uploadVersion(
    mediaId: string,
    file: File,
    options: { userId: string; tenantId?: DatabaseId | null },
  ): Promise<DatabaseResult<MediaItem>> {
    const { userId, tenantId } = options;
    return safeCall(async () => {
      if (!mediaId) throw new AppError("Media ID is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);
      if (!isFileLike(file)) throw new AppError("Valid file is required", 400);

      const result = await this.mediaService.uploadNewVersion(
        mediaId,
        file,
        userId,
        tenantId as DatabaseId,
      );
      this.invalidateCache(tenantId, mediaId);
      return result;
    });
  }

  async restoreVersion(
    mediaId: string,
    versionNumber: number,
    options: { userId: string; tenantId?: DatabaseId | null },
  ): Promise<DatabaseResult<MediaItem>> {
    const { userId, tenantId } = options;
    return safeCall(async () => {
      if (!mediaId) throw new AppError("Media ID is required", 400);
      if (!versionNumber) throw new AppError("Version number is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);

      const result = await this.mediaService.restoreVersion(
        mediaId,
        versionNumber,
        userId,
        tenantId as DatabaseId,
      );
      this.invalidateCache(tenantId, mediaId);
      return result;
    });
  }

  /**
   * Release derivatives/version blobs that no media record references any more.
   * Runs without the job queue so it still works when `DISABLE_JOBS` is set or a
   * background job is stuck.
   */
  async cleanup(options: MediaCleanupOptions = {}): Promise<DatabaseResult<MediaCleanupResult>> {
    return safeCall(async () => {
      const data = await cleanupMediaVersions(this._dbAdapter, options);
      if (!options.dryRun) this.invalidateCache(options.tenantId);
      return data;
    });
  }

  /**
   * Reconcile persisted `processingStatus` values with the derivatives that
   * actually exist; optionally re-queue missing variant generation.
   */
  async syncStatus(
    options: MediaStatusSyncOptions = {},
  ): Promise<DatabaseResult<MediaStatusSyncResult>> {
    return safeCall(async () => {
      const data = await syncMediaProcessingStatus(this._dbAdapter, options);
      if (options.persist !== false || options.requeue) this.invalidateCache(options.tenantId);
      return data;
    });
  }
}
