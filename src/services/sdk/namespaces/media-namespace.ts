/**
 * @file src/services/local-cms/media-namespace.ts
 * @description Media namespace for LocalCMS SDK.
 */

import { AppError } from "@utils/error-handling";
import { LRUCache } from "lru-cache";
import type { DatabaseId, IDBAdapter, DatabaseResult } from "@src/databases/db-interface";
import type { MediaItem } from "@utils/media/media-models";

let _MediaService: any = null;
async function getMediaServiceClass() {
  if (!_MediaService) {
    const mod = await import("@utils/media/media-service.server");
    _MediaService = mod.MediaService;
  }
  return _MediaService;
}

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

interface FindOptions {
  tenantId?: DatabaseId | null;
  limit?: number;
  folderId?: string;
  recursive?: boolean;
  prefix?: string;
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
  private mediaService: any = null;
  private _dbAdapter: IDBAdapter;

  // Mirror the pattern used in CollectionsNamespace: static LRU for request-level dedup
  private static _requestCache = new LRUCache<string, any>({
    max: 500,
    ttl: 60_000,
  });

  constructor(_dbAdapter: IDBAdapter) {
    this._dbAdapter = _dbAdapter;
  }

  private async getMediaService() {
    if (!this.mediaService) {
      const MediaService = await getMediaServiceClass();
      this.mediaService = new MediaService(this._dbAdapter);
    }
    return this.mediaService;
  }

  private invalidateCache(tenantId?: DatabaseId | null, fileId?: string) {
    // Basic invalidation: clear related keys or the whole cache
    if (fileId) {
      MediaNamespace._requestCache.delete(`${tenantId ?? "global"}:media:${fileId}`);
    }
    // For simplicity, we often clear larger chunks on folder changes
    // But for now, we just let TTL handle it or clear specific keys.
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async find(options: FindOptions = {}): Promise<DatabaseResult<any>> {
    const { tenantId, limit = 100, folderId, recursive = false, prefix } = options;

    const cacheKey = `${tenantId ?? "global"}:media:folder:${folderId ?? "root"}:${limit}:${recursive}`;
    if (MediaNamespace._requestCache.has(cacheKey)) {
      return MediaNamespace._requestCache.get(cacheKey);
    }

    const result = await this._dbAdapter.media.files.getByFolder(
      folderId as DatabaseId,
      {
        pageSize: limit,
        page: 1,
        sortField: "updatedAt",
        sortDirection: "desc",
      },
      recursive,
      tenantId as DatabaseId,
    );

    if (result.success && result.data?.items) {
      const svc = await this.getMediaService();
      result.data.items = result.data.items.map(
        (item: any) => svc.enrichMediaWithUrl(item, prefix) as any,
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
      const svc = await this.getMediaService();
      result.data = svc.enrichMediaWithUrl(result.data as any, prefix);
      MediaNamespace._requestCache.set(cacheKey, result);
    }

    return result;
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

    try {
      if (!userId) throw new AppError("User ID is required for upload", 400);
      if (!isFileLike(file)) throw new AppError("A valid File object is required", 400);

      const svc = await this.getMediaService();
      const result = await svc.saveMedia(
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
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async remote(url: string, options: RemoteOptions): Promise<DatabaseResult<MediaItem>> {
    const { userId, access = "private", tenantId } = options;
    try {
      if (!url) throw new AppError("URL is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);

      const svc = await this.getMediaService();
      const result = await svc.saveRemoteMedia(url, userId, access, tenantId as DatabaseId);

      this.invalidateCache(tenantId);
      return result;
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async update(
    mediaId: string,
    data: any,
    options: TenantOptions = {},
  ): Promise<DatabaseResult<void>> {
    try {
      if (!mediaId) throw new AppError("Media ID is required", 400);

      const svc = await this.getMediaService();
      await svc.updateMedia(mediaId, data, options.tenantId as DatabaseId);

      this.invalidateCache(options.tenantId, mediaId);
      return { success: true, data: undefined };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async delete(fileId: string, options: TenantOptions = {}): Promise<DatabaseResult<void>> {
    try {
      if (!fileId) throw new AppError("File ID is required", 400);

      const svc = await this.getMediaService();
      await svc.deleteMedia(fileId, options.tenantId as DatabaseId);

      this.invalidateCache(options.tenantId, fileId);
      return { success: true, data: undefined };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async manipulate(
    id: string,
    manipulations: any,
    options: ManipulateOptions,
  ): Promise<DatabaseResult<MediaItem>> {
    const { userId, tenantId } = options;
    try {
      if (!id) throw new AppError("Media ID is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);

      const svc = await this.getMediaService();
      const result = await svc.manipulateMedia(id, manipulations, userId, tenantId as DatabaseId);
      return { success: true, data: result };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async batchProcess(
    ids: string[],
    options: BatchProcessOptions,
  ): Promise<DatabaseResult<MediaItem[]>> {
    const { userId, tenantId, ...config } = options;
    try {
      const svc = await this.getMediaService();
      const result = await svc.batchProcessImages(ids, config, userId, tenantId as DatabaseId);
      return { success: true, data: result };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async references(mediaId: string, options: TenantOptions = {}): Promise<DatabaseResult<any[]>> {
    try {
      if (!mediaId) throw new AppError("Media ID is required", 400);
      const svc = await this.getMediaService();
      const refs = await svc.getMediaReferences(mediaId, options.tenantId as DatabaseId);
      return { success: true, data: refs };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
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
    const svc = await this.getMediaService();
    return svc.getPublishedReferences(mediaId, options.tenantId as DatabaseId);
  }

  async uploadVersion(
    mediaId: string,
    file: File,
    options: { userId: string; tenantId?: DatabaseId | null },
  ): Promise<DatabaseResult<MediaItem>> {
    const { userId, tenantId } = options;
    try {
      if (!mediaId) throw new AppError("Media ID is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);
      if (!isFileLike(file)) throw new AppError("Valid file is required", 400);

      const svc = await this.getMediaService();
      const result = await svc.uploadNewVersion(mediaId, file, userId, tenantId as DatabaseId);
      this.invalidateCache(tenantId, mediaId);
      return result;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }

  async restoreVersion(
    mediaId: string,
    versionNumber: number,
    options: { userId: string; tenantId?: DatabaseId | null },
  ): Promise<DatabaseResult<MediaItem>> {
    const { userId, tenantId } = options;
    try {
      if (!mediaId) throw new AppError("Media ID is required", 400);
      if (!versionNumber) throw new AppError("Version number is required", 400);
      if (!userId) throw new AppError("User ID is required", 400);

      const svc = await this.getMediaService();
      const result = await svc.restoreVersion(
        mediaId,
        versionNumber,
        userId,
        tenantId as DatabaseId,
      );
      this.invalidateCache(tenantId, mediaId);
      return result;
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as import("@src/databases/db-interface").DatabaseError,
      };
    }
  }
}
