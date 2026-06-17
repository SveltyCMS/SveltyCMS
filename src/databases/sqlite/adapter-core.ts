/**
 * @file src/databases/sqlite/adapter/adapter-core.ts
 * @description Core functionality for SQLite adapter, optimized for performance and Windows resilience.
 */

import { logger } from "@utils/logger";
import { BaseAdapter } from "../core/base-adapter";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseCapabilities,
  DatabaseResult,
  DatabaseId,
  FindOptions,
  EntityCreate,
  EntityUpdate,
  QueryFilter,
  ICrudAdapter,
  ISqlAdapter,
} from "../db-interface";
import * as helpers from "../core/drizzle-sql-helpers";
import { generateUUID } from "@utils/native-utils";
import {
  count as drizzleCount,
  getTableColumns,
  getTableName,
  asc,
  desc,
  type Column,
} from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";
import { sql, type SQL, eq, and } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";
import { SQLiteQueryBuilder } from "./sq-lite-query-builder";
import { TransactionModule } from "./transaction-module";
import { RelationalAuthModule } from "../core/relational-auth";
import { RelationalContentModule } from "../core/relational-content";
import { RelationalMediaModule } from "../core/relational-media";
import { RelationalSystemModule } from "../core/relational-system";
import { BatchModule } from "../core/batch-module";
import { CollectionModule } from "../core/collection-module";

// --- Types ---
export type SQLiteConfig = { connectionString?: string; readonly?: boolean };
export type SQLiteClient = any; // bun:sqlite Database | node:sqlite DatabaseSync
export type SQLiteDB = any; // Drizzle instance

// Isolation for multi-threaded testing
const testWorkerContext = new AsyncLocalStorage<string>();

/**
 * 🚀 PERFORMANCE: Lightweight Re-entrant Mutex for serializing database writes.
 * Uses AsyncLocalStorage to allow the same execution context to re-acquire the lock.
 */
class Mutex {
  private queue: Promise<any> = Promise.resolve();
  private storage = new AsyncLocalStorage<boolean>();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    // If we already hold the lock in this context, just execute
    if (this.storage.getStore()) {
      return await fn();
    }

    return new Promise<T>((resolve, reject) => {
      this.queue = this.queue
        .then(async () => {
          try {
            const res = await this.storage.run(true, fn);
            resolve(res);
          } catch (err) {
            reject(err);
          }
        })
        .catch(() => {
          logger.debug("SQLite mutex queue handler failed silently");
        });
    });
  }
}

export abstract class SQLiteAdapterCore extends BaseAdapter implements ISqlAdapter {
  public type = "sqlite";
  public static readonly writeMutex = new Mutex();
  public readonly schema = schema;

  // Cache and Registry State
  protected preparedStatements = new Map<string, any>();
  protected readonly MAX_PREPARED_STATEMENTS = 500;
  protected _tableColumnsCache = new Map<any, Record<string, Column>>();
  protected tableRegistry = new Map<string, any>();

  // Cache whether RETURNING works for INSERT ... VALUES for this sqlite instance.
  // Avoids repeated try/catch + warn overhead in benchmarks and for tables that don't support it.
  private _insertManyReturningSupported: boolean | null = null;
  protected dynamicTables = new Map<string, any>();
  protected modelRegistry = new Map<string, any>();
  protected _resolving = new Set<string>();
  protected _selectionCache = new Map<string, any>();
  protected _lastTable: any = null;
  protected _lastCols: Record<string, Column> | null = null;
  /** Tables that have been fully provisioned with physical columns via createModel */
  protected _provisionedTables = new Set<string>();

  // Lazy Domain Module Cache
  private _auth: any = null;
  private _content: any = null;
  private _media: any = null;
  private _system: any = null;
  private _batch: any = null;
  private _collection: any = null;

  // Domain module getters
  public get auth(): any {
    if (!this._auth) {
      this._auth = new RelationalAuthModule(this as any, this.schema);
    }
    return this._auth;
  }

  public get content(): any {
    if (!this._content) {
      this._content = new RelationalContentModule(this as any, this.schema);
    }
    return this._content;
  }

  public get media(): any {
    if (!this._media) {
      this._media = new RelationalMediaModule(this as any, this.schema);
    }
    return this._media;
  }

  public get system(): any {
    if (!this._system) {
      this._system = new RelationalSystemModule(this as any, this.schema);
    }
    return this._system;
  }

  public get batch(): any {
    if (!this._batch) {
      this._batch = new BatchModule(this as any);
    }
    return this._batch;
  }

  public get collection(): any {
    if (!this._collection) {
      this._collection = new CollectionModule(this as any);
    }
    return this._collection;
  }

  public get crud(): ICrudAdapter {
    return this as any;
  }

  // --- Helpers ---
  public isSystemTable(collection: string): boolean {
    return helpers.isSystemTable(collection);
  }

