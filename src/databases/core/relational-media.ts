/**
 * @file src/databases/core/relational-media.ts
 * @description
 * Unified Media module for all SQL-based database adapters.
 * Consolidates file and folder management logic using Drizzle ORM.
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { logger } from "@utils/logger";
import { and, asc, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { escapeLikePattern } from "./drizzle-sql-helpers";
import { type JsonPathClause, type JsonPathOp, parseJsonPathFilter } from "@utils/json-path-filter";
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
import {
  applyTenantFilter,
  convertArrayDatesToISO,
  convertDatesToISO,
  convertISOToDates,
  generateId,
} from "./relational-utils";
import { assertTenantContext } from "@src/utils/security/safe-query";
import { isAdmin } from "@src/databases/auth/constants";

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

            applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

            if (options?.user) {
              const isAdminUser = isAdmin(options.user);
              if (!isAdminUser) {
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

            // 🚀 findPage pattern: limit+1 for hasNextPage; lazy/parallel COUNT only when needed
            const limit = options?.pageSize || 20;
            const page = options?.page || 1;
            const offset = (page - 1) * limit;
            q = q.limit(limit + 1).offset(offset);

            const results = await q;
            const hasNextPage = results.length > limit;
            const pageRows = hasNextPage ? results.slice(0, limit) : results;

            let total: number;
            if (page === 1 && !hasNextPage) {
              total = pageRows.length;
            } else {
              const countRows = await this.getDb(options)
                .select({ count: count() })
                .from(this.schema.mediaItems)
                .where(and(...conditions));
              total = Number(countRows[0]?.count || 0);
            }

            return {
              items: convertArrayDatesToISO(pageRows) as unknown as MediaItem[],
              total,
              page,
              pageSize: limit,
              hasNextPage,
              hasPreviousPage: page > 1,
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
          // Escape LIKE wildcards so user input ("%", "_", "\\") is matched
          // literally — a raw "%" in a search box must not widen the filter to
          // every row. ESCAPE is bound as a parameter (MariaDB-safe).
          const qry = `%${escapeLikePattern(query)}%`;
          const ESCAPE_CHAR = "\\";
          const filenameCol = this.schema.mediaItems.filename;
          const originalCol = this.schema.mediaItems.originalFilename;
          const nameMatch = isPg
            ? sql`(lower(${filenameCol}) LIKE lower(${qry}) ESCAPE ${ESCAPE_CHAR} OR lower(${originalCol}) LIKE lower(${qry}) ESCAPE ${ESCAPE_CHAR})`
            : sql`(${filenameCol} LIKE ${qry} ESCAPE ${ESCAPE_CHAR} OR ${originalCol} LIKE ${qry} ESCAPE ${ESCAPE_CHAR})`;
          const conditions = [nameMatch];

          applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

          if (options?.user) {
            const isAdminUser = isAdmin(options.user);
            if (!isAdminUser) {
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
          const page = options?.page || 1;
          const offset = (page - 1) * limit;
          q = q.limit(limit + 1).offset(offset);

          const results = await q;
          const hasNextPage = results.length > limit;
          const pageRows = hasNextPage ? results.slice(0, limit) : results;

          let total: number;
          if (page === 1 && !hasNextPage) {
            total = pageRows.length;
          } else {
            const countRows = await this.db
              .select({ count: count() })
              .from(this.schema.mediaItems)
              .where(and(...conditions));
            total = Number(countRows[0]?.count || 0);
          }

          return {
            items: convertArrayDatesToISO(pageRows) as unknown as MediaItem[],
            total,
            page,
            pageSize: limit,
            hasNextPage,
            hasPreviousPage: page > 1,
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
          applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

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
            applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

            const [existing] = await this.db
              .select({ metadata: this.schema.mediaItems.metadata })
              .from(this.schema.mediaItems)
              .where(and(...conditions))
              .limit(1);

            const newMetadata = { ...(existing?.metadata as any), ...metadata };
            if (this.adapter.type === "sqlite" || this.adapter.type === "postgresql") {
              const [updated] = await this.db
                .update(this.schema.mediaItems)
                .set(
                  convertISOToDates({
                    metadata: newMetadata,
                    updatedAt: nowISODateString(),
                  }) as any,
                )
                .where(and(...conditions))
                .returning();

              return convertDatesToISO(updated) as unknown as MediaItem;
            }

            await this.db
              .update(this.schema.mediaItems)
              .set(
                convertISOToDates({
                  metadata: newMetadata,
                  updatedAt: nowISODateString(),
                }) as any,
              )
              .where(and(...conditions));

            const [updated] = await this.db
              .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
              .from(this.schema.mediaItems)
              .where(and(...conditions))
              .limit(1);

            return convertDatesToISO(updated) as unknown as MediaItem;
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
            applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

            if (this.adapter.type === "sqlite" || this.adapter.type === "postgresql") {
              const results = await this.db
                .update(this.schema.mediaItems)
                .set(
                  convertISOToDates({
                    folderId: (targetFolderId || null) as any,
                    updatedAt: nowISODateString(),
                  }) as any,
                )
                .where(and(...conditions))
                .returning();
              return { movedCount: results.length };
            }

            const [result] = await this.db
              .update(this.schema.mediaItems)
              .set(
                convertISOToDates({
                  folderId: (targetFolderId || null) as any,
                  updatedAt: nowISODateString(),
                }) as any,
              )
              .where(and(...conditions));

            return { movedCount: (result as any)?.affectedRows || fileIds.length };
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
          applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);
          const [item] = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
            .from(this.schema.mediaItems)
            .where(and(...conditions))
            .limit(1);
          return item ? (convertDatesToISO(item) as unknown as MediaItem) : null;
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
            applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

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
            applyTenantFilter(conditions, this.schema.mediaItems.tenantId, options);

            const [existing] = await this.db
              .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
              .from(this.schema.mediaItems)
              .where(and(...conditions))
              .limit(1);

            if (!existing) throw new Error("File not found");

            const id = generateId();
            const now = isoDateStringToDate(nowISODateString());
            const values = {
              ...existing,
              _id: id,
              filename: newName || `copy_${existing.filename}`,
              createdAt: now,
              updatedAt: now,
            };

            await this.db.insert(this.schema.mediaItems).values(values);
            return convertDatesToISO(values) as unknown as MediaItem;
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
          applyTenantFilter(conditions, this.schema.systemVirtualFolders.tenantId, options);
          const results = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
            .from(this.schema.systemVirtualFolders)
            .where(and(...conditions));
          return convertArrayDatesToISO(results) as unknown as MediaFolder[];
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
          applyTenantFilter(folderConditions, this.schema.systemVirtualFolders.tenantId, options);

          const fileConditions = folderId
            ? [eq(this.schema.mediaItems.folderId, folderId as string)]
            : [isNull(this.schema.mediaItems.folderId)];
          applyTenantFilter(fileConditions, this.schema.mediaItems.tenantId, options);

          const folders = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
            .from(this.schema.systemVirtualFolders)
            .where(and(...folderConditions));
          const files = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
            .from(this.schema.mediaItems)
            .where(and(...fileConditions));

          return {
            folders: convertArrayDatesToISO(folders) as unknown as MediaFolder[],
            files: convertArrayDatesToISO(files) as unknown as MediaItem[],
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

// ---------------------------------------------------------------------------
// DB-Native JSON Path Conditions for Media Queries
// ---------------------------------------------------------------------------

export type MediaJsonSqlDialect = "sqlite" | "postgresql" | "mariadb" | "mysql";

/** Strip `metadata.` prefix; null if not a simple metadata path (no array index). */
export function metadataRelativePath(path: string): string | null {
  if (!path || !path.startsWith("metadata.")) return null;
  const rest = path.slice("metadata.".length);
  if (!rest || rest.includes("[")) return null;
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(rest)) return null;
  return rest;
}

