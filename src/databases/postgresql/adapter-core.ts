/**
 * @file src/databases/postgresql/adapter-core.ts
 * @description
 * Core functionality for PostgreSQL database adapter.
 *
 * Responsibilities include:
 * - Establishing connection to PostgreSQL using postgres.js.
 * - Implementing PostgreSQL-specific CRUD hooks and table provisioning.
 *
 * ### Features:
 * - connection pooling and health checks
 * - native postgres JSONB querying
 * - optimized single-statement atomic increment
 * - PgBouncer compatibility (DATABASE_PREPARE flag)
 * - read replica support
 * - per-tenant connection pooling for enterprise isolation
 */

import { logger } from "@src/utils/logger";
import { SqlAdapterCore } from "../core/sql-adapter-core";
import type {
  BaseQueryOptions,
  DatabaseCapabilities,
  DatabaseResult,
  DatabaseId,
} from "../db-interface";
import * as helpers from "../core/drizzle-sql-helpers";
import { getTableName } from "drizzle-orm";
import * as schema from "./schema";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as drizzleSql, type SQL } from "drizzle-orm";
import { pgTable, varchar, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";
import { generateUUID } from "@src/utils/native-utils";

export abstract class PostgresAdapterCore extends SqlAdapterCore {
  public type = "postgresql";
  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: true,
    supportsAggregation: true,
    supportsStreaming: true,
    supportsPartitioning: true,
    maxBatchSize: 1000,
    maxQueryComplexity: 100,
  };

  public sql: ReturnType<typeof postgres> | null = null;
  public get db(): PostgresJsDatabase<typeof schema> {
    if (!this._db) {
      throw new Error(
        `[PostgreSQLAdapter] Database not connected (state: ${this.connected ? "connected" : "idle"})`,
      );
    }
    return this._db;
  }

  private _db: PostgresJsDatabase<typeof schema> | null = null;
  private _readDb: PostgresJsDatabase<typeof schema> | null = null;
  private replicaSqls = new Map<string, ReturnType<typeof postgres>>();
  private allReplicaSqls: ReturnType<typeof postgres>[] = [];

  // --------------------------------------------------------------------------
  // Per-Tenant Connection Pools
  // --------------------------------------------------------------------------

  /** Map of tenant ID to dedicated postgres.js connection pool */
  private _tenantPools = new Map<string, ReturnType<typeof postgres>>();
  /** The tenant ID for the current request context, set by setTenantContext() */
  private _currentTenantId: string | null = null;

  protected _transactionModule?: import("./transaction-module").TransactionModule;

  // --------------------------------------------------------------------------
  // Abstract hook implementations
  // --------------------------------------------------------------------------

  /** PostgreSQL supports RETURNING on INSERT and UPDATE. */
  protected get insertReturnsRows(): boolean {
    return true;
  }

  protected get updateReturnsRows(): boolean {
    return true;
  }

  protected get useDynamicSqlInFindMany(): boolean {
    return true;
  }

  /**
   * Raw prepared-SQL findById: postgres.js caches parsed statements by SQL
   * text, so a stable parameterized SELECT skips Drizzle's per-call AST
   * building + SQL string construction (~30-80µs/call on hot reads).
   */
  protected get useRawFindById(): boolean {
    return true;
  }

  protected async rawInsertReturning<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    values: Record<string, any>,
    options: BaseQueryOptions,
  ): Promise<T | null> {
    // Inside an outer transaction the pool-level unsafe() would commit the
    // insert immediately (bypassing rollback) — defer to the base Drizzle
    // path which routes through options.transaction.db.
    if (options?.transaction) return null;
    try {
      const tableName = getTableName(table);
      const valuesCols = Object.keys(values);
      if (valuesCols.length === 0) return null;

      // 🚀 NO-READ-BACK INSERT: the returned row is synthesized from the
      // prepared values + column defaults instead of RETURNING * (saves the
      // row materialization + jsonb parse on the write round trip). Exact for
      // CMS tables — the Drizzle def mirrors the DDL and there are no
      // triggers/generated columns. If the table shape is unknown, bail out
      // BEFORE inserting so the base Drizzle path can RETURNING normally.
      let synthesized: Record<string, any>;
      try {
        synthesized = this.synthesizeInsertRow(table, values);
      } catch {
        return null;
      }

      // postgres.js 3.x removed sql.join — one flat unsafe() call with explicit
      // prepare:true gives the same stable-SQL-text statement-cache hit as
      // nested fragments with a fraction of the per-call allocation. Dates and
      // objects bind as strings (describe-phase Bind quirk, see above). Bind
      // the SYNTHESIZED row: all columns defined (defaults + NULLs), so
      // postgres.js never substitutes undefined params client-side — stable
      // SQL text + full bind list on the prepared statement.
      const synthCols = Object.keys(synthesized);
      const colList = synthCols
        .map((c) => {
          // Drizzle def property names may differ from physical column names
          // (e.g. plugin_storage: collectionName → `collection`).
          const phys = this.getColumn(table, c);
          return `"${utils.assertSafeSqlIdentifier(phys?.name ?? c, "column")}"`;
        })
        .join(", ");
      const boundValues = synthCols.map((c) => {
        const v = synthesized[c];
        if (v instanceof Date) return (v as Date).toISOString();
        if (v !== null && typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
        return v;
      });
      const sqlText = `INSERT INTO "${tableName}" (${colList}) VALUES (${synthCols
        .map((_, i) => `$${i + 1}`)
        .join(", ")})`;
      await this.sql!.unsafe(sqlText, boundValues, { prepare: true });
      return utils.convertDatesToISO(synthesized, {
        ...this.convertDatesOptions,
        table: collection,
      }) as unknown as T;
    } catch {
      return null;
    }
  }

  /**
   * Raw multi-VALUES INSERT fast path — mirrors the SQLite insertMany path:
   * one prepared statement per chunk (stable SQL text → postgres.js statement
   * cache) instead of Drizzle's per-call AST build. Chunked under the 65535
   * bind-parameter limit; falls back to the base Drizzle path on any error or
   * when inside an outer transaction. skipReturning (seed/outbox callers)
   * skips the RETURNING read-back and returns the prepared values as-is.
   */
  override async insertMany<T extends import("../db-interface").BaseEntity>(
    collection: string,
    data: import("../db-interface").EntityCreate<T>[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    if (!data || data.length === 0) return { success: true, data: [] };
    const skipReturning = (options as any)?.skipReturning === true;
    const inOuterTxn = Boolean(options?.transaction);
    if (!inOuterTxn) {
      try {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Table not found: ${collection}`);
        const now = new Date();
        const len = data.length;
        const batchValues: Record<string, any>[] = Array.from({ length: len });
        for (let i = 0; i < len; i++) {
          const item = data[i];
          const id = (item as any)._id || generateUUID();
          batchValues[i] = this.prepareValues(table, item, id, now, options);
        }
        // Union of column keys across rows — rows may omit optional physical
        // columns (status/slug/…) and the DB default fills them.
        const cols = new Set<string>();
        for (let i = 0; i < len; i++) {
          for (const k in batchValues[i]) cols.add(k);
        }
        if (cols.size > 0) {
          const maxParams = 65000; // PG limit is 65535; headroom for safety
          const chunkSize = Math.max(1, Math.floor(maxParams / cols.size));
          const colList = Array.from(cols)
            .map((c) => `"${utils.assertSafeSqlIdentifier(c, "column")}"`)
            .join(", ");
          const rowsOut: any[] = [];
          for (let start = 0; start < len; start += chunkSize) {
            const chunk = batchValues.slice(start, start + chunkSize);
            const params: any[] = [];
            const valuesSql: string[] = [];
            for (let r = 0; r < chunk.length; r++) {
              const row = chunk[r];
              const rowPlaceholders: string[] = [];
              for (const c of cols) {
                const v = row[c];
                // Missing/undefined values bind as literal DEFAULT — binding
                // undefined through postgres.js renders client-side 'default'
                // and desyncs the prepared-statement bind count.
                if (v === undefined) {
                  rowPlaceholders.push("default");
                  continue;
                }
                // String-bound dates/objects (describe-phase Bind quirk).
                if (v instanceof Date) params.push((v as Date).toISOString());
                else if (v !== null && typeof v === "object" && !Array.isArray(v))
                  params.push(JSON.stringify(v));
                else params.push(v);
                rowPlaceholders.push(`$${params.length}`);
              }
              valuesSql.push(`(${rowPlaceholders.join(", ")})`);
            }
            const sqlText = `INSERT INTO "${getTableName(table)}" (${colList}) VALUES ${valuesSql.join(", ")}${skipReturning ? "" : " RETURNING *"}`;
            const rows = await this.sql!.unsafe(sqlText, params, { prepare: true });
            if (Array.isArray(rows) && rows.length > 0) rowsOut.push(...rows);
          }
          if (skipReturning) {
            return { success: true as const, data: batchValues as unknown as T[] };
          }
          if (rowsOut.length === len) {
            return {
              success: true as const,
              data: utils.convertArrayDatesToISO(rowsOut, {
                ...this.convertDatesOptions,
                table: collection,
              }) as T[],
            };
          }
        }
      } catch {
        /* fall through to the base Drizzle path */
      }
    }
    return super.insertMany(collection, data, options);
  }

  protected async rawFindById<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    id: import("../db-interface").DatabaseId,
    options: import("../db-interface").FindOptions<T>,
  ): Promise<T | null> {
    try {
      const tableName = getTableName(table);
      const tenantId =
        options?.tenantId && options?.tenantId !== "global" ? options.tenantId : null;
      // Projection-aware: skip the jsonb data blob when all requested fields
      // are physical columns (avoids jsonb deserialization on hot reads).
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
        .map((c) => `"${c}"`)
        .join(", ");
      // Tagged template (NOT unsafe): postgres.js caches prepared statements by
      // SQL text, so this stable query gets parse-once + bind/execute reuse.
      // Identifiers are inlined via sql.unsafe fragments (stable SQL text);
      // only _id/tenantId are bound values.
      const selectFragment = this.sql!.unsafe(selectCols);
      const tableFragment = this.sql!.unsafe(tableName);
      const rows = tenantId
        ? await this.sql!`SELECT ${selectFragment} FROM ${tableFragment} WHERE "_id" = ${String(
            id,
          )} AND "tenantId" = ${String(tenantId)} LIMIT 1`
        : await this.sql!`SELECT ${selectFragment} FROM ${tableFragment} WHERE "_id" = ${String(
            id,
          )} LIMIT 1`;
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
      logger.debug("[PostgreSQL raw findById] falling back to Drizzle:", rawErr?.message);
      return null;
    }
  }

  /**
   * Raw single-statement UPDATE…RETURNING (or no-read-back UPDATE) for PG —
   * same tagged-template statement-cache pattern as rawInsertReturning.
   * Skipping the read-back is opt-in (skipReturning) for full-document callers;
   * the returned row is reconstructed from the prepared values.
   */
  override async update<T extends import("../db-interface").BaseEntity>(
    collection: string,
    id: import("../db-interface").DatabaseId,
    data: import("../db-interface").EntityUpdate<T>,
    options: import("../db-interface").BaseQueryOptions = {},
  ): Promise<import("../db-interface").DatabaseResult<T>> {
    // Inside an outer transaction the pool-level sql! fragments would bypass
    // the txn connection — defer to the base Drizzle path (txn-aware).
    if (options?.transaction) {
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
      const values = this.prepareValues(table, d, id, new Date(), options);
      delete values[idColName];
      delete values["id"];
      const cols = Object.keys(values);
      if (cols.length === 0) return super.update(collection, id, data, options);

      // Bound SET pairs via nested fragments (stable SQL text → prepared cache);
      // dates/objects bind as strings (describe-phase Bind quirk, same as insert).
      const setFrags = cols.map((c) => {
        const v = values[c];
        const bound =
          v instanceof Date
            ? (v as Date).toISOString()
            : v !== null && typeof v === "object" && !Array.isArray(v)
              ? JSON.stringify(v)
              : v;
        // Drizzle def property names may differ from physical column names
        // (e.g. plugin_storage: collectionName → `collection`).
        const phys = this.getColumn(table, c);
        return this.sql!`"${this.sql!.unsafe(
          utils.assertSafeSqlIdentifier(phys?.name ?? c, "column"),
        )}" = ${bound}`;
      });
      let setFrag = setFrags[0];
      for (let i = 1; i < setFrags.length; i++) {
        setFrag = this.sql!`${setFrag}, ${setFrags[i]}`;
      }

      const skipReturning = (options as any)?.skipReturning === true;
      const tenantId =
        options?.tenantId && options?.tenantId !== "global" ? String(options.tenantId) : null;
      const tableFrag = this.sql!.unsafe(getTableName(table));
      if (skipReturning) {
        await (tenantId
          ? this.sql!`UPDATE ${tableFrag} SET ${setFrag} WHERE "${this.sql!.unsafe(
              idColName,
            )}" = ${String(id)} AND "tenantId" = ${tenantId}`
          : this.sql!`UPDATE ${tableFrag} SET ${setFrag} WHERE "${this.sql!.unsafe(
              idColName,
            )}" = ${String(id)}`);
        const reconstructed = {
          ...values,
          [idColName]: id,
        } as Record<string, unknown>;
        const finalData = utils.convertDatesToISO(reconstructed, {
          ...this.convertDatesOptions,
          table: collection,
        }) as unknown as T;
        return this.wrap(
          async () =>
            this.hooks.length > 0
              ? await this.runHooks("after", "update", collection, finalData, options)
              : finalData,
          "UPDATE_FAILED",
          undefined,
          { ...options, isWrite: true },
        );
      }

      const rows = await (tenantId
        ? this.sql!`UPDATE ${tableFrag} SET ${setFrag} WHERE "${this.sql!.unsafe(
            idColName,
          )}" = ${String(id)} AND "tenantId" = ${tenantId} RETURNING *`
        : this.sql!`UPDATE ${tableFrag} SET ${setFrag} WHERE "${this.sql!.unsafe(
            idColName,
          )}" = ${String(id)} RETURNING *`);
      if (Array.isArray(rows) && rows.length > 0) {
        const finalData = utils.convertDatesToISO(rows[0], {
          ...this.convertDatesOptions,
          table: collection,
        }) as unknown as T;
        return this.wrap(
          async () =>
            this.hooks.length > 0
              ? await this.runHooks("after", "update", collection, finalData, options)
              : finalData,
          "UPDATE_FAILED",
          undefined,
          { ...options, isWrite: true },
        );
      }
    } catch {
      /* fall back to the base Drizzle path */
    }
    return super.update(collection, id, data, options);
  }

  protected isMissingTableError(err: any): boolean {
    return err?.code === "42P01";
  }

  public readonly schema = schema;

  public getJsonField(field: string): SQL {
    if (field.includes(".")) {
      const path = `{${field.split(".").join(",")}}`;
      return drizzleSql`data#>>${path}`;
    }
    return drizzleSql`data->>${field}`;
  }

  protected coerceJsonValue(val: unknown): unknown {
    // data->> returns text; bind scalars as text so `text = boolean/numeric`
    // never throws and JSON-stored booleans/numbers actually match.
    return typeof val === "boolean" || typeof val === "number" ? String(val) : val;
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

      // 🚀 ROW-STORE HYBRID: materialized scalar fields (populated by
      // createModel) exist in the Drizzle def so filters/sorts/writes use the
      // column; the `data` blob keeps only dynamic fields. Previously the
      // physical columns created by createModel were never registered in the
      // runtime table def — dead columns.
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
  // Read Replicas
  // --------------------------------------------------------------------------

  public getSql(mode: "read" | "write" = "write"): ReturnType<typeof postgres> {
    if (!this.sql) throw new Error("Database not connected");

    // If a per-tenant dedicated pool is active, use it for full
    // connection-level isolation instead of the shared pool.
    if (this._currentTenantId && this._tenantPools.has(this._currentTenantId)) {
      return this._tenantPools.get(this._currentTenantId)!;
    }

    if (mode === "write" || this.allReplicaSqls.length === 0) {
      return this.sql;
    }

    const region = (globalThis as any).SVELTY_REGION || "unknown";
    if (this.replicaSqls.has(region)) {
      return this.replicaSqls.get(region)!;
    }

    const index = Math.floor(Math.random() * this.allReplicaSqls.length);
    return this.allReplicaSqls[index];
  }

  public getDrizzle(mode: "read" | "write" = "write"): PostgresJsDatabase<typeof schema> {
    if (mode === "write") return this.db;
    if (this._readDb) return this._readDb;

    const client = this.getSql("read");
    this._readDb = drizzle(client, { schema });
    return this._readDb;
  }

  public configureReplicas(urls: string[] | string): void {
    const replicaUrls = typeof urls === "string" ? (JSON.parse(urls) as string[]) : urls;
    if (!Array.isArray(replicaUrls)) return;
    for (const sql of this.allReplicaSqls)
      sql.end().catch(() => {
        logger.debug("Failed to end PostgreSQL replica SQL during reconfiguration");
      });
    this.allReplicaSqls = [];
    this.replicaSqls.clear();
    if (replicaUrls.length === 0) return;

    for (const urlStr of replicaUrls) {
      try {
        const url = new URL(urlStr);
        const region = url.searchParams.get("region") || "unknown";
        const replicaSql = postgres(urlStr, {
          max: 50,
          transform: { undefined: null },
        });
        this.allReplicaSqls.push(replicaSql);
        if (region !== "unknown") this.replicaSqls.set(region, replicaSql);
      } catch (e) {
        logger.warn(`Failed to initialize replica ${urlStr}:`, e);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

  public getClient(): ReturnType<typeof postgres> | null {
    return this.sql;
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
        throw new Error("Missing PostgreSQL connection configuration.");
      }

      let options: any;

      const { createPostgresOnCloseHandler } = await import("../resilience-integration");
      const onclose = createPostgresOnCloseHandler(
        this as unknown as import("../db-interface").IDBAdapter,
      );

      if (typeof finalConnection === "string") {
        options = {
          max: Number(process.env.DATABASE_MAX_CONNECTIONS) || 100,
          connect_timeout: 30,
          onclose,
        };
        let poolerUrl = process.env.DATABASE_POOLER_URL;
        let effectivePrepare = true;

        if (poolerUrl) {
          const { getDbPoolerConfig } = await import("../config-state");
          const pooler = getDbPoolerConfig ? getDbPoolerConfig() : null;
          if (pooler) {
            poolerUrl = pooler.url || poolerUrl;
            effectivePrepare = pooler.prepare !== false;
          }
        }

        let effectiveConnection = finalConnection;
        if (poolerUrl) {
          effectiveConnection = poolerUrl;
        }

        const url = new URL(effectiveConnection);
        options = {
          host: url.hostname,
          port: Number(url.port || 5432),
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          database: url.pathname.slice(1),
          ssl:
            url.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : false,
          onnotice: () => {},
          onclose,
          transform: { undefined: null },
          max: Number(process.env.DATABASE_MAX_CONNECTIONS) || 100,
          connect_timeout: 10,
          prepare: effectivePrepare,
          idle_timeout: 300,
          max_lifetime: 60 * 60,
          keepalive: true,
          keepaliveInitialDelayMillis: 10000,
          pipeline: true,
          debug: false,
          connection: {
            application_name: "sveltycms",
            statement_timeout: 30000,
          },
        };
      } else {
        const c = (finalConnection || {}) as any;
        const usePrepared = (c.prepare ?? process.env.DATABASE_PREPARE ?? "true") !== "false";

        options = {
          host: c.host || c.DB_HOST || "127.0.0.1",
          port: Number(c.port || c.DB_PORT || 5432),
          user: c.user || c.DB_USER || "postgres",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME,
          max: Number(c.max || process.env.DATABASE_MAX_CONNECTIONS || 100),
          connect_timeout: Number(c.connect_timeout || 10),
          ssl: c.ssl || false,
          onnotice: () => {},
          onclose,
          transform: { undefined: null },
          prepare: usePrepared,
          idle_timeout: Number(c.idle_timeout || 300),
          max_lifetime: Number(c.max_lifetime || 60 * 60),
          keepalive: c.keepalive ?? true,
          keepaliveInitialDelayMillis: Number(c.keepaliveInitialDelayMillis || 10000),
          pipeline: c.pipeline ?? true,
          debug: false,
          connection: {
            application_name: "sveltycms",
            statement_timeout: 30000,
          },
        };
      }

      // Auto-create database if missing
      try {
        this.sql = postgres(finalConnection, options);
        this._db = drizzle(this.sql, { schema });
        await this.sql`SELECT 1`;
        this.connected = true;
        logger.info("Connected to PostgreSQL");
        return { success: true, data: undefined };
      } catch (err: any) {
        const isMissingDb = err.code === "3D000" || err.message?.includes("does not exist");

        if (isMissingDb && typeof finalConnection === "string") {
          const dbName = new URL(finalConnection).pathname.slice(1);
          if (dbName) {
            logger.info(`[postgresql] Database "${dbName}" not found. Attempting auto-creation...`);
            const adminOptions = { ...options, database: "postgres" };
            const adminSql = postgres(
              finalConnection.replace(`/${dbName}`, "/postgres"),
              adminOptions,
            );
            try {
              await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
              await adminSql.end();
              this.sql = postgres(finalConnection, options);
              this._db = drizzle(this.sql, { schema });
              await this.sql`SELECT 1`;
              this.connected = true;
              logger.info("Connected to PostgreSQL");
              return { success: true, data: undefined };
            } catch (createErr) {
              await adminSql.end();
              throw createErr;
            }
          }
        }
        throw err;
      }
    } catch (error) {
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    // Mark as intentional so resilience hooks don't trigger reconnection
    (this as any).__intentionalDisconnect__ = true;
    // Clean up any per-tenant dedicated pools
    await this.closeAllTenantPools();

    if (this.sql) {
      await this.sql.end();
      this.sql = null;
      this._db = null;
      this.connected = false;
      logger.info("Disconnected from PostgreSQL");
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
    if (!(this.connected && this.sql)) {
      return this.notConnectedError();
    }
    const start = Date.now();
    try {
      await this.sql`SELECT 1`;
      const latency = Date.now() - start;
      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: 0,
        },
      };
    } catch (error) {
      return this.handleError(error, "HEALTH_CHECK_FAILED");
    }
  }

  async isEmpty(): Promise<DatabaseResult<boolean>> {
    if (!this.sql) return this.notConnectedError();
    try {
      const result = await this.sql`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      const count = Number(result[0]?.count ?? 0);
      return { success: true, data: count === 0 };
    } catch (error) {
      return this.handleError(error, "CHECK_EMPTY_FAILED");
    }
  }

  public async getConnectionPoolStats(): Promise<
    DatabaseResult<import("../db-interface").ConnectionPoolStats>
  > {
    if (!this.sql) return this.notConnectedError();
    return {
      success: true,
      data: {
        total: 0,
        active: 0,
        idle: 0,
        waiting: 0,
        avgConnectionTime: 0,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Schema & Dynamic Tables
  // --------------------------------------------------------------------------

  public createDynamicTableDefinition(tableName: string, columnsToAdd?: Map<string, string>) {
    const booleanCols: string[] = ["isDeleted"];
    const columns: Record<string, any> = {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      collection: varchar("collection", { length: 255 }),
      slug: varchar("slug", { length: 255 }),
      locale: varchar("locale", { length: 50 }),
      publishedAt: timestamp("publishedAt", { withTimezone: true }),
      data: jsonb("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      isDeleted: boolean("isDeleted").notNull().default(false),
      createdAt: timestamp("createdAt", { withTimezone: true })
        .notNull()
        .default(drizzleSql`CURRENT_TIMESTAMP`),
      updatedAt: timestamp("updatedAt", { withTimezone: true })
        .notNull()
        .default(drizzleSql`CURRENT_TIMESTAMP`),
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
          columns[colName] = integer(colName);
        } else if (colType === "boolean") {
          columns[colName] = boolean(colName);
          booleanCols.push(colName);
        } else {
          columns[colName] = varchar(colName, { length: 255 });
        }
      }
    }

    registerTableSchema(tableName, Object.keys(columns), booleanCols);

    return pgTable(tableName, columns);
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
        if (!this.sql) throw new Error("Database not connected");
        return this.sql.unsafe(sqlText, params);
      },
      client: this.sql,
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
  // Stream Many (PostgreSQL-specific native streaming)
  // --------------------------------------------------------------------------

  public async streamMany<T extends import("../db-interface").BaseEntity>(
    collection: string,
    query: import("../db-interface").QueryFilter<T>,
    options: import("../db-interface").FindOptions<T> = {},
  ): Promise<import("../db-interface").DatabaseResult<AsyncIterable<T>>> {
    return this.wrap(async () => {
      const q =
        this.hooks.length > 0
          ? await this.runHooks("before", "find", collection, query, options)
          : query;
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const where = this.mapQuery(table, q, options);
      let builder = (this.db as any).select().from(table).where(where);
      if (options.limit) builder = builder.limit(options.limit);
      if (options.offset) builder = builder.offset(options.offset);

      const stream = await (builder as any).stream();
      const convertFn = utils.convertDatesToISO;

      async function* generator() {
        for await (const row of stream) {
          yield convertFn(row) as T;
        }
      }

      return generator() as AsyncIterable<T>;
    }, "STREAM_MANY_FAILED");
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

    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info(
        `[upsertNative] Table: ${tableName}, ID: ${values._id}, source: ${values.source}, tenant: ${values.tenantId}`,
      );
    }

    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        // Strip undefined values — Drizzle crashes on undefined column values
        const cleanValues = Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined),
        );
        await (db.insert(resolvedTable).values(cleanValues) as any).onConflictDoUpdate({
          target: conflictTarget,
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

        // Identifiers may be embedded; values (_id, amount, tenantId) are always bound.
        const safeField = utils.assertSafeSqlIdentifier(field);
        const amountNum = utils.assertFiniteAmount(amount);
        const idStr = String(id);
        const dataCol = this.getColumn(table, "data");
        // 🚀 ROW-STORE HYBRID: materialized numeric fields live in a column —
        // increment the column directly (jsonb_set on `data` would no-op for
        // new rows whose field never entered the blob).
        const fieldIsColumn = !!this.getColumn(table, field);

        // $1 = id, $2 = amount, $3 = tenantId (optional)
        const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
          options,
          "postgres",
          { paramIndex: 3 },
        );
        const params: unknown[] = [idStr, amountNum, ...tenantParams];

        const sqlQuery = fieldIsColumn
          ? `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + $2::numeric, "updatedAt" = now() WHERE "${idCol.name}" = $1${tenantSql} RETURNING *`
          : dataCol
            ? `UPDATE "${tableName}" SET "data" = jsonb_set(CASE WHEN jsonb_typeof("data") = 'object' THEN "data" ELSE '{}'::jsonb END, '{${safeField}}', to_jsonb(coalesce((CASE WHEN jsonb_typeof("data") = 'object' THEN "data" ELSE '{}'::jsonb END->>'${safeField}')::numeric, 0) + $2::numeric)), "updatedAt" = now() WHERE "${idCol.name}" = $1${tenantSql} RETURNING *`
            : `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + $2::numeric, "updatedAt" = now() WHERE "${idCol.name}" = $1${tenantSql} RETURNING *`;

        let rows: any[] = [];
        for (let attempt = 0; attempt < 5 && rows.length === 0; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 10 * attempt));
          try {
            rows = (await this.raw.execute(sqlQuery, params)) || [];
          } catch (err: any) {
            if (err?.message?.includes("too many clients") || err?.code === "53300") {
              await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
        if (rows.length === 0) {
          throw new Error(`Entry not found after increment: ${idStr}`);
        }
        return rows[0] as Record<string, unknown>;
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
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.debug(
            `[DB Provision] SVELTY_BENCHMARK_SUITE=${process.env.SVELTY_BENCHMARK_SUITE || "standalone"}`,
          );
        }

        const ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" VARCHAR(36) PRIMARY KEY, "tenantId" VARCHAR(36), "status" VARCHAR(255) DEFAULT 'draft', "isDeleted" BOOLEAN DEFAULT FALSE, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, "data" JSONB);`;

        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.debug(`[DB Provision] [POSTGRESQL] Executing DDL for ${physicalName}`);
        }
        await this.raw.execute(ddl);

        const columns = [
          { name: "isDeleted", type: "BOOLEAN DEFAULT FALSE" },
          { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
          { name: "tenantId", type: "VARCHAR(36)" },
          {
            name: "createdAt",
            type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
          },
          { name: "collection", type: "VARCHAR(255)" },
          { name: "slug", type: "VARCHAR(255)" },
          { name: "locale", type: "VARCHAR(50)" },
          { name: "publishedAt", type: "TIMESTAMP WITH TIME ZONE" },
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
                  colType = "BOOLEAN";
                } else if (field.type === "number" || field.type === "integer") {
                  colType = "INTEGER";
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
                    colType === "INTEGER" ? "integer" : colType === "BOOLEAN" ? "boolean" : "text",
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
            await this.raw.execute(
              `ALTER TABLE "${physicalName}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`,
            );
          } catch {
            /* safe */
          }
        }

        // 🚀 SELF-HEALING BACKFILL: legacy rows keep their field values in the
        // `data` blob — copy them into the materialized columns so filters and
        // sorts match old rows too (idempotent: only NULL columns are filled;
        // `data` is JSONB so `->>` extracts a raw text value; numeric/boolean
        // columns cast explicitly).
        for (const col of columns) {
          try {
            const safeColName = utils.assertSafeSqlIdentifier(col.name, "column");
            if (col.type === "INTEGER") {
              await this.raw.execute(
                `UPDATE "${physicalName}" SET "${safeColName}" = ("data"->>'${safeColName}')::integer WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL`,
              );
            } else if (col.type === "BOOLEAN") {
              await this.raw.execute(
                `UPDATE "${physicalName}" SET "${safeColName}" = ("data"->>'${safeColName}')::boolean WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL`,
              );
            } else {
              await this.raw.execute(
                `UPDATE "${physicalName}" SET "${safeColName}" = "data"->>'${safeColName}' WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL`,
              );
            }
          } catch {
            /* backfill is best-effort (column may not exist on legacy tables) */
          }
        }

        for (const colName of dynamicCols) {
          try {
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${colName}")`,
            );
          } catch {
            /* safe */
          }
        }

        // 🚀 COVERING COMPOSITE INDEX for the canonical tenant list query:
        // WHERE "tenantId"=? AND status=? AND "isDeleted"=false
        // ORDER BY "updatedAt" DESC LIMIT n — turns seq-scan + sort into an
        // index scan and makes keyset pagination on (updatedAt, _id) seekable.
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_status_updated" ON "${physicalName}" ("tenantId", status, "updatedAt" DESC)`,
          );
        } catch {
          /* safe */
        }
        // The pre-DDL table def (base columns only) is stale — rebuild with the
        // materialized columns on next getTable. Invalidate EVERY key variant
        // (logical id, dash-stripped, and the physical collection_ prefix): a
        // missed variant leaves a stale def cached that silently drops
        // materialized columns from later reads.
        this.tableRegistry.delete(tableName);
        this.tableRegistry.delete(normalizedName);
        this.tableRegistry.delete(`collection_${normalizedName}`);
        this.tableRegistry.delete(`collection_${tableName}`);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // Row-Level Security (RLS) & Multi-Tenancy
  // --------------------------------------------------------------------------

  /**
   * Sets the tenant context for the current PostgreSQL session.
   * This must be called at the START of each request after tenant resolution.
   * PostgreSQL RLS policies will then automatically filter all queries
   * against the `app.tenant_id` session variable without application-level changes.
   *
   * @param tenantId - The tenant ID to set, or null to use the "global" context
   * @throws {Error} if the database is not connected
   */
  public async setTenantContext(tenantId: string | null): Promise<void> {
    this._currentTenantId = tenantId;
    const value = tenantId ?? "global";
    if (!this.sql) {
      throw new Error("[PostgreSQLAdapter] Database not connected — cannot set tenant context");
    }
    // Use postgres.js tagged template for proper value escaping
    await this.sql`SET SESSION app.tenant_id = ${value}`;
  }

  /**
   * Creates or replaces a PostgreSQL Row-Level Security policy on a collection table.
   * Enables RLS on the table and creates a policy that filters rows by `tenant_id`
   * using the session-level `app.tenant_id` setting.
   *
   * This should be called from the migration/setup process, not on every query.
   * Once the policy is in place and `setTenantContext()` is called per-request,
   * PostgreSQL automatically enforces tenant isolation on every query.
   *
   * @param collection - The collection name (e.g., "posts")
   * @param _tenantId - Reserved for future use; the policy uses session context
   * @returns DatabaseResult indicating success or failure
   */
  public async enforceTenantPolicy(
    collection: string,
    _tenantId: string,
  ): Promise<DatabaseResult<void>> {
    return this.wrap(
      async () => {
        const normalizedName = collection.replace(/-/g, "");
        const table = this.getTable(normalizedName);
        if (!table) {
          throw new Error(`Table for collection "${collection}" could not be resolved`);
        }
        const physicalName = getTableName(table as any);

        // Enable RLS on the table (idempotent)
        await this.raw.execute(`ALTER TABLE "${physicalName}" ENABLE ROW LEVEL SECURITY`);

        // Create or replace the tenant isolation policy
        // The USING clause compares the table's tenant_id column with the
        // session variable set by setTenantContext() at the start of each request.
        await this.raw.execute(
          `CREATE POLICY tenant_isolation ON "${physicalName}" FOR ALL USING (tenant_id = current_setting('app.tenant_id')::text)`,
        );
      },
      "ENFORCE_TENANT_POLICY_FAILED",
      `Failed to enforce tenant policy for collection "${collection}"`,
      { isWrite: true },
    );
  }

  /**
   * Returns the current tenant context from the PostgreSQL session.
   * Reads the `app.tenant_id` session setting via `current_setting()`.
   *
   * @returns DatabaseResult containing the current tenant ID as a string,
   *          or `null` if the setting was never configured
   */
  public async getTenantContext(): Promise<DatabaseResult<any>> {
    return this.wrap(
      async () => {
        if (!this.sql) {
          throw new Error("[PostgreSQLAdapter] Database not connected");
        }
        const result = await this.sql.unsafe(
          `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
        );
        return result?.[0]?.tenant_id ?? null;
      },
      "GET_TENANT_CONTEXT_FAILED",
      "Failed to retrieve tenant context from PostgreSQL session",
    );
  }

  // --------------------------------------------------------------------------
  // Per-Tenant Connection Pool Management
  // --------------------------------------------------------------------------

  /**
   * Returns a dedicated postgres.js pool for the given tenant.
   * Creates one from the base DATABASE_URL if it doesn't exist yet.
   * The pool is tagged with `application_name=tenant_{tenantId}` for
   * easy identification in pg_stat_activity.
   *
   * @param tenantId - The tenant ID to get a pool for
   * @returns A postgres.js connection pool dedicated to this tenant
   * @throws {Error} if DATABASE_URL is not configured
   */
  public getTenantPool(tenantId: string): ReturnType<typeof postgres> {
    const existing = this._tenantPools.get(tenantId);
    if (existing) return existing;

    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
      throw new Error(
        "[PostgreSQLAdapter] DATABASE_URL is not configured — cannot create tenant pool",
      );
    }

    const poolSize = parseInt(process.env.TENANT_DB_POOL_SIZE || "10", 10);
    const pool = postgres(baseUrl, {
      max: poolSize,
      transform: { undefined: null },
      connection: {
        application_name: `tenant_${tenantId}`,
      },
    });

    this._tenantPools.set(tenantId, pool);
    logger.debug(`Created dedicated connection pool for tenant "${tenantId}" (max: ${poolSize})`);
    return pool;
  }

  /**
   * Registers a dedicated database URL for a specific tenant.
   * This allows enterprise customers to configure true database-level
   * isolation per tenant (separate host/database).
   *
   * If a pool already exists for this tenant, it is closed and replaced.
   *
   * @param tenantId - The tenant ID to assign a dedicated URL for
   * @param connectionUrl - Full PostgreSQL connection URL for this tenant
   */
  public setTenantPool(tenantId: string, connectionUrl: string): void {
    // Close existing pool if present
    const existing = this._tenantPools.get(tenantId);
    if (existing) {
      existing.end().catch(() => {
        logger.debug(`Failed to close existing pool for tenant "${tenantId}"`);
      });
    }

    const poolSize = parseInt(process.env.TENANT_DB_POOL_SIZE || "10", 10);
    const pool = postgres(connectionUrl, {
      max: poolSize,
      transform: { undefined: null },
      connection: {
        application_name: `tenant_${tenantId}`,
      },
    });

    this._tenantPools.set(tenantId, pool);
    logger.info(`Configured dedicated connection pool for tenant "${tenantId}" (max: ${poolSize})`);
  }

  /**
   * Closes and removes the dedicated connection pool for a tenant.
   * After calling this, the tenant will fall back to the shared pool.
   *
   * @param tenantId - The tenant ID whose pool should be closed
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
   * Closes and removes ALL per-tenant dedicated connection pools.
   * Should be called during shutdown to release all database connections.
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
    logger.info("Closed all per-tenant connection pools");
  }
}
