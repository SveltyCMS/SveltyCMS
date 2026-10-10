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
 * - declared field renames and exact decimal/bigint/calendarDay/bytes SQL types
 */

import { logger } from "@src/utils/logger";
import { getHardwareProfile } from "@utils/hardware-profile";
import {
  SqlAdapterCore,
  boundedSqlIndexName,
  type ListIndexRequest,
  type RawPointWireStreamResult,
} from "../core/sql-adapter-core";
import { MARIADB_DIALECT, type SqlDialect } from "../core/sql-query-builder";
import { PROFILE_WRITE_ENABLED, profileMark } from "@utils/write-profiler";
import {
  getJsonDataPatch,
  jsonPatchNeedsJsMerge,
  parseJsonDataBlob,
} from "../core/query-primitives";
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
import {
  isSystemTable,
  shouldMaterializeField,
  buildCompositeIndexColumns,
  getMaterializedFieldColumns,
} from "../core/drizzle-sql-helpers";
import {
  applyDeclaredFieldRenames,
  hasDeclaredFieldRename,
  materializedSqlType,
} from "@src/databases/core/collection-module";
import { getTableName } from "drizzle-orm";
// Namespace import on purpose: exposed as `adapter.schema` (public surface, see the class field).
import * as schema from "./schema";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql, type SQL } from "drizzle-orm";
import { mysqlTable, varchar, json, datetime, boolean, int } from "drizzle-orm/mysql-core";
import {
  applyTenantFilter,
  assertFiniteAmount,
  assertSafeSqlIdentifier,
  buildRawTenantClause,
  convertArrayDatesToISO,
  convertDatesToISO,
  getTableBooleanColumns,
  registerTableSchema,
} from "../core/relational-utils";
import { normalizeCollectionTableName } from "../core/collection-name";
import { generateUUID } from "@src/utils/native-utils";
import { extractPkConflictId } from "../core/query-primitives";
import { NetworkDbQueueGate } from "../core/network-db-queue-gate";