/** Escape a string for use inside a Mongo $regex (full match / contains). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dialect-specific expression extracting a value from the media `metadata` column.
 */
export function metadataJsonExtractSql(dialect: MediaJsonSqlDialect, relativePath: string): SQL {
  if (dialect === "postgresql") {
    if (relativePath.includes(".")) {
      const pathLiteral = `{${relativePath.split(".").join(",")}}`;
      return sql`metadata#>>${pathLiteral}`;
    }
    return sql`metadata->>${relativePath}`;
  }

  if (dialect === "mariadb" || dialect === "mysql") {
    const path = `$.${relativePath}`;
    return sql`JSON_UNQUOTE(JSON_EXTRACT(metadata, ${path}))`;
  }

  // SQLite JSON1 — metadata is TEXT JSON
  const path = `$.${relativePath}`;
  return sql`json_extract(metadata, ${path})`;
}

function stringCompareSql(
  dialect: MediaJsonSqlDialect,
  extract: SQL,
  op: "eq" | "neq" | "contains",
  value: string,
): SQL {
  const lowerVal = value.toLowerCase();
  const containsPattern = `%${escapeLikePattern(lowerVal)}%`;
  const ESCAPE_CHAR = "\\";
  const skipCast = dialect === "mariadb" || dialect === "mysql";
  if (skipCast) {
    if (op === "contains") {
      return sql`lower(${extract}) LIKE ${containsPattern} ESCAPE ${ESCAPE_CHAR}`;
    }
    if (op === "neq") {
      return sql`lower(${extract}) != ${lowerVal}`;
    }
    return sql`lower(${extract}) = ${lowerVal}`;
  }
  if (op === "contains") {
    return sql`lower(CAST(${extract} AS TEXT)) LIKE ${containsPattern} ESCAPE ${ESCAPE_CHAR}`;
  }
  if (op === "neq") {
    return sql`lower(CAST(${extract} AS TEXT)) != ${lowerVal}`;
  }
  return sql`lower(CAST(${extract} AS TEXT)) = ${lowerVal}`;
}

