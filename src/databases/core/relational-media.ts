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
  EntityCreate,
  IMediaAdapter,
  BaseQueryOptions,
  MediaQueryOptions,
  ISqlAdapter,
} from "../db-interface";
import * as utils from "./relational-utils";
import { buildMediaJsonPathSqlConditions, resolveMediaJsonSqlDialect } from "./media-json-path";
import { assertTenantContext } from "@src/utils/security/safe-query";

export class RelationalMediaModule implements IMediaAdapter {
  protected readonly adapter: ISqlAdapter;
  protected readonly schema: any;

  constructor(adapter: ISqlAdapter, schema: any) {
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
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaItem>> => {
        assertTenantContext(options, "media.files.upload");
        return this.crud.insert("media_items", file, options);
      },

      uploadMany: async (
        files: EntityCreate<MediaItem>[],
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaItem[]>> => {
        assertTenantContext(options, "media.files.uploadMany");
        return this.crud.insertMany("media_items", files, options);
      },

      delete: async (
        fileId: DatabaseId,
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<void>> => {
        assertTenantContext(options, "media.files.delete");
        return this.crud.delete("media_items", fileId, options);
      },

      deleteMany: async (
        fileIds: DatabaseId[],
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<{ deletedCount: number }>> => {
        assertTenantContext(options, "media.files.deleteMany");
        return this.crud.deleteMany("media_items", { _id: { $in: fileIds } } as any, options);
      },

      getByFolder: async (
        folderId?: DatabaseId,
        options?: MediaQueryOptions,
      ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
        return this.adapter.wrap(
          async () => {
            assertTenantContext(options, "media.files.getByFolder");
            const conditions = folderId
              ? [eq(this.schema.mediaItems.folderId, folderId as string)]
              : [isNull(this.schema.mediaItems.folderId)];

            utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

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

            const jsonPathExpr = options?.jsonPath?.trim();
            if (jsonPathExpr) {
              const dialect = resolveMediaJsonSqlDialect(this.adapter as any);
              const { conditions: jsonConds, unhandled } = buildMediaJsonPathSqlConditions(
                dialect,
                jsonPathExpr,
              );
              for (const c of jsonConds) conditions.push(c as any);
              if (unhandled) {
                logger.debug(
                  `[media] jsonPath has clauses not pushed to SQL (${dialect}); in-memory filter still applies`,
                );
              } else if (jsonConds.length > 0) {
                logger.debug(
                  `[media] applied ${jsonConds.length} native JSON path condition(s) (${dialect})`,
                );
              }
            }

            let q = this.getDb(options)
              .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
              .from(this.schema.mediaItems)
              .$dynamic();
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
            const [countResult] = await this.getDb(options)
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
          { transaction: options?.transaction },
        );
      },

      search: async (
        query: string,
        options?: MediaQueryOptions,
      ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
        return this.adapter.wrap(async () => {
          assertTenantContext(options, "media.files.search");
          const isPg = (this.adapter as any).dialect === "postgresql";
          const op = isPg ? ilike : like;
          const qry = `%${query}%`;
          const conditions = [
            or(
              op(this.schema.mediaItems.filename, qry),
              op(this.schema.mediaItems.originalFilename, qry),
            ) as any,
          ];

          utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

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

          let q = this.db
            .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
            .from(this.schema.mediaItems)
            .$dynamic();
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
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> => {
        return this.adapter.wrap(async () => {
          assertTenantContext(options, "media.files.getMetadata");
          const conditions = [inArray(this.schema.mediaItems._id, fileIds as string[])];
          utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

          const results = await this.db
            .select({
              _id: this.schema.mediaItems._id,
              metadata: this.schema.mediaItems.metadata,
            })
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
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaItem>> => {
        return this.adapter.wrap(
          async () => {
            assertTenantContext(options, "media.files.updateMetadata");
            const conditions = [eq(this.schema.mediaItems._id, fileId as string)];
            utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

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
        targetFolderId?: DatabaseId | null,
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<{ movedCount: number }>> => {
        return this.adapter.wrap(
          async () => {
            assertTenantContext(options, "media.files.move");
            const conditions = [inArray(this.schema.mediaItems._id, fileIds as string[])];
            utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

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
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaItem | null>> => {
        return this.adapter.wrap(async () => {
          assertTenantContext(options, "media.files.getByHash");
          const conditions = [eq(this.schema.mediaItems.hash, hash)];
          utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);
          const [item] = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
            .from(this.schema.mediaItems)
            .where(and(...conditions))
            .limit(1);
          return item ? (utils.convertDatesToISO(item) as unknown as MediaItem) : null;
        }, "GET_FILE_BY_HASH_FAILED");
      },

      restore: async (
        fileId: DatabaseId,
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<void>> => {
        return this.adapter.wrap(
          async () => {
            assertTenantContext(options, "media.files.restore");
            const conditions = [eq(this.schema.mediaItems._id, fileId as string)];
            utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

            await this.db
              .update(this.schema.mediaItems)
              .set({
                isDeleted: false,
                updatedAt: isoDateStringToDate(nowISODateString()),
              })
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
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaItem>> => {
        return this.adapter.wrap(
          async () => {
            assertTenantContext(options, "media.files.duplicate");
            const conditions = [eq(this.schema.mediaItems._id, fileId as string)];
            utils.applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

            const [existing] = await this.db
              .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
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
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaFolder>> => {
        assertTenantContext(options, "media.folders.create");
        return this.crud.insert("system_virtual_folders", { ...folder, type: "folder" }, options);
      },

      createMany: async (
        folders: EntityCreate<MediaFolder>[],
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaFolder[]>> => {
        assertTenantContext(options, "media.folders.createMany");
        return this.crud.insertMany(
          "system_virtual_folders",
          folders.map((f) => ({ ...f, type: "folder" })),
          options,
        );
      },

      delete: async (
        folderId: DatabaseId,
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<void>> => {
        assertTenantContext(options, "media.folders.delete");
        return this.crud.delete("system_virtual_folders", folderId, options);
      },

      deleteMany: async (
        folderIds: DatabaseId[],
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<{ deletedCount: number }>> => {
        assertTenantContext(options, "media.folders.deleteMany");
        return this.crud.deleteMany(
          "system_virtual_folders",
          { _id: { $in: folderIds } } as any,
          options,
        );
      },

      getTree: async (
        _maxDepth?: number,
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaFolder[]>> => {
        return this.adapter.wrap(async () => {
          assertTenantContext(options, "media.folders.getTree");
          const conditions = [eq(this.schema.systemVirtualFolders.type, "folder")];
          utils.applyTenantFilter(conditions, this.schema.systemVirtualFolders.tenantId, options);
          const results = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
            .from(this.schema.systemVirtualFolders)
            .where(and(...conditions));
          return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
        }, "GET_FOLDER_TREE_FAILED");
      },

      getFolderContents: async (
        folderId?: DatabaseId,
        options?: MediaQueryOptions,
      ): Promise<
        DatabaseResult<{
          folders: MediaFolder[];
          files: MediaItem[];
          totalCount: number;
        }>
      > => {
        return this.adapter.wrap(async () => {
          assertTenantContext(options, "media.folders.getFolderContents");
          const folderConditions = folderId
            ? [eq(this.schema.systemVirtualFolders.parentId, folderId as string)]
            : [isNull(this.schema.systemVirtualFolders.parentId)];
          utils.applyTenantFilter(
            folderConditions,
            this.schema.systemVirtualFolders.tenantId,
            options,
          );

          const fileConditions = folderId
            ? [eq(this.schema.mediaItems.folderId, folderId as string)]
            : [isNull(this.schema.mediaItems.folderId)];
          utils.applyTenantFilter(fileConditions, this.schema.mediaItems.tenantId, options);

          const folders = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
            .from(this.schema.systemVirtualFolders)
            .where(and(...folderConditions));
          const files = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
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
        targetParentId?: DatabaseId | null,
        options?: BaseQueryOptions,
      ): Promise<DatabaseResult<MediaFolder>> => {
        assertTenantContext(options, "media.folders.move");
        return this.crud.update(
          "system_virtual_folders",
          folderId,
          { parentId: targetParentId || null } as any,
          options,
        );
      },
    };
  }
}
