/**
 * @file src/databases/core/relational-media.ts
 * @description
 * Unified Media module for all SQL-based database adapters.
 * Consolidates file and folder management logic using Drizzle ORM.
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { logger } from "@src/utils/logger";
import { and, asc, count, desc, eq, ilike, inArray, isNull, like, or } from "drizzle-orm";
import type {
  DatabaseId,
  DatabaseResult,
  MediaFolder,
  MediaItem,
  CmsMediaMetadata,
  PaginatedResult,
  PaginationOptions,
  EntityCreate,
  IMediaAdapter,
  BaseQueryOptions,
} from "../db-interface";
import type { BaseSqlAdapter } from "./base-sql-adapter";
import * as utils from "./relational-utils";

export class RelationalMediaModule implements IMediaAdapter {
  protected readonly adapter: BaseSqlAdapter;
  protected readonly schema: any;

  constructor(adapter: BaseSqlAdapter, schema: any) {
    this.adapter = adapter;
    this.schema = schema;
  }

  protected get db() {
    return (this.adapter as any).db!;
  }

  protected get crud() {
    return (this.adapter as any).crud;
  }

  protected getDb(options?: BaseQueryOptions) {
    const tx = options?.transaction;
    if (tx) {
      return tx.db || tx;
    }
    return this.db;
  }

  async setupMediaModels(): Promise<void> {
    logger.debug("Media models setup (no-op for SQL)");
  }

  public get files() {
    return {
      upload: async (
        file: EntityCreate<MediaItem>,
        tenantId?: string | null,
      ): Promise<DatabaseResult<MediaItem>> => {
        return this.crud.insert("media_items", file, { tenantId: tenantId as any });
      },

      uploadMany: async (
        files: EntityCreate<MediaItem>[],
        tenantId?: string | null,
      ): Promise<DatabaseResult<MediaItem[]>> => {
        return this.crud.insertMany("media_items", files, { tenantId: tenantId as any });
      },

      delete: async (
        fileId: DatabaseId,
        _tenantId?: string | null,
      ): Promise<DatabaseResult<void>> => {
        return this.crud.delete("media_items", fileId);
      },

      deleteMany: async (
        fileIds: DatabaseId[],
        tenantId?: string | null,
      ): Promise<DatabaseResult<{ deletedCount: number }>> => {
        return this.crud.deleteMany("media_items", { _id: { $in: fileIds } } as any, {
          tenantId: tenantId as any,
        });
      },

      getByFolder: async (
        folderId?: DatabaseId,
        options?: PaginationOptions,
        _recursive?: boolean,
        tenantId?: string | null | null,
        dbOptions?: BaseQueryOptions,
      ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
        return this.adapter.wrap(
          async () => {
            const conditions = folderId
              ? [eq(this.schema.mediaItems.folderId, folderId as string)]
              : [isNull(this.schema.mediaItems.folderId)];

            if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

            if (options?.user) {
              const isAdmin = options.user.role === "admin" || options.user.isAdmin === true;
              if (!isAdmin) {
                const userConditions = or(
                  eq(this.schema.mediaItems.createdBy, options.user._id as string),
                  like(this.schema.mediaItems.path, "global/%"),
                );
                if (userConditions) conditions.push(userConditions);
              }
            }

            let q = this.getDb(dbOptions).select().from(this.schema.mediaItems).$dynamic();
            if (conditions.length > 0) q = q.where(and(...conditions));

            if (options?.sortField) {
              const order = options.sortDirection === "desc" ? desc : asc;
              const column = (this.schema.mediaItems as any)[options.sortField];
              if (column) q = q.orderBy(order(column));
            }

            const limit = options?.pageSize || 20;
            const offset = ((options?.page || 1) - 1) * limit;
            q = q.limit(limit).offset(offset);

            const results = await q;
            const [countResult] = await this.getDb(dbOptions)
              .select({ count: count() })
              .from(this.schema.mediaItems)
              .where(and(...conditions));

            const total = Number(countResult?.count || 0);

            return {
              items: utils.convertArrayDatesToISO(results) as unknown as MediaItem[],
              total,
              page: options?.page || 1,
              pageSize: limit,
              hasNextPage: offset + limit < total,
              hasPreviousPage: (options?.page || 1) > 1,
            };
          },
          "GET_FILES_BY_FOLDER_FAILED",
          undefined,
          { transaction: dbOptions?.transaction },
        );
      },

      search: async (
        query: string,
        options?: PaginationOptions,
        tenantId?: string | null,
      ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
        return this.adapter.wrap(async () => {
          const isPg = (this.adapter as any).dialect === "postgresql";
          const op = isPg ? ilike : like;
          const qry = `%${query}%`;
          const conditions = [
            or(
              op(this.schema.mediaItems.filename, qry),
              op(this.schema.mediaItems.originalFilename, qry),
            ) as any,
          ];

          if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

          if (options?.user) {
            const isAdmin = options.user.role === "admin" || options.user.isAdmin === true;
            if (!isAdmin) {
              const userConditions = or(
                eq(this.schema.mediaItems.createdBy, options.user._id as string),
                like(this.schema.mediaItems.path, "global/%"),
              );
              if (userConditions) conditions.push(userConditions);
            }
          }

          let q = this.db.select().from(this.schema.mediaItems).$dynamic();
          q = q.where(and(...conditions));

          if (options?.sortField) {
            const order = options.sortDirection === "desc" ? desc : asc;
            const column = (this.schema.mediaItems as any)[options.sortField];
            if (column) q = q.orderBy(order(column));
          }

          const limit = options?.pageSize || 20;
          const offset = ((options?.page || 1) - 1) * limit;
          q = q.limit(limit).offset(offset);

          const results = await q;
          const [countResult] = await this.db
            .select({ count: count() })
            .from(this.schema.mediaItems)
            .where(and(...conditions));

          const total = Number(countResult?.count || 0);

          return {
            items: utils.convertArrayDatesToISO(results) as unknown as MediaItem[],
            total,
            page: options?.page || 1,
            pageSize: limit,
            hasNextPage: offset + limit < total,
            hasPreviousPage: (options?.page || 1) > 1,
          };
        }, "SEARCH_FILES_FAILED");
      },

      getMetadata: async (
        fileIds: DatabaseId[],
        tenantId?: string | null,
      ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> => {
        return this.adapter.wrap(async () => {
          const conditions = [inArray(this.schema.mediaItems._id, fileIds as string[])];
          if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

          const results = await this.db
            .select({ _id: this.schema.mediaItems._id, metadata: this.schema.mediaItems.metadata })
            .from(this.schema.mediaItems)
            .where(and(...conditions));

          const metadataMap: Record<string, CmsMediaMetadata> = {};
          results.forEach((r: any) => {
            metadataMap[r._id] = r.metadata as CmsMediaMetadata;
          });
          return metadataMap;
        }, "GET_FILE_METADATA_FAILED");
      },

      updateMetadata: async (
        fileId: DatabaseId,
        metadata: Partial<CmsMediaMetadata>,
        tenantId?: string | null,
      ): Promise<DatabaseResult<MediaItem>> => {
        return this.adapter.wrap(
          async () => {
            const conditions = [eq(this.schema.mediaItems._id, fileId as string)];
            if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

            const [existing] = await this.db
              .select({ metadata: this.schema.mediaItems.metadata })
              .from(this.schema.mediaItems)
              .where(and(...conditions))
              .limit(1);

            const newMetadata = { ...(existing?.metadata as any), ...metadata };
            const [updated] = await this.db
              .update(this.schema.mediaItems)
              .set(
                utils.convertISOToDates({
                  metadata: newMetadata,
                  updatedAt: nowISODateString(),
                }) as any,
              )
              .where(and(...conditions))
              .returning();

            return utils.convertDatesToISO(updated) as unknown as MediaItem;
          },
          "UPDATE_FILE_METADATA_FAILED",
          undefined,
          { isWrite: true },
        );
      },

      move: async (
        fileIds: DatabaseId[],
        targetFolderId?: DatabaseId,
        tenantId?: string | null,
      ): Promise<DatabaseResult<{ movedCount: number }>> => {
        return this.adapter.wrap(
          async () => {
            const conditions = [inArray(this.schema.mediaItems._id, fileIds as string[])];
            if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

            const results = await this.db
              .update(this.schema.mediaItems)
              .set(
                utils.convertISOToDates({
                  folderId: (targetFolderId || null) as any,
                  updatedAt: nowISODateString(),
                }) as any,
              )
              .where(and(...conditions))
              .returning();
            return { movedCount: results.length };
          },
          "MOVE_FILES_FAILED",
          undefined,
          { isWrite: true },
        );
      },

      getByHash: async (
        hash: string,
        tenantId?: string | null,
      ): Promise<DatabaseResult<MediaItem | null>> => {
        return this.adapter.wrap(async () => {
          const conditions = [eq(this.schema.mediaItems.hash, hash)];
          if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));
          const [item] = await this.db
            .select()
            .from(this.schema.mediaItems)
            .where(and(...conditions))
            .limit(1);
          return item ? (utils.convertDatesToISO(item) as unknown as MediaItem) : null;
        }, "GET_FILE_BY_HASH_FAILED");
      },

      restore: async (
        fileId: DatabaseId,
        tenantId?: string | null,
      ): Promise<DatabaseResult<void>> => {
        return this.adapter.wrap(
          async () => {
            const conditions = [eq(this.schema.mediaItems._id, fileId as string)];
            if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

            await this.db
              .update(this.schema.mediaItems)
              .set({ isDeleted: false, updatedAt: isoDateStringToDate(nowISODateString()) })
              .where(and(...conditions));
          },
          "RESTORE_FILE_FAILED",
          undefined,
          { isWrite: true },
        );
      },

      duplicate: async (
        fileId: DatabaseId,
        newName?: string,
        tenantId?: string | null,
      ): Promise<DatabaseResult<MediaItem>> => {
        return this.adapter.wrap(
          async () => {
            const conditions = [eq(this.schema.mediaItems._id, fileId as string)];
            if (tenantId) conditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

            const [existing] = await this.db
              .select()
              .from(this.schema.mediaItems)
              .where(and(...conditions))
              .limit(1);

            if (!existing) throw new Error("File not found");

            const id = utils.generateId();
            const now = isoDateStringToDate(nowISODateString());
            const values = {
              ...existing,
              _id: id,
              filename: newName || `copy_${existing.filename}`,
              createdAt: now,
              updatedAt: now,
            };

            await this.db.insert(this.schema.mediaItems).values(values);
            return utils.convertDatesToISO(values) as unknown as MediaItem;
          },
          "DUPLICATE_FILE_FAILED",
          undefined,
          { isWrite: true },
        );
      },
    };
  }

  public get folders() {
    return {
      create: async (
        folder: EntityCreate<MediaFolder>,
        tenantId?: DatabaseId | null,
      ): Promise<DatabaseResult<MediaFolder>> => {
        return this.crud.insert(
          "system_virtual_folders",
          { ...folder, type: "folder" },
          { tenantId: tenantId as any },
        );
      },

      createMany: async (
        folders: EntityCreate<MediaFolder>[],
        tenantId?: DatabaseId | null,
      ): Promise<DatabaseResult<MediaFolder[]>> => {
        return this.crud.insertMany(
          "system_virtual_folders",
          folders.map((f) => ({ ...f, type: "folder" })),
          { tenantId: tenantId as any },
        );
      },

      delete: async (
        folderId: DatabaseId,
        tenantId?: DatabaseId | null,
      ): Promise<DatabaseResult<void>> => {
        return this.crud.delete("system_virtual_folders", folderId, { tenantId: tenantId as any });
      },

      deleteMany: async (
        folderIds: DatabaseId[],
        tenantId?: DatabaseId | null,
      ): Promise<DatabaseResult<{ deletedCount: number }>> => {
        return this.crud.deleteMany("system_virtual_folders", { _id: { $in: folderIds } } as any, {
          tenantId: tenantId as any,
        });
      },

      getTree: async (
        _maxDepth?: number,
        tenantId?: DatabaseId | null,
      ): Promise<DatabaseResult<MediaFolder[]>> => {
        return this.adapter.wrap(async () => {
          const conditions = [eq(this.schema.systemVirtualFolders.type, "folder")];
          if (tenantId) conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId));
          const results = await this.db
            .select()
            .from(this.schema.systemVirtualFolders)
            .where(and(...conditions));
          return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
        }, "GET_FOLDER_TREE_FAILED");
      },

      getFolderContents: async (
        folderId?: DatabaseId,
        _options?: PaginationOptions,
        tenantId?: DatabaseId | null,
      ): Promise<
        DatabaseResult<{
          folders: MediaFolder[];
          files: MediaItem[];
          totalCount: number;
        }>
      > => {
        return this.adapter.wrap(async () => {
          const folderConditions = folderId
            ? [eq(this.schema.systemVirtualFolders.parentId, folderId as string)]
            : [isNull(this.schema.systemVirtualFolders.parentId)];
          if (tenantId)
            folderConditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId));

          const fileConditions = folderId
            ? [eq(this.schema.mediaItems.folderId, folderId as string)]
            : [isNull(this.schema.mediaItems.folderId)];
          if (tenantId) fileConditions.push(eq(this.schema.mediaItems.tenantId, tenantId));

          const folders = await this.db
            .select()
            .from(this.schema.systemVirtualFolders)
            .where(and(...folderConditions));
          const files = await this.db
            .select()
            .from(this.schema.mediaItems)
            .where(and(...fileConditions));

          return {
            folders: utils.convertArrayDatesToISO(folders) as unknown as MediaFolder[],
            files: utils.convertArrayDatesToISO(files) as unknown as MediaItem[],
            totalCount: folders.length + files.length,
          };
        }, "GET_FOLDER_CONTENTS_FAILED");
      },

      move: async (
        folderId: DatabaseId,
        targetParentId?: DatabaseId,
        tenantId?: DatabaseId | null,
      ): Promise<DatabaseResult<MediaFolder>> => {
        return this.crud.update(
          "system_virtual_folders",
          folderId,
          { parentId: targetParentId || null } as any,
          { tenantId: tenantId as any },
        );
      },
    };
  }
}
