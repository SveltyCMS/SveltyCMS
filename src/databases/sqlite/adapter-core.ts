/**
 * @file src/databases/sqlite/adapter-core.ts
 * @description Core functionality for SQLite adapter, optimized for performance and Windows resilience.
 */

import { logger } from "@utils/logger";
import { SqlAdapterCore } from "../core/sql-adapter-core";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseCapabilities,
  DatabaseResult,
  DatabaseId,
  FindOptions,
  EntityCreate,
  ISqlAdapter,
} from "../db-interface";
import * as helpers from "../core/drizzle-sql-helpers";
import { generateUUID } from "@utils/native-utils";
import { getTableName } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";
import { sql, type SQL } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";
import { SQLiteQueryBuilder } from "./sq-lite-query-builder";
import { TransactionModule } from "./transaction-module";

// Pre-register system table schemas for optimal row conversion
for (const [tableName, columns] of Object.entries(helpers.SYSTEM_LITERAL_COLUMNS)) {
  registerTableSchema(tableName, columns as string[]);
}

// --- Types ---
export type SQLiteConfig = { connectionString?: string; readonly?: boolean };
export type SQLiteClient = any;
export type SQLiteDB = any;

// Isolation for multi-threaded testing
const testWorkerContext = new AsyncLocalStorage<string>();

/**
 * 🚀 PERFORMANCE: Lightweight Re-entrant Mutex for serializing database writes.
 */
class Mutex {
  private queue: Promise<any> = Promise.resolve();
  private storage = new AsyncLocalStorage<boolean>();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
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

async function getRequire() {
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url);
  } catch {
    return null;
  }
}

export abstract class SQLiteAdapterCore extends SqlAdapterCore implements ISqlAdapter {
  public type = "sqlite";
  public static readonly writeMutex = new Mutex();
  public readonly schema = schema;

  // SQLite-specific: cache whether RETURNING works for INSERT ... VALUES
  private _insertManyReturningSupported: boolean | null = null;
  /** Tables that have been fully provisioned with physical columns via createModel */
  protected _provisionedTables = new Set<string>();

  // --------------------------------------------------------------------------
  // Abstract hook implementations
  // --------------------------------------------------------------------------

  protected get insertReturnsRows(): boolean {
    return true;
  }
  protected get updateReturnsRows(): boolean {
    return true;
  }
  protected get shouldJsonSerializeInPrepare(): boolean {
    return true;
  }
  protected get useDynamicSqlInFindMany(): boolean {
    return true;
  }
  protected get useRawFindById(): boolean {
    return true;
  }

  protected isMissingTableError(err: any): boolean {
    return err?.code === "SQLITE_ERROR" && err?.message?.includes("no such table");
  }

  protected async executeDynamicSql(db: any, sqlQuery: SQL): Promise<any[]> {
    return (db as any).values(sqlQuery);
  }

  protected async rawFindById<T>(
    table: any,
    collection: string,
    id: DatabaseId,
    options: FindOptions<T>,
  ): Promise<T | null> {
    try {
      const tableName = getTableName(table);
      const idStr = String(id).replace(/'/g, "''");
      const tenantFilter = utils.buildRawTenantFilter(options, "sqlite");
      const rawSql = `SELECT * FROM "${tableName}" WHERE "_id" = '${idStr}'${tenantFilter} LIMIT 1`;
      const rawRows = this.prepareAndExecute(rawSql, "all");
      if (rawRows && rawRows.length > 0) {
        return utils.convertDatesToISO(rawRows[0], { table: collection }) as T;
      }
      return null;
    } catch (rawErr: any) {
      if (process.env.BENCHMARK !== "true") {
        logger.debug("[SQLite raw findById prototype] falling back to Drizzle:", rawErr?.message);
      }
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // getTable — SQLite-specific with columnsToAdd from content_nodes
  // --------------------------------------------------------------------------

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

      const columnsToAdd = new Map<string, string>();
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
              if (typeof def === "string") def = JSON.parse(def);
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
        /* Safe fallback */
      }

      const dynamicTable = this.createDynamicTableDefinition(tableName, columnsToAdd);
      this.tableRegistry.set(collection, dynamicTable);
      return dynamicTable;
    } finally {
      this._resolving.delete(collection);
    }
  }

