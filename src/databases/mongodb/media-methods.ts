/**
 * @file src/databases/mongodb/methods/media-methods.ts
 * @description Media file management for the MongoDB adapter.
 * This implementation uses flat file storage with hash-based naming.
 * Files are physically organized in year/month folders on disk.
 * The database stores only metadata - no folder hierarchy.
 * Relies on Dependency Injection for testability.
 */

import { logger } from "@utils/logger";
import type mongoose from "mongoose";
import type { Model, QueryFilter } from "mongoose";
import type {
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  MediaItem,
  CmsMediaMetadata,
  MediaQueryOptions,
  PaginatedResult,
} from "../db-interface";
import { type IMedia, mediaSchema } from "./media";
import { CacheCategory, invalidateCategoryCache, withCache } from "./mongodb-cache-utils";
import { createDatabaseError, generateId } from "./mongodb-utils";
import { assertTenantContext, safeQuery } from "@src/utils/security/safe-query";

// Define model types for dependency injection
type MediaModelType = Model<IMedia>;

export class MongoMediaMethods {
  private readonly mediaModel: MediaModelType;

  /**
   * Constructs the MongoMediaMethods instance.
   * @param {MediaModelType} mediaModel - The Mongoose model for the 'media' collection.
   */
  constructor(mediaModel: MediaModelType) {
    this.mediaModel = mediaModel;
    logger.debug("MongoMediaMethods initialized with media model.");
  }

  /**
   * Idempotently registers the required Mongoose models.
   * This should be called once during application startup.
   * @param {typeof mongoose} mongooseInstance - The active Mongoose instance.
   */
  static registerModels(mongooseInstance: typeof mongoose): void {
    if (!mongooseInstance.models.media) {
      mongooseInstance.model("media", mediaSchema);
      logger.debug("Model 'media' was registered.");
    }
  }

  // ============================================================
  // File Operations
  // ============================================================

  /// Uploads multiple media files in a single, efficient batch operation
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
      const result = await this.mediaModel.insertMany(filesWithTenant, {
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

  // Deletes multiple media files in a single batch operation
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

  // Updates metadata for a single file
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

  // Moves multiple files to a different folder
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

  // Retrieves metadata for multiple files
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

  // Duplicates a media file
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

  // Retrieves folders for the tenant (placeholder for more complex tree logic if needed)
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

  // Retrieves a paginated list of media files, optionally filtered by folder
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
    const isAdmin = user?.role === "admin" || user?.isAdmin === true;
    const shouldFilterByUser = user && !isAdmin;

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

        // Legacy untenanted rows only when explicitly requested (default: fail-closed scope)
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
