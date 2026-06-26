/**
 * @file src/databases/core/sql-adapter-core.ts
 * @description
 * Abstract intermediate base class for all SQL-based database adapters (SQLite, MariaDB, PostgreSQL).
 * Absorbs ~1,300 lines of duplicated CRUD logic, delegation helpers, cache/registry state,
 * and domain module lazy-loading that was previously copy-pasted across the three adapter cores.
 *
 * Each adapter must implement the abstract template hooks for dialect-specific behavior
 * (table creation, JSON field extraction, missing-table error detection, raw SQL execution).
 *
 * ### Features:
 * - shared CRUD operations with template method hooks
 * - shared delegation helpers (getColumn, getPhysicalSelection, mapQuery, applyOrderBy)
 * - shared prepareValues with dialect-specific JSON serialization
 * - shared domain module lazy-loading (auth, content, media, system, batch, collection)
 * - shared cache/registry state management
 */
import { BaseAdapter } from "./base-adapter";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseResult,
  DatabaseId,
  FindOptions,
  EntityCreate,
  EntityUpdate,
  QueryFilter,
  ICrudAdapter,
  ISqlAdapter,
} from "../db-interface";
import * as helpers from "./drizzle-sql-helpers";
import { generateUUID } from "@utils/native-utils";
import {
  count as drizzleCount,
  getTableColumns,
  getTableName,
  asc,
  desc,
  type Column,
  eq,
  and,
} from "drizzle-orm";
import { sql, type SQL } from "drizzle-orm";
import * as utils from "./relational-utils";
import { RelationalAuthModule } from "./relational-auth";
import { RelationalContentModule } from "./relational-content";
import { RelationalMediaModule } from "./relational-media";
import { RelationalSystemModule } from "./relational-system";
import { BatchModule } from "./batch-module";
import { CollectionModule } from "./collection-module";

// ============================================================================
// Abstract SqlAdapterCore — shared base for all SQL adapters
// ============================================================================

export abstract class SqlAdapterCore extends BaseAdapter implements ISqlAdapter {
  // --------------------------------------------------------------------------
  // Adapter identity (set by each concrete adapter)
  // --------------------------------------------------------------------------
  public abstract type: string;
  public abstract readonly schema: any;
  public abstract db: any;
  public abstract raw: {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  };
  public abstract transaction<T>(
    fn: (
      transaction: import("../db-interface").DatabaseTransaction,
    ) => Promise<import("../db-interface").DatabaseResult<T>>,
    options?: { timeout?: number; isolationLevel?: string; isWrite?: boolean },
  ): Promise<import("../db-interface").DatabaseResult<T>>;

  // --------------------------------------------------------------------------
  // Abstract template hooks — each adapter MUST implement these
  // --------------------------------------------------------------------------

  /** Resolve a collection name to its Drizzle table definition. */
  public abstract getTable(collection: string): any;

  /** Return dialect-specific JSON field extraction SQL (e.g., json_extract, JSON_EXTRACT, data->>). */
  public abstract getJsonField(field: string): SQL;

  /** Create a Drizzle dynamic table definition using dialect-specific column types. */
  public abstract createDynamicTableDefinition(name: string): any;

  /** Check whether an error indicates "table does not exist" for this dialect. */
  protected abstract isMissingTableError(err: any): boolean;

  // --------------------------------------------------------------------------
  // Overridable template hooks — defaults suitable for MariaDB/PostgreSQL;
  // SQLite overrides several of these.
  // --------------------------------------------------------------------------

  /** Options bag passed to convertDatesToISO / convertArrayDatesToISO. */
  protected get convertDatesOptions(): Record<string, any> {
    return {};
  }

  /** Whether INSERT … RETURNING is supported natively. */
  protected get insertReturnsRows(): boolean {
    return false;
  }

  /** Whether UPDATE … RETURNING is supported natively. */
  protected get updateReturnsRows(): boolean {
    return false;
  }

  /** Whether prepareValues should JSON.stringify object values (SQLite TEXT columns need it). */
  protected get shouldJsonSerializeInPrepare(): boolean {
    return false;
  }

  /** Whether findMany uses a raw-SQL dynamic path for benchmark/heavy tables. */
  protected get useDynamicSqlInFindMany(): boolean {
    return false;
  }

  /** Whether findById has an adapter-specific raw-SQL optimization. */
  protected get useRawFindById(): boolean {
    return false;
  }

  /** Execute a raw SQL query for the dynamic findMany path. */
  protected async executeDynamicSql(_db: any, sqlQuery: SQL): Promise<any[]> {
    // Default: PostgreSQL-style (execute returns rows array or {rows: [...]})
    const execResult = await _db.execute(sqlQuery);
    if (Array.isArray(execResult)) return execResult;
    return (execResult as any).rows || [];
  }

  /** Adapter-specific raw findById optimisation — returns null if not used. */
  protected async rawFindById<T>(
    _table: any,
    _collection: string,
    _id: DatabaseId,
    _options: FindOptions<T>,
  ): Promise<T | null> {
    return null;
  }