  // --------------------------------------------------------------------------
  // getAliasedTable — SQLite-specific with resolveSystemTableName
  // --------------------------------------------------------------------------

  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;
    const physicalName = helpers.resolveSystemTableName(collection);
    if (schemaAny[physicalName]) return schemaAny[physicalName];
    const camelName = physicalName.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
    if (schemaAny[camelName]) return schemaAny[camelName];
    if (physicalName.includes("workflow_definitions") && schemaAny.workflowDefinitions)
      return schemaAny.workflowDefinitions;
    if (physicalName.includes("workflow_instances") && schemaAny.workflowInstances)
      return schemaAny.workflowInstances;
    if (schemaAny[collection]) return schemaAny[collection];
    return null;
  }

  // --------------------------------------------------------------------------
  // getJsonField
  // --------------------------------------------------------------------------

  public getJsonField(field: string): SQL {
    return sql`json_extract(data, '$."' || ${field} || '"')`;
  }

  // --------------------------------------------------------------------------
  // createDynamicTableDefinition
  // --------------------------------------------------------------------------

  public createDynamicTableDefinition(name: string, columnsToAdd?: Map<string, string>) {
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
        )
          continue;
        if (colType === "integer") {
          columns[colName] =
            colName === "publishedAt"
              ? integer(colName, { mode: "timestamp_ms" })
              : integer(colName);
        } else {
          columns[colName] = text(colName);
        }
      }
    }

    registerTableSchema(name, Object.keys(columns));

    return sqliteTable(name, columns, (t) => {
      const idxs: Record<string, any> = {
        tenantIdx: index(`${name}_tenant_idx`).on(t.tenantId),
        statusIdx: index(`${name}_status_idx`).on(t.status),
        updatedIdx: index(`${name}_updated_idx`).on(t.updatedAt),
      };
      if (columnsToAdd) {
        for (const colName of columnsToAdd.keys()) {
          if (t[colName]) idxs[`${colName}Idx`] = index(`${name}_${colName}_idx`).on(t[colName]);
        }
      }
      return idxs;
    });
  }

  // --------------------------------------------------------------------------
  // Override insertMany — SQLite RETURNING fallback
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

  // --------------------------------------------------------------------------
  // SQLite State & Connection
  // --------------------------------------------------------------------------

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
    if (!this._sqlite)
      throw new Error(`[SQLite] Database client not initialized (state: ${this.state})`);
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(worker);
      if (conn) return conn.sqlite;
    }
    return this._sqlite;
  }

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
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.warn(
          `[SQLite] Test worker ${worker} requested DB but connection not ready. Falling back.`,
        );
      }
      return this._db!;
    }
    return this._db!;
  }

  // --------------------------------------------------------------------------
  // Wrap override — SQLite write mutex for single-writer safety
  // --------------------------------------------------------------------------

  public override async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
    options?: any,
  ): Promise<DatabaseResult<T>> {
    if (options?.isWrite && !options?.transaction) {
      return SQLiteAdapterCore.writeMutex.runExclusive(() =>
        super.wrap(fn, code, message, options),
      );
    }
    return super.wrap(fn, code, message, options);
  }

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

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
      this.applyPragmas(sqlite);
      this._statementCache.clear();

      this.state = "connected";
      this.metrics.queryCount = 0;
      this.metrics.errorCount = 0;

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
        if (process.env.BENCHMARK_DEBUG === "true") logger.info("[SQLite] Disconnected");
        this.connected = false;
      }
      return { success: true, data: undefined };
    } catch (error) {
      return this.handleError(error, "DISCONNECT_FAILED");
    }
  }

  public isConnected(): boolean {
    return this.connected && this._sqlite !== null;
  }

  public async waitForConnection(): Promise<void> {
    if (this.isConnected()) return;
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

  public transaction = async <T>(
    fn: (transaction: import("../db-interface").DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: { timeout?: number; isolationLevel?: string },
  ): Promise<DatabaseResult<T>> => {
    const module = new TransactionModule(this as any);
    return module.execute(fn, options as any);
  };

  // --------------------------------------------------------------------------
  // Provisioning
  // --------------------------------------------------------------------------

  protected _provisioned = false;
  protected _provisionPromise: Promise<void> | null = null;

  public async provision() {
    if (this._provisioned) return;
    if (this._provisionPromise) return this._provisionPromise;

    this._provisionPromise = (async () => {
      try {
        const { runMigrations } = await import("./migrations");
        await runMigrations(this._sqlite);
        await this._warmTableRegistry();
        this._provisioned = true;
      } catch (err: any) {
        logger.error(`[SQLite] Provisioning failed: ${err.message}`);
        this._provisionPromise = null;
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
          this.getTable(collectionName);
          this._provisionedTables.add(collectionName);
          warmed++;
        } catch {
          /* skip */
        }
      }
      if (warmed > 0) {
        logger.info(
          `[SQLite] Table registry pre-warmed: ${warmed} collections ready (zero-DB request path)`,
        );
      }
    } catch {
      /* non-critical */
    }
  }

  // --------------------------------------------------------------------------
  // Worker Test Connection
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Health & Diagnostics
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // prepareAndExecute — internal SQLite execution helper
  // --------------------------------------------------------------------------

  public prepareAndExecute(
    sqlText: string,
    method: "all" | "get" | "run" | "values" = "all",
    ...params: any[]
  ): any {
    const client = this.sqlite;
    let stmt = this._statementCache.get(sqlText);
    if (!stmt) {
      stmt = client.prepare(sqlText);
      if (this._statementCache.size < 1000) this._statementCache.set(sqlText, stmt);
    }
    this.metrics.queryCount++;
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

  // --------------------------------------------------------------------------
  // Raw Access
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Capabilities
  // --------------------------------------------------------------------------

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
      this.applyPragmas(this._sqlite);
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

  // --------------------------------------------------------------------------
  // Upsert Native
  // --------------------------------------------------------------------------

  async upsertNative(
    table: any,
    values: any,
    conflictTarget: any[],
    options: BaseQueryOptions = {},
  ): Promise<void> {
    // Resolve string collection name to Drizzle table object
    const resolvedTable = typeof table === "string" ? this.getTable(table) : table;
    if (!resolvedTable) throw new Error(`Table not found: ${table}`);
    const tableName = getTableName(resolvedTable);
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
        // Strip undefined values — Drizzle SQLite insert crashes on undefined column values
        const cleanValues = Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined),
        );
        await (db.insert(resolvedTable).values(cleanValues) as any).onConflictDoUpdate({
          target: rawTarget,
          set: cleanValues,
        });
      },
      "UPSERT_NATIVE_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // Atomic Increment
  // --------------------------------------------------------------------------

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

        const updateSql = dataCol
          ? `UPDATE "${tableName}" SET "data" = json_set(coalesce("data", '{}'), '$.${field}', coalesce(json_extract(coalesce("data", '{}'), '$.${field}'), 0) + ${amount}), "updatedAt" = ${now.getTime()} WHERE "${idCol.name}" = '${idStr}'${tenantFilter}`
          : `UPDATE "${tableName}" SET "${field}" = coalesce("${field}", 0) + ${amount}, "updatedAt" = ${now.getTime()} WHERE "${idCol.name}" = '${idStr}'${tenantFilter}`;

        this.prepareAndExecute(updateSql, "run");

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

  // --------------------------------------------------------------------------
  // Create Model (Table Provisioning)
  // --------------------------------------------------------------------------

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
        if (debugMode && !isBenchSuite)
          console.log(`[DB Provision] [SQLITE] Executing DDL for ${physicalName}`);
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
                if (field.type === "number" || field.type === "integer" || field.type === "boolean")
                  colType = "INTEGER";
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
        registerTableSchema(normalizedName, [
          "_id",
          "data",
          ...allColumnsToEnsure.map((c) => c.name),
        ]);

        for (const col of allColumnsToEnsure) {
          try {
            const tableInfo = await this.raw.execute(`PRAGMA table_info("${physicalName}")`);
            const exists = tableInfo.some((c: any) => c.name === col.name);
            if (!exists)
              await this.raw.execute(
                `ALTER TABLE "${physicalName}" ADD COLUMN "${col.name}" ${col.type}`,
              );
          } catch {
            /* safe */
          }
        }

        for (const col of dynamicCols) {
          try {
            const indexName = `${physicalName}_${col.name}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${col.name}")`,
            );
          } catch {
            /* safe */
          }
        }

        logger.info(`[SQLITE Adapter] Provisioned table: ${physicalName}`);
        this._provisionedTables.add(normalizedName);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // Driver Initialization
  // --------------------------------------------------------------------------

  private async createDriver(dbPath: string) {
    const versions = (process as any)?.versions || {};
    const isBun = typeof Bun !== "undefined";
    const nodeVersion = versions.node;

    let normalizedPath = dbPath.replace(/\\/g, "/");
    if (process.platform === "win32") {
      const root = process.cwd().replace(/\\/g, "/").toLowerCase();
      const normLower = normalizedPath.toLowerCase();
      if (normLower.startsWith(root)) {
        normalizedPath = normalizedPath.substring(root.length).replace(/^\//, "");
      } else if (normalizedPath.includes(":/") && !normalizedPath.startsWith("file:")) {
        normalizedPath = `file:///${normalizedPath}`;
      }
    }

    logger.info(`[SQLite] Opening database at: ${normalizedPath} (Original: ${dbPath})`);

    const readonly = (this.config as SQLiteConfig)?.readonly || dbPath.includes("mode=ro") || false;
    const options = readonly ? { readonly } : {};

    if (isBun) {
      try {
        const { Database } = await import("bun:sqlite");
        let sqlite: any;
        let lastErr: any;
        for (let i = 0; i < 10; i++) {
          try {
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
        if (!(globalThis as any).__SQLITE_DRIVER_LOGGED__) {
          logger.info(`[SQLite] 🚀 SUCCESS: Using high-performance 'bun:sqlite' driver.`);
          (globalThis as any).__SQLITE_DRIVER_LOGGED__ = true;
        }
        return { sqlite, db };
      } catch (e: any) {
        logger.warn(`[SQLite] Bun driver failed: ${e.message}. Falling back to node:sqlite...`);
        if (process.platform === "win32") {
          if (process.env.FORCE_SQLITE_FALLBACK !== "true") throw e;
        }
      }
    }

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
                  if (this._statementCache.size < 1000) this._statementCache.set(sqlText, stmt);
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
              if (isWrite) return SQLiteAdapterCore.writeMutex.runExclusive(execute);
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
    const safeExec = (cmd: string) => {
      try {
        client.exec(cmd);
      } catch {
        /* safe */
      }
    };
    safeExec("PRAGMA journal_mode=WAL");
    safeExec("PRAGMA synchronous=NORMAL");
    safeExec("PRAGMA foreign_keys=ON");
    safeExec("PRAGMA page_size=8192");
    safeExec("PRAGMA busy_timeout=30000");
    safeExec("PRAGMA temp_store=MEMORY");
    safeExec("PRAGMA mmap_size=536870912");
    safeExec("PRAGMA cache_size=-128000");
    safeExec("PRAGMA wal_autocheckpoint=1000");
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

    if (dbPath.includes("://")) {
      throw new Error(
        `Invalid SQLite path: '${dbPath}' looks like a URI. Check your DB configuration.`,
      );
    }

    if (dbPath !== ":memory:" && !path.isAbsolute(dbPath) && !dbPath.startsWith("file:")) {
      dbPath = path.resolve(process.cwd(), dbPath);
    }

    const dir = path.dirname(dbPath.replace("file:///", ""));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return dbPath;
  }
}
