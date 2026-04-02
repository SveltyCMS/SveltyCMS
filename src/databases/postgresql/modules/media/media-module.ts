/**
 * @file src/databases/postgresql/modules/media/media-module.ts
 * @description Media management module for PostgreSQL
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date-utils";
import { logger } from "@src/utils/logger";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type {
  DatabaseId,
  DatabaseResult,
  MediaFolder,
  MediaItem,
  CmsMediaMetadata,
  PaginatedResult,
  PaginationOptions,
  EntityCreate,
} from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import { schema } from "../../schema";
import * as utils from "../../utils";

export class MediaModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  private get crud() {
    return this.core.crud;
  }

  async setupMediaModels(): Promise<void> {
    // No-op for SQL - tables created by migrations
    logger.debug("Media models setup (no-op for SQL)");
  }

  files = {
    upload: async (
      file: EntityCreate<MediaItem>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem>> => {
      return this.crud.insert<MediaItem>("media_items", file, { tenantId: tenantId as any });
    },

    uploadMany: async (
      files: EntityCreate<MediaItem>[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem[]>> => {
      return this.crud.insertMany<MediaItem>("media_items", files, { tenantId: tenantId as any });
    },

    restore: async (
      fileId: DatabaseId,
      _tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<void>> => {
      return this.crud.restore("media_items", fileId);
    },

    delete: async (
      fileId: DatabaseId,
      _tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<void>> => {
      return this.crud.delete("media_items", fileId);
    },

    deleteMany: async (
      fileIds: DatabaseId[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.crud.deleteMany("media_items", { _id: { $in: fileIds } } as any, { tenantId });
    },

    getByFolder: async (
      folderId?: DatabaseId,
      options?: PaginationOptions,
      _recursive?: boolean,
      tenantId?: DatabaseId | null | null,
    ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
      return this.core.wrap(async () => {
        const conditions = folderId
          ? [eq(schema.mediaItems.folderId, folderId as string)]
          : [isNull(schema.mediaItems.folderId)];

        if (tenantId) {
          conditions.push(eq(schema.mediaItems.tenantId, tenantId));
        }

        // Ownership filtering
        if (options?.user) {
          const isAdmin = options.user.role === "admin" || options.user.isAdmin === true;
          if (!isAdmin) {
            // ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
            const userConditions = or(
              eq(schema.mediaItems.createdBy, options.user._id as string),
              ilike(schema.mediaItems.path, "global/%"),
            );
            if (userConditions) {
              conditions.push(userConditions as import("drizzle-orm").SQL);
            }
          }
        }

        let q = this.db.select().from(schema.mediaItems).$dynamic();
        if (conditions.length > 0) {
          q = q.where(and(...conditions));
        }

        if (options?.sortField) {
          const order = options.sortDirection === "desc" ? desc : asc;
          const column = (schema.mediaItems as unknown as Record<string, unknown>)[
            options.sortField
          ];
          if (column && typeof column === "object") {
            q = q.orderBy(order(column as import("drizzle-orm").Column));
          }
        }

        const limit = options?.pageSize || 20;
        const offset = ((options?.page || 1) - 1) * limit;

        q = q.limit(limit).offset(offset);

        const results = await q;

        const [countResult] = await this.db
          .select({ count: count() })
          .from(schema.mediaItems)
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
      }, "GET_FILES_BY_FOLDER_FAILED");
    },

    search: async (
      query: string,
      options?: PaginationOptions,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
      return this.core.wrap(async () => {
        const qry = `%${query}%`;
        const conditions = [
          or(
            ilike(schema.mediaItems.filename, qry),
            ilike(schema.mediaItems.originalFilename, qry),
          ) as import("drizzle-orm").SQL,
        ];

        if (tenantId) {
          conditions.push(eq(schema.mediaItems.tenantId, tenantId));
        }

        // Ownership filtering
        if (options?.user) {
          const isAdmin = options.user.role === "admin" || options.user.isAdmin === true;
          if (!isAdmin) {
            // ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
            const userConditions = or(
              eq(schema.mediaItems.createdBy, options.user._id as string),
              ilike(schema.mediaItems.path, "global/%"),
            );
            if (userConditions) {
              conditions.push(userConditions as import("drizzle-orm").SQL);
            }
          }
        }

        let q = this.db.select().from(schema.mediaItems).$dynamic();
        q = q.where(and(...conditions));

        if (options?.sortField) {
          const order = options.sortDirection === "desc" ? desc : asc;
          const column = (schema.mediaItems as unknown as Record<string, unknown>)[
            options.sortField
          ];
          if (column && typeof column === "object") {
            q = q.orderBy(order(column as import("drizzle-orm").Column));
          }
        }

        const limit = options?.pageSize || 20;
        const offset = ((options?.page || 1) - 1) * limit;

        q = q.limit(limit).offset(offset);

        const results = await q;

        const [countResult] = await this.db
          .select({ count: count() })
          .from(schema.mediaItems)
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
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<Record<string, CmsMediaMetadata>>> => {
      return this.core.wrap(async () => {
        const conditions = [inArray(schema.mediaItems._id, fileIds as string[])];
        if (tenantId) conditions.push(eq(schema.mediaItems.tenantId, tenantId));

        const results = await this.db
          .select({
            _id: schema.mediaItems._id,
            metadata: schema.mediaItems.metadata,
          })
          .from(schema.mediaItems)
          .where(and(...conditions));

        const metadataMap: Record<string, CmsMediaMetadata> = {};
        results.forEach((r) => {
          metadataMap[r._id] = r.metadata as CmsMediaMetadata;
        });
        return metadataMap;
      }, "GET_FILE_METADATA_FAILED");
    },

    updateMetadata: async (
      fileId: DatabaseId,
      metadata: Partial<CmsMediaMetadata>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem>> => {
      return this.core.wrap(async () => {
        const conditions = [eq(schema.mediaItems._id, fileId as string)];
        if (tenantId) conditions.push(eq(schema.mediaItems.tenantId, tenantId));

        const [existing] = await this.db
          .select({ metadata: schema.mediaItems.metadata })
          .from(schema.mediaItems)
          .where(and(...conditions))
          .limit(1);

        const newMetadata = {
          ...(existing?.metadata as Record<string, unknown>),
          ...metadata,
        };

        const [updated] = await this.db
          .update(schema.mediaItems)
          .set({
            metadata: newMetadata,
            updatedAt: isoDateStringToDate(nowISODateString()),
          })
          .where(and(...conditions))
          .returning();

        return utils.convertDatesToISO(updated) as unknown as MediaItem;
      }, "UPDATE_FILE_METADATA_FAILED");
    },

    move: async (
      fileIds: DatabaseId[],
      targetFolderId?: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ movedCount: number }>> => {
      return this.core.wrap(async () => {
        const conditions = [inArray(schema.mediaItems._id, fileIds as string[])];
        if (tenantId) conditions.push(eq(schema.mediaItems.tenantId, tenantId));

        const results = await this.db
          .update(schema.mediaItems)
          .set({
            folderId: (targetFolderId || null) as string | null,
            updatedAt: isoDateStringToDate(nowISODateString()),
          })
          .where(and(...conditions))
          .returning();
        return { movedCount: results.length };
      }, "MOVE_FILES_FAILED");
    },

    duplicate: async (
      fileId: DatabaseId,
      newName?: string,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaItem>> => {
      return this.core.wrap(async () => {
        const conditions = [eq(schema.mediaItems._id, fileId as string)];
        if (tenantId) conditions.push(eq(schema.mediaItems.tenantId, tenantId));

        const [existing] = await this.db
          .select()
          .from(schema.mediaItems)
          .where(and(...conditions))
          .limit(1);

        if (!existing) {
          throw new Error("File not found");
        }

        const id = utils.generateId() as string;
        const now = nowISODateString();
        const copy = {
          ...existing,
          _id: id,
          filename: newName || `${existing.filename}_copy`,
          createdAt: isoDateStringToDate(now),
          updatedAt: isoDateStringToDate(now),
        };

        const [created] = await this.db
          .insert(schema.mediaItems)
          .values(copy as typeof schema.mediaItems.$inferInsert)
          .returning();

        return utils.convertDatesToISO(created) as unknown as MediaItem;
      }, "DUPLICATE_FILE_FAILED");
    },
  };

  folders = {
    create: async (
      folder: EntityCreate<MediaFolder>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder>> => {
      return this.core.wrap(async () => {
        const id = utils.generateId() as string;
        const now = nowISODateString();
        const values = {
          ...folder,
          _id: id,
          tenantId: tenantId || null,
          type: "folder",
          createdAt: isoDateStringToDate(now),
          updatedAt: isoDateStringToDate(now),
        };
        const [result] = await this.db
          .insert(schema.systemVirtualFolders)
          .values(values as any)
          .returning();
        return utils.convertDatesToISO(result) as unknown as MediaFolder;
      }, "CREATE_MEDIA_FOLDER_FAILED");
    },

    createMany: async (
      folders: EntityCreate<MediaFolder>[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder[]>> => {
      return this.core.wrap(async () => {
        const now = nowISODateString();
        const values = folders.map((f) => ({
          ...f,
          _id: utils.generateId() as string,
          tenantId: tenantId || null,
          type: "folder",
          createdAt: isoDateStringToDate(now),
          updatedAt: isoDateStringToDate(now),
        }));
        const results = await this.db
          .insert(schema.systemVirtualFolders)
          .values(values as (typeof schema.systemVirtualFolders.$inferInsert)[])
          .returning();

        return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
      }, "CREATE_MANY_MEDIA_FOLDERS_FAILED");
    },

    delete: async (
      folderId: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<void>> => {
      return this.crud.delete("system_virtual_folders", folderId, { tenantId });
    },

    deleteMany: async (
      folderIds: DatabaseId[],
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.crud.deleteMany("system_virtual_folders", { _id: { $in: folderIds } } as any, {
        tenantId,
      });
    },

    getTree: async (
      _maxDepth?: number,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder[]>> => {
      return this.core.wrap(async () => {
        const conditions = [eq(schema.systemVirtualFolders.type, "folder")];
        if (tenantId) conditions.push(eq(schema.systemVirtualFolders.tenantId, tenantId));

        const results = await this.db
          .select()
          .from(schema.systemVirtualFolders)
          .where(and(...conditions));
        return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
      }, "GET_MEDIA_FOLDER_TREE_FAILED");
    },

    getFolderContents: async (
      folderId?: DatabaseId,
      options?: PaginationOptions,
      tenantId?: DatabaseId | null,
    ): Promise<
      DatabaseResult<{
        folders: MediaFolder[];
        files: MediaItem[];
        totalCount: number;
      }>
    > => {
      return this.core.wrap(async () => {
        const folderConditions = [
          eq(schema.systemVirtualFolders.type, "folder"),
          folderId
            ? eq(schema.systemVirtualFolders.parentId, folderId as string)
            : isNull(schema.systemVirtualFolders.parentId),
        ];
        if (tenantId) folderConditions.push(eq(schema.systemVirtualFolders.tenantId, tenantId));

        const [folders, filesRes] = await Promise.all([
          this.db
            .select()
            .from(schema.systemVirtualFolders)
            .where(and(...folderConditions)),
          this.files.getByFolder(folderId, options, false, tenantId),
        ]);

        const filesItems = filesRes.success ? filesRes.data?.items || [] : [];
        const filesTotal = filesRes.success ? filesRes.data?.total || 0 : 0;

        return {
          folders: utils.convertArrayDatesToISO(folders) as unknown as MediaFolder[],
          files: filesItems,
          totalCount: folders.length + filesTotal,
        };
      }, "GET_FOLDER_CONTENTS_FAILED");
    },

    move: async (
      folderId: DatabaseId,
      targetParentId?: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<MediaFolder>> => {
      return this.core.wrap(async () => {
        const conditions = [eq(schema.systemVirtualFolders._id, folderId as string)];
        if (tenantId) conditions.push(eq(schema.systemVirtualFolders.tenantId, tenantId));

        const [updated] = await this.db
          .update(schema.systemVirtualFolders)
          .set({
            parentId: (targetParentId || null) as string | null,
            updatedAt: isoDateStringToDate(nowISODateString()),
          })
          .where(and(...conditions))
          .returning();

        return utils.convertDatesToISO(updated) as unknown as MediaFolder;
      }, "MOVE_MEDIA_FOLDER_FAILED");
    },
  };
}