  /** Resolve a collection name to a Drizzle schema object (system tables). */
  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;
    const alias = helpers.SQL_TABLE_ALIASES[collection];
    if (alias && schemaAny[alias]) return schemaAny[alias];
    if (schemaAny[collection]) return schemaAny[collection];
    return null;
  }

  /** Return the active Drizzle database instance. */
  protected getDrizzleInstance(_options?: BaseQueryOptions): any {
    return (this as any).db;
  }

  // --------------------------------------------------------------------------
  // Cache & Registry State (shared across all SQL adapters)
  // --------------------------------------------------------------------------

  protected preparedStatements = new Map<string, any>();
  protected readonly MAX_PREPARED_STATEMENTS = 500;
  protected _tableColumnsCache = new Map<any, Record<string, Column>>();
  protected tableRegistry = new Map<string, any>();
  protected dynamicTables = new Map<string, any>();
  protected modelRegistry = new Map<string, any>();
  protected _resolving = new Set<string>();
  protected _selectionCache = new Map<string, any>();
  protected _lastTable: any = null;
  protected _lastCols: Record<string, Column> | null = null;

  // --------------------------------------------------------------------------
  // Lazy Domain Modules
  // --------------------------------------------------------------------------

  protected _auth: any = null;
  protected _content: any = null;
  protected _media: any = null;
  protected _system: any = null;
  protected _batch: any = null;
  protected _collection: any = null;

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

  // --------------------------------------------------------------------------
  // Helper Delegations
  // --------------------------------------------------------------------------

  public isSystemTable(collection: string): boolean {
    return helpers.isSystemTable(collection);
  }

  public getColumn(table: any, name: string, forcePhysical = false): any {
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val: any) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val: any) {
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
      set table(val: any) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val: any) {
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
      set table(val: any) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val: any) {
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
      set table(val: any) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val: any) {
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

  // --------------------------------------------------------------------------
  // prepareValues (shared logic, dialect hooks for JSON serialization)
  // --------------------------------------------------------------------------

  public prepareValues(table: any, data: any, id: any, now: Date, options: any): any {
    const values: any = {};
    const self = this as any;
    const lastRef = {
      get table() {
        return self._lastTable;
      },
      set table(val: any) {
        self._lastTable = val;
      },
      get cols() {
        return self._lastCols;
      },
      set cols(val: any) {
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
      } catch {
        /* safe fallback */
      }
    }

    for (const k in data) {
      if (!Object.hasOwn(data, k)) continue;
      if (k === "_id" || k === "id") continue;

      const isPhysical = schemaCols?.[k] || getCol(table, k);

      if (isPhysical) {
        if ((k === "_id" || k === "id") && id) continue;
        if (data[k] !== undefined) {
          let val = data[k];
          if (
            this.shouldJsonSerializeInPrepare &&
            typeof val === "object" &&
            val !== null &&
            !(val instanceof Date)
          ) {
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

    // Map common fields explicitly
    if (schemaCols?.["collection"] || getCol(table, "collection")) {
      values.collection = data.collection || getTableName(table).replace(/^collection_/, "");
    }

    if (schemaCols?.["publishedAt"] || getCol(table, "publishedAt")) {
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
      if (this.shouldJsonSerializeInPrepare) {
        values.data = JSON.stringify(dynamicData) || "{}";
      } else {
        values.data = dynamicData;
      }
    }

    const result = utils.convertISOToDates(values, {
      ...this.convertDatesOptions,
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

  // --------------------------------------------------------------------------
  // CRUD: findOne
  // --------------------------------------------------------------------------

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
        ? (utils.convertDatesToISO(results[0], {
            ...this.convertDatesOptions,
            table: collection,
          }) as T)
        : null;
      return this.hooks.length > 0
        ? await this.runHooks("after", "find", collection, data, options)
        : data;
    }, "FIND_ONE_FAILED");
  }

  // --------------------------------------------------------------------------
  // CRUD: findMany
  // --------------------------------------------------------------------------

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
        this.useDynamicSqlInFindMany &&
        (collection.toLowerCase().includes("benchmark") || collection.startsWith("collection_"));

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
                  normalizedSorts.push({
                    field: keys[0],
                    direction: (item as any)[keys[0]],
                  });
                }
              }
            }
          } else if (typeof options.sort === "object") {
            for (const field of Object.keys(options.sort)) {
              normalizedSorts.push({
                field,
                direction: (options.sort as any)[field],
              });
            }
          }

          const self = this as any;
          const lastRef = {
            get table() {
              return self._lastTable;
            },
            set table(v: any) {
              self._lastTable = v;
            },
            get cols() {
              return self._lastCols;
            },
            set cols(v: any) {
              self._lastCols = v;
            },
          };
          for (const s of normalizedSorts) {
            let sortCol: any = helpers.getColumnHelper(
              table,
              s.field,
              this._tableColumnsCache,
              lastRef,
              false,
            );
            if (!sortCol) {
              const dataCol = helpers.getColumnHelper(
                table,
                "data",
                this._tableColumnsCache,
                lastRef,
                false,
              );
              if (dataCol) sortCol = this.getJsonField(s.field);
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
        const rawRows = await this.executeDynamicSql(db, sqlQuery);

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
        let builder: any = this.getDrizzleInstance(options)
          .select(this.getPhysicalSelection(table))
          .from(table)
          .where(where);
        builder = this.applyOrderBy(builder, table, options);
        if (options.limit) builder = builder.limit(options.limit);
        if (options.offset) builder = builder.offset(options.offset);
        results = await builder;
      }

      const data = utils.convertArrayDatesToISO(results as any, {
        ...this.convertDatesOptions,
        table: collection,
      }) as T[];
      return this.hooks.length > 0
        ? await this.runHooks("after", "find", collection, data, options)
        : data;
    }, "FIND_MANY_FAILED");
  }

  // --------------------------------------------------------------------------
  // CRUD: streamMany
  // --------------------------------------------------------------------------

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
        ...this.convertDatesOptions,
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

  // --------------------------------------------------------------------------
  // CRUD: find, findByIds (simple delegations)
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // CRUD: findById
  // --------------------------------------------------------------------------

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

      // Adapter-specific raw SQL fast-path (SQLite)
      if (this.useRawFindById) {
        const rawResult = await this.rawFindById<T>(table, collection, id, options);
        if (rawResult !== null) return rawResult;
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
        ? (utils.convertDatesToISO(results[0], {
            ...this.convertDatesOptions,
            table: collection,
          }) as T)
        : null;
    }, "FIND_BY_ID_FAILED");
  }

  // --------------------------------------------------------------------------
  // CRUD: exists
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // CRUD: count
  // --------------------------------------------------------------------------

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
        if (this.isMissingTableError(err)) {
          return 0;
        }
        throw err;
      }
    }, "COUNT_FAILED");
  }

  // --------------------------------------------------------------------------
  // CRUD: insert
  // --------------------------------------------------------------------------

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
        if (this.insertReturnsRows) {
          const result = await (query as any).returning();
          const finalData = utils.convertDatesToISO(result[0], {
            ...this.convertDatesOptions,
            table: collection,
          }) as T;
          return this.hooks.length > 0
            ? await this.runHooks("after", "insert", collection, finalData, options)
            : finalData;
        } else {
          await (query as any);
          const finalData = utils.convertDatesToISO(values, {
            ...this.convertDatesOptions,
            table: collection,
          }) as T;
          return this.hooks.length > 0
            ? await this.runHooks("after", "insert", collection, finalData, options)
            : finalData;
        }
      },
      "INSERT_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // CRUD: insertMany
  // --------------------------------------------------------------------------

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

        const query = this.getDrizzleInstance(options).insert(table).values(batchValues);
        if (this.insertReturnsRows) {
          const results = await (query as any).returning();
          return utils.convertArrayDatesToISO(results as any, {
            ...this.convertDatesOptions,
            table: collection,
          }) as T[];
        } else {
          await (query as any);
          return utils.convertArrayDatesToISO(batchValues as Record<string, any>[], {
            ...this.convertDatesOptions,
            table: collection,
          }) as T[];
        }
      },
      "INSERT_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // CRUD: update
  // --------------------------------------------------------------------------

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

        if (this.updateReturnsRows) {
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
            ...this.convertDatesOptions,
            table: collection,
          }) as unknown as T;
          return this.hooks.length > 0
            ? await this.runHooks("after", "update", collection, finalData, options)
            : finalData;
        } else {
          await query;
          const updated = await this.findOne<T>(collection, { _id: id } as any, options);
          if (!updated.success || !updated.data) {
            throw new Error(`Record ${id} not found in ${getTableName(table)}`);
          }
          return this.hooks.length > 0
            ? await this.runHooks("after", "update", collection, updated.data, options)
            : updated.data;
        }
      },
      "UPDATE_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // CRUD: updateMany
  // --------------------------------------------------------------------------

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);

        const values = this.prepareValues(table, data, null, new Date(), options);
        const whereCondition = this.mapQuery(table, query, options);

        // Atomic single UPDATE instead of N+1 sequential loop
        const result = await this.getDrizzleInstance(options)
          .update(table)
          .set(values)
          .where(whereCondition);

        return {
          modifiedCount: (result as any).changes ?? (result as any).affectedRows ?? 0,
        };
      },
      "UPDATE_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // CRUD: delete
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // CRUD: deleteMany
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // CRUD: restore
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // CRUD: upsert / upsertMany
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // CRUD: aggregate (stub — adapters may override)
  // --------------------------------------------------------------------------

  async aggregate<R>(
    _collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    // Return empty result silently — aggregate is a MongoDB-ism not needed by SQL adapters.
    // Concrete adapters (PostgreSQL) can override with real GROUP BY implementation.
    return { success: true, data: [] };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  public override destroy(): void {
    if (this.preparedStatements.size > 0) this.preparedStatements.clear();
  }
}
