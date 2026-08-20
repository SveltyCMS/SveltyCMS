/**
 * @file src/databases/mongodb/media-module.ts
 * @description Consolidated Media management module for MongoDB — options-last API (BaseQueryOptions).
 */

import { DatabaseModule } from "../core/base-adapter";
import type {
  IMediaAdapter,
  DatabaseResult,
  DatabaseId,
  MediaItem,
  CmsMediaMetadata,
  PaginatedResult,
  BaseQueryOptions,
  MediaQueryOptions,
} from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import { type IMedia, mediaSchema } from "./media";
import { CacheCategory, invalidateCategoryCache, withCache } from "./mongodb-cache-utils";
import { createDatabaseError, generateId, processDates } from "./mongodb-utils";
import { assertTenantContext, safeQuery } from "@src/utils/security/safe-query";
import { isAdmin } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import type { Model, QueryFilter } from "mongoose";

export class MongoMediaMethods {
  constructor(private readonly mediaModel: Model<IMedia>) {
    logger.debug("MongoMediaMethods initialized with media model.");
  }

  async uploadMany(
    files: Omit<MediaItem, "_id">[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem[]>> {
    try {
      assertTenantContext(options, "media.uploadMany");
      const tenantId = options?.tenantId;
      const filesWithTenant =
        tenantId !== undefined && tenantId !== null
          ? files.map((f) => ({ ...f, tenantId }))
          : files;

      const filesWithIds = filesWithTenant.map((f) => ({ ...f, _id: generateId() }));
      const result = await this.mediaModel.insertMany(filesWithIds, {
        lean: true,
      });

      await invalidateCategoryCache(CacheCategory.MEDIA);

      return {
        success: true,
        data: result as unknown as MediaItem[],
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to upload media files",
        error: createDatabaseError(
          error,
          "MEDIA_UPLOAD_MANY_ERROR",
          "Failed to upload media files",
        ),
      };
    }
  }

  async deleteMany(
    fileIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      assertTenantContext(options, "media.deleteMany");
      if (fileIds.length === 0) {
        return { success: true, data: { deletedCount: 0 } };
      }
      const query = safeQuery(
        {
          _id: { $in: fileIds } as unknown as QueryFilter<IMedia>["_id"],
        },
        options?.tenantId as string,
        options,
      );
      const result = await this.mediaModel.deleteMany(query);

      await invalidateCategoryCache(CacheCategory.MEDIA);

      return { success: true, data: { deletedCount: result.deletedCount } };
    } catch (error) {
      return {
        success: false,
        message: "Failed to delete media files",
        error: createDatabaseError(
          error,
          "MEDIA_DELETE_MANY_ERROR",
          "Failed to delete media files",
        ),
      };
    }
  }

  async updateMetadata(
    fileId: DatabaseId,
    metadata: Partial<CmsMediaMetadata>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem | null>> {
    try {
      assertTenantContext(options, "media.updateMetadata");
      const updateData = Object.entries(metadata).reduce(
        (acc, [key, value]) => {
          acc[`metadata.${key}`] = value;
          return acc;
        },
        {} as Record<string, unknown>,
      );

      updateData.updatedAt = new Date();
      const query = safeQuery({ _id: fileId }, options?.tenantId as string, options);

      const result = await this.mediaModel
        .findOneAndUpdate(query as any, { $set: updateData }, { returnDocument: "after" })
        .lean()
        .exec();

      await invalidateCategoryCache(CacheCategory.MEDIA);

      return { success: true, data: result as unknown as MediaItem | null };
    } catch (error) {
      return {
        success: false,
        message: "Failed to update metadata",
        error: createDatabaseError(error, "UPDATE_METADATA_ERROR", "Failed to update metadata"),
      };
    }
  }

  async move(
    fileIds: DatabaseId[],
    targetFolderId?: DatabaseId | null,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ movedCount: number }>> {
    try {
      assertTenantContext(options, "media.move");
      const query = safeQuery(
        { _id: { $in: fileIds } as unknown as QueryFilter<IMedia>["_id"] },
        options?.tenantId as string,
        options,
      );
      const result = await this.mediaModel.updateMany(query as any, {
        $set: { folderId: (targetFolderId ?? null) as string, updatedAt: new Date() },
      });

      await invalidateCategoryCache(CacheCategory.MEDIA);

      return { success: true, data: { movedCount: result.modifiedCount } };
    } catch (error) {
      return {
        success: false,
        message: "Failed to move files",
        error: createDatabaseError(error, "MEDIA_MOVE_ERROR", "Failed to move files"),
      };
    }
  }

  async getMetadata(
    fileIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> {
    try {
      assertTenantContext(options, "media.getMetadata");
      const query = safeQuery(
        { _id: { $in: fileIds } as unknown as QueryFilter<IMedia>["_id"] },
        options?.tenantId as string,
        options,
      );
      const results = await this.mediaModel
        .find(query as any, { metadata: 1 })
        .lean()
        .exec();

      const metadataMap: Record<string, CmsMediaMetadata> = {};
      results.forEach((r: any) => {
        metadataMap[r._id] = r.metadata as CmsMediaMetadata;
      });
      return { success: true, data: metadataMap };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get metadata",
        error: createDatabaseError(error, "GET_METADATA_ERROR", "Failed to get metadata"),
      };
    }
  }

  async duplicate(
    fileId: DatabaseId,
    newName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      assertTenantContext(options, "media.duplicate");
      const query = safeQuery({ _id: fileId }, options?.tenantId as string, options);
      const existing = await this.mediaModel
        .findOne(query as any)
        .lean()
        .exec();
      if (!existing) {
        return {
          success: false,
          message: "File not found",
          error: { code: "NOT_FOUND", message: "File not found" },
        };
      }

      const copy = {
        ...existing,
        _id: generateId(),
        filename: newName || `${existing.filename}_copy`,
        tenantId: options?.tenantId ?? (existing as any).tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      delete (copy as any).__v;

      const result = await this.mediaModel.create(copy as any);
      return {
        success: true,
        data: (result as any).toObject() as unknown as MediaItem,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to duplicate file",
        error: createDatabaseError(error, "DUPLICATE_ERROR", "Failed to duplicate file"),
      };
    }
  }

  async getByHash(
    hash: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem | null>> {
    try {
      assertTenantContext(options, "media.getByHash");
      const query = safeQuery({ hash }, options?.tenantId as string, options);
      const result = await this.mediaModel
        .findOne(query as any)
        .lean()
        .exec();
      return {
        success: true,
        data: result ? (processDates(result) as unknown as MediaItem) : null,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get media by hash",
        error: createDatabaseError(error, "GET_MEDIA_BY_HASH_ERROR", "Failed to get media by hash"),
      };
    }
  }

  async getFolders(
    parentId?: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<any[]>> {
    try {
      assertTenantContext(options, "media.getFolders");
      const query: Record<string, unknown> = parentId ? { parentId } : {};
      const secureQuery = safeQuery(query as any, options?.tenantId as string, options);

      const folderModel = this.mediaModel.db.model("media_folders");
      const folders = await folderModel.find(secureQuery).lean().exec();

      return { success: true, data: folders };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get folders",
        error: createDatabaseError(error, "GET_FOLDERS_ERROR", "Failed to get folders"),
      };
    }
  }

  async getFiles(
    folderId?: DatabaseId,
    options: MediaQueryOptions = {},
  ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> {
    assertTenantContext(options, "media.getFiles");
    const {
      page = 1,
      pageSize = 25,
      sortField = "createdAt",
      sortDirection = "desc",
      user,
      jsonPath,
      recursive = false,
      tenantId,
      includeLegacyUntenanted = false,
    } = options;

    const userId = user?._id?.toString();
    const isAdminUser = isAdmin(user);
    const shouldFilterByUser = user && !isAdminUser;

    const jsonPathKey = jsonPath?.trim() ? `:jp:${jsonPath.trim().slice(0, 120)}` : "";
    const cacheKey = `media:files:${folderId || "root"}:${page}:${pageSize}:${sortField}:${sortDirection}:rec:${recursive}:${tenantId || "no-tenant"}${shouldFilterByUser ? `:user:${userId}` : ""}${jsonPathKey}:leg:${includeLegacyUntenanted ? 1 : 0}`;

    const fetchData = async (): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
      try {
        let query: Record<string, unknown> = {};
        if (recursive) {
          query = {};
        } else {
          query = folderId ? { folderId } : { folderId: { $in: [null, undefined] } };
        }

        if (shouldFilterByUser) {
          query = {
            ...query,
            $or: [{ createdBy: userId }, { user: userId }, { path: /^global\// }],
          };
        }

        if (jsonPath?.trim()) {
          const { buildMediaJsonPathMongoFilter } = await import("../core/media-json-path");
          const { filter: jpFilter } = buildMediaJsonPathMongoFilter(jsonPath.trim());
          if (jpFilter) {
            query = { $and: [query, jpFilter] };
          }
        }

        const secureQuery = safeQuery(
          query as unknown as import("../db-interface").QueryFilter<MediaItem>,
          tenantId as string,
          options,
        );

        if (
          includeLegacyUntenanted &&
          tenantId &&
          (secureQuery as Record<string, unknown>).tenantId === tenantId
        ) {
          (secureQuery as Record<string, unknown>).tenantId = {
            $in: [tenantId, null, undefined],
          };
        }

        const skip = (page - 1) * pageSize;
        const sort: Record<string, 1 | -1> = {
          [sortField]: sortDirection === "asc" ? 1 : -1,
        };

        const [items, total] = await Promise.all([
          this.mediaModel
            .find(secureQuery as QueryFilter<IMedia>)
            .sort(sort)
            .skip(skip)
            .limit(pageSize)
            .lean()
            .exec(),
          this.mediaModel.countDocuments(secureQuery as QueryFilter<IMedia>),
        ]);

        return {
          success: true,
          data: {
            items: items as unknown as MediaItem[],
            total,
            page,
            pageSize,
            hasNextPage: page * pageSize < total,
            hasPreviousPage: page > 1,
          },
        };
      } catch (error) {
        return {
          success: false,
          message: "Failed to fetch media files",
          error: createDatabaseError(error, "GET_FILES_ERROR", "Failed to fetch media files"),
        };
      }
    };

    return withCache(cacheKey, fetchData, { category: CacheCategory.MEDIA });
  }
}

export class MongoMediaModule extends DatabaseModule<MongoAdapterCore> implements IMediaAdapter {
  private _media: MongoMediaMethods | null = null;

  private async _getMedia() {
    if (this._media) return this._media;

    const mediaModel = (this.adapter as any)._getOrCreateModel("media", mediaSchema);
    this._media = new MongoMediaMethods(mediaModel);
    return this._media;
  }

  async uploadMany(
    files: Omit<MediaItem, "_id">[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem[]>> {
    const res = await (await this._getMedia()).uploadMany(files, options);
    if (res.success) await this.adapter.invalidateQueryCache("media", options?.tenantId);
    return res;
  }

  async deleteMany(
    fileIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const res = await (await this._getMedia()).deleteMany(fileIds, options);
    if (res.success) await this.adapter.invalidateQueryCache("media", options?.tenantId);
    return res;
  }

  async updateMetadata(
    fileId: DatabaseId,
    metadata: Partial<CmsMediaMetadata>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem | null>> {
    const res = await (await this._getMedia()).updateMetadata(fileId, metadata, options);
    if (res.success) await this.adapter.invalidateQueryCache("media", options?.tenantId);
    return res;
  }

  async move(
    fileIds: DatabaseId[],
    targetFolderId?: DatabaseId | null,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ movedCount: number }>> {
    const res = await (await this._getMedia()).move(fileIds, targetFolderId, options);
    if (res.success) await this.adapter.invalidateQueryCache("media", options?.tenantId);
    return res;
  }

  async getMetadata(
    fileIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> {
    return (await this._getMedia()).getMetadata(fileIds, options);
  }

  async duplicate(
    fileId: DatabaseId,
    newName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem>> {
    const res = await (await this._getMedia()).duplicate(fileId, newName, options);
    if (res.success) await this.adapter.invalidateQueryCache("media", options?.tenantId);
    return res;
  }

  async getByHash(
    hash: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<MediaItem | null>> {
    return (await this._getMedia()).getByHash(hash, options);
  }

  async getFiles(
    folderId?: DatabaseId,
    options: MediaQueryOptions = {},
  ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> {
    return (await this._getMedia()).getFiles(folderId, options);
  }

  async getFolders(
    parentId?: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<any[]>> {
    return (await this._getMedia()).getFolders(parentId, options);
  }

  files = {
    upload: async (file: any, options?: BaseQueryOptions) =>
      this.uploadMany([file], options).then((res) => ({
        ...res,
        data: res.success ? res.data[0] : (undefined as any),
      })),
    uploadMany: (files: any[], options?: BaseQueryOptions) => this.uploadMany(files, options),
    delete: (id: DatabaseId, options?: BaseQueryOptions) =>
      this.deleteMany([id], options).then((res) => ({
        ...res,
        data: undefined,
      })),
    deleteMany: (ids: DatabaseId[], options?: BaseQueryOptions) => this.deleteMany(ids, options),
    getMetadata: (ids: DatabaseId[], options?: BaseQueryOptions) => this.getMetadata(ids, options),
    updateMetadata: (id: DatabaseId, meta: any, options?: BaseQueryOptions) =>
      this.updateMetadata(id, meta, options) as any,
    move: (ids: DatabaseId[], target?: DatabaseId | null, options?: BaseQueryOptions) =>
      this.move(ids, target, options),
    duplicate: (id: DatabaseId, name?: string, options?: BaseQueryOptions) =>
      this.duplicate(id, name, options),
    getByFolder: (folder?: DatabaseId, opt?: MediaQueryOptions) => this.getFiles(folder, opt),
    restore: (id: DatabaseId, options?: BaseQueryOptions) =>
      (this.adapter as any).crud.restore("media", id, options),
    search: (q: string, opt?: MediaQueryOptions) =>
      this.getFiles(undefined, { ...opt, search: q, recursive: false }),
    getByHash: (hash: string, options?: BaseQueryOptions) => this.getByHash(hash, options),
  };

  folders = {
    getTree: (_maxDepth?: number, options?: BaseQueryOptions) =>
      this.getFolders(undefined, options),
    getFolderContents: async (folderId?: DatabaseId, options?: MediaQueryOptions) => {
      const [foldersRes, filesRes] = await Promise.all([
        this.getFolders(folderId, options),
        this.getFiles(folderId, options),
      ]);
      if (!foldersRes.success) return foldersRes as any;
      if (!filesRes.success) return filesRes as any;
      return {
        success: true,
        data: {
          folders: foldersRes.data,
          files: filesRes.data.items,
          totalCount: filesRes.data.total,
        },
      };
    },
    create: (folder: any, options?: BaseQueryOptions) =>
      (this.adapter as any).crud.insert(
        "media_folders",
        { ...folder, tenantId: options?.tenantId ?? folder.tenantId },
        options,
      ),
    createMany: (folders: any[], options?: BaseQueryOptions) =>
      (this.adapter as any).crud.insertMany(
        "media_folders",
        folders.map((f: any) => ({ ...f, tenantId: options?.tenantId ?? f.tenantId })),
        options,
      ),
    delete: (id: DatabaseId, options?: BaseQueryOptions) =>
      (this.adapter as any).crud.delete("media_folders", id, options),
    deleteMany: (ids: DatabaseId[], options?: BaseQueryOptions) =>
      (this.adapter as any).crud.deleteMany("media_folders", { _id: { $in: ids } } as any, options),
    move: (id: DatabaseId, target?: DatabaseId | null, options?: BaseQueryOptions) =>
      (this.adapter as any).crud.update(
        "media_folders",
        id,
        { parentId: target ?? null } as any,
        options,
      ),
  };

  setupMediaModels() {
    return Promise.resolve();
  }
}
