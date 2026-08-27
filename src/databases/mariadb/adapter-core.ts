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
import { getHardwareProfile } from "@utils/hardware-profile";
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
import { mysqlTable, varchar, json, datetime, boolean, int } from "drizzle-orm/mysql-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";
import { normalizeCollectionTableName } from "../core/collection-name";
import { generateUUID } from "@src/utils/native-utils";
import { extractPkConflictId } from "../core/lookup-query";

export abstract class AdapterCore extends SqlAdapterCore {
  public type = "mariadb";
  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: true,
    supportsAggregation: false,
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

  /** mysql2's execute/query return [rows, fields] — rows are the first element. */
  protected async executeDynamicSql(db: any, sqlQuery: SQL): Promise<any[]> {
    try {
      const rendered = (
        sqlQuery as { toQuery?: (opts: unknown) => { sql: string; params: unknown[] } }
      ).toQuery?.({
        escapeName: (n: string) => `\`${n.replace(/`/g, "``")}\``,
        escapeParam: () => "?",
      });
      if (rendered?.sql && Array.isArray(rendered.params)) {
        const rawExec = this.getRawExec({});
        const rows = await rawExec(rendered.sql, rendered.params);
        if (Array.isArray(rows) && rows.length >= 1 && Array.isArray(rows[0])) {
          return rows[0];
        }
        return Array.isArray(rows) ? rows : [];
      }
    } catch {
      /* fall through */
    }
    const execResult = await db.execute(sqlQuery);
    if (Array.isArray(execResult) && execResult.length >= 1 && Array.isArray(execResult[0])) {
      return execResult[0];
    }
    return execResult;
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
      const selectCols = this.getRawFindByIdCols(table, wantsData)
        .map((c) => `\`${c}\``)
        .join(", ");
      // Defense-in-depth: tableName derives from getTable (already allow-listed),
      // but assert again at the raw-SQL site so the invariant is local.
      const rawSql = `SELECT ${selectCols} FROM \`${utils.assertSafeSqlIdentifier(
        tableName,
        "table",
      )}\` WHERE \`${idColName}\` = ?${tenantSql} LIMIT 1`;
      // Read-path schema registration: raw reads must normalize timestamps to
      // ISODateString even on read-only workloads (relational-utils isEpochMs).
      if (!this._registeredSchemas.has(collection)) {
        this.ensureTableSchemaRegistered(table, collection);
        this._registeredSchemas.add(collection);
      }
      // Tx-aware: inside a transaction reads MUST stay on the txn connection
      // (the pool would see pre-transaction state — phantom reads).
      const rows = (await this.getRawExec(options)(rawSql, [String(id), ...tenantParams])) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        if (!wantsData) {
          return utils.convertDatesToISO(row, {
            ...this.convertDatesOptions,
            table: collection,
            skipJson: true,
          }) as T;
        }
        return utils.convertDatesToISO(row, {
          ...this.convertDatesOptions,
          table: collection,
        }) as T;
      }
      return null;
    } catch (rawErr: any) {
      logger.debug("[MariaDB raw findById] falling back to Drizzle:", rawErr?.message);
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
      // 🛡️ Identifier allow-list: this name is embedded in raw SQL identifiers
      // (rawFindById/insert/update/DDL). Dash-stripping alone did not stop
      // backtick breakout from admin-typed collection names — fail closed
      // BEFORE any SQL is assembled.
      utils.assertSafeSqlIdentifier(cleanId, "collection");
      // ⚠️ Composite length guard: the interpolated identifier is
      // `collection_${cleanId}` (11-char prefix). A bare-label pass alone is
      // not enough — the composite can exceed MariaDB's 64-char identifier
      // limit and would be silently truncated, colliding with a longer
      // sibling name. Fail closed on the FINAL identifier
      // (normalizeCollectionTableName is the single source of truth for the
      // physical name derivation).
      const tableName = utils.assertSafeSqlIdentifier(
        normalizeCollectionTableName(collection),
        "table",
      );

      const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
      if (helpers.isSystemTable(cleanName) && cleanName !== collection) {
        return this.getTable(cleanName);
      }

      // 🚀 ROW-STORE HYBRID: materialized scalar fields (populated by
      // createModel) exist in the Drizzle def so filters/sorts/writes use the
      // column; the `data` blob keeps only dynamic fields.
      const dynamicTable = this.createDynamicTableDefinition(
        tableName,
        this.materializedColumns.get(cleanName) ||
          this.materializedColumns.get(tableName) ||
          undefined,
      );
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
          connectionLimit:
            Number(process.env.DATABASE_MAX_CONNECTIONS) || getHardwareProfile().dbPoolSize,
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
          connectionLimit:
            Number(c.max || process.env.DATABASE_MAX_CONNECTIONS) ||
            getHardwareProfile().dbPoolSize,
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

  public createDynamicTableDefinition(tableName: string, columnsToAdd?: Map<string, string>) {
    const booleanCols: string[] = ["isDeleted"];
    const columns: Record<string, any> = {
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
          columns[colName] = int(colName);
        } else if (colType === "boolean") {
          columns[colName] = boolean(colName);
          booleanCols.push(colName);
        } else {
          columns[colName] = varchar(colName, { length: 255 });
        }
      }
    }

    registerTableSchema(tableName, Object.keys(columns), booleanCols);

    return mysqlTable(tableName, columns);
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
      const lookupId = extractPkConflictId(query);
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
      // Drizzle def property names may differ from physical column names
      // (e.g. plugin_storage: collectionName → `collection`).
      const physicalName = (c: string) =>
        utils.assertSafeSqlIdentifier(this.getColumn(table, c)?.name ?? c, "column");
      const colList = cols.map((c) => `\`${physicalName(c)}\``);
      const placeholders = cols.map(() => "?").join(", ");
      const updatePairs = cols
        .filter((c) => c !== idColName)
        .map((c) => `\`${physicalName(c)}\` = VALUES(\`${physicalName(c)}\`)`);
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
        .map((c) => {
          // Drizzle def property names may differ from physical column names
          // (e.g. plugin_storage: collectionName → `collection`).
          const phys = this.getColumn(table, c);
          return utils.assertSafeSqlIdentifier(phys?.name ?? c, "column");
        })
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
   * Raw single INSERT (no RETURNING) — MariaDB's Drizzle dialect has no
   * .returning() and the base path pays the Drizzle AST build per insert. The
   * row is reconstructed from the prepared values (identical shape to the
   * base no-read-back path: same prepareValues + convertDatesToISO). Falls
   * back to the base implementation on any error or missing table (auto-
   * provisioning lives there).
   */
  /**
   * Tx-scoped mysql2 connection when inside a transaction started by the
   * Maria TransactionModule (which stashes the dedicated pool connection on
   * `transaction.conn`). Falls back to reading it off the drizzle tx session.
   * Returns null when the transaction carries no raw handle (callers then
   * defer to the Drizzle path, preserving rollback semantics).
   */
  protected getTxnConn(options: BaseQueryOptions): any {
    const tx = options?.transaction as any;
    return tx?.conn ?? tx?.db?.session?.client ?? null;
  }

  /**
   * Raw statement executor honoring the tx connection: `conn.execute` returns
   * [rows, fields] (same unwrap as this.raw.execute) — bound here once so raw
   * paths stay single-line swaps between pool and txn.
   */
  protected getRawExec(options: BaseQueryOptions): (sql: string, params?: any[]) => Promise<any[]> {
    const txnConn = this.getTxnConn(options);
    if (txnConn) {
      return async (sqlText: string, params: any[] = []) => {
        const [rows] = await txnConn.execute(sqlText, params);
        return rows;
      };
    }
    return (sqlText: string, params: any[] = []) => this.raw.execute(sqlText, params);
  }

  override async insert<T extends BaseEntity>(
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
    const invalid = this.validateEntryId(collection, (data as any)?._id);
    if (invalid) return invalid;
    // Inside an outer transaction WITHOUT a raw handle (a Drizzle tx from
    // another caller) the raw pool path would bypass the txn connection and
    // commit immediately — defer to the base Drizzle path. With the
    // TransactionModule's raw handle, run the raw INSERT on the txn
    // connection instead (single code path).
    const txnConn = this.getTxnConn(options);
    if (options?.transaction && !txnConn) {
      return super.insert(collection, data, options);
    }
    return this.wrap(
      async () => {
        const rawExec = this.getRawExec(options);
        const d =
          this.hooks.length > 0
            ? await this.runHooks("before", "insert", collection, data, options)
            : data;
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        if (!this._registeredSchemas.has(collection)) {
          this.ensureTableSchemaRegistered(table, collection);
          this._registeredSchemas.add(collection);
        }
        const id = (d as any)._id || generateUUID();
        const now = new Date();
        const values = this.prepareValues(table, d, id, now, options);
        // Old tables predate the DDL timestamp defaults — always write both
        // timestamps explicitly so createdAt is never NULL.
        if (values.createdAt === undefined) values.createdAt = now;

        const runInsert = async () => {
          const tableName = getTableName(table);
          const cols = Object.keys(values);
          if (cols.length === 0) {
            return utils.convertDatesToISO(values, {
              ...this.convertDatesOptions,
              table: collection,
            }) as T;
          }
          const colList = cols
            .map((c) => {
              // Drizzle def property names may differ from physical column
              // names (e.g. plugin_storage: collectionName → `collection`).
              const phys = this.getColumn(table, c);
              return utils.assertSafeSqlIdentifier(phys?.name ?? c, "column");
            })
            .map((c) => `\`${c}\``)
            .join(", ");
          const placeholders: string[] = [];
          const params: any[] = [];
          for (const c of cols) {
            const v = values[c];
            // Missing/undefined values bind as literal DEFAULT — mysql2
            // throws on undefined bind params.
            if (v === undefined) {
              placeholders.push("DEFAULT");
              continue;
            }
            params.push(
              v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v,
            );
            placeholders.push("?");
          }
          const sqlText = `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders.join(", ")})`;
          await rawExec(sqlText, params);
          return utils.convertDatesToISO(
            this.synthesizeInsertRow(table, values, { intBooleans: true }),
            {
              ...this.convertDatesOptions,
              table: collection,
            },
          ) as T;
        };

        let finalData: T;
        try {
          finalData = await runInsert();
        } catch (err: any) {
          // Auto-provision dynamic collection tables on first write.
          if (this.isMissingTableError(err) && typeof (this as any).createModel === "function") {
            await (this as any).createModel({
              _id: collection,
              name: collection,
              fields: [],
            });
            finalData = await runInsert();
          } else {
            throw err;
          }
        }

        return this.hooks.length > 0
          ? await this.runHooks("after", "insert", collection, finalData, options)
          : finalData;
      },
      "INSERT_FAILED",
      undefined,
      { ...options, isWrite: true, skipMeta: true },
    );
  }

  /**
   * Raw multi-VALUES INSERT fast path — mirrors the SQLite/PG insertMany
   * paths: one prepared multi-row statement per chunk instead of the Drizzle
   * AST build. MariaDB materializes multi-row RETURNING (slow — measured
   * 62 RPS vs 190 for the no-read-back path), so rows are synthesized from
   * the prepared values exactly like the base no-returning path. Falls back
   * to the base path on any error or inside an outer transaction.
   */
  protected override async rawInsertManyReturning<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    batchValues: Record<string, any>[],
    options: BaseQueryOptions,
  ): Promise<T[] | null> {
    const inOuterTxn = Boolean(options?.transaction);
    const txnConn = this.getTxnConn(options);
    if (inOuterTxn && !txnConn) return null;

    try {
      const len = batchValues.length;
      if (len === 0) return [];
      const rawExec = this.getRawExec(options);
      const tableName = getTableName(table);
      const safeTableName = utils.assertSafeSqlIdentifier(tableName, "table");

      const synthesizedRows: Record<string, any>[] = Array.from({ length: len });
      for (let i = 0; i < len; i++) {
        synthesizedRows[i] = this.synthesizeInsertRow(table, batchValues[i], { intBooleans: true });
      }

      const cols = new Set<string>();
      for (let i = 0; i < len; i++) {
        for (const k in synthesizedRows[i]) cols.add(k);
      }
      if (cols.size === 0) return [];

      const maxParams = 65000;
      const chunkSize = Math.max(1, Math.floor(maxParams / cols.size));
      const colList = Array.from(cols)
        .map((c) => {
          const phys = this.getColumn(table, c);
          return `\`${utils.assertSafeSqlIdentifier(phys?.name ?? c, "column")}\``;
        })
        .join(", ");

      for (let start = 0; start < len; start += chunkSize) {
        const chunk = synthesizedRows.slice(start, start + chunkSize);
        const params: any[] = [];
        const valuesSql: string[] = [];
        for (let r = 0; r < chunk.length; r++) {
          const row = chunk[r];
          const rowPlaceholders: string[] = [];
          for (const c of cols) {
            const v = row[c];
            if (v === undefined) {
              rowPlaceholders.push("DEFAULT");
              continue;
            }
            params.push(
              v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v,
            );
            rowPlaceholders.push("?");
          }
          valuesSql.push(`(${rowPlaceholders.join(", ")})`);
        }
        const sqlText = `INSERT INTO \`${safeTableName}\` (${colList}) VALUES ${valuesSql.join(", ")}`;
        await rawExec(sqlText, params);
      }

      const skipReturning = (options as any)?.skipReturning === true;
      if (skipReturning) {
        return synthesizedRows as unknown as T[];
      }
      return utils.convertArrayDatesToISO(synthesizedRows, {
        ...this.convertDatesOptions,
        mariaDoubleParseJson: true,
        table: collection,
      }) as T[];
    } catch {
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
    // Inside an outer transaction WITHOUT a raw handle (a Drizzle tx from
    // another caller) the raw pool path would bypass the txn connection —
    // defer to the base Drizzle path. With the TransactionModule's raw
    // handle, run the raw UPDATE on the txn connection (single code path).
    const txnConn = this.getTxnConn(options);
    if (options?.transaction && !txnConn) {
      return super.update(collection, id, data, options);
    }
    const rawExec = this.getRawExec(options);
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
      const values = this.prepareUpdateValues(table, d, id, now, options);
      // Drop the PK from SET (never write _id back)
      delete values[idColName];
      delete values["id"];

      const setPairs: string[] = [];
      const params: any[] = [];
      const columns = Object.keys(values);
      for (const col of columns) {
        // Drizzle def property names may differ from physical column names
        // (e.g. plugin_storage: collectionName → `collection`).
        const phys = this.getColumn(table, col);
        const safeCol = utils.assertSafeSqlIdentifier(phys?.name ?? col, "column");
        setPairs.push(`\`${safeCol}\` = ?`);
        const val = values[col];
        params.push(
          val === null || val === undefined
            ? null
            : typeof val === "object" && !(val instanceof Date)
              ? JSON.stringify(val)
              : val,
        );
      }
      if (setPairs.length === 0) {
        return super.update(collection, id, data, options);
      }

      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(options, "mysql");

      // 🚀 NO-READ-BACK: full-document callers skip the RETURNING row read-back
      // + JSON parse — the row is reconstructed from the prepared values.
      const skipReturning = (options as any)?.skipReturning === true;
      const sqlText = skipReturning
        ? `UPDATE \`${tableName}\` SET ${setPairs.join(", ")} WHERE \`${idColName}\` = ?${tenantSql}`
        : `UPDATE \`${tableName}\` SET ${setPairs.join(", ")} WHERE \`${idColName}\` = ?${tenantSql} RETURNING *`;
      const rows = (await rawExec(sqlText, [...params, String(id), ...tenantParams])) as any[];

      if (skipReturning) {
        const reconstructed = {
          ...values,
          [idColName]: id,
        } as Record<string, unknown>;
        const converted = utils.convertDatesToISO(reconstructed, {
          mariaDoubleParseJson: true,
          table: collection,
        }) as unknown as T;
        const finalData =
          this.hooks.length > 0
            ? await this.runHooks("after", "update", collection, converted, options)
            : converted;
        this.metrics.queryCount++;
        return this.okEnvelope(finalData, true);
      }

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
        this.metrics.queryCount++;
        return this.okEnvelope(finalData, true);
      }
    } catch (err: any) {
      this._returningSupported = false;
      logger.debug(
        `MariaDB UPDATE...RETURNING not supported, using base update path: ${err.message}`,
      );
    }
    return super.update(collection, id, data, options);
  }

  /**
   * Raw heterogeneous bulk UPDATE for MariaDB — one prepared statement
   * instead of N per-row UPDATEs (BatchModule.bulkUpdate's transactional
   * fallback loop, which also errored on blob-field payloads: Drizzle
   * mysql2 .set() rejects keys that live in the JSON `data` column).
   *
   * Builds `SET \`col\` = CASE \`_id\` WHEN ? THEN ? … ELSE \`col\` END` for
   * varying columns (rows omitting a column fall through to ELSE), plain
   * `\`constCol\` = ?` for columns every row sets to the same value
   * (updatedAt, tenantId), and `WHERE \`_id\` IN (?, …)` + tenant clause.
   *
   * Values come from prepareUpdateValues (same semantics as crud.update);
   * binding mirrors rawInsertReturning (objects→JSON text, Date objects
   * bound natively by mysql2). Chunks run inside a pool transaction so a
   * batch is all-or-nothing; returns null on any failure (nothing committed).
   */
  public override async rawBulkUpdate(
    table: any,
    _collection: string,
    updates: Array<{ id: DatabaseId; data: Partial<Record<string, unknown>> }>,
    now: Date,
    options: BaseQueryOptions,
  ): Promise<{ modifiedCount: number } | null> {
    try {
      if (!this.pool) return null;
      const txnConn = this.getTxnConn(options);
      if (options?.transaction && !txnConn) return null;
      if (updates.length < 2) return null;
      const tableName = getTableName(table);
      const safeTableName = utils.assertSafeSqlIdentifier(tableName, "table");
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) return null;
      const idColName = idCol?.name || "_id";

      // 🛡️ TENANT ISOLATION: fail-closed guard (BatchModule asserts too; keep
      // defense-in-depth for direct calls) + tenant WHERE like rawFindById.
      if (this.getColumn(table, "tenantId")) {
        utils.applyTenantFilter([], this.getColumn(table, "tenantId"), options);
      }
      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(options, "mysql");

      const prepared = updates.map((u) =>
        this.prepareUpdateValues(table, u.data, u.id as string, now, options),
      );

      const setCols: string[] = [];
      const seen = new Set<string>();
      for (const values of prepared) {
        for (const k in values) {
          if (!Object.hasOwn(values, k)) continue;
          if (k === idColName || k === "id") continue;
          if (!seen.has(k)) {
            seen.add(k);
            setCols.push(k);
          }
        }
      }
      if (setCols.length === 0) return null;

      // MariaDB max placeholders (65535) — same conservative chunking as the
      // other adapters; CASE columns cost 2 params/row + 1 id in WHERE IN.
      const maxParams = 65_000;
      const maxRowsPerChunk = Math.max(1, Math.floor(maxParams / (setCols.length * 2 + 1)));

      const bind = (v: unknown) =>
        v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      const sameValue = (a: unknown, b: unknown): boolean => {
        if (a === b) return true;
        if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
        if (a && b && typeof a === "object" && typeof b === "object") {
          return JSON.stringify(a) === JSON.stringify(b);
        }
        return false;
      };

      let modifiedCount = 0;
      const runChunks = async (rawExec: (sql: string, params?: any[]) => Promise<any>) => {
        for (let start = 0; start < prepared.length; start += maxRowsPerChunk) {
          const chunk = prepared.slice(start, start + maxRowsPerChunk);
          const chunkIds = updates.slice(start, start + maxRowsPerChunk).map((u) => String(u.id));

          const setPairs: string[] = [];
          const params: unknown[] = [];
          for (const col of setCols) {
            const phys = this.getColumn(table, col);
            const safeCol = utils.assertSafeSqlIdentifier(phys?.name ?? col, "column");

            let constant = true;
            let firstVal: unknown;
            let firstSet = false;
            for (const values of chunk) {
              if (!Object.hasOwn(values, col)) {
                constant = false;
                break;
              }
              const v = values[col];
              if (!firstSet) {
                firstVal = v;
                firstSet = true;
              } else if (!sameValue(v, firstVal)) {
                constant = false;
                break;
              }
            }

            if (constant) {
              setPairs.push(`\`${safeCol}\` = ?`);
              params.push(bind(firstVal));
              continue;
            }

            const whens: string[] = [];
            for (let i = 0; i < chunk.length; i++) {
              const values = chunk[i];
              if (!Object.hasOwn(values, col)) continue;
              whens.push("WHEN ? THEN ?");
              params.push(chunkIds[i], bind(values[col]));
            }
            const safeIdCol = utils.assertSafeSqlIdentifier(idColName, "column");
            setPairs.push(
              `\`${safeCol}\` = CASE \`${safeIdCol}\` ${whens.join(" ")} ELSE \`${safeCol}\` END`,
            );
          }

          const idPlaceholders = chunkIds.map(() => "?").join(", ");
          const rawSql = `UPDATE \`${safeTableName}\` SET ${setPairs.join(", ")} WHERE \`${utils.assertSafeSqlIdentifier(idColName, "column")}\` IN (${idPlaceholders})${tenantSql}`;
          const res = await rawExec(rawSql, [...params, ...chunkIds, ...tenantParams]);
          modifiedCount += Number((res as any)?.affectedRows ?? 0);
        }
      };

      if (txnConn) {
        await runChunks(async (sql: string, params: any[] = []) => {
          const [rows] = await txnConn.execute(sql, params);
          return rows;
        });
      } else {
        // One pinned connection for the whole batch → atomic (mysql2 promise
        // Pool has no beginTransaction; transactions live on a connection).
        const conn = await this.pool.getConnection();
        try {
          await conn.beginTransaction();
          await runChunks(async (sql: string, params: any[] = []) => {
            const [rows] = await conn.execute(sql, params);
            return rows;
          });
          await conn.commit();
        } catch (err) {
          try {
            await conn.rollback();
          } catch {
            /* already aborted */
          }
          throw err;
        } finally {
          conn.release();
        }
      }

      return { modifiedCount };
    } catch {
      return null;
    }
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
        // 🚀 ROW-STORE HYBRID: materialized numeric fields live in a column —
        // increment the column directly (JSON_SET on `data` would no-op for new
        // rows whose field never entered the blob).
        const fieldIsColumn = !!this.getColumn(table, field);
        const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
          options,
          "mysql",
        );
        const idColName = idCol.name || "_id";

        if (this._returningSupported !== false) {
          try {
            // Prefer single-round-trip upsert with bound params when RETURNING is available.
            const upsertSql = fieldIsColumn
              ? `INSERT INTO \`${tableName}\` (\`_id\`, \`${safeField}\`, \`updatedAt\`) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() RETURNING *`
              : dataCol
                ? `INSERT INTO \`${tableName}\` (\`_id\`, \`data\`, \`updatedAt\`) VALUES (?, '{}', NOW()) ON DUPLICATE KEY UPDATE \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${safeField}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${safeField}'), 0) + ?), \`updatedAt\` = NOW() RETURNING *`
                : `INSERT INTO \`${tableName}\` (\`_id\`, \`${safeField}\`, \`updatedAt\`) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() RETURNING *`;

            const upsertParams = fieldIsColumn
              ? [idStr, amountNum, amountNum]
              : dataCol
                ? [idStr, amountNum]
                : [idStr, amountNum, amountNum];

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
        if (fieldIsColumn) {
          await this.raw.execute(
            `UPDATE \`${tableName}\` SET \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() WHERE \`${idColName}\` = ?${tenantSql}`,
            [amountNum, idStr, ...tenantParams],
          );
        } else if (dataCol) {
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

  public async createModel(schemaData: any, force = false): Promise<void> {
    const tableName = schemaData._id || schemaData.id;
    if (!tableName) throw new Error("Schema must have an _id");

    const normalizedName = tableName.replace(/-/g, "");

    // 🚀 FAST PATH: skip all DDL for already-provisioned tables.
    if (!force && this._provisionedTables.has(normalizedName)) return;

    const table = this.getTable(normalizedName);
    const physicalName = getTableName(table as any);

    await this.wrap(
      async () => {
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.debug(`[DB Provision] BENCHMARK=${process.env.BENCHMARK || "standalone"}`);
        }

        const ddl = `CREATE TABLE IF NOT EXISTS \`${physicalName}\` (\`_id\` VARCHAR(36) PRIMARY KEY, \`tenantId\` VARCHAR(36), \`status\` VARCHAR(255) DEFAULT 'draft', \`isDeleted\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` DATETIME DEFAULT CURRENT_TIMESTAMP, \`data\` LONGTEXT);`;

        if (ddl) {
          if (process.env.BENCHMARK_DEBUG === "true") {
            logger.debug(`[DB Provision] [MARIADB] Executing DDL for ${physicalName}`);
          }
          await this.raw.execute(ddl);
        }

        const columns = [
          { name: "isDeleted", type: "TINYINT(1) DEFAULT 0" },
          { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
          { name: "tenantId", type: "VARCHAR(36)" },
          { name: "createdAt", type: "DATETIME DEFAULT CURRENT_TIMESTAMP" },
          { name: "updatedAt", type: "DATETIME DEFAULT CURRENT_TIMESTAMP" },
          { name: "collection", type: "VARCHAR(255)" },
          { name: "slug", type: "VARCHAR(255)" },
          { name: "locale", type: "VARCHAR(50)" },
          { name: "publishedAt", type: "DATETIME" },
        ];

        const dynamicCols = ["collection", "slug", "locale", "publishedAt"];

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          const materialized = new Map<string, string>();
          for (const field of schemaData.fields) {
            // Row-store hybrid: scalar fields become physical columns — the
            // `data` blob keeps only dynamic fields for new rows.
            if (helpers.shouldMaterializeField(field)) {
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
                  materialized.set(
                    fieldName,
                    colType === "INT" ? "integer" : colType === "TINYINT(1)" ? "boolean" : "text",
                  );
                }
              }
            }
          }
          if (materialized.size > 0) {
            this.materializedColumns.set(tableName, materialized);
            this.materializedColumns.set(normalizedName, materialized);
          }
        }

        registerTableSchema(normalizedName, ["_id", "data", ...columns.map((c: any) => c.name)]);

        for (const col of columns) {
          try {
            // 🛡️ col.name can be admin-typed field LABEL text — allow-list it
            // before it reaches SHOW COLUMNS/ALTER/CREATE INDEX identifiers.
            const colName = utils.assertSafeSqlIdentifier(col.name, "column");
            const query = `SHOW COLUMNS FROM \`${physicalName}\` LIKE '${colName}'`;
            const res = await this.raw.execute(query);
            const exists = res.length > 0;

            if (!exists) {
              const alterSql = `ALTER TABLE \`${physicalName}\` ADD COLUMN \`${colName}\` ${col.type}`;
              await this.raw.execute(alterSql);
              // 🚀 SELF-HEALING BACKFILL: legacy rows keep their field values in
              // the `data` blob — copy them into the new column so filters and
              // sorts match old rows too (idempotent: only NULL columns are
              // filled; JSON_EXTRACT returns JSON — UNQUOTE for text columns,
              // implicit cast for INT/TINYINT).
              try {
                const safeColName = utils.assertSafeSqlIdentifier(col.name, "column");
                if (col.type === "INT" || col.type === "TINYINT(1)") {
                  await this.raw.execute(
                    `UPDATE \`${physicalName}\` SET \`${safeColName}\` = CAST(JSON_EXTRACT(\`data\`, '$.${safeColName}') AS SIGNED) WHERE \`${safeColName}\` IS NULL AND \`data\` IS NOT NULL`,
                  );
                } else {
                  await this.raw.execute(
                    `UPDATE \`${physicalName}\` SET \`${safeColName}\` = JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${safeColName}')) WHERE \`${safeColName}\` IS NULL AND \`data\` IS NOT NULL`,
                  );
                }
              } catch {
                /* backfill is best-effort */
              }
            }
          } catch {
            /* safe */
          }
        }

        for (const colNameRaw of dynamicCols) {
          try {
            // 🛡️ Same allow-list as the ALTER loop — dynamicCols can carry
            // admin-typed labels too.
            const colName = utils.assertSafeSqlIdentifier(colNameRaw, "column");
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${physicalName}\` (\`${colName}\`)`,
            );
            // 🚀 Covering composite index for filter+sort on dynamic columns:
            // WHERE tenantId=? AND status=? ORDER BY colName, _id
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_status_${colName}_id\` ON \`${physicalName}\` (\`tenantId\`, \`status\`, \`${colName}\`, \`_id\`)`,
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
        // 🚀 KEYSET TIEBREAKER variant: findPage appends "_id" to the default
        // sort so pages never overlap when rows share a timestamp; including
        // _id keeps that ORDER BY index-served (no filesort). New name on
        // purpose — existing deployments keep the legacy index via IF NOT EXISTS.
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_status_updated_id\` ON \`${physicalName}\` (\`tenantId\`, \`status\`, \`updatedAt\`, \`_id\`)`,
          );
        } catch {
          /* safe */
        }
        // 🚀 COMPOSITE INDEX for the status-less tenant list (the default list
        // page): WHERE tenantId=? ORDER BY updatedAt DESC LIMIT n — avoids the
        // filesort the status-composite index cannot serve without a status
        // predicate (middle column unconstrained).
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_updated\` ON \`${physicalName}\` (\`tenantId\`, \`updatedAt\`)`,
          );
        } catch {
          /* safe */
        }
        // 🚀 KEYSET TIEBREAKER variant of the status-less tenant index (see above).
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_updated_id\` ON \`${physicalName}\` (\`tenantId\`, \`updatedAt\`, \`_id\`)`,
          );
        } catch {
          /* safe */
        }

        logger.info(`[MARIADB Adapter] Provisioned table: ${physicalName}`);
        // The pre-DDL table def (base columns only) is stale — rebuild with the
        // materialized columns on next getTable. Invalidate EVERY key variant
        // (logical id, dash-stripped, and the physical collection_ prefix): a
        // missed variant leaves a stale def cached that silently drops
        // materialized columns from later reads.
        this.tableRegistry.delete(tableName);
        this.tableRegistry.delete(normalizedName);
        this.tableRegistry.delete(normalizeCollectionTableName(normalizedName));
        this.tableRegistry.delete(`collection_${tableName}`);
        // 🚀 Mark as provisioned so subsequent calls take the fast-path
        this._provisionedTables.add(normalizedName);
        this._provisionedTables.add(physicalName);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }
}

export * from "./adapter-core";