export abstract class AdapterCore extends SqlAdapterCore {
  public type = "mariadb";
  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: true,
    // The documented pipeline subset runs through `core/aggregation-translator.ts`;
    // stages SQL cannot express fail closed with `NOT_SUPPORTED`.
    supportsAggregation: true,
    supportsStreaming: true,
    supportsPartitioning: true,
    supportsNativeJson: true,
    supportsReturning: false,
    supportsWriteCoalescing: true,
    supportsPreparedStatementWarmup: true,
    supportsWireStreaming: true,
    supportsVectorSearch: false,
    maxBatchSize: 1000,
    maxQueryComplexity: 100,
  };

  public pool: mysql.Pool | null = null;
  /** Map of tenant ID to dedicated mysql2 connection pool */
  private _tenantPools = new Map<string, mysql.Pool>();
  /** The tenant ID for the current request context, set by setTenantContext() */
  private _currentTenantId: string | null = null;
  private _rawPoolConfig: any = null;

  /** Active tenant for pool routing (null = unset). */
  public get currentTenantId(): string | null {
    return this._currentTenantId;
  }

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
  private _mariaSelectColsCache = new WeakMap<
    object,
    { withData?: string; withoutData?: string }
  >();
  private _mariaInsertTplCache = new Map<
    string,
    {
      sqlPrefix: string;
      cols: string[];
    }
  >();
  /**
   * Prepared UPDATE template cache — parity with SQLite's `_updateSqlCache` and
   * PostgreSQL's `_updateTemplateCache`. Key captures the full column ORDER
   * (payload key order drives bind order), tenant clause, RETURNING choice and
   * the JSON merge mode; the per-call loop then only converts/binds values.
   * FIFO-capped like the SQLite twin.
   */
  private _mariaUpdateTplCache = new Map<string, { sqlSkip: string; sqlReturning: string }>();
  /** Upsert template cache: fixed column list + ON DUPLICATE KEY pairs per column set. */
  private _mariaUpsertTplCache = new Map<string, string>();
  /** rawInsertReturning template cache (fixed `?` placeholders, one per column). */
  private _mariaInsertReturningTplCache = new Map<string, string>();

  /** FIFO-evict a Map cache at `cap` entries (mirrors the SQLite twin). */
  private evictIfFull(cache: Map<unknown, unknown>, cap = 256): void {
    if (cache.size >= cap) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

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
   * `JSON_MERGE_PATCH` is RFC 7396 — recursive, and a `null` in the patch deletes
   * the key. Nested-object / explicit-null patches are therefore hydrated and
   * merged in JS so the observable contract matches MongoDB's shallow `$set`.
   */
  protected override get jsonPatchMergeMode(): "operator" | "subset" {
    return "subset";
  }

  /**
   * `JSON_MERGE_PATCH` is RFC 7396 like SQLite's `json_patch` — recursive, and a
   * `null` in the patch deletes the key. Only patches that `jsonPatchNeedsJsMerge()`
   * clears are merged through it; the rest hydrate and merge in JS.
   */
  protected override jsonMergeWrapper(colSql: string): { prefix: string; suffix: string } {
    return { prefix: `JSON_MERGE_PATCH(COALESCE(${colSql}, '{}'), `, suffix: `)` };
  }

  /**
   * Read the JSON `data` column of one row for the JS merge path. Null means the
   * row is absent — the caller then fails closed instead of writing the patch as
   * the whole document. Stays on the txn connection when the update is in one.
   */
  protected override async readJsonDataColumn(
    table: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<Record<string, unknown> | null> {
    const tableName = getTableName(table);
    const idColName = (this.getColumn(table, "_id") || this.getColumn(table, "id"))?.name ?? "_id";
    const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");
    const rows = (await this.getRawExec(options)(
      `SELECT \`data\` FROM \`${assertSafeSqlIdentifier(tableName, "table")}\` WHERE \`${assertSafeSqlIdentifier(idColName, "column")}\` = ?${tenantSql} LIMIT 1`,
      [String(id), ...tenantParams],
    )) as Array<{ data?: unknown }> | undefined;
    return parseJsonDataBlob(rows?.[0]?.data);
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

  protected override get updateCoalescingEnabled(): boolean {
    return process.env.SVELTY_WRITE_COALESCE_UPDATE === "1";
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
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");
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
      let entry = this._mariaSelectColsCache.get(table);
      let selectCols = wantsData ? entry?.withData : entry?.withoutData;
      if (!selectCols) {
        selectCols = this.getRawFindByIdCols(table, wantsData)
          .map((c) => `\`${c}\``)
          .join(", ");
        if (!entry) {
          entry = {};
          this._mariaSelectColsCache.set(table, entry);
        }
        if (wantsData) entry.withData = selectCols;
        else entry.withoutData = selectCols;
      }
      // Defense-in-depth: tableName derives from getTable (already allow-listed),
      // but assert again at the raw-SQL site so the invariant is local.
      const rawSql = `SELECT ${selectCols} FROM \`${assertSafeSqlIdentifier(
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
          return convertDatesToISO(row, {
            ...this.convertDatesOptions,
            table: collection,
            skipJson: true,
          }) as T;
        }
        return convertDatesToISO(row, {
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

  /**
   * Direct-to-Wire point stream optimization for MariaDB:
   * Generates `{ success: true, data: { ... } }` directly inside MariaDB C engine
   * via JSON_OBJECT and JSON_MERGE_PATCH, completely bypassing V8 JS object hydration.
   */
  protected override async rawFindPointWireStream(
    table: any,
    _collection: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    try {
      const hasDataCol = !!this.getColumn(table, "data");
      if (!hasDataCol) return { kind: "declined" }; // Non-collection tables without a JSON blob use findOne fallback

      const tableName = getTableName(table);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) return { kind: "declined" };
      const idColName = idCol.name || "_id";
      const hasUpdatedAtCol = !!this.getColumn(table, "updatedAt");
      const updatedAtSelect = hasUpdatedAtCol ? "`updatedAt`" : "NULL";
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");

      const hasSlugCol = !!this.getColumn(table, "slug");
      const hasStatusCol = !!this.getColumn(table, "status");

      // Row-store hybrid: materialized fields live in real columns and the
      // `data` blob keeps only dynamic fields, so a blob-only wire body would
      // silently drop them. `JSON_SET` merges them back and — unlike
      // `JSON_MERGE_PATCH`/RFC 7396 — KEEPS an explicit `null`, matching the
      // Domain-Plane flatten (columns win; an unset column is `null`, not a
      // missing key). A boolean column is expressed as a comparison so the JSON
      // carries true/false, not TINYINT 0/1.
      const overrides: string[] = [`'$."_id"', \`${idColName}\``];
      if (hasStatusCol) overrides.push(`'$."status"', \`status\``);
      if (hasSlugCol) overrides.push(`'$."slug"', \`slug\``);
      const boolCols = getTableBooleanColumns(tableName);
      for (const rawName of getMaterializedFieldColumns(table)) {
        // The JSON path is a string literal — a name that cannot be embedded
        // verbatim means no faithful wire body, so decline (findOne fallback).
        if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
        const name = assertSafeSqlIdentifier(rawName, "column");
        const col = `\`${name}\``;
        overrides.push(`'$."${name}"', ${boolCols?.has(rawName) ? `(${col} = 1)` : col}`);
      }

      const dataExpr = `JSON_SET(COALESCE(\`data\`, '{}')${overrides.map((o) => `, ${o}`).join("")})`;

      const safeTable = `\`${assertSafeSqlIdentifier(tableName, "table")}\``;
      // Wire Plane publication guarantee: fail closed when the table cannot express it.
      const publishedSql =
        options?.requirePublished === true
          ? hasStatusCol
            ? " AND `status` IN ('publish', 'published')"
            : null
          : "";
      if (publishedSql === null) return { kind: "declined" };
      const rawSql = `SELECT JSON_OBJECT('success', true, 'data', ${dataExpr}) AS wire_body, ${updatedAtSelect} AS updated_at FROM ${safeTable} WHERE \`${idColName}\` = ?${publishedSql}${tenantSql} LIMIT 1`;

      const rows = (await this.getRawExec(options)(rawSql, [String(id), ...tenantParams])) as any[];
      if (!Array.isArray(rows) || rows.length === 0) return { kind: "missing" };
      const first = rows[0];
      return {
        kind: "found",
        wireBody:
          typeof first.wire_body === "string" ? first.wire_body : JSON.stringify(first.wire_body),
        etag: `"${String(id)}-${String(first.updated_at ?? "")}"`,
      };
    } catch (err: any) {
      logger.debug("[MariaDB rawFindPointWireStream] falling back:", err?.message);
      return { kind: "declined" };
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

  /**
   * `$min`/`$max` cannot be answered type-safely from the JSON blob here, so the
   * translator refuses the stage instead of returning a wrong number. MariaDB stores
   * JSON as text: both `JSON_UNQUOTE(JSON_EXTRACT(…))` and the raw `JSON_EXTRACT(…)`
   * compare as strings — measured 2026-09-22, `MIN` over `{10, 2}` returns `"10"`
   * for either form. A `CAST(… AS DECIMAL)` would fix numbers at the cost of
   * silently zeroing string values, and no single aggregate can return the numeric
   * MIN for numeric rows and the string MIN for string rows.
   *
   * A materialized column (declared `indexed` / `materialize: true`) is ordered by
   * the engine in its native column type and is the supported path.
   */
  protected override getJsonOrderedField(_field: string): SQL | null {
    return null;
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
      if (isSystemTable(collection)) {
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
      assertSafeSqlIdentifier(cleanId, "collection");
      // ⚠️ Composite length guard: the interpolated identifier is
      // `collection_${cleanId}` (11-char prefix). A bare-label pass alone is
      // not enough — the composite can exceed MariaDB's 64-char identifier
      // limit and would be silently truncated, colliding with a longer
      // sibling name. Fail closed on the FINAL identifier
      // (normalizeCollectionTableName is the single source of truth for the
      // physical name derivation).
      const tableName = assertSafeSqlIdentifier(normalizeCollectionTableName(collection), "table");

      const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
      if (isSystemTable(cleanName) && cleanName !== collection) {
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

      const { detectMysqlSocketPath, preferIpv4Loopback } = await import("../db-local-socket");

      if (typeof finalConnection === "string") {
        const hw = getHardwareProfile();
        let hostname = "127.0.0.1";
        try {
          hostname = new URL(finalConnection).hostname;
        } catch {
          /* uri parse optional */
        }
        const socketPath = detectMysqlSocketPath(hostname);
        poolConfig = socketPath
          ? {
              socketPath,
              user: new URL(finalConnection).username || "root",
              password: decodeURIComponent(new URL(finalConnection).password || ""),
              database: new URL(finalConnection).pathname.slice(1),
              connectionLimit: Number(process.env.DATABASE_MAX_CONNECTIONS) || hw.dbPoolSize,
              connectTimeout: 30000,
              maxIdle: Math.max(hw.dbPoolMin, 2),
              idleTimeout: 60000,
              charset: "utf8mb4",
              enableKeepAlive: true,
              keepAliveInitialDelay: 0,
              maxPreparedStatements: Number(process.env.MARIADB_MAX_PREPARED || 2000),
            }
          : {
              uri: finalConnection.replace("@localhost:", "@127.0.0.1:"),
              connectionLimit: Number(process.env.DATABASE_MAX_CONNECTIONS) || hw.dbPoolSize,
              connectTimeout: 30000,
              maxIdle: Math.max(hw.dbPoolMin, 2),
              idleTimeout: 60000,
              charset: "utf8mb4",
              enableKeepAlive: true,
              keepAliveInitialDelay: 0,
              maxPreparedStatements: Number(process.env.MARIADB_MAX_PREPARED || 2000),
            };
      } else {
        const c = (finalConnection || {}) as any;
        const rawHost = c.host || c.DB_HOST || "127.0.0.1";
        const socketPath = detectMysqlSocketPath(rawHost);
        poolConfig = socketPath
          ? {
              socketPath,
              user: c.user || c.DB_USER || "root",
              password: c.password || c.DB_PASSWORD || "",
              database: c.database || c.DB_NAME,
              connectionLimit:
                Number(c.max || process.env.DATABASE_MAX_CONNECTIONS) ||
                getHardwareProfile().dbPoolSize,
              connectTimeout: 30000,
              waitForConnections: true,
              maxIdle: Math.max(getHardwareProfile().dbPoolMin, 2),
              idleTimeout: 60000,
              queueLimit: 0,
              enableKeepAlive: true,
              charset: "utf8mb4",
              keepAliveInitialDelay: 0,
              maxPreparedStatements: Number(process.env.MARIADB_MAX_PREPARED || 2000),
            }
          : {
              host: preferIpv4Loopback(String(rawHost)),
              port: Number(c.port || c.DB_PORT || 3306),
              user: c.user || c.DB_USER || "root",
              password: c.password || c.DB_PASSWORD || "",
              database: c.database || c.DB_NAME,
              connectionLimit:
                Number(c.max || process.env.DATABASE_MAX_CONNECTIONS) ||
                getHardwareProfile().dbPoolSize,
              connectTimeout: 30000,
              waitForConnections: true,
              maxIdle: Math.max(getHardwareProfile().dbPoolMin, 2),
              idleTimeout: 60000,
              queueLimit: 0,
              enableKeepAlive: true,
              charset: "utf8mb4",
              keepAliveInitialDelay: 0,
            };
      }

      this._rawPoolConfig = poolConfig;
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
      const poolMax = poolConfig.connectionLimit || 20;
      const gateDisabled =
        process.env.DATABASE_QUEUE_GATE === "0" || process.env.SVELTY_DB_QUEUE_GATE === "0";
      if (!gateDisabled) {
        this.queueGate = new NetworkDbQueueGate({
          maxConcurrency: Number(process.env.DATABASE_MAX_CONCURRENCY) || poolMax,
          maxQueue: Number(process.env.DATABASE_MAX_QUEUE) || 500,
          timeoutMs: Number(process.env.DATABASE_QUEUE_TIMEOUT_MS) || 15_000,
          name: "MariaDB",
          enableWriteCoalescing: false,
        });
      }
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
    await this.closeAllTenantPools();
    if (this.queueGate) {
      this.queueGate.clear("MariaDB disconnected");
      this.queueGate = undefined;
    }
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
      const gateStats = this.queueGate?.getMetrics();

      return {
        total: gateStats?.maxConcurrency ?? total,
        active: gateStats?.active ?? Math.max(0, all - free),
        idle: free,
        waiting: (gateStats?.waiting ?? 0) + queue,
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

  /**
   * Covering index for a query-builder list sorted by a physical column other
   * than `updatedAt`. Fire-and-forget so the discovering read does not wait.
   */
  protected override scheduleListSortIndex(tableName: string, plan: ListIndexRequest): void {
    if (process.env.SVELTY_LAZY_SORT_INDEXES === "0") return;
    const safeTable = assertSafeSqlIdentifier(tableName, "table");
    const safeCol = assertSafeSqlIdentifier(plan.column, "column");
    const indexName = assertSafeSqlIdentifier(
      boundedSqlIndexName(`${tableName}_${plan.column}_${plan.withTenant ? "t" : "o"}_list_id`),
      "index",
    );
    const cols = plan.withTenant
      ? `(\`tenantId\`, \`${safeCol}\`, \`_id\`)`
      : `(\`${safeCol}\`, \`_id\`)`;
    const ddl = `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${safeTable}\` ${cols}`;
    void this.raw.execute(ddl).catch((err: unknown) => {
      logger.debug(
        `[MariaDB] list index failed for ${tableName}.${plan.column}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  public override get sqlDialect(): SqlDialect {
    return MARIADB_DIALECT;
  }

  /**
   * Run a compiled list/count statement on the MariaDB connection pool.
   * Direct invocation bypasses wrapper allocation in `raw.execute`.
   */
  public override async executeCompiled(
    sqlText: string,
    params: readonly unknown[],
    options?: BaseQueryOptions,
  ): Promise<unknown[]> {
    const pool =
      (this._currentTenantId && this._tenantPools.get(this._currentTenantId)) || this.pool;
    if (!pool) throw new Error("Database not connected");
    if (options?.transaction || !this.queueGate || this.queueGate.isInsideActiveContext()) {
      const [rows] = await pool.execute(sqlText, params as any);
      return Array.isArray(rows) ? (rows as unknown[]) : [];
    }
    return this.queueGate.acquire(async () => {
      const [rows] = await pool.execute(sqlText, params as any);
      return Array.isArray(rows) ? (rows as unknown[]) : [];
    });
  }

  public get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    const pool =
      (this._currentTenantId && this._tenantPools.get(this._currentTenantId)) || this.pool;
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        if (!pool) throw new Error("Database not connected");
        if (this.queueGate) {
          return this.queueGate.acquire(async () => {
            const [rows] = await pool.execute(sqlText, params);
            return rows;
          });
        }
        const [rows] = await pool.execute(sqlText, params);
        return rows;
      },
      client: pool,
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
    if (this.queueGate) {
      return this.queueGate.acquire(() => this._transactionModule!.execute(fn, options as any));
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
   * Whether JSON path arguments (`$.field`) may be bound as `?` parameters in
   * server-side prepared statements. Parameterized paths keep the statement
   * text stable per table so mysql2's prepared-statement cache hits for every
   * field instead of re-preparing per field name. Servers that reject a
   * parameter in a JSON path (ER_PARSE_ERROR) permanently fall back to the
   * interpolated (identifier-safe) path literal.
   */
  private _jsonPathParamsSupported: boolean | null = null;

  /** JSON-path token + bound params for the `data` column increment. */
  private mariaJsonPathTokens(safeField: string): { token: string; params: unknown[] } {
    const path = `$.${safeField}`;
    if (this._jsonPathParamsSupported === false) {
      return { token: `'${path}'`, params: [] };
    }
    return { token: "?", params: [path, path] };
  }

  private static isMariaJsonPathError(err: unknown): boolean {
    const errno = (err as { errno?: number } | null)?.errno;
    const message = err instanceof Error ? err.message : "";
    return errno === 1064 || /syntax|parse error/i.test(message);
  }

  /** SQL fragment: JSON_SET(...) increment expression for the `data` column. */
  private mariaJsonSetExpr(token: string): string {
    return `JSON_SET(COALESCE(\`data\`, '{}'), ${token}, COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), ${token}), 0) + ?)`;
  }

  /**
   * Whether the server supports JSON_TABLE (MariaDB 10.6+) for the bulk-update
   * fast path. The first 1064/1305 (unknown function/syntax) flips this
   * permanently and the CASE-ladder path takes over.
   */
  private _jsonTableSupported: boolean | null = null;

  private static isJsonTableUnsupportedError(err: unknown): boolean {
    const errno = (err as { errno?: number } | null)?.errno;
    const message = err instanceof Error ? err.message : "";
    return errno === 1064 || errno === 1305 || /JSON_TABLE/i.test(message);
  }

  /** mysql2 Date serialization shape: 'YYYY-MM-DD HH:MM:SS.mmm' (UTC). */
  private static mariaDateString(d: Date): string {
    return d.toISOString().replace("T", " ").slice(0, 23);
  }

  /**
   * Execute a data-column JSON increment with parameterized paths, retrying
   * once with the interpolated path literal when the server rejects `?` in a
   * JSON path (the first rejection flips the flag permanently).
   */
  private async mariaExecJsonIncrement(
    buildSql: (token: string) => string,
    buildParams: (pathParams: unknown[]) => unknown[],
    safeField: string,
  ): Promise<unknown> {
    if (this._jsonPathParamsSupported === false) {
      const { token, params } = this.mariaJsonPathTokens(safeField);
      return this.raw.execute(buildSql(token), buildParams(params));
    }
    try {
      const { token, params } = this.mariaJsonPathTokens(safeField);
      const result = await this.raw.execute(buildSql(token), buildParams(params));
      this._jsonPathParamsSupported = true;
      return result;
    } catch (err) {
      if (this._jsonPathParamsSupported === null && AdapterCore.isMariaJsonPathError(err)) {
        this._jsonPathParamsSupported = false;
        logger.debug(
          `[mariadb] JSON path parameter rejected by the server, using interpolated path for atomicIncrement`,
        );
        const { token, params } = this.mariaJsonPathTokens(safeField);
        return this.raw.execute(buildSql(token), buildParams(params));
      }
      throw err;
    }
  }

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

      // 🐛 PARTIAL-UPSERT MERGE: `col = VALUES(col)` (below) replaces the JSON `data`
      // blob wholesale, so every field the payload did not mention is deleted.
      // Measured on the live engine: `{"title":"Seed","value":7,"tags":["a"]}`
      // upserted with `{"title":"Upserted Partial"}` becomes
      // `{"title":"Upserted Partial"}` — value/tags gone. This override was added
      // after the shared path had already been fixed for exactly this data-loss class
      // (`jsonUpsertMergeSet`, and the docblock above it names the failing contract:
      // tests/integration/databases/adapter-parity.test.ts "keeps the fields a partial
      // upsert payload does not mention"), and it bypasses that fix.
      //
      // A payload that carries the blob therefore goes back through the shared path,
      // which applies the dialect-correct merge AND the JS hydration MariaDB needs for
      // RFC 7396 patches — reimplementing that here would be a second merge
      // implementation to keep in sync. The single-round-trip fast path stays for
      // payloads that only touch physical columns; a full-document upsert of a
      // blob-backed collection costs one extra round trip in exchange for not losing
      // columns (the correct trade for a sync/import path).
      const dataColumn = this.getColumn(table, "data");
      if (dataColumn && ("data" in values || (dataColumn.name ?? "") in values)) {
        return super.upsert(collection, query, data, options);
      }
      // Drizzle def property names may differ from physical column names
      // (e.g. plugin_storage: collectionName → `collection`).
      // 🚀 TEMPLATE CACHE: column list, placeholders and the ON DUPLICATE KEY
      // pairs depend only on the column ORDER — build once per shape.
      const tplKey = `${tableName}:${cols.join(",")}`;
      let sqlText = this._mariaUpsertTplCache.get(tplKey);
      if (!sqlText) {
        const physicalName = (c: string) =>
          assertSafeSqlIdentifier(this.getColumn(table, c)?.name ?? c, "column");
        const colList = cols.map((c) => `\`${physicalName(c)}\``).join(", ");
        const placeholders = cols.map(() => "?").join(", ");
        const updatePairs = cols
          .filter((c) => c !== idColName)
          .map((c) => `\`${physicalName(c)}\` = VALUES(\`${physicalName(c)}\`)`);
        sqlText =
          updatePairs.length > 0
            ? `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updatePairs.join(", ")} RETURNING *`
            : `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders}) RETURNING *`;
        this.evictIfFull(this._mariaUpsertTplCache);
        this._mariaUpsertTplCache.set(tplKey, sqlText);
      }
      const params = cols.map((c) => {
        const v = values[c];
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      });

      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");
      // Note: buildRawTenantClause may add a tenantId equality to WHERE; for upsert
      // we instead merge tenantId into the row values (done by prepareValues) and
      // rely on the PK conflict. Tenant WHERE on insert is not applicable.
      void tenantSql;
      void tenantParams;

      // 🔬 Parity with SQLite/PG's `db:ins:stmt` — the upsert is a *write* statement and
      // was the last unmarked MariaDB write path (measured N = 0.57 before this mark).
      const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:ins:stmt") : null;
      const rows = (await this.raw.execute(sqlText, params)) as any[];
      mStmt?.();
      if (Array.isArray(rows) && rows.length > 0) {
        this._returningSupported = true;
        return {
          success: true,
          data: convertDatesToISO(rows[0], {
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
      // 🚀 NO-READ-BACK: skipReturning avoids RETURNING * round trip
      const skipReturning = (_options as any)?.skipReturning === true;
      const tplKey = `${tableName}:${cols.join(",")}:${skipReturning ? 1 : 0}`;
      let sqlText = this._mariaInsertReturningTplCache.get(tplKey);
      if (!sqlText) {
        const colList = cols
          .map((c) => {
            // Drizzle def property names may differ from physical column names
            // (e.g. plugin_storage: collectionName → `collection`).
            const phys = this.getColumn(table, c);
            return assertSafeSqlIdentifier(phys?.name ?? c, "column");
          })
          .map((c) => `\`${c}\``)
          .join(", ");
        const placeholders = cols.map(() => "?").join(", ");
        sqlText = skipReturning
          ? `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders})`
          : `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders}) RETURNING *`;
        this.evictIfFull(this._mariaInsertReturningTplCache);
        this._mariaInsertReturningTplCache.set(tplKey, sqlText);
      }
      const params = cols.map((c) => {
        const v = values[c];
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      });
      // 🔬 Parity with SQLite's `db:ins:stmt` — see the PostgreSQL adapter for why the
      // count matters (N = Σ db:*:stmt ÷ ns:persist) and what this span contains.
      const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:ins:stmt") : null;
      const rows = (await this.raw.execute(sqlText, params)) as any[];
      mStmt?.();
      if (skipReturning) {
        return convertDatesToISO(values, {
          table: collection,
        }) as unknown as T;
      }
      if (Array.isArray(rows) && rows.length > 0) {
        this._returningSupported = true;
        return convertDatesToISO(rows[0], {
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
   * Phase 2 statement coalescing gate: concurrent single-row inserts for the
   * same collection coalesce into one multi-VALUES statement (PostgreSQL
   * parity — SVELTY_WRITE_COALESCING=1 enables multi-row statements).
   * Off by default because mysql2 executes single parameterized INSERT
   * statements immediately without the setImmediate tick delay.
   */
  protected override get insertCoalescingEnabled(): boolean {
    return process.env.SVELTY_WRITE_COALESCING === "1";
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
    const tenantId = (options?.tenantId as string) || this._currentTenantId;
    const pool = (tenantId && this._tenantPools.get(tenantId)) || this.pool;
    return async (sqlText: string, params: any[] = []) => {
      if (!pool) throw new Error("Database not connected");
      const [rows] = await pool.execute(sqlText, params);
      // mysql2 returns OkPacket / ResultSetHeader for non-SELECT statements;
      // the raw callers only ever read rows, so the union is narrowed here.
      return rows as unknown as any[];
    };
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
    // Phase 2 statement coalescing (PG parity): route through the base
    // executeInsert so concurrent same-collection inserts coalesce via the
    // per-collection StatementCoalescer into rawInsertManyReturning's one
    // multi-VALUES statement. `SVELTY_WRITE_COALESCING=0` keeps this
    // adapter's dedicated raw INSERT path hot (A/B control lane). Batches
    // that the engine declines replay per row through the base path's
    // missing-table provision (fault isolation).
    if (this.insertCoalescingEnabled && !options?.transaction) {
      return super.insert(collection, data, options);
    }
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
            return convertDatesToISO(values, {
              ...this.convertDatesOptions,
              table: collection,
            }) as T;
          }
          const tplKey = `${tableName}:${cols.join(",")}`;
          let tpl = this._mariaInsertTplCache.get(tplKey);
          if (!tpl) {
            const colList = cols
              .map((c) => {
                const phys = this.getColumn(table, c);
                return assertSafeSqlIdentifier(phys?.name ?? c, "column");
              })
              .map((c) => `\`${c}\``)
              .join(", ");
            tpl = {
              sqlPrefix: `INSERT INTO \`${tableName}\` (${colList}) VALUES (`,
              cols,
            };
            this._mariaInsertTplCache.set(tplKey, tpl);
          }
          const placeholders: string[] = [];
          const params: any[] = [];
          for (let i = 0; i < cols.length; i++) {
            const v = values[cols[i]];
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
          const sqlText = `${tpl.sqlPrefix}${placeholders.join(", ")})`;
          await rawExec(sqlText, params);
          return convertDatesToISO(this.synthesizeInsertRow(table, values, { intBooleans: true }), {
            ...this.convertDatesOptions,
            table: collection,
          }) as T;
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
   * Raw multi-VALUES INSERT fast path — serves both the seed `insertMany`
   * path and the Phase 2 StatementCoalescer contract: it receives prepared
   * `prepareValues` rows (timestamps/tenant baked in) and returns the created
   * rows in INPUT ORDER, or null to decline (the coalescer then replays per
   * row — fault isolation). One multi-row statement per chunk instead of the
   * Drizzle AST build. MariaDB materializes multi-row RETURNING (slow —
   * measured 62 RPS vs 190 for the no-read-back path), so RETURNING is
   * deliberately NOT used: rows are synthesized from the prepared values
   * exactly like the single-row no-read-back path, which makes the input
   * order mapping exact by construction. Falls back to the base path on any
   * error or inside an outer transaction.
   *
   * Measured and deliberately NOT replaced by `INSERT … SELECT FROM
   * JSON_TABLE` (A/B, 2026-10-04): direct binding beats JSON parse+extract
   * for inserts — the JSON_TABLE variant measured BULK INSERT (100)
   * 2.70 → 3.24 ms (+19 %) and seed burst 7,676 → 4,899 docs/s (−36 %),
   * because multi-VALUES binds values natively while JSON_TABLE pays a
   * full JSON document parse per batch. (The UPDATE twin DID win because it
   * replaced N per-row statements, not direct binding.)
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

    let tableName = "unknown";
    try {
      const len = batchValues.length;
      if (len === 0) return [];
      const rawExec = this.getRawExec(options);
      tableName = getTableName(table);
      const safeTableName = assertSafeSqlIdentifier(tableName, "table");

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
          return `\`${assertSafeSqlIdentifier(phys?.name ?? c, "column")}\``;
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
        // 🔬 Parity with the single-row `db:ins:stmt` — one mark per *chunk*
        // statement (chunkSize is params-bound, so long batches emit several).
        const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:ins:stmt") : null;
        await rawExec(sqlText, params);
        mStmt?.();
      }

      const skipReturning = (options as any)?.skipReturning === true;
      if (skipReturning) {
        return synthesizedRows as unknown as T[];
      }
      return convertArrayDatesToISO(synthesizedRows, {
        ...this.convertDatesOptions,
        mariaDoubleParseJson: true,
        table: collection,
      }) as T[];
    } catch (err) {
      // Never swallow silently: an insertMany failure must be visible in logs,
      // not vanish into the caller's fallback unannounced.
      logger.debug(`[mariadb] rawInsertManyReturning failed for ${tableName}:`, err);
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

      // Same partial-update merge decision as the shared path: `JSON_MERGE_PATCH`
      // cannot express a nested-object or explicit-null patch, so hydrate and merge
      // the stored blob in JS first and write a complete document.
      const jsonPatch = getJsonDataPatch(values);
      if (jsonPatch && jsonPatchNeedsJsMerge(jsonPatch)) {
        await this.hydrateJsonDataPatch(values, table, id, options);
      }

      const setPairs: string[] = [];
      const params: any[] = [];
      const columns = Object.keys(values);
      if (columns.length === 0) {
        return super.update(collection, id, data, options);
      }
      // 🔀 PARTIAL-UPDATE MERGE: a live patch marker means the `data` blob must merge
      // (`JSON_MERGE_PATCH` is RFC 7396 — exact for the scalar/array patches that
      // reach this point; nested objects and explicit nulls were already merged in
      // JS just above). Without it a PATCH would replace every dynamic field.
      const mergeJsonData = getJsonDataPatch(values) !== undefined;

      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");

      // 🚀 NO-READ-BACK: full-document callers skip the RETURNING row read-back
      // + JSON parse — the row is reconstructed from the prepared values.
      const skipReturning = (options as any)?.skipReturning === true;
      // 🚀 TEMPLATE CACHE (parity with SQLite/PG): the SET list, WHERE clause and
      // both SQL variants depend only on the column ORDER (the key captures it),
      // tenant clause, merge mode and RETURNING choice — build once per shape.
      const cacheKey = `${tableName}|${columns.join(",")}|${skipReturning ? 1 : 0}|${mergeJsonData ? 1 : 0}|${tenantSql}`;
      let tpl = this._mariaUpdateTplCache.get(cacheKey);
      if (!tpl) {
        for (const col of columns) {
          // Drizzle def property names may differ from physical column names
          // (e.g. plugin_storage: collectionName → `collection`).
          const phys = this.getColumn(table, col);
          const safeCol = assertSafeSqlIdentifier(phys?.name ?? col, "column");
          const isJson = phys?.name === "data" || (phys as any)?.dataType === "json";
          setPairs.push(
            isJson && mergeJsonData
              ? `\`${safeCol}\` = JSON_MERGE_PATCH(COALESCE(\`${safeCol}\`, '{}'), ?)`
              : `\`${safeCol}\` = ?`,
          );
        }
        const safeIdCol = assertSafeSqlIdentifier(idColName, "column");
        const safeTable = assertSafeSqlIdentifier(tableName, "table");
        const whereSql = `\`${safeIdCol}\` = ?${tenantSql}`;
        const setSql = setPairs.join(", ");
        tpl = {
          sqlSkip: `UPDATE \`${safeTable}\` SET ${setSql} WHERE ${whereSql}`,
          sqlReturning: `UPDATE \`${safeTable}\` SET ${setSql} WHERE ${whereSql} RETURNING *`,
        };
        this.evictIfFull(this._mariaUpdateTplCache);
        this._mariaUpdateTplCache.set(cacheKey, tpl);
      }
      for (const col of columns) {
        const val = values[col];
        params.push(
          val === null || val === undefined
            ? null
            : typeof val === "object" && !(val instanceof Date)
              ? JSON.stringify(val)
              : val,
        );
      }

      const sqlText = skipReturning ? tpl.sqlSkip : tpl.sqlReturning;
      // 🔬 Parity with SQLite/PG's `db:upd:stmt` — without this mark MariaDB's writes
      // produced fewer statement spans than writes (measured N = 0.44), which made its
      // round-trip count uncountable. One mark per statement, so
      // N = Σ db:*:stmt ÷ ns:persist and per-statement latency compare across engines.
      const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:upd:stmt") : null;
      const rows = (await rawExec(sqlText, [...params, String(id), ...tenantParams])) as any[];
      mStmt?.();

      if (skipReturning) {
        const reconstructed = {
          ...values,
          [idColName]: id,
        } as Record<string, unknown>;
        const converted = convertDatesToISO(reconstructed, {
          mariaDoubleParseJson: true,
          table: collection,
          inPlace: true,
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
        const converted = convertDatesToISO(rows[0], {
          mariaDoubleParseJson: true,
          table: collection,
          inPlace: true,
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
    let tableName = "unknown";
    try {
      if (!this.pool) return null;
      const txnConn = this.getTxnConn(options);
      if (options?.transaction && !txnConn) return null;
      if (updates.length < 2) return null;
      tableName = getTableName(table);
      const safeTableName = assertSafeSqlIdentifier(tableName, "table");
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) return null;
      const idColName = idCol?.name || "_id";

      // 🛡️ TENANT ISOLATION: fail-closed guard (BatchModule asserts too; keep
      // defense-in-depth for direct calls) + tenant WHERE like rawFindById.
      if (this.getColumn(table, "tenantId")) {
        applyTenantFilter([], this.getColumn(table, "tenantId"), options);
      }
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");

      const prepared = updates.map((u) =>
        this.prepareUpdateValues(table, u.data, u.id as string, now, options),
      );

      // 🔀 PARTIAL-UPDATE MERGE: `JSON_MERGE_PATCH` can wrap the `data` column in
      // this one statement, but only for patches it expresses like a shallow merge.
      // A nested object / explicit-null patch needs every row's stored blob — refuse
      // the fast path so the caller's per-row loop merges each row exactly.
      const jsonPatchRows = prepared.filter((v) => getJsonDataPatch(v) !== undefined);
      if (jsonPatchRows.some((v) => !this.canMergeJsonInOneStatement(getJsonDataPatch(v)!))) {
        return null;
      }

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

      // 🚀 JSON_TABLE FAST PATH (MariaDB 10.6+): one bound JSON array parameter
      // per chunk with CONSTANT SQL text per column set → mysql2's server-side
      // prepared-statement cache hits for every batch shape, instead of a
      // per-batch CASE ladder (2 params/cell, unique text per chunk). The first
      // 1064/1305 (unknown function) flips `_jsonTableSupported` permanently and
      // the proven CASE ladder below takes over; an oversized cell (>16 KB)
      // returns null so the caller's per-row loop handles it.
      if (this._jsonTableSupported !== false) {
        try {
          return await this.rawBulkUpdateJsonTable(
            table,
            safeTableName,
            idColName,
            tenantSql,
            tenantParams,
            prepared,
            setCols,
            txnConn,
          );
        } catch (err) {
          if (this._jsonTableSupported === null && AdapterCore.isJsonTableUnsupportedError(err)) {
            this._jsonTableSupported = false;
            logger.debug("[mariadb] JSON_TABLE unavailable, using CASE bulk update");
          } else {
            throw err;
          }
        }
      }

      return await this.rawBulkUpdateCaseLadder(
        table,
        safeTableName,
        idColName,
        tenantSql,
        tenantParams,
        prepared,
        setCols,
        txnConn,
      );
    } catch (err) {
      // Never swallow silently: a JSON_TABLE runtime failure (e.g. the 1267
      // collation mix on default-collation tables) must be visible in logs,
      // not vanish into the per-row fallback unannounced.
      logger.debug(`[mariadb] rawBulkUpdate failed for ${tableName}:`, err);
      return null;
    }
  }

  /**
   * Raw multi-row UPDATE statement coalescing for MariaDB.
   * Dispatches updates to the bulk update engine and returns the updated items.
   */
  protected override async rawUpdateManyReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    batch: Array<{ id: DatabaseId; values: Record<string, any>; options: BaseQueryOptions }>,
  ): Promise<T[] | null> {
    const len = batch.length;
    if (len === 0) return [];
    try {
      const updates = batch.map((b) => ({ id: b.id, data: b.values }));
      const options = batch[0].options;
      const res = await this.rawBulkUpdate(table, collection, updates, new Date(), options);
      if (!res) return null;

      const idColName = this.getColumn(table, "_id")?.name || "_id";
      const reconstructed: T[] = [];
      for (const item of batch) {
        reconstructed.push(
          convertDatesToISO(
            { ...item.values, [idColName]: item.id },
            {
              ...this.convertDatesOptions,
              table: collection,
            },
          ) as unknown as T,
        );
      }
      return reconstructed;
    } catch {
      return null;
    }
  }

  /**
   * Bulk UPDATE via `UPDATE … JOIN JSON_TABLE` — the MariaDB twin of the
   * PostgreSQL UNNEST path. Verified against MariaDB 12.3 (2026-10-04):
   * VARCHAR extraction unquotes JSON strings, JSON columns keep them quoted
   * (hence JSON_UNQUOTE for the `data` blob), and implicit assignment casts
   * handle INT/DATETIME/TINYINT. Booleans ride as 1/0 in the payload; Dates
   * are pre-formatted to mysql2's 'YYYY-MM-DD HH:MM:SS.mmm'.
   */
  private async rawBulkUpdateJsonTable(
    table: any,
    safeTableName: string,
    idColName: string,
    tenantSql: string,
    tenantParams: unknown[],
    prepared: any[],
    setCols: string[],
    txnConn: any,
  ): Promise<{ modifiedCount: number }> {
    const safeIdCol = assertSafeSqlIdentifier(idColName, "column");
    const colMeta = setCols.map((col) => {
      const phys = this.getColumn(table, col);
      const physName = phys?.name ?? col;
      const isJson = physName === "data" || (phys as any)?.dataType === "json";
      return { col, safeCol: assertSafeSqlIdentifier(physName, "column"), isJson };
    });
    const physCols = colMeta.filter((m) => !m.isJson);
    const dataCol = colMeta.find((m) => m.isJson);

    // Constant JSON_TABLE column shape per column set:
    //   $[0] = id, then (val, pres) per physical column, then (data_val, data_mode).
    // The JOIN compares in utf8mb4_bin (explicit collation beats the implicit
    // column collation), so it works for BOTH table collations in the fleet —
    // boot tables (utf8mb4_unicode_ci) and collection tables created under the
    // MariaDB 12 server default (utf8mb4_uca1400_ai_ci). Pinning the derived
    // columns to unicode_ci alone used to raise error 1267 (illegal mix of
    // collations) on default-collation tables, silently bailing the whole batch
    // into the per-row fallback loop. UUID ids are ASCII, so binary equality is
    // exact. The derived-column pins stay for the literal comparisons (c0_pres
    // = '1'), which have no collation conflict either way.
    const defs: string[] = ["_unnest_id VARCHAR(36) COLLATE utf8mb4_unicode_ci PATH '$[0]'"];
    const setPairs: string[] = [];
    physCols.forEach((m, i) => {
      const valIdx = 1 + i * 2;
      const presIdx = 2 + i * 2;
      defs.push(
        `c${i}_val VARCHAR(16383) COLLATE utf8mb4_unicode_ci PATH '$[${valIdx}]'`,
        `c${i}_pres VARCHAR(1) COLLATE utf8mb4_unicode_ci PATH '$[${presIdx}]'`,
      );
      setPairs.push(
        `\`${m.safeCol}\` = CASE WHEN v.c${i}_pres = '1' THEN v.c${i}_val ELSE t.\`${m.safeCol}\` END`,
      );
    });
    if (dataCol) {
      const dataIdx = 1 + physCols.length * 2;
      defs.push(
        `data_val JSON PATH '$[${dataIdx}]'`,
        `data_mode VARCHAR(5) COLLATE utf8mb4_unicode_ci PATH '$[${dataIdx + 1}]'`,
      );
      setPairs.push(
        `\`${dataCol.safeCol}\` = CASE
          WHEN v.data_mode = 'patch' THEN JSON_MERGE_PATCH(COALESCE(t.\`${dataCol.safeCol}\`, '{}'), JSON_UNQUOTE(v.data_val))
          WHEN v.data_mode = 'set' THEN JSON_UNQUOTE(v.data_val)
          ELSE t.\`${dataCol.safeCol}\`
        END`,
      );
    }

    const rawSql = `UPDATE \`${safeTableName}\` t JOIN JSON_TABLE(?, '$[*]' COLUMNS(${defs.join(
      ", ",
    )})) AS v ON t.\`${safeIdCol}\` = v._unnest_id COLLATE utf8mb4_bin${tenantSql} SET ${setPairs.join(", ")}`;

    const encodeCell = (v: unknown): unknown => {
      if (v === undefined) return null;
      if (v instanceof Date) return AdapterCore.mariaDateString(v);
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v !== null && typeof v === "object") return JSON.stringify(v);
      if (typeof v === "string" && v.length > 16_000) {
        throw new Error("BULK_JSON_CELL_TOO_LARGE");
      }
      return v;
    };

    // Pre-build ALL chunk documents before executing anything: a cell that is
    // too large for a derived VARCHAR (or any encoding surprise) must bail to
    // the CASE path BEFORE the first chunk commits (batch is all-or-nothing).
    const maxRowsPerChunk = 500;
    const chunkDocs: string[] = [];
    for (let start = 0; start < prepared.length; start += maxRowsPerChunk) {
      const chunk = prepared.slice(start, start + maxRowsPerChunk);
      const rows: unknown[][] = chunk.map((values) => {
        const row: unknown[] = [String(values[idColName])];
        for (const m of physCols) {
          const has = Object.hasOwn(values, m.col);
          row.push(has ? encodeCell(values[m.col]) : null, has ? "1" : "0");
        }
        if (dataCol) {
          if (getJsonDataPatch(values) !== undefined) {
            row.push(encodeCell(values.data), "patch");
          } else if (Object.hasOwn(values, "data")) {
            row.push(encodeCell(values.data), "set");
          } else {
            row.push(null, "keep");
          }
        }
        return row;
      });
      chunkDocs.push(JSON.stringify(rows));
    }

    let modifiedCount = 0;
    const runChunks = async (rawExec: (sql: string, params?: any[]) => Promise<any>) => {
      for (const doc of chunkDocs) {
        const res = await rawExec(rawSql, [doc, ...tenantParams]);
        modifiedCount += Number((res as any)?.affectedRows ?? 0);
      }
    };

    await this.runBulkUpdateChunks(txnConn, runChunks);

    return { modifiedCount };
  }

  /**
   * Legacy bulk UPDATE via per-column CASE ladders — the pre-JSON_TABLE path.
   * Still used on MariaDB < 10.6 servers and whenever the JSON_TABLE fast path
   * bails out (oversized cells). Kept verbatim so the two strategies are
   * interchangeable with identical null-presence and patch semantics.
   */
  private async rawBulkUpdateCaseLadder(
    table: any,
    safeTableName: string,
    idColName: string,
    tenantSql: string,
    tenantParams: unknown[],
    prepared: any[],
    setCols: string[],
    txnConn: any,
  ): Promise<{ modifiedCount: number }> {
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
        const chunkIds = prepared
          .slice(start, start + maxRowsPerChunk)
          .map((v: any) => String(v[idColName]));

        const setPairs: string[] = [];
        const params: unknown[] = [];
        for (const col of setCols) {
          const phys = this.getColumn(table, col);
          const safeCol = assertSafeSqlIdentifier(phys?.name ?? col, "column");
          const isJson = phys?.name === "data" || (phys as any)?.dataType === "json";
          const jsonWrap =
            isJson && chunk.some((v) => getJsonDataPatch(v) !== undefined)
              ? this.jsonMergeWrapper(`\`${safeCol}\``)
              : null;

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
            setPairs.push(
              jsonWrap
                ? `\`${safeCol}\` = ${jsonWrap.prefix}?${jsonWrap.suffix}`
                : `\`${safeCol}\` = ?`,
            );
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
          const safeIdCol = assertSafeSqlIdentifier(idColName, "column");
          const caseSql = `CASE \`${safeIdCol}\` ${whens.join(" ")} ELSE \`${safeCol}\` END`;
          setPairs.push(
            jsonWrap
              ? `\`${safeCol}\` = ${jsonWrap.prefix}${caseSql}${jsonWrap.suffix}`
              : `\`${safeCol}\` = ${caseSql}`,
          );
        }

        const idPlaceholders = chunkIds.map(() => "?").join(", ");
        const rawSql = `UPDATE \`${safeTableName}\` SET ${setPairs.join(", ")} WHERE \`${assertSafeSqlIdentifier(idColName, "column")}\` IN (${idPlaceholders})${tenantSql}`;
        const res = await rawExec(rawSql, [...params, ...chunkIds, ...tenantParams]);
        modifiedCount += Number((res as any)?.affectedRows ?? 0);
      }
    };

    await this.runBulkUpdateChunks(txnConn, runChunks);

    return { modifiedCount };
  }

  /**
   * Execute a batch's chunks on the transaction connection when one is active,
   * otherwise on one pinned pool connection wrapped in BEGIN/COMMIT so the
   * whole batch is all-or-nothing.
   */
  private async runBulkUpdateChunks(
    txnConn: any,
    runChunks: (rawExec: (sql: string, params?: any[]) => Promise<any>) => Promise<void>,
  ): Promise<void> {
    if (txnConn) {
      await runChunks(async (sql: string, params: any[] = []) => {
        const [rows] = await txnConn.execute(sql, params);
        return rows;
      });
      return;
    }
    const pool = this.pool;
    if (!pool) throw new Error("Pool unavailable");
    // One pinned connection for the whole batch → atomic (mysql2 promise
    // Pool has no beginTransaction; transactions live on a connection).
    const conn = await pool.getConnection();
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
        const safeField = assertSafeSqlIdentifier(field);
        const amountNum = assertFiniteAmount(amount);
        const idStr = String(id);
        const dataCol = this.getColumn(table, "data");
        // 🚀 ROW-STORE HYBRID: materialized numeric fields live in a column —
        // increment the column directly (JSON_SET on `data` would no-op for new
        // rows whose field never entered the blob).
        const fieldIsColumn = !!this.getColumn(table, field);
        const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");
        const idColName = idCol.name || "_id";

        if (options.skipReturning === true) {
          let header: unknown;
          if (dataCol && !fieldIsColumn) {
            header = await this.mariaExecJsonIncrement(
              (token) =>
                `UPDATE \`${tableName}\` SET \`data\` = ${this.mariaJsonSetExpr(token)}, \`updatedAt\` = NOW() WHERE \`${idColName}\` = ?${tenantSql}`,
              (pathParams) => [...pathParams, amountNum, idStr, ...tenantParams],
              safeField,
            );
          } else {
            header = await this.raw.execute(
              `UPDATE \`${tableName}\` SET \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() WHERE \`${idColName}\` = ?${tenantSql}`,
              [amountNum, idStr, ...tenantParams],
            );
          }
          const affected = Number((header as { affectedRows?: number })?.affectedRows ?? 0);
          if (affected === 0) throw new Error(`Entry not found after increment: ${idStr}`);
          return { _id: idStr };
        }

        if (this._returningSupported !== false) {
          try {
            // Prefer single-round-trip upsert with bound params when RETURNING is available.
            const upsertSql = fieldIsColumn
              ? `INSERT INTO \`${tableName}\` (\`_id\`, \`${safeField}\`, \`updatedAt\`) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() RETURNING *`
              : `INSERT INTO \`${tableName}\` (\`_id\`, \`${safeField}\`, \`updatedAt\`) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE \`${safeField}\` = COALESCE(\`${safeField}\`, 0) + ?, \`updatedAt\` = NOW() RETURNING *`;

            const upsertParams = [idStr, amountNum, amountNum];

            const rows =
              dataCol && !fieldIsColumn
                ? ((await this.mariaExecJsonIncrement(
                    (token) =>
                      `INSERT INTO \`${tableName}\` (\`_id\`, \`data\`, \`updatedAt\`) VALUES (?, '{}', NOW()) ON DUPLICATE KEY UPDATE \`data\` = ${this.mariaJsonSetExpr(token)}, \`updatedAt\` = NOW() RETURNING *`,
                    (pathParams) => [idStr, ...pathParams, amountNum],
                    safeField,
                  )) as any[])
                : ((await this.raw.execute(upsertSql, upsertParams)) as any[]);
            if (Array.isArray(rows) && rows.length > 0) {
              this._returningSupported = true;
              return convertDatesToISO(rows[0], {
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
          await this.mariaExecJsonIncrement(
            (token) =>
              `UPDATE \`${tableName}\` SET \`data\` = ${this.mariaJsonSetExpr(token)}, \`updatedAt\` = NOW() WHERE \`${idColName}\` = ?${tenantSql}`,
            (pathParams) => [...pathParams, amountNum, idStr, ...tenantParams],
            safeField,
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

        return convertDatesToISO(fallbackRows[0], {
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
    const tableName = schemaData._id || schemaData.id || schemaData.name || schemaData.slug;
    if (!tableName) throw new Error("Schema must have an _id or name");

    const normalizedName = tableName.replace(/-/g, "");

    // Same registry contract as PostgreSQL: the Drizzle def must list
    // materialized columns even when this process skips DDL.
    this.rememberMaterializedColumns(schemaData);

    // Declared `renamedFrom` must run even when the table is already provisioned.
    // Schemas with no rename skip the catalog (hasDeclaredFieldRename is false).
    if (hasDeclaredFieldRename(schemaData.fields)) {
      const renameTable = this.getTable(normalizedName);
      const renamePhysical = getTableName(renameTable as any);
      await applyDeclaredFieldRenames({
        dialect: "mariadb",
        tableKey: `mariadb:${normalizedName}`,
        physicalName: renamePhysical,
        fields: schemaData.fields,
        listColumns: async () => {
          const names = new Set<string>();
          try {
            const res = await this.raw.execute(`SHOW COLUMNS FROM \`${renamePhysical}\``);
            const rows = Array.isArray(res) ? res : [];
            for (const row of rows) {
              const fieldName = (row as { Field?: unknown }).Field;
              if (fieldName) names.add(String(fieldName));
            }
          } catch {
            /* table may not exist yet */
          }
          return names;
        },
        execute: (sqlText: string, params?: unknown[]) =>
          this.raw.execute(sqlText, params as any[]),
      });
    }

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
        // 🚀 COMPOSITE-INDEX POLICY: the covering `(tenantId, status, col, _id)`
        // index is provisioned only for declared query targets (indexed fields,
        // numeric sort columns, the publishedAt base column) — see
        // `buildCompositeIndexColumns`. Every extra index is maintained on EVERY
        // write, and InnoDB has no HOT equivalent, so an unused covering index is
        // pure write amplification (PostgreSQL twin measured: +11–17 % per index).
        const compositeCols = buildCompositeIndexColumns(schemaData.fields);

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          const materialized = new Map<string, string>();
          for (const field of schemaData.fields) {
            // Row-store hybrid: scalar fields become physical columns — the
            // `data` blob keeps only dynamic fields for new rows.
            if (shouldMaterializeField(field)) {
              const fieldName = field.db_fieldName || field.label;
              if (fieldName) {
                let colType = "VARCHAR(255)";
                const exact = materializedSqlType("mariadb", field.type);
                if (exact) {
                  colType = exact;
                } else if (field.type === "boolean") {
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
            const colName = assertSafeSqlIdentifier(col.name, "column");
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
                const safeColName = assertSafeSqlIdentifier(col.name, "column");
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
            const colName = assertSafeSqlIdentifier(colNameRaw, "column");
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${physicalName}\` (\`${colName}\`)`,
            );
            // 🚀 Covering composite index for filter+sort — provisioned only for
            // declared query targets (see buildCompositeIndexColumns):
            // WHERE tenantId=? AND status=? ORDER BY colName, _id
            if (compositeCols.has(colNameRaw)) {
              await this.raw.execute(
                `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_status_${colName}_id\` ON \`${physicalName}\` (\`tenantId\`, \`status\`, \`${colName}\`, \`_id\`)`,
              );
            }
          } catch {
            /* safe */
          }
        }

        // 🔻 COMPOSITE CLEANUP: legacy tables carry the covering index for every
        // materialized column. Dropping the ones the policy no longer provisions
        // is what makes the per-write saving real on upgrades; after the first
        // boot it is a name lookup that finds nothing.
        for (const colNameRaw of dynamicCols) {
          if (compositeCols.has(colNameRaw)) continue;
          try {
            const colName = assertSafeSqlIdentifier(colNameRaw, "column");
            await this.raw.execute(
              `DROP INDEX IF EXISTS \`${physicalName}_tenant_status_${colName}_id\``,
            );
          } catch {
            /* safe */
          }
        }

        // 🔻 REDUNDANT TWIN REMOVED: `..._tenant_status_updated` (tenantId, status,
        // updatedAt) is a strict prefix of the keyset variant below — the same seek
        // and the same output order, so it served no plan the tiebreaker index
        // cannot, while every UPDATE paid a second index maintenance + redo entry.
        // Dropped explicitly — no legacy twin is left behind.
        try {
          await this.raw.execute(`DROP INDEX IF EXISTS \`${physicalName}_tenant_status_updated\``);
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
        // 🔻 REDUNDANT TWIN REMOVED (see above) — `..._tenant_updated` is the
        // non-tiebreaker prefix of the keyset variant that follows.
        try {
          await this.raw.execute(`DROP INDEX IF EXISTS \`${physicalName}_tenant_updated\``);
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

  // --------------------------------------------------------------------------
  // Per-Tenant Dedicated Connection Pool Partitioning (Phase 4)
  // --------------------------------------------------------------------------

  /**
   * Sets the tenant context for the current request context.
   * Directs raw statement execution to the dedicated tenant pool slice when configured.
   */
  public setTenantContext(tenantId: string | null): void {
    this._currentTenantId = tenantId;
  }

  /**
   * Retrieves or creates a dedicated connection pool slice for a tenant.
   */
  public getTenantPool(tenantId: string): mysql.Pool {
    const existing = this._tenantPools.get(tenantId);
    if (existing) return existing;

    if (!this._rawPoolConfig) {
      throw new Error(
        "[MariaDBAdapter] MariaDB is not connected — cannot create dedicated tenant pool",
      );
    }

    const poolSize = parseInt(process.env.TENANT_DB_POOL_SIZE || "10", 10);
    const tenantConfig = {
      ...this._rawPoolConfig,
      connectionLimit: poolSize,
    };

    const pool = mysql.createPool(tenantConfig);
    this._tenantPools.set(tenantId, pool);
    logger.debug(`Created dedicated connection pool for tenant "${tenantId}" (max: ${poolSize})`);
    return pool;
  }

  /**
   * Registers a dedicated connection URL or config for a specific tenant.
   * Replaces any existing pool for that tenant.
   */
  public setTenantPool(
    tenantId: string,
    connectionUrlOrConfig: string | Record<string, any>,
  ): void {
    const existing = this._tenantPools.get(tenantId);
    if (existing) {
      existing.end().catch(() => {
        logger.debug(`Failed to close existing pool for tenant "${tenantId}"`);
      });
    }

    const poolSize = parseInt(process.env.TENANT_DB_POOL_SIZE || "10", 10);
    let pool: mysql.Pool;
    // Parity with the main pool (connect()): keepalive + prepared-statement
    // budget so dedicated tenant pools do not silently lose the tuned options.
    const poolTuning = {
      connectionLimit: poolSize,
      waitForConnections: true,
      charset: "utf8mb4",
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      maxPreparedStatements: Number(process.env.MARIADB_MAX_PREPARED || 2000),
    };
    if (typeof connectionUrlOrConfig === "string") {
      pool = mysql.createPool({
        uri: connectionUrlOrConfig,
        ...poolTuning,
      });
    } else {
      pool = mysql.createPool({
        ...connectionUrlOrConfig,
        ...poolTuning,
      });
    }

    this._tenantPools.set(tenantId, pool);
    logger.info(`Configured dedicated connection pool for tenant "${tenantId}" (max: ${poolSize})`);
  }

  /**
   * Closes and removes the dedicated connection pool for a tenant.
   */
  public async closeTenantPool(tenantId: string): Promise<void> {
    const pool = this._tenantPools.get(tenantId);
    if (pool) {
      await pool.end();
      this._tenantPools.delete(tenantId);
      logger.info(`Closed dedicated connection pool for tenant "${tenantId}"`);
    }
  }

  /**
   * Closes and removes all dedicated connection pools across all tenants.
   */
  public async closeAllTenantPools(): Promise<void> {
    if (this._tenantPools.size === 0) return;
    const entries = Array.from(this._tenantPools.entries());
    this._tenantPools.clear();
    this._currentTenantId = null;

    await Promise.all(
      entries.map(([tenantId, pool]) =>
        pool
          .end()
          .catch((err: unknown) =>
            logger.warn(`Failed to close pool for tenant "${tenantId}":`, err),
          ),
      ),
    );
    logger.info("Closed all per-tenant connection pools in MariaDB");
  }

  // --------------------------------------------------------------------------
  // Dynamic JSON Field Sort Indexing (MariaDB W1 Resolution)
  // --------------------------------------------------------------------------

  private static readonly SORT_EXPR_FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  private static readonly MAX_DYNAMIC_SORT_INDEXES = 64;
  private _dynamicSortIndexes = new Map<string, "requested" | "done">();

  /**
   * Schedule a lazy index for a dynamic JSON field sorted via `JSON_UNQUOTE(JSON_EXTRACT(data, '$.field'))`.
   * Resolves the MariaDB W1 scale cliff (4.25 s at 1M rows down to index seeks).
   * In MariaDB 10.6+ / 12.3+, this creates an expression index or generated virtual column index fire-and-forget.
   */
  protected override onDynamicSort(collection: string, tableName: string, field: string): void {
    if (process.env.SVELTY_LAZY_SORT_INDEXES === "0") return;
    if (field.includes(".") || !AdapterCore.SORT_EXPR_FIELD_RE.test(field)) return;
    const table = this.getTable(collection);
    // If field is already a physical column on the table, an expression index on data is unnecessary
    if (table && this.getColumn(table, field)) return;

    const key = `${collection}\0${field}`;
    if (this._dynamicSortIndexes.has(key)) return;
    this._dynamicSortIndexes.set(key, "requested");
    this.evictIfFull(this._dynamicSortIndexes, AdapterCore.MAX_DYNAMIC_SORT_INDEXES);

    const safeTable = assertSafeSqlIdentifier(tableName, "table");
    const rawIndexName = `${tableName}_${field}_expr_idx`;
    const indexName = assertSafeSqlIdentifier(boundedSqlIndexName(rawIndexName), "index");

    void (async () => {
      try {
        // MariaDB 10.6+ supports expression indexes directly: CREATE INDEX ... ON table ((JSON_UNQUOTE(JSON_EXTRACT(data, '$.field'))))
        await this.raw.execute(
          `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${safeTable}\` ((JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${field}'))))`,
        );
        this._dynamicSortIndexes.set(key, "done");
      } catch (err: unknown) {
        // Fallback: if functional index syntax is restricted or field extraction fails, unmark to allow retry or fallback scan
        this._dynamicSortIndexes.delete(key);
        logger.debug(
          `[MariaDB] onDynamicSort index failed for ${tableName}.${field}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
  }
}
