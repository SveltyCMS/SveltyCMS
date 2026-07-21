/**
 * @file src/databases/mongodb/media-module.ts
 * @description Media management module for MongoDB — options-last API (BaseQueryOptions).
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
import { MongoMediaMethods } from "./media-methods";
import { mediaSchema } from "./media";

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

  async getFolders(
    parentId?: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<any[]>> {
    return (await this._getMedia()).getFolders(parentId, options);
  }

  async getFiles(
    folderId?: DatabaseId,
    options?: MediaQueryOptions,
  ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> {
    return (await this._getMedia()).getFiles(folderId, options);
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
    getByHash: (hash: string, options?: BaseQueryOptions) =>
      (this.adapter as any).crud.findOne("media", { hash }, options),
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
