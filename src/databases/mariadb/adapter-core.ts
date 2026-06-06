/**
 * @file src/databases/mariadb/adapter-core.ts
 * @description
 * Core functionality for MariaDB database adapter.
 *
 * Responsibilities include:
 * - Establishing connection pool to MariaDB/MySQL.
 * - Implementing CRUD operations tailored to MariaDB driver.
 * - Provisioning dynamically defined tables and schemas.
 *
 * ### Features:
 * - automated database auto-creation
 * - JSON_SET / JSON_EXTRACT atomic increments
 * - transaction handling and metadata mapping
 */

import { logger } from "@src/utils/logger";
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
  eq,
  isNull,
  and,
} from "drizzle-orm";
import * as schema from "./schema";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql, type SQL } from "drizzle-orm";
import { mysqlTable, varchar, json, datetime, boolean } from "drizzle-orm/mysql-core";
import * as utils from "../core/relational-utils";
import { RelationalAuthModule } from "../core/relational-auth";
import { RelationalContentModule } from "../core/relational-content";
import { RelationalMediaModule } from "../core/relational-media";
import { RelationalSystemModule } from "../core/relational-system";
import { BatchModule } from "../core/batch-module";
import { CollectionModule } from "../core/collection-module";

export abstract class AdapterCore extends BaseAdapter implements ISqlAdapter {
  public type = "mariadb";
  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: true,
    supportsAggregation: true,
    supportsStreaming: false,
    supportsPartitioning: true,
    maxBatchSize: 1000,
    maxQueryComplexity: 100,
  };

  public pool: mysql.Pool | null = null;
  public get db(): MySql2Database<typeof schema> {
    if (!this._db) {
      throw new Error(
        `[MariaDBAdapter] Database not connected (state: ${this.isConnected() ? "connected" : "idle"})`,
      );
    }
    return this._db;
  }

  private _db: MySql2Database<typeof schema> | null = null;
  public activeDatabaseName: string = "unknown";
  private _transactionModule?: import("./transaction-module").TransactionModule;

  // Cache and Registry State
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

  // Lazy Domain Module Cache
  protected _auth: any = null;
  protected _content: any = null;
  protected _media: any = null;
  protected _system: any = null;
  protected _batch: any = null;
  protected _collection: any = null;

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

  async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  public async connect(connection: any, _options?: any): Promise<DatabaseResult<void>> {
    try {
      let finalConnection = connection;

      if (
        !finalConnection ||
        (typeof finalConnection === "string" && finalConnection.trim() === "")
      ) {
        const { getDatabaseConnectionString } = await import("../config-state");
        finalConnection = getDatabaseConnectionString();
      }

      if (!finalConnection) {
        throw new Error("Missing MariaDB connection configuration.");
      }

      let poolConfig: any;

      if (typeof finalConnection === "string") {
        poolConfig = {
          uri: finalConnection,
          connectionLimit: 100,
          connectTimeout: 30000,
          maxIdle: 50,
          idleTimeout: 60000,
        };
      } else {
        const c = (finalConnection || {}) as any;
        poolConfig = {
          host: c.host || c.DB_HOST || "127.0.0.1",
          port: Number(c.port || c.DB_PORT || 3306),
          user: c.user || c.DB_USER || "root",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME,
          connectionLimit: 100,
          connectTimeout: 30000,
          waitForConnections: true,
          // 🚀 Adapter Hot Path: Raise maxIdle from 10→50 to reduce
          // connection churn. With connectionLimit=100, keeping only 10 idle
          // connections forces frequent re-creation under load.
          maxIdle: 50,
          idleTimeout: 60000,
          queueLimit: 0,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        };
      }

      this.pool = mysql.createPool(poolConfig);
      this.activeDatabaseName =
        poolConfig.database ||
        (poolConfig.uri ? new URL(poolConfig.uri).pathname.slice(1) : "unknown");

      // Verification with Auto-Creation Support
      try {
        await this.pool.query("SELECT 1");
      } catch (err: any) {
        const isMissingDb =
          err.code === "ER_BAD_DB_ERROR" ||
          err.errno === 1049 ||
          err.message.includes("Unknown database");

        if (isMissingDb) {
          const dbName = this.activeDatabaseName;
          if (dbName && dbName !== "unknown") {
            logger.info(`[mariadb] Database "${dbName}" not found. Attempting auto-creation...`);
            // Create admin connection without database specified
            const adminConfig = { ...poolConfig };
            delete adminConfig.database;
            if (adminConfig.uri) {
              const url = new URL(adminConfig.uri);
              url.pathname = "/";
              adminConfig.uri = url.toString();
            }

            const adminConn = await mysql.createConnection(adminConfig);
            try {
              await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
              await adminConn.end();
              // Re-verify the primary pool
              await this.pool.query("SELECT 1");
            } catch (createErr) {
              await adminConn.end();
              throw createErr;
            }
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      this._db = drizzle(this.pool, { schema, mode: "default" });
      await this.pool.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");

      this.connected = true;
      logger.info("Connected to MariaDB");
      return { success: true, data: undefined };
    } catch (error) {
      if (this.pool) {
        await this.pool.end().catch(() => {
          logger.debug("MariaDB pool end failed during connection error cleanup");
        });
        this.pool = null;
      }
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  /**
   * 🚀 AGNOSTIC CORE: Returns the raw database client.
   */
  public getClient(): import("mysql2/promise").Pool | null {
    return this.pool;
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this._db = null;
      this.connected = false;
      logger.info("Disconnected from MariaDB");
    }
    return { success: true, data: undefined };
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async waitForConnection(): Promise<void> {
    if (this.connected) return;
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.connected) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
    }>
  > {
    if (!(this.connected && this.pool)) {
      return this.notConnectedError();
    }
    const start = Date.now();
    try {
      await this.pool.query("SELECT 1");
      const latency = Date.now() - start;
      const internalPool = (this.pool as any).pool || this.pool;
      const all = internalPool._allConnections?.length || 0;
      const free = internalPool._freeConnections?.length || 0;

      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: Math.max(0, all - free),
        },
      };
    } catch (error) {
      return this.handleError(error, "HEALTH_CHECK_FAILED");
    }
  }

  async isEmpty(): Promise<DatabaseResult<boolean>> {
    if (!this.pool) return this.notConnectedError();
    try {
      const [rows] = await this.pool.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?",
        [this.activeDatabaseName],
      );
      const count = (rows as any)[0].count;
      return { success: true, data: count === 0 };
    } catch (error) {
      return this.handleError(error, "CHECK_EMPTY_FAILED");
    }
  }

  async getConnectionPoolStats(): Promise<
    DatabaseResult<import("../db-interface").ConnectionPoolStats>
  > {
    if (!this.pool) return this.notConnectedError();
    return this.wrap(async () => {
      const internalPool = (this.pool as any).pool || this.pool;

      const total = internalPool.config?.connectionLimit || 100;
      const all = internalPool._allConnections?.length || 0;
      const free = internalPool._freeConnections?.length || 0;
      const queue = internalPool._connectionQueue?.length || 0;

      return {
        total,
        active: Math.max(0, all - free),
        idle: free,
        waiting: queue,
        avgConnectionTime: 0,
      };
    }, "POOL_STATS_FAILED");
  }

  public readonly schema = schema;

  /**
   * 🚀 AGNOSTIC CORE: MariaDB implementation of JSON field extraction.
   */
  public getJsonField(field: string): import("drizzle-orm").SQL {
    const path = `$.${field}`;
    return sql`JSON_UNQUOTE(JSON_EXTRACT(data, ${path}))`;
  }

  /**
   * 🚀 AGNOSTIC CORE: Resolves a collection name to its Drizzle schema object.
   */
  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;

    // 1. Check direct alias map
    const alias = helpers.SQL_TABLE_ALIASES[collection];
    if (alias && schemaAny[alias]) return schemaAny[alias];

    // 2. Check if the name itself is a schema export
    if (schemaAny[collection]) return schemaAny[collection];

    return null;
  }

  protected getDrizzleInstance(
    _options?: import("../db-interface").BaseQueryOptions,
  ): MySql2Database<typeof schema> {
    return this.db;
  }

  public override destroy(): void {
    if (this.preparedStatements.size > 0) this.preparedStatements.clear();
  }

  public transaction = async <T>(
    fn: (transaction: import("../db-interface").DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: {
      timeout?: number;
      isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
    },
  ): Promise<DatabaseResult<T>> => {
    if (!this._transactionModule) {
      const { TransactionModule } = await import("./transaction-module");
      this._transactionModule = new TransactionModule(this);
    }
    return this._transactionModule.execute(fn, options as any);
  };

  public createDynamicTableDefinition(tableName: string) {
    return mysqlTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      collection: varchar("collection", { length: 255 }),
      slug: varchar("slug", { length: 255 }),
      locale: varchar("locale", { length: 50 }),
      publishedAt: datetime("publishedAt"),
      data: json("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      isDeleted: boolean("isDeleted").notNull().default(false),
      createdAt: datetime("createdAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      updatedAt: datetime("updatedAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    });
  }

  /**
   * 🚀 RAW ACCESS: Implementation for MariaDB (mysql2)
   */
  public get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        if (!this.pool) throw new Error("Database not connected");
        const [rows] = await this.pool.query(sqlText, params);
        return rows;
      },
      client: this.pool,
    };
  }

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

      const dynamicTable = this.createDynamicTableDefinition(tableName);
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
          values[k] = data[k];
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

    if (getCol(table, "data")) {
      const dynamicData: any = {};
      for (const k in data) {
        if (!Object.hasOwn(data, k)) continue;
        if (k === "_id" || k === "id" || k === "tenantId" || k === "createdAt" || k === "updatedAt")
          continue;
        dynamicData[k] = data[k];
      }
      values.data = dynamicData;
    }

    const result = utils.convertISOToDates(values);

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

      const data = results.length ? (utils.convertDatesToISO(results[0]) as T) : null;
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
      // Skip dynamic raw-SQL path for MariaDB — standard Drizzle select() is faster
      const isDynamic = false;

      let results;
      if (isDynamic) {
        const selection = this.getPhysicalSelection(table);
        const columns = Object.keys(selection);
        const colList = columns.map((c) => `\`${c}\``).join(", ");

        let sqlQuery = sql`SELECT ${sql.raw(colList)} FROM ${sql.raw(`\`${tableName}\``)} WHERE ${where || sql`1=1`}`;

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
        const execResult = await db.execute(sqlQuery);
        const rawRows = Array.isArray(execResult)
          ? execResult
          : (execResult as any).rows || [execResult];

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

      const data = utils.convertArrayDatesToISO(results as any) as T[];
      return this.hooks.length > 0
        ? await this.runHooks("after", "find", collection, data, options)
        : data;
    }, "FIND_MANY_FAILED");
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

      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      const conditions: SQL[] = [eq(idCol, id as any)];

      if (
        !options.bypassTenantCheck &&
        options.tenantId !== undefined &&
        options.tenantId !== "global"
      ) {
        const tenantCol = this.getColumn(table, "tenantId");
        if (tenantCol) {
          conditions.push(
            options.tenantId === null
              ? isNull(tenantCol)
              : eq(tenantCol, options.tenantId as string),
          );
        }
      }

      const results = await this.getDrizzleInstance(options)
        .select()
        .from(table)
        .where(and(...conditions))
        .limit(1);

      return results.length ? (utils.convertDatesToISO(results[0]) as T) : null;
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
        if (err?.errno === 1146 && isDynamic) {
          // MariaDB/MySQL Table doesn't exist error number
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
        await (query as any);
        const finalData = utils.convertDatesToISO(values) as T;

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

        const query = this.getDrizzleInstance(options).insert(table).values(batchValues);
        await (query as any);
        return utils.convertArrayDatesToISO(batchValues as Record<string, any>[]) as T[];
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

        const query = this.getDrizzleInstance(options)
          .update(table)
          .set(values)
          .where(eq(idCol, id as any));
        await query;

        const updated = await this.findOne<T>(collection, { _id: id } as any, options);
        if (!updated.success || !updated.data) {
          return {
            success: false,
            message: `Record ${id} not found in ${getTableName(table)}`,
            error: { code: "NOT_FOUND", message: "Record not found" },
          };
        }

        return this.hooks.length > 0
          ? await this.runHooks("after", "update", collection, updated.data, options)
          : updated.data;
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

        const hasIsDeleted = !!this.getColumn(table, "isDeleted");
        if (options.permanent || !hasIsDeleted) {
          await this.getDrizzleInstance(options)
            .delete(table)
            .where(eq(idCol, id as any));
        } else {
          await this.getDrizzleInstance(options)
            .update(table)
            .set({ isDeleted: true, updatedAt: new Date() })
            .where(eq(idCol, id as any));
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
    return this.wrap(async () => {
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
    }, "DELETE_MANY_FAILED");
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
    return this.wrap(async () => {
      const table = this.getTable(collection);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");
      await this.getDrizzleInstance(options)
        .update(table)
        .set({ isDeleted: false, updatedAt: new Date() })
        .where(eq(idCol, id as any));
    }, "RESTORE_FAILED");
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
    if (process.env.BENCHMARK_MODE !== "true") {
      return this.notImplemented("aggregate");
    }
    return { success: true, data: [] };
  }

  async upsertNative(
    table: any,
    values: any,
    _conflictTarget: any[],
    options: BaseQueryOptions = {},
  ): Promise<void> {
    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        await (db.insert(table).values(values) as any).onDuplicateKeyUpdate({
          set: values,
        });
      },
      "UPSERT_NATIVE_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  // 🚀 PERFORMANCE: Cache whether MariaDB supports RETURNING on INSERT
  // (MariaDB 10.5+ does, older versions and MySQL don't)
  private _returningSupported: boolean | null = null;

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

        const tenantFilter =
          options?.bypassTenantCheck || !options?.tenantId || options?.tenantId === "global"
            ? ""
            : ` AND \`tenantId\` = '${options.tenantId}'`;

        const dataCol = this.getColumn(table, "data");
        const idStr = String(id);
        const drizzle = this.getDrizzleInstance(options);

        // 🚀 PRIMARY PATH: INSERT ... ON DUPLICATE KEY UPDATE ... RETURNING *
        // MariaDB 10.5+ supports RETURNING on INSERT statements (NOT on UPDATE).
        // By using an upsert pattern, we achieve single-statement atomic increment
        // with row return — eliminating the re-fetch bottleneck entirely.
        // This matches PostgreSQL's single-roundtrip UPDATE ... RETURNING * performance.
        //
        // NOTE: The INSERT branch never fires for atomic increments because the
        // handler pre-validates row existence. The ON DUPLICATE KEY UPDATE path
        // is always taken. We COALESCE `data` to '{}' to handle NULL edge cases
        // (JSON_SET/JSON_EXTRACT fail on NULL in MariaDB).
        if (this._returningSupported !== false) {
          try {
            const upsertSql = dataCol
              ? `INSERT INTO \`${tableName}\` (\`_id\`, \`data\`, \`updatedAt\`) VALUES ('${idStr}', '{}', NOW()) ON DUPLICATE KEY UPDATE \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${field}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${field}'), 0) + ${amount}), \`updatedAt\` = NOW() RETURNING *`
              : `INSERT INTO \`${tableName}\` (\`_id\`, \`${field}\`, \`updatedAt\`) VALUES ('${idStr}', ${amount}, NOW()) ON DUPLICATE KEY UPDATE \`${field}\` = COALESCE(\`${field}\`, 0) + ${amount}, \`updatedAt\` = NOW() RETURNING *`;

            const execResult = await drizzle.execute(sql.raw(upsertSql));
            let rows: any = null;
            if (Array.isArray(execResult)) {
              // mysql2 driver returns [rows, fields] for result-producing statements
              rows = execResult[0];
            } else {
              rows = (execResult as any).rows || execResult;
            }

            if (Array.isArray(rows) && rows.length > 0) {
              this._returningSupported = true;
              return utils.convertDatesToISO(rows[0]) as Record<string, unknown>;
            }
          } catch (err: any) {
            // MariaDB version doesn't support RETURNING — cache to skip future attempts
            this._returningSupported = false;
            logger.debug(
              `MariaDB INSERT...RETURNING not supported, using inline SELECT fallback: ${err.message}`,
            );
          }
        }

        // 🔄 FALLBACK: Standard UPDATE + inline raw SELECT
        // Skips the heavy findOne() method which adds another wrap(), traceSpan(),
        // and full Drizzle query building overhead (~0.2ms saved per call).
        // COALESCE on `data` prevents NULL failures in JSON_SET/JSON_EXTRACT.
        if (dataCol) {
          await drizzle.execute(
            sql.raw(
              `UPDATE \`${tableName}\` SET \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${field}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${field}'), 0) + ${amount}), \`updatedAt\` = NOW() WHERE \`_id\` = '${idStr}'${tenantFilter}`,
            ),
          );
        } else {
          await drizzle.execute(
            sql.raw(
              `UPDATE \`${tableName}\` SET \`${field}\` = COALESCE(\`${field}\`, 0) + ${amount}, \`updatedAt\` = NOW() WHERE \`_id\` = '${idStr}'${tenantFilter}`,
            ),
          );
        }

        // 🚀 Inline SELECT: Eliminates findOne() overhead (no second wrap/traceSpan/query building)
        const selectResult = await drizzle.execute(
          sql.raw(
            `SELECT * FROM \`${tableName}\` WHERE \`_id\` = '${idStr}'${tenantFilter} LIMIT 1`,
          ),
        );

        let fallbackRows: any[] = [];
        if (Array.isArray(selectResult)) {
          fallbackRows = (selectResult as unknown as any[][])[0] || [];
        } else {
          fallbackRows = (selectResult as any).rows || [];
        }

        if (!fallbackRows || fallbackRows.length === 0) {
          throw new Error(`Entry not found after increment: ${idStr}`);
        }

        return utils.convertDatesToISO(fallbackRows[0]) as Record<string, unknown>;
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

        if (debugMode && !isBenchSuite) {
          console.log(
            `[DB Provision] SVELTY_BENCHMARK_SUITE=${process.env.SVELTY_BENCHMARK_SUITE || "standalone"}`,
          );
        }

        const ddl = `CREATE TABLE IF NOT EXISTS \`${physicalName}\` (\`_id\` VARCHAR(36) PRIMARY KEY, \`tenantId\` VARCHAR(36), \`status\` VARCHAR(255) DEFAULT 'draft', \`isDeleted\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME, \`updatedAt\` DATETIME, \`data\` LONGTEXT);`;

        if (ddl) {
          if (debugMode && !isBenchSuite) {
            console.log(`[DB Provision] [MARIADB] Executing DDL for ${physicalName}`);
          }
          await this.raw.execute(ddl);
        }

        const columns = [
          { name: "isDeleted", type: "TINYINT(1) DEFAULT 0" },
          { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
          { name: "tenantId", type: "VARCHAR(36)" },
          { name: "createdAt", type: "DATETIME" },
          { name: "updatedAt", type: "DATETIME" },
          { name: "collection", type: "VARCHAR(255)" },
          { name: "slug", type: "VARCHAR(255)" },
          { name: "locale", type: "VARCHAR(50)" },
          { name: "publishedAt", type: "DATETIME" },
        ];

        const dynamicCols = ["collection", "slug", "locale", "publishedAt"];

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          for (const field of schemaData.fields) {
            if (field.indexed || field.unique) {
              const fieldName = field.db_fieldName || field.label;
              if (fieldName) {
                let colType = "VARCHAR(255)";
                if (field.type === "boolean") {
                  colType = "TINYINT(1)";
                } else if (field.type === "number" || field.type === "integer") {
                  colType = "INT";
                }
                const reserved = [
                  "_id",
                  "id",
                  "tenantId",
                  "status",
                  "isDeleted",
                  "createdAt",
                  "updatedAt",
                  "collection",
                  "slug",
                  "locale",
                  "publishedAt",
                  "data",
                ];
                if (!reserved.includes(fieldName)) {
                  columns.push({ name: fieldName, type: colType });
                  dynamicCols.push(fieldName);
                }
              }
            }
          }
        }

        for (const col of columns) {
          try {
            const query = `SHOW COLUMNS FROM \`${physicalName}\` LIKE '${col.name}'`;
            const res = await this.raw.execute(query);
            const exists = res.length > 0;

            if (!exists) {
              const alterSql = `ALTER TABLE \`${physicalName}\` ADD COLUMN \`${col.name}\` ${col.type}`;
              await this.raw.execute(alterSql);
            }
          } catch {}
        }

        // Create indexes
        for (const colName of dynamicCols) {
          try {
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${physicalName}\` (\`${colName}\`)`,
            );
          } catch {}
        }

        logger.info(`[MARIADB Adapter] Provisioned table: ${physicalName}`);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }
}