function numericCompareSql(extract: SQL, op: JsonPathOp, value: string): SQL | null {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  switch (op) {
    case "gt":
      return sql`CAST(${extract} AS REAL) > ${n}`;
    case "lt":
      return sql`CAST(${extract} AS REAL) < ${n}`;
    case "gte":
      return sql`CAST(${extract} AS REAL) >= ${n}`;
    case "lte":
      return sql`CAST(${extract} AS REAL) <= ${n}`;
    default:
      return null;
  }
}

function clauseToSql(dialect: MediaJsonSqlDialect, clause: JsonPathClause): SQL | null {
  const rel = metadataRelativePath(clause.path);
  if (!rel) return null;
  const extract = metadataJsonExtractSql(dialect, rel);

  if (clause.op === "eq" || clause.op === "neq" || clause.op === "contains") {
    return stringCompareSql(dialect, extract, clause.op, clause.value);
  }
  return numericCompareSql(extract, clause.op, clause.value);
}

/**
 * Build SQL WHERE fragments for a JSON path expression.
 */
export function buildMediaJsonPathSqlConditions(
  dialect: MediaJsonSqlDialect,
  expression: string,
): { conditions: SQL[]; unhandled: boolean; clauseCount: number } {
  const clauses = parseJsonPathFilter(expression);
  if (clauses.length === 0) {
    return { conditions: [], unhandled: false, clauseCount: 0 };
  }

  const conditions: SQL[] = [];
  let unhandled = false;
  for (const clause of clauses) {
    const cond = clauseToSql(dialect, clause);
    if (!cond) {
      unhandled = true;
      continue;
    }
    conditions.push(cond);
  }
  return { conditions, unhandled, clauseCount: clauses.length };
}

/** Normalize adapter `type` / `dialect` strings to a supported SQL dialect. */
export function resolveMediaJsonSqlDialect(adapter: {
  type?: string;
  dialect?: string;
}): MediaJsonSqlDialect {
  const raw = String(adapter.type || adapter.dialect || "sqlite").toLowerCase();
  if (raw === "postgresql" || raw === "postgres" || raw === "pg") return "postgresql";
  if (raw === "mariadb" || raw === "mysql") return raw === "mysql" ? "mysql" : "mariadb";
  return "sqlite";
}

/**
 * MongoDB filter fragment for media JSON path (AND of clauses).
 */
export function buildMediaJsonPathMongoFilter(expression: string): {
  filter: Record<string, unknown> | null;
  unhandled: boolean;
  clauseCount: number;
} {
  const clauses = parseJsonPathFilter(expression);
  if (clauses.length === 0) {
    return { filter: null, unhandled: false, clauseCount: 0 };
  }

  const parts: Record<string, unknown>[] = [];
  let unhandled = false;

  for (const clause of clauses) {
    if (!metadataRelativePath(clause.path) && !clause.path.startsWith("metadata.")) {
      if (clause.path.includes("[")) {
        unhandled = true;
        continue;
      }
    } else if (!metadataRelativePath(clause.path)) {
      unhandled = true;
      continue;
    }

    const field = clause.path;
    let part: Record<string, unknown> | null = null;

    switch (clause.op) {
      case "eq":
        part = {
          [field]: { $regex: `^${escapeRegex(clause.value)}$`, $options: "i" },
        };
        break;
      case "neq":
        part = {
          [field]: {
            $not: { $regex: `^${escapeRegex(clause.value)}$`, $options: "i" },
          },
        };
        break;
      case "contains":
        part = {
          [field]: { $regex: escapeRegex(clause.value), $options: "i" },
        };
        break;
      case "gt":
      case "lt":
      case "gte":
      case "lte": {
        const n = Number(clause.value);
        if (Number.isNaN(n)) {
          unhandled = true;
          break;
        }
        const opKey =
          clause.op === "gt"
            ? "$gt"
            : clause.op === "lt"
              ? "$lt"
              : clause.op === "gte"
                ? "$gte"
                : "$lte";
        part = { [field]: { [opKey]: n } };
        break;
      }
      default:
        unhandled = true;
    }

    if (part) parts.push(part);
  }

  if (parts.length === 0) {
    return { filter: null, unhandled: true, clauseCount: clauses.length };
  }
  if (parts.length === 1) {
    return { filter: parts[0]!, unhandled, clauseCount: clauses.length };
  }
  return { filter: { $and: parts }, unhandled, clauseCount: clauses.length };
}
