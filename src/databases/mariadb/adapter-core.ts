/**
 * @file src/databases/mariadb/adapter-core.ts
 * @description
 * Core functionality for MariaDB database adapter.
 *
 * Responsibilities include:
 * - Establishing connection pool to MariaDB/MySQL.
 * - Implementing MariaDB-specific CRUD hooks and table provisioning.
 *
 * ### Features:
 * - automated database auto-creation
 * - JSON_SET / JSON_EXTRACT atomic increments
 * - transaction handling and metadata mapping
 */

import { logger } from "@src/utils/logger";
import { SqlAdapterCore } from "../core/sql-adapter-core";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseCapabilities,
  DatabaseResult,
  DatabaseId,
  EntityCreate,
  EntityUpdate,
  FindOptions,
  QueryFilter,
} from "../db-interface";
import * as helpers from "../core/drizzle-sql-helpers";
import { getTableName } from "drizzle-orm";
import * as schema from "./schema";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql, type SQL } from "drizzle-orm";
import { mysqlTable, varchar, json, datetime, boolean } from "drizzle-orm/mysql-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";

export abstract class AdapterCore extends SqlAdapterCore {
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

  // --------------------------------------------------------------------------
  // Abstract hook implementations
  // --------------------------------------------------------------------------

  /**
   * Drizzle mysql2 dialect does not implement INSERT/UPDATE … RETURNING
   * (MySQL protocol gap). Post-write re-read uses optimized findById instead.
   * useDynamicSqlInFindMany matches Postgres/SQLite heavy-table path.
   */
  protected get useDynamicSqlInFindMany(): boolean {
    return true;
  }

  /**
   * Raw prepared-SQL findById: mysql2's pool.execute uses server-side prepared
   * statements; a stable parameterized SELECT skips Drizzle's per-call AST
   * building + escaping on the hottest read path.
   */
  protected get useRawFindById(): boolean {
    return true;
  }

