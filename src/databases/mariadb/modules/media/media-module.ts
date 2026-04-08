/**
 * @file src/databases/mariadb/modules/media/media-module.ts
 * @description Media management module for MariaDB.
 */

import type {
  DatabaseId,
  DatabaseResult,
  MediaFolder,
  MediaItem,
  CmsMediaMetadata,
  PaginationOptions,
  PaginatedResult,
  EntityCreate,
} from "../../../db-interface";
import type { MariaDBAdapter } from "../../adapter";

export class MediaModule {
  private readonly adapter: MariaDBAdapter;

  constructor(adapter: MariaDBAdapter) {
    this.adapter = adapter;
  }

  public readonly files = {
    upload: (
      file: EntityCreate<MediaItem>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem>> =>
      this.adapter.crud.insert("media", file as any, { tenantId }),

    uploadMany: (
      files: EntityCreate<MediaItem>[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem[]>> =>
      this.adapter.crud.insertMany("media", files as any[], { tenantId }),

    getByHash: async (
      hash: string,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem | null>> =>
      this.adapter.crud.findOne("media", { hash } as any, { tenantId }),

    restore: async (
      fileId: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<void>> => this.adapter.crud.restore("media", fileId, { tenantId }),

    delete: (fileId: DatabaseId, tenantId?: DatabaseId | null): Promise<DatabaseResult<void>> =>
      this.adapter.crud.delete("media", fileId, { tenantId }),

    deleteMany: (
      fileIds: DatabaseId[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ deletedCount: number }>> =>
      this.adapter.crud.deleteMany("media", { _id: { $in: fileIds } } as any, {
        tenantId,
      }),

    getByFolder: (
      folderId?: DatabaseId,
      options?: PaginationOptions,
      _recursive?: boolean,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> =>
      this.adapter.wrap(async () => {
        const res = await this.adapter.crud.findMany<MediaItem>(
          "media",
          { folderId: folderId || null } as any,
          {
            ...options,
            tenantId: tenantId ?? undefined,
          } as any,
        );
        return this.adapter.utils.createPagination(
          res.success ? res.data || [] : [],
          options || {},
        );
      }, "GET_FILES_BY_FOLDER_FAILED"),

    search: (
      query: string,
      options?: PaginationOptions,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> =>
      this.adapter.wrap(async () => {
        const res = await this.adapter.crud.findMany<MediaItem>(
          "media",
          { filename: { $regex: query } } as any,
          {
            ...options,
            tenantId: tenantId ?? undefined,
          } as any,
        );
        return this.adapter.utils.createPagination(
          res.success ? res.data || [] : [],
          options || {},
        );
      }, "SEARCH_FILES_FAILED"),

    getMetadata: (
      fileIds: DatabaseId[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> =>
      this.adapter.wrap(async () => {
        const res = await this.adapter.crud.findMany<MediaItem>(
          "media",
          { _id: { $in: fileIds } } as any,
          { tenantId },
        );
        const metadata: Record<string, CmsMediaMetadata> = {};
        if (res.success && res.data) {
          for (const item of res.data) {
            metadata[item._id as string] = item.metadata;
          }
        }
        return metadata;
      }, "GET_METADATA_FAILED"),

    updateMetadata: (
      fileId: DatabaseId,
      metadata: Partial<CmsMediaMetadata>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem>> =>
      this.adapter.crud.update("media", fileId, { metadata } as any, { tenantId }),

    move: (
      fileIds: DatabaseId[],
      targetFolderId?: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ movedCount: number }>> =>
      this.adapter.wrap(async () => {
        const res = await this.adapter.crud.updateMany(
          "media",
          { _id: { $in: fileIds } } as any,
          { folderId: targetFolderId || null } as any,
          { tenantId },
        );
        return { movedCount: res.success ? res.data?.modifiedCount || 0 : 0 };
      }, "MOVE_FILES_FAILED"),

    duplicate: async (
      fileId: DatabaseId,
      newName?: string,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem>> => {
      const res = await this.adapter.crud.findOne<MediaItem>("media", { _id: fileId } as any, {
        tenantId,
      });
      if (!res.success || !res.data) return res as any;
      const newItem = {
        ...res.data,
        _id: undefined,
        filename: newName || `copy_${res.data.filename}`,
        createdAt: undefined,
        updatedAt: undefined,
      };
      return this.adapter.crud.insert("media", newItem as any, { tenantId });
    },
  };

  public readonly folders = {
    create: (
      folder: EntityCreate<MediaFolder>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder>> =>
      this.adapter.crud.insert("media_folders", folder as any, { tenantId }),

    createMany: (
      folders: EntityCreate<MediaFolder>[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder[]>> =>
      this.adapter.crud.insertMany("media_folders", folders as any[], { tenantId }),

    delete: (folderId: DatabaseId, tenantId?: DatabaseId | null): Promise<DatabaseResult<void>> =>
      this.adapter.crud.delete("media_folders", folderId, { tenantId }),

    deleteMany: (
      folderIds: DatabaseId[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ deletedCount: number }>> =>
      this.adapter.crud.deleteMany("media_folders", { _id: { $in: folderIds } } as any, {
        tenantId,
      }),

    getTree: (
      maxDepth?: number,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder[]>> =>
      this.adapter.crud.findMany("media_folders", {}, { limit: maxDepth, tenantId }),

    getFolderContents: (
      folderId?: DatabaseId,
      options?: PaginationOptions,
      tenantId?: DatabaseId | null,
    ): Promise<
      DatabaseResult<{
        folders: MediaFolder[];
        files: MediaItem[];
        totalCount: number;
      }>
    > =>
      this.adapter.wrap(async () => {
        const [foldersRes, filesRes] = await Promise.all([
          this.adapter.crud.findMany<MediaFolder>(
            "media_folders",
            { parentId: folderId || null } as any,
            { tenantId },
          ),
          this.files.getByFolder(folderId, options, false, tenantId),
        ]);
        const folders = foldersRes.success ? foldersRes.data || [] : [];
        const files = filesRes.success ? filesRes.data?.items || [] : [];
        return {
          folders,
          files,
          totalCount: folders.length + (filesRes.success ? filesRes.data?.total || 0 : 0),
        };
      }, "GET_FOLDER_CONTENTS_FAILED"),

    move: (
      folderId: DatabaseId,
      targetParentId?: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder>> =>
      this.adapter.crud.update(
        "media_folders",
        folderId,
        { parentId: targetParentId || null } as any,
        { tenantId },
      ),
  };

  async setupMediaModels(): Promise<void> {}
}
