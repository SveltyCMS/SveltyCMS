/**
 * @file src/databases/mongodb/modules/media-module.ts
 * @description Media management module for MongoDB.
 */

import { DatabaseModule } from "../base-adapter";
import type {
  IMediaAdapter,
  DatabaseResult,
  DatabaseId,
  MediaItem,
  CmsMediaMetadata,
  PaginatedResult,
  PaginationOptions,
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
    tenantId?: string | null,
  ): Promise<DatabaseResult<MediaItem[]>> {
    const res = await (await this._getMedia()).uploadMany(files, tenantId);
    if (res.success) await this.adapter.invalidateQueryCache("media", tenantId);
    return res;
  }

  async deleteMany(
    fileIds: DatabaseId[],
    tenantId?: string | null,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const res = await (await this._getMedia()).deleteMany(fileIds, tenantId);
    if (res.success) await this.adapter.invalidateQueryCache("media", tenantId);
    return res;
  }

  async updateMetadata(
    fileId: DatabaseId,
    metadata: Partial<CmsMediaMetadata>,
    tenantId?: string | null,
  ): Promise<DatabaseResult<MediaItem | null>> {
    const res = await (await this._getMedia()).updateMetadata(fileId, metadata, tenantId);
    if (res.success) await this.adapter.invalidateQueryCache("media", tenantId);
    return res;
  }

  async move(
    fileIds: DatabaseId[],
    targetFolderId?: DatabaseId,
    tenantId?: string | null,
  ): Promise<DatabaseResult<{ movedCount: number }>> {
    const res = await (await this._getMedia()).move(fileIds, targetFolderId, tenantId);
    if (res.success) await this.adapter.invalidateQueryCache("media", tenantId);
    return res;
  }

  async getMetadata(
    fileIds: DatabaseId[],
    tenantId?: string | null,
  ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> {
    return (await this._getMedia()).getMetadata(fileIds, tenantId);
  }

  async duplicate(
    fileId: DatabaseId,
    newName?: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<MediaItem>> {
    const res = await (await this._getMedia()).duplicate(fileId, newName, tenantId);
    if (res.success) await this.adapter.invalidateQueryCache("media", tenantId);
    return res;
  }

  async getFolders(
    parentId?: DatabaseId,
    tenantId?: string | null,
  ): Promise<DatabaseResult<any[]>> {
    return (await this._getMedia()).getFolders(parentId, tenantId);
  }

  async getFiles(
    folderId?: DatabaseId,
    options?: PaginationOptions,
    recursive?: boolean,
    tenantId?: string | null,
  ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> {
    return (await this._getMedia()).getFiles(folderId, options, recursive, tenantId);
  }

  files = {
    upload: async (file: any, tenantId?: DatabaseId | null) =>
      this.uploadMany([file], tenantId).then((res) => ({
        ...res,
        data: res.success ? res.data[0] : (undefined as any),
      })),
    uploadMany: (files: any[], tenantId?: DatabaseId | null) => this.uploadMany(files, tenantId),
    delete: (id: DatabaseId, tenantId?: DatabaseId | null) =>
      this.deleteMany([id], tenantId).then((res) => ({ ...res, data: undefined })),
    deleteMany: (ids: DatabaseId[], tenantId?: DatabaseId | null) => this.deleteMany(ids, tenantId),
    getMetadata: (ids: DatabaseId[], tenantId?: DatabaseId | null) =>
      this.getMetadata(ids, tenantId),
    updateMetadata: (id: DatabaseId, meta: any, tenantId?: DatabaseId | null) =>
      this.updateMetadata(id, meta, tenantId) as any,
    move: (ids: DatabaseId[], target: DatabaseId, tenantId?: DatabaseId | null) =>
      this.move(ids, target, tenantId),
    duplicate: (id: DatabaseId, name?: string, tenantId?: DatabaseId | null) =>
      this.duplicate(id, name, tenantId),
    getByFolder: (folder?: DatabaseId, opt?: any, rec?: boolean, tenantId?: DatabaseId | null) =>
      this.getFiles(folder, opt, rec, tenantId),
    restore: (id: DatabaseId, tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.restore("media", id, { tenantId }),
    search: (q: string, opt?: any, tenantId?: DatabaseId | null) =>
      this.getFiles(undefined, { ...opt, search: q }, false, tenantId),
    getByHash: (hash: string, tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.findOne("media", { hash }, { tenantId }),
  };

  folders = {
    getTree: (_maxDepth?: number, tenantId?: DatabaseId | null) =>
      this.getFolders(undefined, tenantId),
    getFolderContents: async (
      folderId?: DatabaseId,
      options?: any,
      tenantId?: DatabaseId | null,
    ) => {
      const [foldersRes, filesRes] = await Promise.all([
        this.getFolders(folderId, tenantId),
        this.getFiles(folderId, options, false, tenantId),
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
    create: (folder: any, tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.insert("media_folders", { ...folder, tenantId }),
    createMany: (folders: any[], tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.insertMany(
        "media_folders",
        folders.map((f: any) => ({ ...f, tenantId })),
      ),
    delete: (id: DatabaseId, tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.delete("media_folders", id, { tenantId }),
    deleteMany: (ids: DatabaseId[], tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.deleteMany("media_folders", { _id: { $in: ids } } as any, {
        tenantId,
      }),
    move: (id: DatabaseId, target: DatabaseId, tenantId?: DatabaseId | null) =>
      (this.adapter as any).crud.update("media_folders", id, { parentId: target } as any, {
        tenantId,
      }),
  };

  setupMediaModels() {
    return Promise.resolve();
  }
}