  protected async rawFindById<T extends BaseEntity>(
    table: any,
    collection: string,
    id: DatabaseId,
    options: FindOptions<T>,
  ): Promise<T | null> {
    try {
      const tableName = getTableName(table);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");
      const idColName = idCol.name || "_id";
      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(options, "mysql");
      // Projection-aware: skip the JSON data blob when all requested fields
      // are physical columns (avoids LONGTEXT transfer + JSON.parse on reads).
      const fields = options?.fields;
      const wantsData =
        !Array.isArray(fields) ||
        fields.length === 0 ||
        fields.some((f) => {
          if (f === "data") return true;
          if (
            f === "_id" ||
            f === "id" ||
            f === "tenantId" ||
            f === "status" ||
            f === "createdAt" ||
            f === "updatedAt" ||
            f === "isDeleted"
          )
            return false;
          return !this.getColumn(table, String(f));
        });
      const selectCols = wantsData
        ? "`_id`, `data`, `status`, `tenantId`, `createdAt`, `updatedAt`, `isDeleted`"
        : "`_id`, `status`, `tenantId`, `createdAt`, `updatedAt`, `isDeleted`";
      const rawSql = `SELECT ${selectCols} FROM \`${tableName}\` WHERE \`${idColName}\` = ?${tenantSql} LIMIT 1`;
      const rows = (await this.raw.execute(rawSql, [String(id), ...tenantParams])) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        if (!wantsData) return row as T;
        return utils.convertDatesToISO(row, {
          ...this.convertDatesOptions,
          table: collection,
        }) as T;
      }
      return null;
    } catch (rawErr: any) {
      if (process.env.BENCHMARK !== "true") {
        logger.debug("[MariaDB raw findById] falling back to Drizzle:", rawErr?.message);
      }
      return null;
    }
  }

  /** MariaDB default sql_mode has no ANSI_QUOTES — identifiers need backticks. */
  protected override quoteIdentifier(name: string): string {
    return `\`${name.replace(/`/g, "``")}\``;
  }

  protected get convertDatesOptions(): Record<string, any> {
    return { mariaDoubleParseJson: true, inPlace: true };
  }

  protected isMissingTableError(err: any): boolean {
    // drizzle-orm/mysql2 wraps the mysql2 error — the real errno/code live on
    // `.cause`. Checking only the top level made auto-provision (insert) and
    // empty-result (findMany/count) fallbacks silently not fire on MariaDB.
    const e = err?.cause ?? err;
    return e?.errno === 1146 || e?.code === "ER_NO_SUCH_TABLE";
  }

  public readonly schema = schema;

  public getJsonField(field: string): SQL {
    const path = `$.${field}`;
    return sql`JSON_UNQUOTE(JSON_EXTRACT(data, ${path}))`;
  }

  protected coerceJsonValue(val: unknown): unknown {
    // JSON_UNQUOTE(JSON_EXTRACT(...)) renders JSON booleans as the text
    // "true"/"false"; binding a JS boolean (1/0) never matches those rows.
    return typeof val === "boolean" ? String(val) : val;
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

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

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
          connectionLimit: Number(process.env.DATABASE_MAX_CONNECTIONS) || 20,
          connectTimeout: 30000,
          maxIdle: 10,
          idleTimeout: 60000,
          charset: "utf8mb4",
        };
      } else {
        const c = (finalConnection || {}) as any;
        poolConfig = {
          host: c.host || c.DB_HOST || "127.0.0.1",
          port: Number(c.port || c.DB_PORT || 3306),
          user: c.user || c.DB_USER || "root",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME,
          connectionLimit: Number(c.max || process.env.DATABASE_MAX_CONNECTIONS || 20),
          connectTimeout: 30000,
          waitForConnections: true,
          maxIdle: 10,
          idleTimeout: 60000,
          queueLimit: 0,
          enableKeepAlive: true,
          charset: "utf8mb4",
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

  public getClient(): import("mysql2/promise").Pool | null {
    return this.pool;
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    if (this.pool) {
      (this as any).__intentionalDisconnect__ = true;
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
      const [rows] = await this.pool.execute(
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

  // --------------------------------------------------------------------------
  // Schema & Table Management
  // --------------------------------------------------------------------------

  public createDynamicTableDefinition(tableName: string) {
    registerTableSchema(tableName, [
      "_id",
      "tenantId",
      "collection",
      "slug",
      "locale",
      "publishedAt",
      "data",
      "status",
      "isDeleted",
      "createdAt",
      "updatedAt",
    ]);

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

  // --------------------------------------------------------------------------
  // Raw Access
  // --------------------------------------------------------------------------

  public get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        if (!this.pool) throw new Error("Database not connected");
        const [rows] = await this.pool.execute(sqlText, params);
        return rows;
      },
      client: this.pool,
    };
  }

  // --------------------------------------------------------------------------
  // Transaction
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Upsert Native
  // --------------------------------------------------------------------------

  async upsertNative(
    table: any,
    values: any,
    _conflictTarget: any[],
    options: BaseQueryOptions = {},
  ): Promise<void> {
    // Resolve string collection name to Drizzle table object
    const resolvedTable = typeof table === "string" ? this.getTable(table) : table;
    if (!resolvedTable) throw new Error(`Table not found: ${table}`);
    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        // Strip undefined values — Drizzle crashes on undefined column values
        const cleanValues = Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined),
        );
        await (db.insert(resolvedTable).values(cleanValues) as any).onDuplicateKeyUpdate({
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

  private _returningSupported: boolean | null = null;

  /**
   * Single-round-trip upsert when the conflict is on _id (or a unique column):
   * INSERT ... ON DUPLICATE KEY UPDATE ... RETURNING. Base upsert() would do
   * findOne + update/insert (2 RT). Falls back when RETURNING is unsupported.
   */
  override async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    if (this._returningSupported === false) {
      return super.upsert(collection, query, data, options);
    }
    try {
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");
      const idColName = idCol.name || "_id";

      // Only when the conflict filter is a pure _id lookup (common sync/import path)
      const lookupId = this.extractIdFromQuery(query);
      if (!lookupId) return super.upsert(collection, query, data, options);

      const tableName = getTableName(table);
      const now = new Date();
      const values = this.prepareValues(
        table,
        { ...data, [idColName]: lookupId },
        lookupId,
        now,
        options,
      );
      // Ensure PK present in the insert column list
      if (values[idColName] === undefined) values[idColName] = String(lookupId);

      const cols = Object.keys(values);
      if (cols.length === 0) return super.upsert(collection, query, data, options);
      const colList = cols
        .map((c) => utils.assertSafeSqlIdentifier(c, "column"))
        .map((c) => `\`${c}\``);
      const placeholders = cols.map(() => "?").join(", ");
      const updatePairs = cols
        .filter((c) => c !== idColName)
        .map(
          (c) =>
            `\`${utils.assertSafeSqlIdentifier(c, "column")}\` = VALUES(\`${utils.assertSafeSqlIdentifier(c, "column")}\`)`,
        );
      const params = cols.map((c) => {
        const v = values[c];
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      });

      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(options, "mysql");
      // Note: buildRawTenantClause may add a tenantId equality to WHERE; for upsert
      // we instead merge tenantId into the row values (done by prepareValues) and
      // rely on the PK conflict. Tenant WHERE on insert is not applicable.
      void tenantSql;
      void tenantParams;

      const sqlText =
        updatePairs.length > 0
          ? `INSERT INTO \`${tableName}\` (${colList.join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updatePairs.join(", ")} RETURNING *`
          : `INSERT INTO \`${tableName}\` (${colList.join(", ")}) VALUES (${placeholders}) RETURNING *`;

      const rows = (await this.raw.execute(sqlText, params)) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        this._returningSupported = true;
        return {
          success: true,
          data: utils.convertDatesToISO(rows[0], {
            mariaDoubleParseJson: true,
            table: collection,
          }) as unknown as T,
        };
      }
      return super.upsert(collection, query, data, options);
    } catch (err: any) {
      this._returningSupported = false;
      logger.debug(
        `MariaDB upsert RETURNING not supported, using base upsert path: ${err.message}`,
      );
      return super.upsert(collection, query, data, options);
    }
  }

  /** Extract a plain _id value from a query filter, or null if not a pure _id lookup. */
  private extractIdFromQuery(query: QueryFilter<any>): string | null {
    if (!query || typeof query !== "object") return null;
    const keys = Object.keys(query);
    if (keys.length > 2) return null;
    const idVal = (query as any)._id ?? (query as any).id;
    if (idVal === undefined || idVal === null) return null;
    if (typeof idVal === "object" && !(idVal instanceof Date) && !Array.isArray(idVal)) return null;
    const remaining = keys.filter((k) => k !== "_id" && k !== "id");
    if (remaining.length === 0) return String(idVal);
    if (remaining.length === 1 && remaining[0] === "tenantId") return String(idVal);
    return null;
  }

  /**
   * MariaDB ≥10.5 supports INSERT … RETURNING natively, but Drizzle's mysql2
   * dialect does not expose .returning(). The base update() would otherwise do
   * UPDATE + separate findById (2 round trips). This raw path keeps one.
   * Falls back to the base implementation when RETURNING is unsupported.
   */
  protected async rawInsertReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    values: Record<string, any>,
    _options: BaseQueryOptions,
  ): Promise<T | null> {
    if (this._returningSupported === false) return null;
    try {
      const tableName = getTableName(table);
      const cols = Object.keys(values);
      if (cols.length === 0) return null;
      const colList = cols
        .map((c) => utils.assertSafeSqlIdentifier(c, "column"))
        .map((c) => `\`${c}\``);
      const placeholders = cols.map(() => "?").join(", ");
      const params = cols.map((c) => {
        const v = values[c];
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      });
      const sqlText = `INSERT INTO \`${tableName}\` (${colList.join(", ")}) VALUES (${placeholders}) RETURNING *`;
      const rows = (await this.raw.execute(sqlText, params)) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        this._returningSupported = true;
        return utils.convertDatesToISO(rows[0], {
          mariaDoubleParseJson: true,
          table: collection,
        }) as unknown as T;
      }
      return null;
    } catch {
      this._returningSupported = false;
      return null;
    }
  }

  /**
   * MariaDB ≥10.5 supports UPDATE ... RETURNING natively, but Drizzle's mysql2
   * dialect does not expose .returning(). The base update() would otherwise do
   * UPDATE + separate findById (2 round trips). This raw path keeps one.
   * Falls back to the base implementation when RETURNING is unsupported.
   */
  override async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    if (this._returningSupported === false) {
      return super.update(collection, id, data, options);
    }
    try {
      const d =
        this.hooks.length > 0
          ? await this.runHooks("before", "update", collection, data, options)
          : data;
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");
      const idColName = idCol.name || "_id";
      const tableName = getTableName(table);

      const now = new Date();
      const values = this.prepareValues(table, d, id, now, options);
      // Drop the PK from SET (never write _id back)
      delete values[idColName];
      delete values["id"];

      const setPairs: string[] = [];
      const params: any[] = [];
      const columns = Object.keys(values);
      for (const col of columns) {
        const safeCol = utils.assertSafeSqlIdentifier(col, "column");
        setPairs.push(`\`${safeCol}\` = ?`);
        const val = values[col];
        params.push(
          val !== null && typeof val === "object" && !(val instanceof Date)
            ? JSON.stringify(val)
            : val,
        );
      }
      if (setPairs.length === 0) {
        return super.update(collection, id, data, options);
      }

      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(options, "mysql");
      const sqlText = `UPDATE \`${tableName}\` SET ${setPairs.join(", ")} WHERE \`${idColName}\` = ?${tenantSql} RETURNING *`;
      const rows = (await this.raw.execute(sqlText, [
        ...params,
        String(id),
        ...tenantParams,
      ])) as any[];

      if (Array.isArray(rows) && rows.length > 0) {
        this._returningSupported = true;
        const converted = utils.convertDatesToISO(rows[0], {
          mariaDoubleParseJson: true,
          table: collection,
        }) as unknown as T;
        const finalData =
          this.hooks.length > 0
            ? await this.runHooks("after", "update", collection, converted, options)
            : converted;
        // Match base wrap semantics (pooled envelope + write metrics)
        return this.wrap(async () => finalData, "UPDATE_FAILED", undefined, {
          ...options,
          isWrite: true,
        });
      }
    } catch (err: any) {
      this._returningSupported = false;
      logger.debug(
        `MariaDB UPDATE...RETURNING not supported, using base update path: ${err.message}`,
      );
    }
    return super.update(collection, id, data, options);
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

        // Identifiers may be embedded; values (_id, amount, tenantId) are always bound via raw.execute.
        const safeField = utils.assertSafeSqlIdentifier(field);
        const amountNum = utils.assertFiniteAmount(amount);
        const idStr = String(id);
        const dataCol = this.getColumn(table, "data");
        const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
          options,
          "mysql",
        );
        const idColName = idCol.name || "_id";

        if (this._returningSupported !== false) {
          try {
            // Prefer single-round-trip upsert with bound params when RETURNING is available.
            const upsertSql = dataCol
              ? `INSERT INTO \`${tableName}\` (\`_id\`, \`data\`, \`updatedAt\`) VALUES (?, '{}', NOW()) ON DUPLICATE KEY UPDATE \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${safeField}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${safeField}'), 0) + ?), \`updatedAt\` = NOW() RETURNING *`
              : `INSERT INTO \`${tableName}\` (\`_id\`, \`${safeField}\`, \`updatedAt\`) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() RETURNING *`;

            const upsertParams = dataCol ? [idStr, amountNum] : [idStr, amountNum, amountNum];

            const rows = (await this.raw.execute(upsertSql, upsertParams)) as any[];
            if (Array.isArray(rows) && rows.length > 0) {
              this._returningSupported = true;
              return utils.convertDatesToISO(rows[0], {
                mariaDoubleParseJson: true,
                table: collection,
              }) as Record<string, unknown>;
            }
          } catch (err: any) {
            this._returningSupported = false;
            logger.debug(
              `MariaDB INSERT...RETURNING not supported, using inline SELECT fallback: ${err.message}`,
            );
          }
        }

        // Fallback: parameterized UPDATE + SELECT (works on all MariaDB/MySQL versions)
        if (dataCol) {
          await this.raw.execute(
            `UPDATE \`${tableName}\` SET \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${safeField}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${safeField}'), 0) + ?), \`updatedAt\` = NOW() WHERE \`${idColName}\` = ?${tenantSql}`,
            [amountNum, idStr, ...tenantParams],
          );
        } else {
          await this.raw.execute(
            `UPDATE \`${tableName}\` SET \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() WHERE \`${idColName}\` = ?${tenantSql}`,
            [amountNum, idStr, ...tenantParams],
          );
        }

        const fallbackRows = (await this.raw.execute(
          `SELECT * FROM \`${tableName}\` WHERE \`${idColName}\` = ?${tenantSql} LIMIT 1`,
          [idStr, ...tenantParams],
        )) as any[];

        if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) {
          throw new Error(`Entry not found after increment: ${idStr}`);
        }

        return utils.convertDatesToISO(fallbackRows[0], {
          mariaDoubleParseJson: true,
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

        if (debugMode && !isBenchSuite) {
          logger.debug(
            `[DB Provision] SVELTY_BENCHMARK_SUITE=${process.env.SVELTY_BENCHMARK_SUITE || "standalone"}`,
          );
        }

        const ddl = `CREATE TABLE IF NOT EXISTS \`${physicalName}\` (\`_id\` VARCHAR(36) PRIMARY KEY, \`tenantId\` VARCHAR(36), \`status\` VARCHAR(255) DEFAULT 'draft', \`isDeleted\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME, \`updatedAt\` DATETIME, \`data\` LONGTEXT);`;

        if (ddl) {
          if (debugMode && !isBenchSuite) {
            logger.debug(`[DB Provision] [MARIADB] Executing DDL for ${physicalName}`);
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

        registerTableSchema(normalizedName, ["_id", "data", ...columns.map((c: any) => c.name)]);

        for (const col of columns) {
          try {
            const query = `SHOW COLUMNS FROM \`${physicalName}\` LIKE '${col.name}'`;
            const res = await this.raw.execute(query);
            const exists = res.length > 0;

            if (!exists) {
              const alterSql = `ALTER TABLE \`${physicalName}\` ADD COLUMN \`${col.name}\` ${col.type}`;
              await this.raw.execute(alterSql);
            }
          } catch {
            /* safe */
          }
        }

        for (const colName of dynamicCols) {
          try {
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${physicalName}\` (\`${colName}\`)`,
            );
          } catch {
            /* safe */
          }
        }

        // 🚀 COVERING COMPOSITE INDEX for the canonical tenant list query:
        // WHERE tenantId=? AND status=? AND isDeleted=0 ORDER BY updatedAt DESC
        // LIMIT n — avoids filesort and enables keyset seeks on deep pages.
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_status_updated\` ON \`${physicalName}\` (\`tenantId\`, \`status\`, \`updatedAt\`)`,
          );
        } catch {
          /* safe */
        }

        logger.info(`[MARIADB Adapter] Provisioned table: ${physicalName}`);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }
}

export * from "./adapter-core";