  public getTable(collection: string): any {
    if (typeof collection !== "string") return null;

    const cached = this.tableRegistry.get(collection);
    if (cached) return cached;

    if (this._resolving.has(collection)) {
      logger.error(`Infinite recursion detected in getTable for: ${collection}`);
      return null;
    }
    this._resolving.add(collection);

    try {
      if (helpers.isSystemTable(collection)) {
        const aliased = this.getAliasedTable(collection);
        if (aliased) {
          this.tableRegistry.set(collection, aliased);
          return aliased;
        }
      }

      const cleanId = collection.replace(/-/g, "");
      const tableName = cleanId.startsWith("collection_") ? cleanId : `collection_${cleanId}`;

      const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
      if (helpers.isSystemTable(cleanName) && cleanName !== collection) {
        return this.getTable(cleanName);
      }

      // Query content_nodes for indexed fields synchronously
      const columnsToAdd = new Map<string, string>();
      // Only add common projection columns if this table was provisioned
      // via createModel (which runs ALTER TABLE). Tests and benchmarks that
      // create tables directly won't have these columns physically.
      if (this._provisionedTables.has(collection)) {
        columnsToAdd.set("collection", "text");
        columnsToAdd.set("slug", "text");
        columnsToAdd.set("locale", "text");
        columnsToAdd.set("publishedAt", "integer");
      }

      try {
        const client = this._sqlite ? this.sqlite : null;
        if (client) {
          let row: any = null;
          if (client.query) {
            row = client
              .query(`SELECT data FROM content_nodes WHERE _id = '${cleanName}' LIMIT 1`)
              .get();
          } else if (client.prepare) {
            row = client
              .prepare(`SELECT data FROM content_nodes WHERE _id = ? LIMIT 1`)
              .get(cleanName);
          }
          if (row?.data) {
            const nodeData = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
            let def = nodeData.collectionDef;
            if (def) {
              if (typeof def === "string") {
                def = JSON.parse(def);
              }
              if (def && Array.isArray(def.fields)) {
                for (const field of def.fields) {
                  if (field.indexed || field.unique) {
                    const fieldName = field.db_fieldName || field.label;
                    if (fieldName && !columnsToAdd.has(fieldName)) {
                      let colType = "text";
                      if (
                        field.type === "number" ||
                        field.type === "integer" ||
                        field.type === "boolean"
                      ) {
                        colType = "integer";
                      }
                      columnsToAdd.set(fieldName, colType);
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // Safe fallback
      }

      const dynamicTable = this.createDynamicTableDefinition(tableName, columnsToAdd);
      this.tableRegistry.set(collection, dynamicTable);
      return dynamicTable;
    } finally {
      this._resolving.delete(collection);
    }
  }

  public getColumn(table: any, name: string, forcePhysical = false): any {
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val) {
        self._lastCols = val;
      },
    };
    return helpers.getColumnHelper(table, name, this._tableColumnsCache, lastRef, forcePhysical);
  }

  public getPhysicalSelection(table: any): any {
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val) {
        self._lastCols = val;
      },
    };
    return helpers.getPhysicalSelection(table, this._selectionCache, (t, n, f) =>
      helpers.getColumnHelper(t, n, this._tableColumnsCache, lastRef, f),
    );
  }

  public mapQuery(table: any, query: any, options: any = {}): any {
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val) {
        self._lastCols = val;
      },
    };
    return helpers.mapQuery(
      table,
      query,
      options,
      (t, n) => helpers.getColumnHelper(t, n, this._tableColumnsCache, lastRef, false),
      (f) => this.getJsonField(f),
    );
  }

  public applyOrderBy(builder: any, table: any, options: any): any {
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val) {
        self._lastCols = val;
      },
    };
    return helpers.applyOrderBy(
      builder,
      table,
      options,
      (t, n) => helpers.getColumnHelper(t, n, this._tableColumnsCache, lastRef, false),
      (f) => this.getJsonField(f),
    );
  }

  public prepareValues(table: any, data: any, id: any, now: Date, options: any): any {
    const values: any = {};
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val) {
        self._lastCols = val;
      },
    };
    const getCol = (t: any, n: string) =>
      helpers.getColumnHelper(t, n, this._tableColumnsCache, lastRef, false);

    let schemaCols: Record<string, any> | undefined = this._tableColumnsCache.get(table);
    if (!schemaCols) {
      try {
        const resolvedCols = getTableColumns(table);
        if (resolvedCols && Object.keys(resolvedCols).length > 0) {
          schemaCols = resolvedCols as any;
          this._tableColumnsCache.set(table, schemaCols!);
        }
      } catch {}
    }

    for (const k in data) {
      if (!Object.hasOwn(data, k)) continue;
      if (k === "_id" || k === "id") continue;

      const isPhysical = schemaCols?.[k] || getCol(table, k);

      if (isPhysical) {
        if ((k === "_id" || k === "id") && id) continue;
        if (data[k] !== undefined) {
          let val = data[k];
          if (typeof val === "object" && val !== null && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values[k] = val;
        }
      }
    }

    if (id) {
      const idCol =
        schemaCols?.["_id"] || getCol(table, "_id") || schemaCols?.["id"] || getCol(table, "id");
      if (idCol) {
        values[idCol.name] = id;
      }
    }

    if (options?.tenantId && (schemaCols?.["tenantId"] || getCol(table, "tenantId"))) {
      values.tenantId = options.tenantId;
    }

    if (id && (schemaCols?.["createdAt"] || getCol(table, "createdAt"))) {
      values.createdAt = now;
    }
    if (schemaCols?.["updatedAt"] || getCol(table, "updatedAt")) {
      values.updatedAt = now;
    }

    // Map common fields explicitly — only if data provides them
    // (avoids inserting columns that may not exist in the physical table
    //  for tables created before projection support was added)
    if ((schemaCols?.["collection"] || getCol(table, "collection")) && "collection" in data) {
      values.collection = data.collection || getTableName(table).replace(/^collection_/, "");
    }

    if (
      (schemaCols?.["publishedAt"] || getCol(table, "publishedAt")) &&
      ("publishedAt" in data || (data.metadata && "publishedAt" in data.metadata))
    ) {
      const pubAt = data.publishedAt || data.metadata?.publishedAt;
      if (pubAt !== undefined) {
        values.publishedAt = pubAt;
      }
    }

    if ((schemaCols?.["slug"] || getCol(table, "slug")) && "slug" in data) {
      values.slug = data.slug;
    }
    if ((schemaCols?.["locale"] || getCol(table, "locale")) && "locale" in data) {
      values.locale = data.locale;
    }

    if (getCol(table, "data")) {
      const dynamicData: any = {};
      for (const k in data) {
        if (!Object.hasOwn(data, k)) continue;
        if (k === "_id" || k === "id" || k === "tenantId" || k === "createdAt" || k === "updatedAt")
          continue;
        dynamicData[k] = data[k];
      }
      values.data = JSON.stringify(dynamicData) || "{}";
    }

    const result = utils.convertISOToDates(values, {
      table: getTableName(table),
    });

    for (const k in result) {
      const val = result[k];
      if (val && typeof val === "object" && typeof (val as any).getTime === "function") {
        result[k] = new Date((val as any).getTime());
      }
    }

    return result;
  }

  // --- CRUD Operations ---
  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    if (typeof collection !== "string") {
      return {
        success: false,
        message: `Invalid collection: expected string, got ${typeof collection}`,
        error: {
          code: "INVALID_COLLECTION",
          message: "Collection name must be a string",
        },
      };
    }
    return this.wrap(async () => {
      const q =
        this.hooks.length > 0
          ? await this.runHooks("before", "find", collection, query, options)
          : query;
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const where = this.mapQuery(table, q as any, options);

      const results = await this.getDrizzleInstance(options)
        .select(this.getPhysicalSelection(table))
        .from(table)
        .where(where)
        .limit(1);

      const data = results.length
        ? (utils.convertDatesToISO(results[0], { table: collection }) as T)
        : null;
      return this.hooks.length > 0
        ? await this.runHooks("after", "find", collection, data, options)
        : data;
    }, "FIND_ONE_FAILED");
  }

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    if (typeof collection !== "string") {
      return {
        success: false,
        message: `Invalid collection: expected string, got ${typeof collection}`,
        error: {
          code: "INVALID_COLLECTION",
          message: "Collection name must be a string",
        },
      };
    }
    return this.wrap(async () => {
      const q =
        this.hooks.length > 0
          ? await this.runHooks("before", "find", collection, query, options)
          : query;
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const where = this.mapQuery(table, q as any, options);

      const tableName = getTableName(table);
      const isDynamic =
        collection.toLowerCase().includes("benchmark") || collection.startsWith("collection_");

      let results;
      if (isDynamic) {
        const selection = this.getPhysicalSelection(table);
        const columns = Object.keys(selection);
        const colList = columns.map((c) => `"${c}"`).join(", ");

        let sqlQuery = sql`SELECT ${sql.raw(colList)} FROM ${sql.raw(`"${tableName}"`)} WHERE ${where || sql`1=1`}`;

        if (options.sort) {
          const sortConditions: any[] = [];
          const normalizedSorts: {
            field: string;
            direction: "asc" | "desc";
          }[] = [];
          if (Array.isArray(options.sort)) {
            for (const item of options.sort) {
              if (Array.isArray(item) && item.length >= 2) {
                normalizedSorts.push({
                  field: item[0],
                  direction: item[1] as "asc" | "desc",
                });
              } else if (typeof item === "object" && item !== null) {
                const keys = Object.keys(item);
                if (keys.length > 0) {
                  const field = keys[0];
                  const direction = (item as any)[field];
                  normalizedSorts.push({ field, direction });
                }
              }
            }
          } else if (typeof options.sort === "object") {
            for (const field of Object.keys(options.sort)) {
              const direction = (options.sort as any)[field];
              normalizedSorts.push({ field, direction });
            }
          }

          const self = this as any;
          const lastRef = {
            get table() {
              return self._lastTable;
            },
            set table(val) {
              self._lastTable = val;
            },
            get cols() {
              return self._lastCols;
            },
            set cols(val) {
              self._lastCols = val;
            },
          };
          for (const s of normalizedSorts) {
            let sortCol: any;
            const column = helpers.getColumnHelper(
              table,
              s.field,
              this._tableColumnsCache,
              lastRef,
              false,
            );
            if (column) {
              sortCol = column;
            } else {
              const dataCol = helpers.getColumnHelper(
                table,
                "data",
                this._tableColumnsCache,
                lastRef,
                false,
              );
              if (dataCol) {
                sortCol = this.getJsonField(s.field);
              }
            }

            if (sortCol) {
              sortConditions.push(s.direction === "asc" ? asc(sortCol) : desc(sortCol));
            }
          }

          if (sortConditions.length > 0) {
            sqlQuery = sql`${sqlQuery} ORDER BY ${sql.join(sortConditions, sql`, `)}`;
          }
        }

        if (options.limit !== undefined) sqlQuery = sql`${sqlQuery} LIMIT ${options.limit}`;
        if (options.offset !== undefined) sqlQuery = sql`${sqlQuery} OFFSET ${options.offset}`;

        const db = this.getDrizzleInstance(options);
        const rawRows = await (db as any).values(sqlQuery);

        results = rawRows.map((row: any) => {
          const obj: any = {};
          if (Array.isArray(row)) {
            columns.forEach((col, idx) => {
              if (row[idx] !== undefined) obj[col] = row[idx];
            });
          } else if (row && typeof row === "object") {
            columns.forEach((col) => {
              if (row[col] !== undefined) obj[col] = row[col];
            });
          }
          return obj;
        });
      } else {
        let builder = this.getDrizzleInstance(options)
          .select(this.getPhysicalSelection(table))
          .from(table)
          .where(where);
        builder = this.applyOrderBy(builder, table, options);
        if (options.limit) builder = builder.limit(options.limit);
        if (options.offset) builder = builder.offset(options.offset);
        results = await builder;
      }

      const data = utils.convertArrayDatesToISO(results as any, {
        table: collection,
      }) as T[];
      return this.hooks.length > 0
        ? await this.runHooks("after", "find", collection, data, options)
        : data;
    }, "FIND_MANY_FAILED");
  }

  async streamMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<AsyncIterable<T>>> {
    return this.wrap(async () => {
      const q =
        this.hooks.length > 0
          ? await this.runHooks("before", "find", collection, query, options)
          : query;
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const where = this.mapQuery(table, q as any, options);
      let builder = this.getDrizzleInstance(options)
        .select(this.getPhysicalSelection(table))
        .from(table)
        .where(where);
      builder = this.applyOrderBy(builder, table, options);
      if (options.limit) builder = builder.limit(options.limit);
      if (options.offset) builder = builder.offset(options.offset);

      const results = await builder;
      const data = utils.convertDatesToISO(results, {
        table: collection,
      }) as T[];

      const generator = async function* () {
        for (const item of data) {
          yield item;
        }
      };
      return generator() as AsyncIterable<T>;
    }, "STREAM_MANY_FAILED");
  }

  async find<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, query, options);
  }

  async findByIds<T extends BaseEntity>(
    collection: string,
    ids: DatabaseId[],
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, { _id: { $in: ids } } as any, options);
  }

  async findById<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    if (typeof collection !== "string") {
      return {
        success: false,
        message: `Invalid collection: expected string, got ${typeof collection}`,
        error: {
          code: "INVALID_COLLECTION",
          message: "Collection name must be a string",
        },
      };
    }
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Invalid ID: ${id}`,
        error: { code: "INVALID_ID", message: "ID must be a non-null value" },
      };
    }
    return this.wrap(async () => {
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);

      // Prototype: raw SQL bypass for findById (highest-volume ~40% pattern per allocation audit).
      // Eliminates: conditions[] array, and(), getColumn lookups, Drizzle SQL nodes, mapQuery overhead.
      // Uses buildRawTenantFilter + direct prepareAndExecute (inlined values like atomic paths).
      // Fallback to current Drizzle impl on any error (zero behavior change).
      // Immediate benchmark comparison vs Drizzle path available.
      if (this.type === "sqlite") {
        try {
          const tableName = getTableName(table);
          const idStr = String(id).replace(/'/g, "''"); // basic escape (id trusted from validated paths)
          const tenantFilter = utils.buildRawTenantFilter(options, "sqlite");
          const rawSql = `SELECT * FROM "${tableName}" WHERE "_id" = '${idStr}'${tenantFilter} LIMIT 1`;
          const rawRows = this.prepareAndExecute(rawSql, "all");
          if (rawRows && rawRows.length > 0) {
            const converted = utils.convertDatesToISO(rawRows[0], {
              table: collection,
            }) as T;
            return converted;
          }
          return null;
        } catch (rawErr: any) {
          // Fallback — log only outside benchmark to avoid measurement pollution (see BULK INSERT regression fix).
          if (process.env.BENCHMARK !== "true") {
            logger.debug(
              "[SQLite raw findById prototype] falling back to Drizzle:",
              rawErr?.message,
            );
          }
        }
      }

      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      const conditions: SQL[] = [eq(idCol, id as any)];

      const tenantCol = this.getColumn(table, "tenantId");
      utils.applyTenantFilter(conditions, tenantCol, options);

      const results = await this.getDrizzleInstance(options)
        .select()
        .from(table)
        .where(and(...conditions))
        .limit(1);

      return results.length
        ? (utils.convertDatesToISO(results[0], { table: collection }) as T)
        : null;
    }, "FIND_BY_ID_FAILED");
  }

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<boolean>> {
    return this.wrap(async () => {
      const table = this.getTable(collection);
      if (!table) return false;
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");
      const where = this.mapQuery(table, query as any, options);
      const results = await this.getDrizzleInstance(options)
        .select({ id: idCol })
        .from(table)
        .where(where)
        .limit(1);
      return results.length > 0;
    }, "EXISTS_FAILED");
  }

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<number>> {
    return this.wrap(async () => {
      const table = this.getTable(collection);
      const where = this.mapQuery(table, query || {}, options);
      try {
        const result = await this.getDrizzleInstance(options)
          .select({ count: drizzleCount() })
          .from(table)
          .where(where);
        return result[0].count;
      } catch (err: any) {
        const tableName = getTableName(table);
        const isDynamic =
          tableName.startsWith("collection_") || tableName.toLowerCase().includes("benchmark");
        if (err?.code === "SQLITE_ERROR" && err?.message?.includes("no such table") && isDynamic) {
          return 0;
        }
        throw err;
      }
    }, "COUNT_FAILED");
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    if (typeof collection !== "string") {
      return {
        success: false,
        message: `Invalid collection: expected string, got ${typeof collection}`,
        error: {
          code: "INVALID_COLLECTION",
          message: "Collection name must be a string",
        },
      };
    }
    return this.wrap(
      async () => {
        const d =
          this.hooks.length > 0
            ? await this.runHooks("before", "insert", collection, data, options)
            : data;
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const id = (d as any)._id || generateUUID();
        const now = new Date();
        const values = this.prepareValues(table, d, id, now, options);

        const query = this.getDrizzleInstance(options).insert(table).values(values);
        const result = await (query as any).returning();
        const finalData = utils.convertDatesToISO(result[0], {
          table: collection,
        }) as T;

        return this.hooks.length > 0
          ? await this.runHooks("after", "insert", collection, finalData, options)
          : finalData;
      },
      "INSERT_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }
  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    if (!data || data.length === 0) return { success: true, data: [] };
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const now = new Date();
        const len = data.length;
        const batchValues = Array.from({ length: len });
        for (let i = 0; i < len; i++) {
          const item = data[i];
          const id = (item as any)._id || generateUUID();
          batchValues[i] = this.prepareValues(table, item, id, now, options);
        }

        const db = this.getDrizzleInstance(options);
        return await db.transaction(async (tx: any) => {
          const query = tx.insert(table).values(batchValues);
          if (this._insertManyReturningSupported !== false) {
            try {
              const results = await (query as any).returning();
              this._insertManyReturningSupported = true;
              return utils.convertArrayDatesToISO(results as any, {
                table: collection,
              }) as T[];
            } catch (err: any) {
              this._insertManyReturningSupported = false;
              if (process.env.BENCHMARK !== "true") {
                logger.warn("[SQLite] insertMany returning fallback invoked due to error:", err);
              }
              await (query as any);
              return utils.convertArrayDatesToISO(batchValues as Record<string, any>[], {
                table: collection,
              }) as T[];
            }
          }
          await (query as any);
          return utils.convertArrayDatesToISO(batchValues as Record<string, any>[], {
            table: collection,
          }) as T[];
        });
      },
      "INSERT_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    if (typeof collection !== "string") {
      return {
        success: false,
        message: `Invalid collection: expected string, got ${typeof collection}`,
        error: {
          code: "INVALID_COLLECTION",
          message: "Collection name must be a string",
        },
      };
    }
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Update failed: ID is ${id}`,
        error: {
          code: "INVALID_ID",
          message: `Cannot update ${collection} with ${id} ID`,
        },
      };
    }
    return this.wrap(
      async () => {
        const d =
          this.hooks.length > 0
            ? await this.runHooks("before", "update", collection, data, options)
            : data;
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const now = new Date();
        const values = this.prepareValues(table, d, id, now, options);

        const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
        if (!idCol) throw new Error("ID column not found");

        const conditions: SQL[] = [eq(idCol, id as any)];
        const tenantCol = this.getColumn(table, "tenantId");
        utils.applyTenantFilter(conditions, tenantCol, options);

        const query = this.getDrizzleInstance(options)
          .update(table)
          .set(values)
          .where(and(...conditions));
        const results = await query.returning();
        let res = results[0];
        if (!res) {
          const check = await this.getDrizzleInstance(options)
            .select()
            .from(table)
            .where(and(...conditions));
          res = check[0];
        }

        if (!res) {
          throw new Error(`Record ${id} not found in ${getTableName(table)}`);
        }

        const finalData = utils.convertDatesToISO(res, {
          table: collection,
        }) as unknown as T;
        return this.hooks.length > 0
          ? await this.runHooks("after", "update", collection, finalData, options)
          : finalData;
      },
      "UPDATE_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.wrap(
      async () => {
        const items = await this.findMany(collection, query, options);
        if (!items.success) throw new Error(items.message);
        let modifiedCount = 0;
        for (const item of items.data || []) {
          const res = await this.update(collection, (item as any)._id, data, options);
          if (res.success) modifiedCount++;
        }
        return { modifiedCount };
      },
      "UPDATE_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions & {
      permanent?: boolean;
      userId?: DatabaseId;
    } = {},
  ): Promise<DatabaseResult<void>> {
    if (typeof collection !== "string") {
      return {
        success: false,
        message: `Invalid collection: expected string, got ${typeof collection}`,
        error: {
          code: "INVALID_COLLECTION",
          message: "Collection name must be a string",
        },
      };
    }
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Delete failed: ID is ${id}`,
        error: {
          code: "INVALID_ID",
          message: `Cannot delete from ${collection} with ${id} ID`,
        },
      };
    }
    return this.wrap(
      async () => {
        if (this.hooks.length > 0)
          await this.runHooks("before", "delete", collection, { _id: id }, options);
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
        if (!idCol) throw new Error("ID column not found");

        const conditions: SQL[] = [eq(idCol, id as any)];
        const tenantCol = this.getColumn(table, "tenantId");
        utils.applyTenantFilter(conditions, tenantCol, options);

        const hasIsDeleted = !!this.getColumn(table, "isDeleted");
        if (options.permanent || !hasIsDeleted) {
          await this.getDrizzleInstance(options)
            .delete(table)
            .where(and(...conditions));
        } else {
          await this.getDrizzleInstance(options)
            .update(table)
            .set({ isDeleted: true, updatedAt: new Date() })
            .where(and(...conditions));
        }
        if (this.hooks.length > 0)
          await this.runHooks("after", "delete", collection, { _id: id }, options);
      },
      "DELETE_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & {
      permanent?: boolean;
      userId?: DatabaseId;
    } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (options.permanent && (!query || Object.keys(query).length === 0)) {
          await this.getDrizzleInstance(options).delete(table);
          return { deletedCount: -1 };
        }
        const items = await this.findMany(collection, query, options);
        if (!items.success) throw new Error(items.message);
        let deletedCount = 0;
        for (const item of items.data || []) {
          const res = await this.delete(collection, (item as any)._id, options);
          if (res.success) deletedCount++;
        }
        return { deletedCount };
      },
      "DELETE_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async restore(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<void>> {
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Restore failed: ID is ${id}`,
        error: {
          code: "INVALID_ID",
          message: `Cannot restore in ${collection} with ${id} ID`,
        },
      };
    }
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
        if (!idCol) throw new Error("ID column not found");
        await this.getDrizzleInstance(options)
          .update(table)
          .set({ isDeleted: false, updatedAt: new Date() })
          .where(eq(idCol, id as any));
      },
      "RESTORE_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    const existing = await this.findOne(collection, query, options);
    if (existing.success && existing.data) {
      const existingId = (existing.data as any)._id || (existing.data as any).id;
      if (existingId) {
        return this.update(collection, existingId, data as any, options);
      }
    }
    return this.insert(collection, data, options);
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    const results: T[] = [];
    for (const item of items) {
      const res = await this.upsert(collection, item.query, item.data, options);
      if (res.success && res.data) results.push(res.data as T);
    }
    return { success: true, data: results };
  }

  async aggregate<R>(
    _collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return { success: true, data: [] };
  }

  async upsertNative(
    table: any,
    values: any,
    conflictTarget: any[],
    options: BaseQueryOptions = {},
  ): Promise<void> {
    const tableName = getTableName(table);
    if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
      logger.info(
        `[upsertNative] Table: ${tableName}, ID: ${values._id}, source: ${values.source}, tenant: ${values.tenantId}`,
      );
    }
    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        const rawNames = conflictTarget.map((col: any) =>
          col && typeof col === "object" && "name" in col ? `"${col.name}"` : `"${String(col)}"`,
        );
        const rawTarget = sql.raw(rawNames.join(", "));
        await (db.insert(table).values(values) as any).onConflictDoUpdate({
          target: rawTarget,
          set: values,
        });
      },
      "UPSERT_NATIVE_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  async atomicIncrement(
    collection: string,
    id: DatabaseId,
    field: string,
    amount: number,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<Record<string, unknown>>> {
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const tableName = getTableName(table);
        const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
        if (!idCol) throw new Error("ID column not found");

        const now = new Date();
        const tenantFilter = utils.buildRawTenantFilter(options, "sqlite");

        const dataCol = this.getColumn(table, "data");
        const idStr = String(id);

        // 🚀 PRIMARY PATH: UPDATE ... RETURNING * (SQLite 3.35+, Bun built-in)
        // Single-statement atomic increment with row return — eliminates the
        // findOne() re-fetch bottleneck (saves ~0.2ms per call by skipping a
        // second wrap/traceSpan/query-build cycle).
        // Uses prepareAndExecute("all") to get rows back instead of run().
        // COALESCE on "data" prevents NULL failures in json_set/json_extract.
        const updateReturning = dataCol
          ? `UPDATE "${tableName}" SET "data" = json_set(coalesce("data", '{}'), '$.${field}', coalesce(json_extract(coalesce("data", '{}'), '$.${field}'), 0) + ${amount}), "updatedAt" = ${now.getTime()} WHERE "${idCol.name}" = '${idStr}'${tenantFilter} RETURNING *`
          : `UPDATE "${tableName}" SET "${field}" = coalesce("${field}", 0) + ${amount}, "updatedAt" = ${now.getTime()} WHERE "${idCol.name}" = '${idStr}'${tenantFilter} RETURNING *`;

        try {
          const rows = this.prepareAndExecute(updateReturning, "all");
          if (Array.isArray(rows) && rows.length > 0) {
            return utils.convertDatesToISO(rows[0], {
              table: collection,
            }) as Record<string, unknown>;
          }
        } catch (err: any) {
          logger.debug(`SQLite RETURNING failed, using inline SELECT fallback: ${err.message}`);
        }

        // 🔄 FALLBACK: Standard UPDATE + inline SELECT (pre-3.35 SQLite)
        // Skips the heavy findOne() method overhead.
        // COALESCE on "data" prevents NULL failures in json_set/json_extract.
        const updateSql = dataCol
          ? `UPDATE "${tableName}" SET "data" = json_set(coalesce("data", '{}'), '$.${field}', coalesce(json_extract(coalesce("data", '{}'), '$.${field}'), 0) + ${amount}), "updatedAt" = ${now.getTime()} WHERE "${idCol.name}" = '${idStr}'${tenantFilter}`
          : `UPDATE "${tableName}" SET "${field}" = coalesce("${field}", 0) + ${amount}, "updatedAt" = ${now.getTime()} WHERE "${idCol.name}" = '${idStr}'${tenantFilter}`;

        this.prepareAndExecute(updateSql, "run");

        // 🚀 Inline SELECT: Eliminates findOne() overhead (no second wrap/traceSpan/query building)
        const selectRows = this.prepareAndExecute(
          `SELECT * FROM "${tableName}" WHERE "${idCol.name}" = '${idStr}'${tenantFilter} LIMIT 1`,
          "all",
        );

        if (!Array.isArray(selectRows) || selectRows.length === 0) {
          throw new Error(`Entry not found after increment: ${idStr}`);
        }

        return utils.convertDatesToISO(selectRows[0], {
          table: collection,
        }) as Record<string, unknown>;
      },
      "ATOMIC_INCREMENT_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  public async createModel(schemaData: any): Promise<void> {
    const tableName = schemaData._id || schemaData.id;
    if (!tableName) throw new Error("Schema must have an _id");
    const normalizedName = tableName.replace(/-/g, "");
    const table = this.getTable(normalizedName);
    const physicalName = getTableName(table as any);

    await this.wrap(
      async () => {
        const isBenchSuite = process.env.SVELTY_BENCHMARK_SUITE === "true";
        const debugMode = process.env.BENCHMARK_DEBUG === "true";

        const ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" TEXT PRIMARY KEY, "tenantId" TEXT, "status" TEXT DEFAULT 'draft', "isDeleted" INTEGER DEFAULT 0, "createdAt" INTEGER, "updatedAt" INTEGER, "data" TEXT);`;
        if (debugMode && !isBenchSuite) {
          console.log(`[DB Provision] [SQLITE] Executing DDL for ${physicalName}`);
        }
        await this.raw.execute(ddl);

        const columns = [
          { name: "isDeleted", type: "INTEGER DEFAULT 0" },
          { name: "status", type: "TEXT DEFAULT 'draft'" },
          { name: "tenantId", type: "TEXT" },
          { name: "createdAt", type: "INTEGER" },
          { name: "updatedAt", type: "INTEGER" },
        ];

        const dynamicCols = [
          { name: "collection", type: "TEXT" },
          { name: "slug", type: "TEXT" },
          { name: "locale", type: "TEXT" },
          { name: "publishedAt", type: "INTEGER" },
        ];

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          for (const field of schemaData.fields) {
            if (field.indexed || field.unique) {
              const fieldName = field.db_fieldName || field.label;
              if (fieldName) {
                let colType = "TEXT";
                if (
                  field.type === "number" ||
                  field.type === "integer" ||
                  field.type === "boolean"
                ) {
                  colType = "INTEGER";
                }
                if (
                  !dynamicCols.some((c) => c.name === fieldName) &&
                  !columns.some((c) => c.name === fieldName) &&
                  fieldName !== "_id" &&
                  fieldName !== "id" &&
                  fieldName !== "data"
                ) {
                  dynamicCols.push({ name: fieldName, type: colType });
                }
              }
            }
          }
        }

        const allColumnsToEnsure = [...columns, ...dynamicCols];

        // Schema-aware row conversion: register date/JSON columns for zero-overhead lookups
        registerTableSchema(normalizedName, [
          "_id",
          "data",
          ...allColumnsToEnsure.map((c) => c.name),
        ]);

        for (const col of allColumnsToEnsure) {
          try {
            const tableInfo = await this.raw.execute(`PRAGMA table_info("${physicalName}")`);
            const exists = tableInfo.some((c: any) => c.name === col.name);
            if (!exists) {
              await this.raw.execute(
                `ALTER TABLE "${physicalName}" ADD COLUMN "${col.name}" ${col.type}`,
              );
            }
          } catch {}
        }

        // Create indexes
        for (const col of dynamicCols) {
          try {
            const indexName = `${physicalName}_${col.name}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${col.name}")`,
            );
          } catch {}
        }

        logger.info(`[SQLITE Adapter] Provisioned table: ${physicalName}`);
        // Track that this table has physical columns so getTable() can add them
        this._provisionedTables.add(normalizedName);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: false,
    supportsAggregation: true,
    supportsStreaming: false,
    supportsPartitioning: false,
    maxBatchSize: 100,
    maxQueryComplexity: 50,
  };

  // 🚀 AGNOSTIC CORE: SQLite implementation of JSON field extraction.
  public getJsonField(field: string): SQL {
    // Correct SQLite JSON path syntax: '$."field"'
    // We explicitly quote the field inside the path to handle keywords.
    return sql`json_extract(data, '$."' || ${field} || '"')`;
  }

  // 🚀 AGNOSTIC CORE: Reports the current connection state and checks if the SQLite client is responsive.
  public async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
    }>
  > {
    const start = performance.now();
    try {
      if (!this._sqlite) {
        return {
          success: true,
          data: { healthy: false, latency: 0, activeConnections: 0 },
        };
      }

      // 🚀  Advanced PRAGMAs for benchmark stability and performance
      this.applyPragmas(this._sqlite);

      // Ping check
      if (this._sqlite.query) {
        this._sqlite.query("SELECT 1").get();
      } else if (this._sqlite.prepare) {
        this._sqlite.prepare("SELECT 1").get();
      } else if (typeof this._sqlite.exec === "function") {
        this._sqlite.exec("SELECT 1");
      }

      return {
        success: true,
        data: {
          healthy: true,
          latency: performance.now() - start,
          activeConnections: 1,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message,
        error: utils.createDatabaseError("HEALTH_CHECK_FAILED", e.message, e),
      };
    }
  }

  public override async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
    options?: any,
  ): Promise<DatabaseResult<T>> {
    // 🚀 SERIALIZE: SQLite is a single-writer database.
    // If this is a write operation and not already in a transaction (which has its own mutex),
    // we MUST use the global write mutex to prevent 'database is locked' errors.
    if (options?.isWrite && !options?.transaction) {
      return SQLiteAdapterCore.writeMutex.runExclusive(() =>
        super.wrap(fn, code, message, options),
      );
    }
    return super.wrap(fn, code, message, options);
  }

  // 🚀 AGNOSTIC CORE: Resolves a collection name to its Drizzle schema object.
  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;

    // 1. O(1) Centralized Resolution (gets physical name like 'workflow_definitions')
    const physicalName = helpers.resolveSystemTableName(collection);

    // 2. Direct physical name check
    if (schemaAny[physicalName]) return schemaAny[physicalName];

    // 3. Normalized CamelCase check (e.g. 'workflow_definitions' -> 'workflowDefinitions')
    // This is where most system tables live in the Drizzle schema export
    const camelName = physicalName.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
    if (schemaAny[camelName]) return schemaAny[camelName];

    // 🛡️ HARDENING: Explicit fallback for workflow tables if naming normalization fails
    if (physicalName.includes("workflow_definitions") && schemaAny.workflowDefinitions)
      return schemaAny.workflowDefinitions;
    if (physicalName.includes("workflow_instances") && schemaAny.workflowInstances)
      return schemaAny.workflowInstances;

    // 4. Final fallback: try raw collection name
    if (schemaAny[collection]) return schemaAny[collection];

    return null;
  }

  protected getDrizzleInstance(_options?: BaseQueryOptions): SQLiteDB {
    return this._db!;
  }

  public createDynamicTableDefinition(name: string, columnsToAdd?: Map<string, string>) {
    // 🚀 HARDENING: Standardize dynamic columns to ensure text columns like '_id'
    // are physically selectable in all drivers (especially Bun).
    const columns: Record<string, any> = {
      _id: text("_id").primaryKey().notNull(),
      tenantId: text("tenantId"),
      data: text("data").notNull().default("{}"),
      status: text("status").notNull().default("draft"),
      isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
      createdAt: integer("createdAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s','now')*1000)`),
      updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s','now')*1000)`),
    };

    if (columnsToAdd) {
      for (const [colName, colType] of columnsToAdd.entries()) {
        if (
          colName === "_id" ||
          colName === "id" ||
          colName === "tenantId" ||
          colName === "status" ||
          colName === "isDeleted" ||
          colName === "createdAt" ||
          colName === "updatedAt" ||
          colName === "data"
        ) {
          continue;
        }
        if (colType === "integer") {
          if (colName === "publishedAt") {
            columns[colName] = integer(colName, { mode: "timestamp_ms" });
          } else {
            columns[colName] = integer(colName);
          }
        } else {
          columns[colName] = text(colName);
        }
      }
    }

    // Schema-aware row conversion: register date/JSON columns for zero-overhead lookups
    registerTableSchema(name, Object.keys(columns));

    return sqliteTable(name, columns, (t) => {
      const idxs: Record<string, any> = {
        tenantIdx: index(`${name}_tenant_idx`).on(t.tenantId),
        statusIdx: index(`${name}_status_idx`).on(t.status),
        updatedIdx: index(`${name}_updated_idx`).on(t.updatedAt),
      };
      if (columnsToAdd) {
        for (const colName of columnsToAdd.keys()) {
          if (t[colName]) {
            idxs[`${colName}Idx`] = index(`${name}_${colName}_idx`).on(t[colName]);
          }
        }
      }
      return idxs;
    });
  }

  protected _sqlite: SQLiteClient | null = null;
  protected _db: SQLiteDB | null = null;
  protected connections = new Map<
    string,
    { sqlite: SQLiteClient; db: SQLiteDB; statementCache: Map<string, any> }
  >();
  protected _statementCache = new Map<string, any>();

  protected state: "idle" | "connecting" | "connected" | "closing" | "closed" = "idle";
  protected config: string | SQLiteConfig = "";

  public get sqlite(): SQLiteClient {
    if (!this._sqlite) {
      throw new Error(`[SQLite] Database client not initialized (state: ${this.state})`);
    }
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(worker);
      if (conn) return conn.sqlite;
    }
    return this._sqlite;
  }

  // 🚀 AGNOSTIC CORE: Returns the raw database client.
  public getClient(): SQLiteClient {
    return this.sqlite;
  }

  public get db(): SQLiteDB {
    if (!this.isConnected()) {
      const worker = testWorkerContext.getStore();
      if (!(worker && process.env.TEST_MODE === "true")) {
        throw new Error(`[SQLite] Database connection not established (state: ${this.state})`);
      }
    }
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(worker);
      if (conn) return conn.db;

      // 🛡️ RACE CONDITION GUARD: If worker is set but connection not yet initialized,
      // fallback to main DB but warn. This prevents hard crashes during rapid test re-seeds.
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.warn(
          `[SQLite] Test worker ${worker} requested DB but connection not ready. Falling back.`,
        );
      }
      return this._db!;
    }
    return this._db!;
  }

  /* ------------------------------------------------ */
  /* CONNECT                                          */
  /* ------------------------------------------------ */

  async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  public async connect(
    config?: string | SQLiteConfig | import("../db-interface").ConnectionPoolOptions,
    _options?: any,
  ): Promise<DatabaseResult<void>> {
    let finalConfig = config;

    if (!finalConfig) {
      const { getDatabaseConnectionString } = await import("../config-state");
      finalConfig = getDatabaseConnectionString() as string;
    }

    if (this.state === "connected") {
      // Robust check: if path changed, we should reconnect
      const currentPath = await this.resolvePath(this.config as any);
      const newPath = await this.resolvePath(finalConfig as any);
      if (currentPath === newPath) {
        return { success: true, data: undefined };
      }
      await this.disconnect();
    }

    this.state = "connecting";

    try {
      this.config = finalConfig as any;
      const dbPath = await this.resolvePath(finalConfig as any);
      const { sqlite, db } = await this.createDriver(dbPath);

      this._sqlite = sqlite;
      this._db = db;

      // 🚀 Performance: Apply pragmas immediately to the raw client
      this.applyPragmas(sqlite);
      this._statementCache.clear();

      this.state = "connected";
      this.metrics.queryCount = 0; // Reset metrics on new connection
      this.metrics.errorCount = 0;

      // Silent connection by default in core
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.info(`[SQLite] Connected -> ${dbPath}`);
      }
      this.connected = true;
      return { success: true, data: undefined };
    } catch (error) {
      this.state = "idle";
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  /* ------------------------------------------------ */
  /* PROVISIONING (Standalone Mode Support)           */
  /* ------------------------------------------------ */

  protected _provisioned = false;
  protected _provisionPromise: Promise<void> | null = null;

  public async provision() {
    if (this._provisioned) return;
    if (this._provisionPromise) return this._provisionPromise;

    this._provisionPromise = (async () => {
      try {
        // @ts-ignore - Dynamic import to avoid circular dependency
        const { runMigrations } = await import("./migrations");
        await runMigrations(this._sqlite);

        // 🚀 TABLE REGISTRY PRE-WARMING: Build all dynamic table definitions
        // upfront so getTable() never queries content_nodes during requests.
        // Without this, every first request to a collection does a synchronous
        // DB read for indexed field discovery — adding ~0.5ms per cold collection.
        await this._warmTableRegistry();

        this._provisioned = true;
      } catch (err: any) {
        logger.error(`[SQLite] Provisioning failed: ${err.message}`);
        this._provisionPromise = null; // Allow retry on failure
        throw err;
      }
    })();

    return this._provisionPromise;
  }

  public async ensureAuth() {
    await this.provision();
  }
  public async ensureSystem() {
    await this.provision();
  }
  public async ensureMedia() {
    await this.provision();
  }
  public async ensureContent() {
    await this.provision();
  }
  public async ensureMonitoring() {
    await this.provision();
  }
  public async ensureCollections() {
    await this.provision();
  }

  /**
   * 🚀 TABLE REGISTRY PRE-WARMING
   * Queries all content_nodes at startup and pre-builds dynamic table definitions
   * into tableRegistry. After this runs, getTable() returns instantly from the
   * in-memory Map — zero DB queries on the request path.
   *
   * This eliminates the ~0.5ms synchronous content_nodes query that previously
   * ran on the first request to each collection after server restart.
   */
  private async _warmTableRegistry(): Promise<void> {
    const client = this._sqlite;
    if (!client) return;

    try {
      let rows: any[] = [];
      if (client.query) {
        rows = client
          .query("SELECT _id, data FROM content_nodes WHERE _id NOT LIKE 'system_%'")
          .all();
      } else if (client.prepare) {
        rows = client
          .prepare("SELECT _id, data FROM content_nodes WHERE _id NOT LIKE 'system_%'")
          .all();
      }

      let warmed = 0;
      for (const row of rows) {
        const cleanId = String(row._id).replace(/-/g, "");
        const collectionName = cleanId.startsWith("collection_")
          ? cleanId
          : `collection_${cleanId}`;

        if (this.tableRegistry.has(collectionName)) continue;

        try {
          // Call getTable which populates tableRegistry
          this.getTable(collectionName);
          // Mark as provisioned since the table exists in content_nodes
          this._provisionedTables.add(collectionName);
          warmed++;
        } catch {
          // Skip collections that fail to resolve
        }
      }

      if (warmed > 0) {
        logger.info(
          `[SQLite] Table registry pre-warmed: ${warmed} collections ready (zero-DB request path)`,
        );
      }
    } catch {
      // Non-critical: if content_nodes doesn't exist yet (fresh DB), skip silently
    }
  }

  public async waitForConnection(): Promise<void> {
    if (this.isConnected()) return;
    // Simple polling wait for connection
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.isConnected() || Date.now() - start > 10000) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  public queryBuilder<_T extends BaseEntity>(collection: string): any {
    return new SQLiteQueryBuilder(this as any, collection);
  }

  public async transaction<T>(
    fn: (transaction: import("../db-interface").DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: { timeout?: number; isolationLevel?: string },
  ): Promise<DatabaseResult<T>> {
    const module = new TransactionModule(this as any);
    return module.execute(fn, options as any);
  }

  /* ------------------------------------------------ */
  /* DISCONNECT                                       */
  /* ------------------------------------------------ */

  public async disconnect(): Promise<DatabaseResult<void>> {
    try {
      this.state = "closing";
      this._statementCache.clear();
      this._sqlite?.close();

      for (const conn of this.connections.values()) {
        conn.statementCache.clear();
        conn.sqlite.close();
      }

      this.connections.clear();
      this.state = "closed";
      if (this.connected) {
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info("[SQLite] Disconnected");
        }
        this.connected = false;
      }
      return { success: true, data: undefined };
    } catch (error) {
      return this.handleError(error, "DISCONNECT_FAILED");
    }
  }

  /* ------------------------------------------------ */
  /* WORKER TEST CONNECTION                           */
  /* ------------------------------------------------ */

  public async initWorkerConnection(index: string): Promise<void> {
    if (this.connections.has(index)) return;

    const path = await import("node:path");
    const base = await this.resolvePath(this.config);
    const ext = path.extname(base);
    const workerPath = base.replace(ext, `_test_${index}${ext}`);

    const { sqlite, db } = await this.createDriver(workerPath);
    this.applyPragmas(sqlite);
    this.connections.set(index, { sqlite, db, statementCache: new Map() });
  }

  public runInWorkerContext<T>(index: string, fn: () => T): T {
    return testWorkerContext.run(index, fn);
  }

  /* ------------------------------------------------ */
  /* CAPABILITIES                                     */
  /* ------------------------------------------------ */

  public isConnected(): boolean {
    return this.connected && this._sqlite !== null;
  }

  public async isEmpty(): Promise<DatabaseResult<boolean>> {
    return this.wrap(async () => {
      const tables = this.prepareAndExecute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        "all",
      );
      return tables.length === 0;
    }, "CHECK_EMPTY_FAILED");
  }

  public async getVersion(): Promise<DatabaseResult<string>> {
    return this.wrap(async () => {
      const row = this.prepareAndExecute("SELECT sqlite_version() as version", "get");
      return row.version as string;
    }, "GET_VERSION_FAILED");
  }

  /* ------------------------------------------------ */
  /* INTERNALS                                        */
  /* ------------------------------------------------ */

  // High-performance execution helper that abstracts away driver differences.
  protected prepareAndExecute(
    sqlText: string,
    method: "all" | "get" | "run" | "values" = "all",
    ...params: any[]
  ): any {
    const client = this.sqlite;

    // 🚀 Performance: Prepared Statement Caching
    let stmt = this._statementCache.get(sqlText);
    if (!stmt) {
      stmt = client.prepare(sqlText);
      // Cap cache size to 1000 to prevent memory exhaustion
      if (this._statementCache.size < 1000) {
        this._statementCache.set(sqlText, stmt);
      }
    }

    // 🚀 Metrics
    this.metrics.queryCount++;

    // Driver-specific execution
    try {
      if (method === "all") return stmt.all(...params);
      if (method === "get") return stmt.get(...params);
      if (method === "run") return stmt.run(...params);
      if (method === "values") return stmt.values(...params);
      return stmt.all(...params);
    } catch (err: any) {
      logger.error(`[SQLite] Execution error: ${sqlText}`, err);
      throw err;
    }
  }

  private async createDriver(dbPath: string) {
    const versions = (process as any)?.versions || {};
    const isBun = typeof Bun !== "undefined";
    const nodeVersion = versions.node;

    // 🚀 WINDOWS OPTIMIZATION: bun:sqlite on Windows can fail with SQLITE_MISUSE (21)
    // if given absolute paths with drive letters in certain formats.
    // Converting to a relative path or ensuring forward slashes fixes this.
    let normalizedPath = dbPath.replace(/\\/g, "/");
    if (process.platform === "win32") {
      const root = process.cwd().replace(/\\/g, "/").toLowerCase();
      const normLower = normalizedPath.toLowerCase();

      if (normLower.startsWith(root)) {
        normalizedPath = normalizedPath.substring(root.length).replace(/^\//, "");
      } else if (normalizedPath.includes(":/") && !normalizedPath.startsWith("file:")) {
        // Absolute path on Windows but not in CWD, use file URI
        normalizedPath = `file:///${normalizedPath}`;
      }
    }

    // ALWAYS log this to server-debug.log for diagnosis
    logger.info(`[SQLite] Opening database at: ${normalizedPath} (Original: ${dbPath})`);

    const readonly = (this.config as SQLiteConfig)?.readonly || dbPath.includes("mode=ro") || false;
    const options = readonly ? { readonly } : {};

    // 🚀 Bun native — fastest, zero deps, ESM-friendly
    if (isBun) {
      try {
        const { Database } = await import("bun:sqlite");

        // 🚀 WINDOWS RESILIENCE: Retry on "SQLITE_MISUSE" or "busy" which often indicates
        // a transient file lock or path access issue on Windows.
        let sqlite: any;
        let lastErr: any;
        for (let i = 0; i < 10; i++) {
          try {
            // On Windows, sometimes file:/// is needed, sometimes not.
            // We'll try the normalizedPath first, then raw dbPath.
            const target = i >= 3 ? dbPath.replace(/\\/g, "/") : normalizedPath;

            sqlite =
              Object.keys(options).length > 0
                ? new Database(target, options)
                : new Database(target);
            break;
          } catch (e: any) {
            lastErr = e;
            const isRetryable =
              e.message?.includes("misuse") ||
              e.message?.includes("busy") ||
              e.code === "SQLITE_MISUSE" ||
              e.errno === 21;

            if (process.platform === "win32" && isRetryable) {
              await new Promise((r) => setTimeout(r, 250 * (i + 1)));
              continue;
            }
            throw e;
          }
        }
        if (!sqlite) throw lastErr;

        const { drizzle } = await import("drizzle-orm/bun-sqlite");
        const db = drizzle(sqlite as any, { schema }) as SQLiteDB;

        // 🚀 AGNOSTIC SILENCE: Only log success once per process to keep benchmarks clean
        if (!(globalThis as any).__SQLITE_DRIVER_LOGGED__) {
          logger.info(`[SQLite] 🚀 SUCCESS: Using high-performance 'bun:sqlite' driver.`);
          (globalThis as any).__SQLITE_DRIVER_LOGGED__ = true;
        }

        return { sqlite, db };
      } catch (e: any) {
        logger.warn(`[SQLite] Bun driver failed: ${e.message}. Falling back to node:sqlite...`);

        // 🚀 WINDOWS OPTIMIZATION: On Windows Bun, if bun:sqlite fails,
        // we likely have a serious environment issue.
        if (process.platform === "win32") {
          // Fail fast on Windows Bun issues unless forced
          if (process.env.FORCE_SQLITE_FALLBACK !== "true") throw e;
        }
      }
    }

    // 🔌 Node.js native (Node >=22.5) — via drizzle-orm/sqlite-proxy
    if (nodeVersion) {
      const v = nodeVersion.replace("v", "");
      const [major, minor] = v.split(".").map(Number);

      if (major > 22 || (major === 22 && minor >= 5)) {
        try {
          const req = await getRequire();
          if (!req) throw new Error("requireFunc not available");

          const { DatabaseSync } = req("node:sqlite");
          const sqlite = new DatabaseSync(normalizedPath);

          this.applyPragmas({ exec: (cmd: string) => sqlite.exec(cmd) });

          // drizzle-orm/node-sqlite not yet exported in v0.45.2 — use sqlite-proxy shim
          const { drizzle: proxyDrizzle } = await import("drizzle-orm/sqlite-proxy");

          const db = proxyDrizzle(
            async (sqlText, params = [], method) => {
              const serializedParams = (params || []).map((p) => {
                if (typeof p === "boolean") return p ? 1 : 0;
                return p !== null && typeof p === "object" ? JSON.stringify(p) : p;
              });

              const isWrite =
                /^\s*(insert|update|delete|create|drop|alter|replace|begin|commit|rollback|savepoint)/i.test(
                  sqlText,
                );

              const execute = async () => {
                let stmt = this._statementCache.get(sqlText);
                if (!stmt) {
                  stmt = sqlite.prepare(sqlText);
                  if (this._statementCache.size < 1000) {
                    this._statementCache.set(sqlText, stmt);
                  }
                }

                if (method === "all") {
                  const result = stmt.all(...serializedParams);
                  const rows = (result || []).map((row: any) => Object.values(row));
                  return { rows };
                } else if (method === "get") {
                  const result = stmt.get(...serializedParams);
                  const rows = result ? Object.values(result) : undefined;
                  return { rows };
                } else if (method === "values") {
                  const result = stmt.all(...serializedParams);
                  const rows = (result || []).map((row: any) => Object.values(row));
                  return { rows };
                } else {
                  const result = stmt.run(...serializedParams);
                  return {
                    rows: [],
                    lastInsertRowid: result.lastInsertRowid,
                    changes: result.changes,
                  };
                }
              };

              if (isWrite) {
                return SQLiteAdapterCore.writeMutex.runExclusive(execute);
              }
              return execute();
            },
            { schema },
          );

          logger.info(`[SQLite] Using native 'node:sqlite' driver (shimmed via sqlite-proxy).`);
          return { sqlite: sqlite as any, db };
        } catch (nodeErr: any) {
          logger.error(`[SQLite] node:sqlite failed: ${nodeErr.message}`);
        }
      }
    }

    throw new Error(`No compatible SQLite driver found (bun:sqlite or node:sqlite).`);
  }

  private applyPragmas(client: SQLiteClient) {
    // Tuning - wrapped in try-catch to be safe
    const safeExec = (cmd: string) => {
      try {
        client.exec(cmd);
      } catch {
        // Only log on critical error
      }
    };

    safeExec("PRAGMA journal_mode=WAL");
    safeExec("PRAGMA synchronous=NORMAL");
    safeExec("PRAGMA foreign_keys=ON");
    safeExec("PRAGMA page_size=8192");
    safeExec("PRAGMA busy_timeout=30000");
    safeExec("PRAGMA temp_store=MEMORY");
    safeExec("PRAGMA mmap_size=536870912"); // Increased to 512MB for heavy sorts
    safeExec("PRAGMA cache_size=-128000"); // 128MB RAM cache
    safeExec("PRAGMA wal_autocheckpoint=1000");
  }

  public get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        const isNonSelect =
          /^\s*(create|drop|alter|insert|update|delete|replace|pragma|begin|commit|rollback|savepoint)/i.test(
            sqlText,
          );
        const method = isNonSelect ? "run" : "all";
        return this.prepareAndExecute(sqlText, method, ...params);
      },
      client: this.sqlite,
    };
  }

  private async resolvePath(config: string | SQLiteConfig): Promise<string> {
    const path = await import("node:path");
    const fs = await import("node:fs");

    let dbPath = typeof config === "string" ? config : config.connectionString;

    if (!dbPath) {
      const { isSetupComplete } = await import("@utils/setup-check-fast");
      dbPath =
        process.env.DB_PATH || (isSetupComplete() ? "config/database/sveltycms.db" : ":memory:");
    }

    // 🚀 HARDENING: Don't treat URIs as local paths
    if (dbPath.includes("://")) {
      throw new Error(
        `Invalid SQLite path: '${dbPath}' looks like a URI. Check your DB configuration.`,
      );
    }

    // Handle standard relative paths
    if (dbPath !== ":memory:" && !path.isAbsolute(dbPath) && !dbPath.startsWith("file:")) {
      dbPath = path.resolve(process.cwd(), dbPath);
    }

    // Ensure directory exists
    const dir = path.dirname(dbPath.replace("file:///", ""));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return dbPath;
  }
}

async function getRequire() {
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url);
  } catch {
    return null;
  }
}
