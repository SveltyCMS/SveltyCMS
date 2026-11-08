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
 * - shallow JSONB merge on partial updates (`jsonb || jsonb` — a PATCH keeps
 *   every field it does not mention, matching MongoDB's per-field `$set`)
 * - declared field renames and exact decimal/bigint/calendarDay/bytes SQL types
 */

import { logger } from "@src/utils/logger";
import { getHardwareProfile } from "@utils/hardware-profile";
import { PROFILE_WRITE_ENABLED, profileMark } from "@utils/write-profiler";
import {
  SqlAdapterCore,
  type ListIndexRequest,
  type RawFindResult,
  type RawPointWireStreamResult,
  type RawListWireStreamResult,
} from "../core/sql-adapter-core";
import { POSTGRES_DIALECT, type SqlDialect } from "../core/sql-query-builder";
import { PostgresWireStreamEngine } from "./postgresql-wire-stream";
import { getJsonDataPatch, parseJsonDataBlob } from "../core/query-primitives";
import type {
  BaseQueryOptions,
  DatabaseCapabilities,
  DatabaseResult,
  DatabaseId,
} from "../db-interface";
import { provisionPostgresTable } from "./schema-sync";
import {
  bindPgParam,
  executePostgresBatchUpdateValues,
  executePostgresSingleUpdate,
  resolveUpdateProjection,
} from "./update-templates";
import { getPostgresTenantPool, setPostgresTenantPool } from "./tenant-pool";
import { eq, getTableName } from "drizzle-orm";
// Namespace import on purpose: the whole module is exposed as `adapter.schema` (public surface).
// Not dead — removing it breaks adapter construction (verified 2026-09-27).
import * as schema from "./schema";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as drizzleSql, type SQL } from "drizzle-orm";
import { pgTable, varchar, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import {
  applyTenantFilter,
  assertFiniteAmount,
  assertSafeSqlIdentifier,
  buildRawTenantClause,
  convertArrayDatesToISO,
  convertDatesToISO,
  registerTableSchema,
} from "../core/relational-utils";
import { generateUUID } from "@src/utils/native-utils";
import { NetworkDbQueueGate } from "../core/network-db-queue-gate";
import { TenantPoolManager } from "../sql/tenant-pool-manager";
import { PG_STATEMENT_WARMUP_ENV } from "./statement-warmup";

import {
  PG_TEXT_DATE_TYPES,
  pgConnectionParameters,
  pgIdleTimeout,
  pgSafeIndexName,
} from "./postgres-utils";
export { PG_TEXT_DATE_TYPES, pgConnectionParameters, pgIdleTimeout, pgSafeIndexName };

export abstract class PostgresAdapterCore extends SqlAdapterCore {
  public type = "postgresql";
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
    supportsReturning: true,
    supportsWriteCoalescing: true,
    supportsPreparedStatementWarmup: true,
    supportsWireStreaming: true,
    supportsVectorSearch: false,
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

  public static resolveUpdateProjection(
    table: any,
    fields: string[],
    getColumn: (t: any, name: string) => { name: string } | undefined,
  ): string[] {
    return resolveUpdateProjection(table, fields, getColumn);
  }

  protected _db: PostgresJsDatabase<typeof schema> | null = null;
  protected _readDb: PostgresJsDatabase<typeof schema> | null = null;
  private replicaSqls = new Map<string, ReturnType<typeof postgres>>();
  private allReplicaSqls: ReturnType<typeof postgres>[] = [];
  protected _rawConnectionConfig?: { finalConnection: any; options: any };

  // --------------------------------------------------------------------------
  // Per-Tenant Connection Pools
  // --------------------------------------------------------------------------

  /** Tenant → dedicated postgres.js pool, in-flight counters and LRU state. */
  private _tenantPools = new TenantPoolManager<ReturnType<typeof postgres>>({
    label: "PostgreSQLAdapter",
    closePool: (pool) => pool.end(),
    closedAllMessage: "Closed all per-tenant connection pools",
  });

  /** Active tenant for pool routing / txn GUC (null = unset). */
  public get currentTenantId(): string | null {
    return this._tenantPools.currentTenantId;
  }

  protected _transactionModule?: import("./transaction-module").TransactionModule;

  // --------------------------------------------------------------------------
  // Abstract hook implementations
  // --------------------------------------------------------------------------

  /** postgres.js binds timestamptz as ISO text — skip ISO→Date→ISO. */
  public get persistTimestampsAsDate(): boolean {
    return false;
  }

  /** PostgreSQL supports RETURNING on INSERT and UPDATE. */
  public get insertReturnsRows(): boolean {
    return true;
  }

  public get updateReturnsRows(): boolean {
    return true;
  }

  protected get useDynamicSqlInFindMany(): boolean {
    return true;
  }

  /**
   * Tx-scoped postgres.js instance when inside a transaction started by the
   * PG TransactionModule (which stashes the begin()-scoped instance on
   * `transaction.sql`). Falls back to reading it off the drizzle tx session.
   * Returns null when the transaction carries no raw handle (callers then
   * defer to the Drizzle path, preserving rollback semantics).
   */
  protected getTxnSql(options: BaseQueryOptions): any {
    const tx = options?.transaction as any;
    return tx?.sql ?? tx?.db?.session?.client ?? null;
  }

  protected _insertTemplateCache = new Map<
    string,
    {
      synthCols: string[];
      sqlText: string;
      unnestSqlText: string;
      isJsonMap: boolean[];
    }
  >();

  private _getInsertTemplate(table: any, tableName: string, synthesized: Record<string, any>) {
    const synthCols = Object.keys(synthesized);
    const key = `${tableName}:${synthCols.join(",")}`;
    let tpl = this._insertTemplateCache.get(key);
    if (!tpl) {
      const safeTableName = assertSafeSqlIdentifier(tableName, "table");
      const colList = synthCols
        .map((c) => {
          const phys = this.getColumn(table, c);
          return `"${assertSafeSqlIdentifier(phys?.name ?? c, "column")}"`;
        })
        .join(", ");
      const isJsonMap: boolean[] = [];
      const placeholders = synthCols.map((c, i) => {
        const phys = this.getColumn(table, c);
        const physName = phys?.name ?? c;
        const isJson = physName === "data" || (phys as any)?.dataType === "json";
        isJsonMap[i] = isJson;
        return isJson ? `$${i + 1}::jsonb` : `$${i + 1}`;
      });
      const unnestPlaceholders = synthCols.map((_, i) => `$${i + 1}::text[]`).join(", ");
      const selectCols = synthCols
        .map((c, i) => {
          const phys = this.getColumn(table, c);
          if (isJsonMap[i]) return `u.c${i}::jsonb`;
          if (
            phys?.dataType === "date" ||
            String((phys as any)?.columnType).includes("Timestamp")
          ) {
            return `u.c${i}::timestamptz`;
          }
          if (phys?.dataType === "boolean") return `u.c${i}::boolean`;
          if (phys?.dataType === "number" || String((phys as any)?.columnType).includes("Int")) {
            return `u.c${i}::numeric`;
          }
          return `u.c${i}`;
        })
        .join(", ");
      const uAliasCols = synthCols.map((_, i) => `c${i}`).join(", ");
      const sqlText = `INSERT INTO "${safeTableName}" (${colList}) VALUES (${placeholders.join(", ")})`;
      const unnestSqlText = `INSERT INTO "${safeTableName}" (${colList}) SELECT ${selectCols} FROM UNNEST(${unnestPlaceholders}) AS u(${uAliasCols})`;
      tpl = { synthCols, sqlText, unnestSqlText, isJsonMap };
      this.evictIfFull(this._insertTemplateCache);
      this._insertTemplateCache.set(key, tpl);
    }
    return tpl;
  }

  /**
   * Clear all cached prepared statements and templates (call after any DDL
   * that changes table shape: createModel, clearDatabase, migrations).
   */
  public override clearStatementCaches(): void {
    super.clearStatementCaches();
    this._insertTemplateCache.clear();
    this._updateValuesTemplateCache.clear();
    this._updateTemplateCache.clear();
  }

  protected async rawInsertReturning<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    values: Record<string, any>,
    options: BaseQueryOptions,
  ): Promise<T | null> {
    const txnSql = this.getTxnSql(options);
    if (options?.transaction && !txnSql) return null;
    const exec = txnSql ?? this.sql!;
    try {
      const tableName = getTableName(table);
      const valuesCols = Object.keys(values);
      if (valuesCols.length === 0) return null;

      let synthesized: Record<string, any>;
      try {
        synthesized = this.synthesizeInsertRow(table, values);
      } catch {
        return null;
      }

      const tpl = this._getInsertTemplate(table, tableName, synthesized);
      const numCols = tpl.synthCols.length;
      const boundValues: unknown[] = Array.from({ length: numCols });
      for (let i = 0; i < numCols; i++) {
        boundValues[i] = bindPgParam(synthesized[tpl.synthCols[i]], tpl.isJsonMap[i]);
      }

      // 🔬 Parity with the SQLite adapter's `db:ins:stmt`: one mark per statement, so
      // statement *counts* (N = Σ db:*:stmt ÷ ns:persist) and per-statement latency are
      // comparable across engines. On PostgreSQL this span additionally contains pool
      // acquisition + the TCP round trip, which SQLite's in-process call has no
      // equivalent of — that difference is exactly what the engine comparison measures.
      const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:ins:stmt") : null;
      await exec.unsafe(tpl.sqlText, boundValues, { prepare: true });
      mStmt?.();
      if ((options as any)?.skipReturning === true) {
        return synthesized as unknown as T;
      }
      return convertDatesToISO(synthesized, {
        ...this.convertDatesOptions,
        table: collection,
        inPlace: true,
      }) as unknown as T;
    } catch (err: any) {
      // Unique violations must not fall through to a second Drizzle INSERT.
      if (err?.code === "23505") throw err;
      return null;
    }
  }

  /**
   * Phase 2 statement coalescing gate: concurrent single-row inserts for the
   * same collection coalesce into one UNNEST multi-row statement.
   * On by default — measured +12–18% create throughput at 8 workers on the
   * 100k-doc harness. `SVELTY_WRITE_COALESCING=0` restores pipelined
   * single-row inserts. A size-1 wave does not block the next wave.
   */
  protected override get insertCoalescingEnabled(): boolean {
    return process.env.SVELTY_WRITE_COALESCING !== "0";
  }

  /**
   * Fast multi-row raw INSERT for PostgreSQL:
   * Batches multiple synthesized rows into a single parameterized UNNEST query
   * with stable SQL text, hitting the postgres.js prepared statement cache.
   */
  protected override async rawInsertManyReturning<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    batchValues: Record<string, any>[],
    options: BaseQueryOptions,
  ): Promise<T[] | null> {
    const txnSql = this.getTxnSql(options);
    if (options?.transaction && !txnSql) return null;
    const exec = txnSql ?? this.sql!;
    try {
      const len = batchValues.length;
      if (len === 0) return [];
      const tableName = getTableName(table);

      const synthesizedRows: Record<string, any>[] = [];
      for (let i = 0; i < len; i++) {
        try {
          synthesizedRows.push(this.synthesizeInsertRow(table, batchValues[i]));
        } catch {
          return null;
        }
      }

      const tpl = this._getInsertTemplate(table, tableName, synthesizedRows[0]);
      const numCols = tpl.synthCols.length;

      const colArrays: unknown[][] = tpl.synthCols.map(() => Array.from({ length: len }));
      for (let r = 0; r < len; r++) {
        const row = synthesizedRows[r];
        for (let c = 0; c < numCols; c++) {
          const colName = tpl.synthCols[c];
          const val = bindPgParam(row[colName], tpl.isJsonMap[c]);
          colArrays[c][r] = val === null || val === undefined ? null : String(val);
        }
      }

      // 🔬 Parity with the single-row `db:ins:stmt` — one mark per statement.
      const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:ins:stmt") : null;
      await exec.unsafe(tpl.unnestSqlText, colArrays, { prepare: true });
      mStmt?.();

      return convertArrayDatesToISO(synthesizedRows, {
        ...this.convertDatesOptions,
        table: collection,
        inPlace: true,
      }) as unknown as T[];
    } catch (err) {
      logger.debug(`[PostgreSQL] rawInsertManyReturning error for ${collection}:`, err);
      return null;
    }
  }

  /**
   * Phase 2 statement coalescing gate for updates. Opt-in (`=1`): the lever
   * is profile-dependent — measured +11–15 % on the 100k-doc external harness
   * (8–16-row batches amortize the VALUES join) but −41–54 % on the matrix's
   * 10k-doc replica across two paired A/Bs (2026-10-09), so it must not ship
   * as a default at that profile. The UNNEST join form lost −14 % — postgres.js
   * pipeline mode already overlaps single UPDATE round trips and the casts cost
   * more than they save at wave-sized batches.
   * Insert coalescing stays on `SVELTY_WRITE_COALESCING` (measured +12–16 %).
   */
  protected override get updateCoalescingEnabled(): boolean {
    return process.env.SVELTY_WRITE_COALESCE_UPDATE === "1";
  }

  /**
   * Multi-row UPDATE…FROM (VALUES …) fast path (statement coalescing).
   * One pre-compiled template per size bucket (2/4/8/16) keeps the SQL text
   * stable for the prepared-statement cache while giving the planner an exact
   * row count (the UNNEST function scan's unknown cardinality made the planner
   * pick worse joins — the measured −14% regression). Partial buckets pad with
   * sentinel rows (impossible UUIDv7 — never matches, never writes).
   *
   * All rows in the batch share one column signature and the tenant shape
   * (guaranteed by the coalescer's group key). Returns null to decline — the
   * caller replays every row through its single-statement path.
   */
  protected _updateValuesTemplateCache = new Map<
    string,
    Array<{ size: number; sqlText: string }>
  >();
  protected _updateTemplateCache = new Map<
    string,
    {
      columns: string[];
      isJsonMap: boolean[];
      sqlWithReturning: string;
      sqlSkipReturning: string;
    }
  >();

  protected override async rawUpdateManyReturning<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    batch: Array<{ id: DatabaseId; values: Record<string, any>; options: BaseQueryOptions }>,
  ): Promise<T[] | null> {
    return executePostgresBatchUpdateValues(
      {
        sql: this.sql,
        getColumn: (t, n) => this.getColumn(t, n),
        getTxnSql: (o) => this.getTxnSql(o),
        convertDatesOptions: this.convertDatesOptions,
        updateValuesTemplateCache: this._updateValuesTemplateCache,
        updateTemplateCache: this._updateTemplateCache,
      },
      table,
      collection,
      batch,
    );
  }

  protected override async rawUpdateReturning<T extends import("../db-interface").BaseEntity>(
    table: any,
    collection: string,
    values: Record<string, any>,
    idCol: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawFindResult<T>> {
    return executePostgresSingleUpdate(
      {
        sql: this.sql,
        getColumn: (t, n) => this.getColumn(t, n),
        getTxnSql: (o) => this.getTxnSql(o),
        convertDatesOptions: this.convertDatesOptions,
        updateValuesTemplateCache: this._updateValuesTemplateCache,
        updateTemplateCache: this._updateTemplateCache,
      },
      table,
      collection,
      values,
      idCol,
      id,
      options,
    );
  }

  // --------------------------------------------------------------------------
  // Raw findById fast path (PostgreSQL prepared statement)
  // --------------------------------------------------------------------------

  /**
   * Read the JSON `data` column of one row. PostgreSQL merges patches inside the
   * UPDATE (`jsonb || jsonb`), so this is only reached when the raw UPDATE could
   * not run — an unsupported transaction handle, or a SQL error — and the Drizzle
   * fallback would otherwise `SET "data" = <patch>`. Keeping the fallback a merge
   * means no path can silently replace the blob.
   */
  public override async readJsonDataColumn(
    table: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<Record<string, unknown> | null> {
    const txnSql = this.getTxnSql(options);
    if (options?.transaction && !txnSql) return null;
    const exec = txnSql ?? this.sql;
    if (!exec) return null;
    try {
      const tableName = getTableName(table);
      const idColName =
        (this.getColumn(table, "_id") || this.getColumn(table, "id"))?.name ?? "_id";
      const tenantClause = buildRawTenantClause(options, "postgres", { paramIndex: 2 });
      // 🛡️ Append the clause verbatim: it is "" for no tenant, `AND "tenantId" = $2`
      // for a real tenant, and `AND "tenantId" IS NULL` (empty params) for the
      // canonical global scope. The old `hasTenant` flag treated IS NULL as `= $2`,
      // producing a missing $2 and silently returning null for global-scope rows.
      const sqlText =
        `SELECT "data" FROM "${assertSafeSqlIdentifier(tableName, "table")}"` +
        ` WHERE "${assertSafeSqlIdentifier(idColName, "column")}" = $1${tenantClause.sql} LIMIT 1`;
      const params = [String(id), ...tenantClause.params];
      const rows = await exec.unsafe(sqlText, params, { prepare: true });
      return parseJsonDataBlob(Array.isArray(rows) && rows.length > 0 ? rows[0]?.data : null);
    } catch {
      return null;
    }
  }

  protected override async rawExec<R = Record<string, unknown>>(
    sqlText: string,
    params: readonly unknown[],
    options?: BaseQueryOptions,
  ): Promise<R[] | null> {
    const txnSql = options ? this.getTxnSql(options) : null;
    if (options?.transaction && !txnSql) return null;
    const exec = txnSql ?? this.sql;
    if (!exec) return null;
    const rows = await exec.unsafe(sqlText, [...params], { prepare: true });
    return Array.isArray(rows) ? (rows as R[]) : [];
  }

  /** Cache for Direct-to-Wire SQL JSON statements (2027 architecture). */
  /** Engine for Direct-to-Wire SQL JSON stream queries. */
  private _wireStreamEngine = new PostgresWireStreamEngine();

  /**
   * Direct-to-Wire point stream optimization for PostgreSQL (2027 architecture):
   * Generates { success: true, data: { ... } } directly inside PostgreSQL
   * via jsonb_build_object, completely bypassing V8 JS object hydration and JSON.stringify.
   */
  public override async rawFindPointWireStream(
    table: any,
    _collection: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    const txnSql = this.getTxnSql(options);
    if (options?.transaction && !txnSql) return { kind: "declined" };
    const exec = txnSql ?? this.sql!;
    return this._wireStreamEngine.findPointWireStream(
      this,
      exec,
      table,
      getTableName(table),
      id,
      options,
    );
  }

  /**
   * Raw list direct-to-wire streaming for PostgreSQL (2027 architecture).
   * Aggregates rows directly in the PostgreSQL engine using jsonb_agg,
   * completely bypassing V8 object allocation and JSON.stringify.
   */
  protected override async rawFindListWireStream(
    table: any,
    _collection: string,
    options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      fields?: string[];
    },
  ): Promise<RawListWireStreamResult> {
    const txnSql = this.getTxnSql(options);
    if (options?.transaction && !txnSql) return { kind: "declined" };
    const exec = txnSql ?? this.sql!;
    return this._wireStreamEngine.findListWireStream(
      this,
      exec,
      table,
      getTableName(table),
      options,
    );
  }

  /**
   * Raw heterogeneous bulk UPDATE for PostgreSQL — one prepared statement
   * instead of N per-row UPDATEs (BatchModule.bulkUpdate's transactional
   * fallback loop, which also errored on blob-field payloads: Drizzle .set()
   * rejects keys that live in the jsonb `data` column).
   *
   * Builds `SET "col" = CASE "_id" WHEN $n THEN $n … ELSE "col" END` for
   * varying columns (rows omitting a column fall through to ELSE), plain
   * `"constCol" = $n` for columns every row sets to the same value
   * (updatedAt, tenantId), and `WHERE "_id" IN ($n, …)` + tenant clause.
   *
   * Values come from prepareUpdateValues (same semantics as crud.update);
   * binding mirrors rawUpdateReturning (bindPgParam: Date→ISO, data→jsonb
   * string, objects→JSON text). Chunks run inside exec.begin() so a batch
   * is all-or-nothing; returns null on any failure (nothing committed).
   */
  public override async rawBulkUpdate(
    table: any,
    _collection: string,
    updates: Array<{
      id: import("../db-interface").DatabaseId;
      data: Partial<Record<string, unknown>>;
    }>,
    now: Date,
    options: BaseQueryOptions,
  ): Promise<{ modifiedCount: number } | null> {
    const txnSql = this.getTxnSql(options);
    if (options?.transaction && !txnSql) return null;
    const exec = txnSql ?? this.sql!;
    let tableName = "unknown";
    try {
      if (updates.length < 2) return null;
      tableName = getTableName(table);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) return null;
      const idColName = idCol?.name || "_id";

      // 🛡️ TENANT ISOLATION: fail-closed guard (BatchModule asserts too; keep
      // defense-in-depth for direct calls) + tenant WHERE like rawUpdateReturning.
      if (this.getColumn(table, "tenantId"))
        applyTenantFilter([], this.getColumn(table, "tenantId"), options);

      const prepared = updates.map((u) =>
        this.prepareUpdateValues(table, u.data, u.id as string, now, options),
      );

      // 🔀 PARTIAL-UPDATE MERGE: the CASE builder can wrap the `data` column in the
      // dialect operator (one statement). A patch the operator cannot express
      // (nested object / explicit null on this engine) would need each row's stored
      // blob, so refuse the fast path — the caller's per-row loop merges exactly.
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

      // Resolve column types once per batch
      const colMeta = setCols.map((col) => {
        const phys = this.getColumn(table, col);
        const physName = phys?.name ?? col;
        const safeCol = assertSafeSqlIdentifier(physName, "column");
        const isJson = physName === "data" || (phys as any)?.dataType === "json";
        let pgType = "text";
        if (isJson) pgType = "jsonb";
        else if (
          phys?.dataType === "date" ||
          String((phys as any)?.columnType).includes("Timestamp")
        )
          pgType = "timestamptz";
        else if (phys?.dataType === "boolean") pgType = "boolean";
        else if (phys?.dataType === "number" || String((phys as any)?.columnType).includes("Int"))
          pgType = "numeric";
        return { col, physName, safeCol, isJson, pgType };
      });

      const maxRowsPerChunk = 500;
      let modifiedCount = 0;
      const safeTableName = assertSafeSqlIdentifier(tableName, "table");
      const safeIdCol = assertSafeSqlIdentifier(idColName, "column");
      const hasTenant =
        options?.tenantId !== undefined &&
        options.tenantId !== null &&
        options.tenantId !== "global";

      // Separate physical columns from the json 'data' blob column
      const physCols = colMeta.filter((m) => m.physName !== "data");
      const dataCol = colMeta.find((m) => m.physName === "data");

      // Build constant UNNEST parameter placeholders:
      // $1::text[] for IDs
      // For each physical column: $val::text[], $present::text[]
      // For data column: $dataVal::text[], $dataMode::text[] ('patch' | 'set' | 'keep')
      const unnestPlaceholders: string[] = ["$1::text[]"];
      const vAliases: string[] = ["_unnest_id"];
      let paramCount = 1;

      const setClauses: string[] = [];

      for (let i = 0; i < physCols.length; i++) {
        const m = physCols[i];
        paramCount += 2;
        unnestPlaceholders.push(`$${paramCount - 1}::text[]`, `$${paramCount}::text[]`);
        const valAlias = `c${i}_val`;
        const presAlias = `c${i}_pres`;
        vAliases.push(valAlias, presAlias);

        const cast = m.pgType === "text" ? `v."${valAlias}"` : `v."${valAlias}"::${m.pgType}`;
        setClauses.push(
          `"${m.safeCol}" = CASE WHEN v."${presAlias}" = '1' THEN ${cast} ELSE t."${m.safeCol}" END`,
        );
      }

      if (dataCol) {
        paramCount += 2;
        unnestPlaceholders.push(`$${paramCount - 1}::text[]`, `$${paramCount}::text[]`);
        vAliases.push("data_val", "data_mode");
        setClauses.push(
          `"${dataCol.safeCol}" = CASE
            WHEN v."data_mode" = 'patch' THEN COALESCE(t."${dataCol.safeCol}", '{}'::jsonb) || v."data_val"::jsonb
            WHEN v."data_mode" = 'set' THEN v."data_val"::jsonb
            ELSE t."${dataCol.safeCol}"
          END`,
        );
      }

      let whereSql = `t."${safeIdCol}" = v."_unnest_id"`;
      const tenantParamIdx = paramCount + 1;
      if (hasTenant) {
        whereSql += ` AND t."tenantId" = $${tenantParamIdx}`;
      }

      const rawSql = `UPDATE "${safeTableName}" AS t SET ${setClauses.join(", ")} FROM UNNEST(${unnestPlaceholders.join(", ")}) AS v(${vAliases.map((a) => `"${a}"`).join(", ")}) WHERE ${whereSql}`;

      const runChunks = async (db: any) => {
        for (let start = 0; start < prepared.length; start += maxRowsPerChunk) {
          const chunk = prepared.slice(start, start + maxRowsPerChunk);
          const chunkIds = updates.slice(start, start + maxRowsPerChunk).map((u) => String(u.id));

          const boundParams: unknown[] = [chunkIds];

          for (const m of physCols) {
            const vals: unknown[] = Array.from({ length: chunk.length });
            const pres: string[] = Array.from({ length: chunk.length });
            for (let r = 0; r < chunk.length; r++) {
              const row = chunk[r];
              if (Object.hasOwn(row, m.col)) {
                pres[r] = "1";
                vals[r] = bindPgParam(row[m.col], m.isJson);
              } else {
                pres[r] = "0";
                vals[r] = null;
              }
            }
            boundParams.push(vals, pres);
          }

          if (dataCol) {
            const dataVals: unknown[] = Array.from({ length: chunk.length });
            const dataModes: string[] = Array.from({ length: chunk.length });
            for (let r = 0; r < chunk.length; r++) {
              const row = chunk[r];
              if (getJsonDataPatch(row) !== undefined) {
                dataModes[r] = "patch";
                dataVals[r] = bindPgParam(row.data, true);
              } else if (Object.hasOwn(row, "data")) {
                dataModes[r] = "set";
                dataVals[r] = bindPgParam(row.data, true);
              } else {
                dataModes[r] = "keep";
                dataVals[r] = null;
              }
            }
            boundParams.push(dataVals, dataModes);
          }

          if (hasTenant) {
            boundParams.push(String(options.tenantId));
          }

          const res = await db.unsafe(rawSql, boundParams, { prepare: true });
          modifiedCount += Number((res as any)?.count ?? 0);
        }
      };

      if (options?.transaction || txnSql) {
        await runChunks(exec);
      } else {
        await exec.begin(async (tx: any) => {
          await runChunks(tx);
        });
      }

      return { modifiedCount };
    } catch (err) {
      logger.debug(`[PostgreSQL] rawBulkUpdate error for ${tableName}:`, err);
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
    const txnSql = this.getTxnSql(options);
    if (!inOuterTxn || txnSql) {
      const exec = txnSql ?? this.sql!;
      // 🛡️ Partial-write guard: once ANY chunk executed, falling back to
      // super.insertMany would re-insert the already-committed rows (PK
      // collisions / duplicates). Only a clean pre-write failure may fall back.
      let wroteAny = false;
      try {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Table not found: ${collection}`);
        const now = this.writeNow();
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
          // Pre-resolve column metadata once per batch (no inner-loop getColumn lookups)
          const colMeta = Array.from(cols).map((c) => {
            const phys = this.getColumn(table, c);
            const physName = phys?.name ?? c;
            const isJson = physName === "data" || (phys as any)?.dataType === "json";
            let pgType = "text";
            if (isJson) pgType = "jsonb";
            else if (
              phys?.dataType === "date" ||
              String((phys as any)?.columnType).includes("Timestamp")
            )
              pgType = "timestamptz";
            else if (phys?.dataType === "boolean") pgType = "boolean";
            else if (
              phys?.dataType === "number" ||
              String((phys as any)?.columnType).includes("Int")
            )
              pgType = "numeric";
            return {
              key: c,
              physName,
              safeCol: assertSafeSqlIdentifier(physName, "column"),
              isJson,
              pgType,
            };
          });

          const colList = colMeta.map((m) => `"${m.safeCol}"`).join(", ");
          const safeTable = assertSafeSqlIdentifier(getTableName(table), "table");

          // UNNEST parameters are 1 array per column, bypassing scalar 65535 parameter limit
          const chunkSize = 2000;
          const rowsOut: any[] = [];

          // Stable UNNEST statement text with element-wise casting — plans once and stays in statement cache
          const unnestPlaceholders = colMeta.map((_, i) => `$${i + 1}::text[]`).join(", ");
          const selectCols = colMeta
            .map((m, i) => {
              if (m.isJson) return `u.c${i}::jsonb`;
              if (m.pgType === "timestamptz") return `u.c${i}::timestamptz`;
              if (m.pgType === "boolean") return `u.c${i}::boolean`;
              if (m.pgType === "numeric") return `u.c${i}::numeric`;
              return `u.c${i}`;
            })
            .join(", ");
          const uAliasCols = colMeta.map((_, i) => `c${i}`).join(", ");
          const unnestSqlText = `INSERT INTO "${safeTable}" (${colList}) SELECT ${selectCols} FROM UNNEST(${unnestPlaceholders}) AS u(${uAliasCols})${skipReturning ? "" : " RETURNING *"}`;

          for (let start = 0; start < len; start += chunkSize) {
            const chunk = batchValues.slice(start, start + chunkSize);

            // Check if any row has undefined fields relying on DB column DEFAULT
            let hasUndefined = false;
            for (let r = 0; r < chunk.length; r++) {
              const row = chunk[r];
              for (let c = 0; c < colMeta.length; c++) {
                if (row[colMeta[c].key] === undefined) {
                  hasUndefined = true;
                  break;
                }
              }
              if (hasUndefined) break;
            }

            if (!hasUndefined) {
              // 🚀 FAST UNNEST PATH: identical SQL text for every chunk size, array binding
              const unnestParams = colMeta.map((m) =>
                chunk.map((r) => bindPgParam(r[m.key], m.isJson)),
              );
              const rows = await exec.unsafe(unnestSqlText, unnestParams, { prepare: true });
              wroteAny = true;
              if (Array.isArray(rows) && rows.length > 0) rowsOut.push(...rows);
            } else {
              // Fallback for rows with undefined columns needing DB DEFAULT
              const params: any[] = [];
              const valuesSql: string[] = [];
              for (let r = 0; r < chunk.length; r++) {
                const row = chunk[r];
                const rowPlaceholders: string[] = [];
                for (let c = 0; c < colMeta.length; c++) {
                  const m = colMeta[c];
                  const v = row[m.key];
                  if (v === undefined) {
                    rowPlaceholders.push("default");
                    continue;
                  }
                  if (v instanceof Date) {
                    params.push((v as Date).toISOString());
                    rowPlaceholders.push(`$${params.length}`);
                  } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                    params.push(JSON.stringify(v));
                    rowPlaceholders.push(
                      m.isJson ? `$${params.length}::jsonb` : `$${params.length}`,
                    );
                  } else {
                    params.push(v);
                    rowPlaceholders.push(`$${params.length}`);
                  }
                }
                valuesSql.push(`(${rowPlaceholders.join(", ")})`);
              }
              const sqlText = `INSERT INTO "${safeTable}" (${colList}) VALUES ${valuesSql.join(", ")}${skipReturning ? "" : " RETURNING *"}`;
              // prepare: false so unique chunk shapes do not crowd out the statement cache
              const rows = await exec.unsafe(sqlText, params, { prepare: false });
              wroteAny = true;
              if (Array.isArray(rows) && rows.length > 0) rowsOut.push(...rows);
            }
          }
          if (skipReturning) {
            return { success: true as const, data: batchValues as unknown as T[] };
          }
          if (rowsOut.length === len) {
            return {
              success: true as const,
              data: convertArrayDatesToISO(rowsOut, {
                ...this.convertDatesOptions,
                table: collection,
              }) as T[],
            };
          }
          if (wroteAny) {
            // RETURNING mismatch after committed chunks — retrying via the
            // base path would re-insert committed rows. Fail instead.
            return this.handleError(
              new Error(
                `Partial insertMany write for "${collection}" (${rowsOut.length}/${len} rows returned)`,
              ),
              "INSERT_MANY_PARTIAL_WRITE",
            );
          }
        }
      } catch (err) {
        if (wroteAny) {
          logger.warn(
            `[PostgreSQL insertMany] raw path partially wrote "${collection}" — returning failure instead of re-inserting committed chunks`,
          );
          return this.handleError(
            err instanceof Error ? err : new Error(String(err)),
            "INSERT_MANY_PARTIAL_WRITE",
          );
        }
        logger.debug(`[PostgreSQL] insertMany fallback for ${collection}:`, err);
        /* nothing written yet — safe to fall through to the base Drizzle path */
      }
    }
    return super.insertMany(collection, data, options);
  }

  public override get sqlDialect(): SqlDialect {
    return POSTGRES_DIALECT;
  }

  /** Same prepared postgres.js path findMany uses (`prepare: true`). */
  public override async executeCompiled(
    sqlText: string,
    params: readonly unknown[],
    options?: BaseQueryOptions,
  ): Promise<unknown[]> {
    const txnSql = this.getTxnSql(options ?? {});
    const exec = txnSql ?? this.sql;
    if (!exec) throw new Error("Database not connected");
    if (txnSql || !this.queueGate || this.queueGate.isInsideActiveContext()) {
      const rows = await exec.unsafe(sqlText, params as any[], { prepare: true });
      return Array.isArray(rows) ? rows : [];
    }
    const run = async () => {
      const rows = await exec.unsafe(sqlText, params as any[], { prepare: true });
      return Array.isArray(rows) ? rows : [];
    };
    return this.queueGate.acquire(run);
  }

  /**
   * Covering index for a query-builder list sorted by a physical column other
   * than `updatedAt`. Built off the pool (`CREATE INDEX CONCURRENTLY`) so the
   * list that discovered the sort does not wait on the scan.
   */
  protected override scheduleListSortIndex(tableName: string, plan: ListIndexRequest): void {
    if (process.env.SVELTY_LAZY_SORT_INDEXES === "0") return;
    if (!PostgresAdapterCore.SORT_EXPR_FIELD_RE.test(plan.column)) return;
    const safeTable = assertSafeSqlIdentifier(tableName, "table");
    const safeCol = assertSafeSqlIdentifier(plan.column, "column");
    const dir = plan.direction === "desc" ? "DESC" : "ASC";
    const indexName = assertSafeSqlIdentifier(
      pgSafeIndexName(`${tableName}_${plan.column}_${plan.withTenant ? "t" : "o"}_list_id`),
      "index",
    );
    const cols = plan.withTenant
      ? `("tenantId", "${safeCol}" ${dir}, "_id" ${dir})`
      : `("${safeCol}" ${dir}, "_id" ${dir})`;
    const ddl = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "${safeTable}" ${cols}`;
    void (async () => {
      let client: ReturnType<typeof postgres> | null = null;
      try {
        if (this._rawConnectionConfig) {
          // Drop the pool's onclose. Ending this one-shot client must not
          // schedule a reconnect of the serving adapter.
          const { onclose: _poolClose, ...indexOptions } = this._rawConnectionConfig.options ?? {};
          void _poolClose;
          client = postgres(this._rawConnectionConfig.finalConnection, {
            ...indexOptions,
            max: 1,
            idle_timeout: 10,
          });
        }
        const exec = client ?? this.sql;
        if (!exec) return;
        await exec.unsafe("SET statement_timeout = 0").catch(() => {});
        await exec.unsafe(ddl);
        await exec.unsafe(`ANALYZE "${safeTable}"`).catch(() => {});
      } catch (err) {
        logger.debug(
          `[Postgres] list index failed for ${tableName}.${plan.column}: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (client) await client.end().catch(() => {});
      }
    })();
  }

  /**
   * Prepared dynamic-SQL execution for findMany. `db.execute()` re-parses the
   * statement on every call (no prepared-statement reuse — measured as the PG
   * FIND MANY regression: ~1.9ms vs 0.95ms at the 08-04 ledger). Rendering the
   * Drizzle SQL once via toQuery() and running it through postgres.js
   * unsafe(..., { prepare: true }) hits the statement cache — parse-once +
   * bind/execute reuse, same as the raw insert/update paths. Falls back to the
   * base path when the query can't be rendered or inside a transaction without
   * a raw handle (pool execution would bypass the txn connection).
   */
  protected override async executeDynamicSql(
    _db: any,
    sqlQuery: SQL,
    options?: BaseQueryOptions,
  ): Promise<any[]> {
    const txnSql = this.getTxnSql(options ?? {});
    if (options?.transaction && !txnSql) {
      return super.executeDynamicSql(_db, sqlQuery, options);
    }
    const exec = txnSql ?? this.sql!;
    try {
      const rendered = (sqlQuery as any).toQuery?.({
        escapeName: (n: string) => `"${n.replace(/"/g, '""')}"`,
        escapeParam: (_p: unknown, i: number) => `$${i + 1}`,
      });
      if (rendered?.sql && Array.isArray(rendered.params)) {
        const rows = await exec.unsafe(rendered.sql, rendered.params, { prepare: true });
        return Array.isArray(rows) ? rows : [];
      }
    } catch {
      /* fall through to the base path */
    }
    return super.executeDynamicSql(_db, sqlQuery, options);
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

  /**
   * Key-level JSON patch: `jsonb_set(doc, '{key}', value, true)` per key, nested.
   *
   * `jsonb_set` replaces exactly one top-level key, so a concurrent patch of a
   * different key survives the write (the lost update the whole-blob
   * read-modify-write produced). `true` creates the key when it is absent and
   * `COALESCE` covers a NULL column. The value is bound as JSON text and cast,
   * so a JSON `null` stays a *value* — binding a JS `null` directly would send
   * SQL NULL and null the entire column.
   */
  public override jsonKeyPatchExpression(
    colSql: string,
    entries: ReadonlyArray<readonly [string, string]>,
  ): SQL {
    let expr: SQL = drizzleSql`COALESCE(${drizzleSql.raw(colSql)}, '{}'::jsonb)`;
    for (const [key, jsonText] of entries) {
      expr = drizzleSql`jsonb_set(${expr}, ${`{${key}}`}::text[], ${jsonText}::jsonb, true)`;
    }
    return expr;
  }

  /**
   * Lazy expression-index for dynamic sort fields.
   *
   * `ORDER BY data->>'count'` cannot be served by any stock index, so at 1M+
   * rows a filtered sort is a parallel seq scan + top-N heapsort (measured:
   * 3.8 s cold / ~0.2 s warm at 1.1M rows; linear in table size). The first
   * sorted query on a dynamic scalar field schedules
   * `CREATE INDEX IF NOT EXISTS ((data->>'field'))` in the background — the
   * ORDER BY already emits that exact literal expression, so PostgreSQL serves
   * every subsequent sort with an index scan (measured: ~1.6 ms at 1.1M rows).
   *
   * ### Features:
   * - Fire-and-forget: no query pays the index build; queries stay extraction-
   *   sorted until the build lands, then become index-served
   * - Bounded registry (FIFO) so a client-supplied sort cannot grow DDL
   *   without limit; one build per (collection, field) per process
   * - The field name is inlined as a literal, so it is regex-gated to plain
   *   identifiers first; dotted paths are skipped
   * - `SVELTY_LAZY_SORT_INDEXES=0` opts out entirely
   * - The physical-column materialization path (`indexed: true`) remains the
   *   documented explicit option; this index is its lazy, zero-schema-change
   *   complement and is unused (harmless) once a field is materialized
   */
  private static readonly SORT_EXPR_FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  private static readonly MAX_DYNAMIC_SORT_INDEXES = 64;
  private _dynamicSortIndexes = new Map<string, "requested" | "done">();

  protected override onDynamicSort(collection: string, tableName: string, field: string): void {
    if (process.env.SVELTY_LAZY_SORT_INDEXES === "0") return;
    if (field.includes(".") || !PostgresAdapterCore.SORT_EXPR_FIELD_RE.test(field)) return;
    const table = this.getTable(collection);
    // If field is already a physical column on the table, an expression index on (data->>'field') is pure write amplification
    if (table && this.getColumn(table, field)) return;

    const key = `${collection}\0${field}`;
    if (this._dynamicSortIndexes.has(key)) return;
    this._dynamicSortIndexes.set(key, "requested");
    if (this._dynamicSortIndexes.size > PostgresAdapterCore.MAX_DYNAMIC_SORT_INDEXES) {
      const oldest = this._dynamicSortIndexes.keys().next().value;
      if (oldest !== undefined) this._dynamicSortIndexes.delete(oldest);
    }

    const safeTable = assertSafeSqlIdentifier(tableName, "table");
    const rawIndexName = `${tableName}_${field}_expr_idx`;
    const indexName = assertSafeSqlIdentifier(pgSafeIndexName(rawIndexName), "index");
    void (async () => {
      let client: ReturnType<typeof postgres> | null = null;
      try {
        // Use a dedicated 1-connection client with statement_timeout = 0 so concurrent index creation
        // doesn't hog a pooled worker connection during the full table scan and isn't aborted by query timeout.
        if (this._rawConnectionConfig) {
          // Drop the pool's onclose. Ending this one-shot client must not
          // schedule a reconnect of the serving adapter.
          const { onclose: _poolClose, ...indexOptions } = this._rawConnectionConfig.options ?? {};
          void _poolClose;
          client = postgres(this._rawConnectionConfig.finalConnection, {
            ...indexOptions,
            max: 1,
            idle_timeout: 10,
          });
        }
        const exec = client ?? this.sql;
        if (exec) {
          await exec.unsafe("SET statement_timeout = 0").catch(() => {});
          await exec.unsafe(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "${safeTable}" ((data->>'${field}'))`,
          );
          await exec.unsafe(`ANALYZE "${safeTable}"`).catch(() => {});
        } else {
          await this.raw.execute(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "${safeTable}" ((data->>'${field}'))`,
          );
        }
        this._dynamicSortIndexes.set(key, "done");
      } catch (err) {
        // Unmark so a later sort may retry — the extraction fallback keeps serving meanwhile.
        this._dynamicSortIndexes.delete(key);
        // Repair invalid index if the build was interrupted/failed
        const cleanupExec = client ?? this.sql;
        if (cleanupExec) {
          await cleanupExec
            .unsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`)
            .catch(() => {});
        }
        logger.debug(
          `[Postgres] lazy sort index failed for ${tableName}.${field}: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (client) {
          await client.end().catch(() => {});
        }
      }
    })();
  }

  /**
   * A previous process may have sorted this field while it still lived in
   * `data` and left `(data->>'field')` behind. Once the value is a real
   * column that index is only extra WAL on every update.
   */
  protected override onMaterializedFieldsRegistered(
    physicalTable: string,
    columns: Map<string, string>,
  ): void {
    if (!this.sql || columns.size === 0) return;
    for (const field of columns.keys()) {
      const rawIndexName = `${physicalTable}_${field}_expr_idx`;
      const indexName = pgSafeIndexName(rawIndexName);
      void this.raw
        .execute(`DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(indexName, "index")}"`)
        .catch(() => {});
      if (rawIndexName.length > 63) {
        // Drop legacy truncated name (prior to pgSafeIndexName) so existing DBs don't retain duplicate indexes
        const legacyTruncated = rawIndexName.slice(0, 63);
        void this.raw
          .execute(`DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(legacyTruncated, "index")}"`)
          .catch(() => {});
      }
    }
  }

  /**
   * Numeric range comparison on a JSON field via the JSON value itself
   * (`jsonb_typeof(data->'views') = 'number' AND data->'views' >= '4'::jsonb`).
   *
   * PostgreSQL's extraction (`->>`) is TEXT, so the default comparison is
   * lexicographic: `views >= 4` missed stored `16`/`32` because `'16' < '4'`.
   * Comparing JSONB instead is numeric and needs no cast (a `::int` cast would raise
   * on non-numeric data).
   *
   * The `jsonb_typeof` guard is **required**, not decoration: jsonb's total order is
   * Object > Array > Boolean > Number > String > Null, so every non-numeric value
   * sorts *below* every number. Measured 2026-09-22: `'"101"'::jsonb < '4'::jsonb`
   * is **true**, i.e. an unguarded `<`/`<=` range admits stored strings (`"101"`
   * matched `views < 4`) while `>`/`>=` silently drops them — the guard makes both
   * directions type-strict, matching SQLite's typed `json_extract` and MongoDB.
   * A missing key yields SQL NULL from `jsonb_typeof`, so absent fields never match.
   * Only numbers are handled; other filter types keep the extraction comparison.
   */
  protected override getJsonCompare(
    field: string,
    value: unknown,
    op: "$gt" | "$gte" | "$lt" | "$lte",
  ): SQL | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const segments = field.split(".");
    const path =
      segments.length === 1
        ? drizzleSql`data->${segments[0]}`
        : drizzleSql`data#>${`{${segments.join(",")}}`}`;
    const guard = drizzleSql`jsonb_typeof(${path}) = 'number'`;
    const probe = JSON.stringify(value);
    const cmp =
      op === "$gt"
        ? drizzleSql`${path} > ${probe}::jsonb`
        : op === "$gte"
          ? drizzleSql`${path} >= ${probe}::jsonb`
          : op === "$lt"
            ? drizzleSql`${path} < ${probe}::jsonb`
            : drizzleSql`${path} <= ${probe}::jsonb`;
    // Parenthesised: this condition is a conjunction, and `mapQuery` output can be
    // OR'd (`$or`) by callers — relying on the caller to group it would be implicit.
    return drizzleSql`(${guard} AND ${cmp})`;
  }

  /**
   * Numeric extraction for aggregation: PostgreSQL's `->>` renders every JSON scalar
   * as TEXT, so `SUM(...)`/`AVG(...)` need an explicit cast. SQLite's `json_extract`
   * is already typed and MariaDB coerces text in numeric aggregates, so both keep
   * the plain extraction.
   */
  public override getJsonNumericField(field: string): SQL {
    return drizzleSql`CAST(${this.getJsonField(field)} AS numeric)`;
  }

  /**
   * `$min`/`$max` cannot be answered type-safely from the JSON blob here, so the
   * translator refuses the stage instead of returning a wrong number:
   *
   * - the extraction (`->>`) is TEXT, so `MIN` is lexicographic — measured
   *   2026-09-22: `MIN(data->>'views')` over `{10, 2}` returns `"10"`;
   * - comparing the JSON value itself is not an option either: PostgreSQL defines
   *   no `min(jsonb)` aggregate (verified: `function min(jsonb) does not exist`),
   *   and a `::numeric` cast would raise on the string values a mixed-type blob may
   *   hold;
   * - `jsonb_typeof` cannot rescue it, because one aggregate cannot return the
   *   numeric MIN for numeric rows and the string MIN for string rows at once.
   *
   * A materialized column (declared `indexed` / `materialize: true`) is ordered by
   * the engine in its native column type and is the supported path.
   */
  public override getJsonOrderedField(_field: string): SQL | null {
    return null;
  }

  /**
   * 🌐 POSTGRES-NATIVE INDEXED JSON EQUALITY: `data @> '{"field": value}'::jsonb`
   * is served by the `jsonb_path_ops` GIN index on `data` (created for every
   * dynamic collection table in `createModel`), where the default text-extraction
   * comparison (`data->>'field' = $1`) can only ever be a sequential scan.
   *
   * Measured 2026-09-22 on 100k rows: extraction → Seq Scan **7.9–10.9 ms**,
   * containment → Bitmap Index Scan **0.1–1.7 ms**; index build 347 ms once, write
   * cost within run-to-run noise.
   *
   * Returns `null` (⇒ extraction fallback) for anything containment cannot express
   * faithfully:
   * - non-scalar payloads (objects/arrays are matched as a whole by containment,
   *   which is not what `=` on the extracted text meant),
   * - values that are not JSON scalars after `JSON.stringify` (functions, `NaN`,
   *   `undefined`).
   * Type fidelity is preserved by serializing the raw value: a number filter probes
   * a JSON number, a string filter a JSON string — exactly how the write path stores
   * widget values.
   */
  protected override getJsonEquals(field: string, value: unknown): SQL | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "function" || typeof value === "symbol") return null;
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    if (value instanceof Uint8Array) return null;
    if (typeof value === "object" && !(value instanceof Date)) return null;

    // Dotted paths probe a nested object (`a.b` → `{"a":{"b": value}}`), matching
    // the `data#>>'{a,b}'` extraction form. `undefined`/`null` key segments are
    // impossible: SQL path identifiers never contain a bare dot twice.
    const segments = field.split(".");
    const probe: Record<string, unknown> = {};
    let cursor = probe;
    for (let i = 0; i < segments.length - 1; i++) {
      const next: Record<string, unknown> = {};
      cursor[segments[i]] = next;
      cursor = next;
    }
    cursor[segments[segments.length - 1]] = value instanceof Date ? value.toISOString() : value;

    try {
      return drizzleSql`data @> ${JSON.stringify(probe)}::jsonb`;
    } catch {
      return null;
    }
  }

  protected coerceJsonValue(val: unknown): unknown {
    // data->> returns text; bind scalars as text so `text = boolean/numeric`
    // never throws and JSON-stored booleans/numbers actually match.
    return typeof val === "boolean" || typeof val === "number" ? String(val) : val;
  }

  // --------------------------------------------------------------------------
  // Read Replicas
  // --------------------------------------------------------------------------

  public getSql(mode: "read" | "write" = "write"): ReturnType<typeof postgres> {
    if (!this.sql) throw new Error("Database not connected");

    // If a per-tenant dedicated pool is active, use it for full
    // connection-level isolation instead of the shared pool.
    if (
      this._tenantPools.currentTenantId &&
      this._tenantPools.has(this._tenantPools.currentTenantId)
    ) {
      return this._tenantPools.get(this._tenantPools.currentTenantId)!;
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

  protected _readDbs = new WeakMap<
    ReturnType<typeof postgres>,
    PostgresJsDatabase<typeof schema>
  >();

  public getDrizzle(mode: "read" | "write" = "write"): PostgresJsDatabase<typeof schema> {
    if (mode === "write") return this.db;
    const client = this.getSql("read");
    if (!client) return this.db;
    let readDb = this._readDbs.get(client);
    if (!readDb) {
      readDb = drizzle(client, { schema });
      this._readDbs.set(client, readDb);
    }
    return readDb;
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
          types: PG_TEXT_DATE_TYPES,
          idle_timeout: pgIdleTimeout(),
          // postgres.js 3.4.x: pipelining is always enabled (`max_pipeline`
          // defaults to 100); TCP keepalive is `keep_alive` = initial delay in
          // seconds (10s mirrors the newer keepaliveInitialDelayMillis=10000).
          keep_alive: 10,
          max_lifetime: 60 * 60,
          connection: pgConnectionParameters({
            application_name: `sveltycms_replica_${region}`,
          }),
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
      // A setup probe passes `preferTcp` so the wizard tests the host and
      // credentials the operator entered instead of a trusted Unix socket.
      const preferTcp = (_options as { preferTcp?: boolean } | undefined)?.preferTcp === true;

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
          max: Number(process.env.DATABASE_MAX_CONNECTIONS) || getHardwareProfile().dbPoolSize,
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
        const { detectPostgresSocketDir, preferIpv4Loopback } = await import("../db-local-socket");
        const socketDir = preferTcp ? undefined : detectPostgresSocketDir(url.hostname);
        const hw = getHardwareProfile();
        // 🚀 POOL SIZING: the hardware profile OWNS the default — it is CPU- and
        // memory-derived (2 × budget cores, memory-capped), so a 1-core/512 MB
        // box gets a handful of connections instead of the 20 a constant floor
        // forced (the anti-lean case). MariaDB/Mongo already read the profile
        // directly; this removes the last adapter-specific override.
        // `DATABASE_MAX_CONNECTIONS` always wins; high-concurrency sweeps on a
        // dedicated host raise `HARDWARE_CPU_BUDGET=1` (or set the env).
        options = {
          host: socketDir || preferIpv4Loopback(url.hostname),
          port: Number(url.port || 5432),
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          database: url.pathname.slice(1),
          ssl:
            url.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : false,
          onnotice: () => {},
          onclose,
          transform: { undefined: null },
          types: PG_TEXT_DATE_TYPES,
          fetch_types: false,
          // 🚀 Postgres.js: client-side type inference (`infer: true`) passes parameter OIDs
          // directly so queries bypass the extra roundtrip describe/flush stall on diverse workloads.
          infer: true,
          max: Number(process.env.DATABASE_MAX_CONNECTIONS) || hw.dbPoolSize,
          connect_timeout: 10,
          prepare: effectivePrepare,
          idle_timeout: pgIdleTimeout(),
          max_lifetime: 60 * 60,
          keep_alive: 10,
          debug: false,
          connection: pgConnectionParameters({
            ...(url.searchParams.get("synchronous_commit")
              ? { synchronous_commit: url.searchParams.get("synchronous_commit") }
              : {}),
            ...(url.searchParams.get("work_mem")
              ? { work_mem: url.searchParams.get("work_mem") }
              : {}),
          }),
        };
      } else {
        const c = (finalConnection || {}) as any;
        const usePrepared = (c.prepare ?? process.env.DATABASE_PREPARE ?? "true") !== "false";
        const hw2 = getHardwareProfile();

        const { detectPostgresSocketDir, preferIpv4Loopback } = await import("../db-local-socket");
        const rawHost = c.host || c.DB_HOST || "127.0.0.1";
        const socketDirObj = preferTcp ? undefined : detectPostgresSocketDir(rawHost);
        options = {
          host: socketDirObj || preferIpv4Loopback(String(rawHost)),
          port: Number(c.port || c.DB_PORT || 5432),
          user: c.user || c.DB_USER || "postgres",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME,
          max: Number(c.max || process.env.DATABASE_MAX_CONNECTIONS) || hw2.dbPoolSize,
          connect_timeout: Number(c.connect_timeout || 10),
          ssl: c.ssl || false,
          onnotice: () => {},
          onclose,
          transform: { undefined: null },
          types: PG_TEXT_DATE_TYPES,
          fetch_types: false,
          infer: true,
          prepare: usePrepared,
          idle_timeout: pgIdleTimeout(c.idle_timeout),
          max_lifetime: Number(c.max_lifetime || 60 * 60),
          keepalive: c.keepalive ?? true,
          keepaliveInitialDelayMillis: Number(c.keepaliveInitialDelayMillis || 10000),
          pipeline: c.pipeline ?? true,
          debug: false,
          connection: pgConnectionParameters({
            ...c.connection,
            ...(c.synchronous_commit ? { synchronous_commit: c.synchronous_commit } : {}),
            ...(c.work_mem ? { work_mem: c.work_mem } : {}),
          }),
        };
      }

      // Auto-create database if missing
      try {
        this.sql = postgres(finalConnection, options);
        this._rawConnectionConfig = { finalConnection, options };
        this._db = drizzle(this.sql, { schema });
        await this.sql`SELECT 1`;
        this.connected = true;
        const poolMax = options.max || 20;
        const gateDisabled =
          process.env.DATABASE_QUEUE_GATE === "0" || process.env.SVELTY_DB_QUEUE_GATE === "0";
        if (!gateDisabled) {
          this.queueGate = new NetworkDbQueueGate({
            maxConcurrency: Number(process.env.DATABASE_MAX_CONCURRENCY) || poolMax,
            maxQueue: Number(process.env.DATABASE_MAX_QUEUE) || 500,
            timeoutMs: Number(process.env.DATABASE_QUEUE_TIMEOUT_MS) || 15_000,
            name: "PostgreSQL",
            enableWriteCoalescing: true,
          });
        }
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
              this._rawConnectionConfig = { finalConnection, options };
              this._db = drizzle(this.sql, { schema });
              await this.sql`SELECT 1`;
              this.connected = true;
              const poolMax = options.max || 20;
              const gateDisabled =
                process.env.DATABASE_QUEUE_GATE === "0" || process.env.SVELTY_DB_QUEUE_GATE === "0";
              if (!gateDisabled) {
                this.queueGate = new NetworkDbQueueGate({
                  maxConcurrency: Number(process.env.DATABASE_MAX_CONCURRENCY) || poolMax,
                  maxQueue: Number(process.env.DATABASE_MAX_QUEUE) || 500,
                  timeoutMs: Number(process.env.DATABASE_QUEUE_TIMEOUT_MS) || 15_000,
                  name: "PostgreSQL",
                  enableWriteCoalescing: true,
                });
              }
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

    if (this.queueGate) {
      this.queueGate.clear("PostgreSQL disconnected");
      this.queueGate = undefined;
    }
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

  /**
   * Phase-1 statement warm-up (see statement-warmup.ts): crosses the planner's
   * custom-plan window on every pooled connection before traffic arrives, so
   * the first requests already run on generic plans.
   *
   * Non-fatal and env-gated (`SVELTY_PG_STATEMENT_WARMUP=0` disables).
   */
  public async warmPreparedStatements(): Promise<void> {
    if (process.env[PG_STATEMENT_WARMUP_ENV] === "0") return;
    if (!this.connected || !this.sql) return;
    try {
      const opts = this._rawConnectionConfig?.options as { max?: number } | undefined;
      const poolMax = Number(opts?.max) || 20;
      const { warmPgPreparedStatements } = await import("./statement-warmup");
      const stats = await warmPgPreparedStatements(this.sql, poolMax);
      logger.info(
        `[PostgreSQL] Statement warm-up: ${stats.warmed}/${stats.total} prepared statements on generic plans`,
      );
    } catch (err) {
      logger.debug(
        `[PostgreSQL] Statement warm-up skipped: ${(err as Error)?.message ?? String(err)}`,
      );
    }
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
    try {
      const rows = await this.sql`
        SELECT
          count(*)::int as total,
          count(*) filter (where state = 'active')::int as active,
          count(*) filter (where state = 'idle')::int as idle,
          count(*) filter (where wait_event is not null)::int as waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      if (rows && rows[0]) {
        return {
          success: true,
          data: {
            total: Number(rows[0].total) || 0,
            active: Number(rows[0].active) || 0,
            idle: Number(rows[0].idle) || 0,
            waiting: Number(rows[0].waiting) || 0,
            avgConnectionTime: 0,
          },
        };
      }
    } catch {
      // Fallback to local pool options if pg_stat_activity cannot be queried
    }
    const max = (this.sql as any)?.options?.max || 10;
    const gateStats = this.queueGate?.getMetrics();
    return {
      success: true,
      data: {
        total: gateStats?.maxConcurrency ?? max,
        active: gateStats?.active ?? 0,
        idle: Math.max(0, (gateStats?.maxConcurrency ?? max) - (gateStats?.active ?? 0)),
        waiting: gateStats?.waiting ?? 0,
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
      // Soft-delete audit pair (parity with Mongo): written by crud.delete/deleteMany
      // so the trash can show who deleted an entry and when.
      deletedAt: timestamp("deletedAt", { withTimezone: true }),
      deletedBy: varchar("deletedBy", { length: 36 }),
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
          colName === "deletedAt" ||
          colName === "deletedBy" ||
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
        if (this.queueGate) {
          return this.queueGate.acquire(() => this.sql!.unsafe(sqlText, params));
        }
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
    if (this.queueGate) {
      return this.queueGate.acquire(() => this._transactionModule!.execute(fn, options as any));
    }
    return this._transactionModule.execute(fn, options as any);
  };

  // --------------------------------------------------------------------------
  // Stream Many (Delegates to SqlAdapterCore paged cursor)
  // --------------------------------------------------------------------------

  public async streamMany<T extends import("../db-interface").BaseEntity>(
    collection: string,
    query: import("../db-interface").QueryFilter<T>,
    options: import("../db-interface").FindOptions<T> = {},
  ): Promise<import("../db-interface").DatabaseResult<AsyncIterable<T>>> {
    return super.streamMany(collection, query, options);
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
        const tenantCol = this.getColumn(resolvedTable, "tenantId");
        const setWhere =
          tenantCol && cleanValues.tenantId !== undefined && cleanValues.tenantId !== null
            ? eq(tenantCol, cleanValues.tenantId as string)
            : undefined;
        await (db.insert(resolvedTable).values(cleanValues) as any).onConflictDoUpdate({
          target: conflictTarget,
          set: cleanValues,
          ...(setWhere ? { setWhere } : {}),
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
        const safeField = assertSafeSqlIdentifier(field);
        const amountNum = assertFiniteAmount(amount);
        const idStr = String(id);
        const dataCol = this.getColumn(table, "data");
        // 🚀 ROW-STORE HYBRID: materialized numeric fields live in a column —
        // increment the column directly (jsonb_set on `data` would no-op for
        // new rows whose field never entered the blob).
        const fieldIsColumn = !!this.getColumn(table, field);

        const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "postgres", {
          paramIndex: fieldIsColumn || !dataCol ? 3 : 4,
        });

        let sqlQuery: string;
        let params: unknown[];

        if (fieldIsColumn) {
          params = [idStr, amountNum, ...tenantParams];
          sqlQuery = `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + $2::numeric, "updatedAt" = now() WHERE "${idCol.name}" = $1${tenantSql} RETURNING *`;
        } else if (dataCol) {
          // Param $3 is the field name — statement text is stable and plans once for all numeric JSON fields
          params = [idStr, amountNum, field, ...tenantParams];
          sqlQuery = `UPDATE "${tableName}" SET "data" = jsonb_set(CASE WHEN jsonb_typeof("data") = 'object' THEN "data" ELSE '{}'::jsonb END, ARRAY[$3]::text[], to_jsonb(coalesce(("data"->>$3)::numeric, 0) + $2::numeric)), "updatedAt" = now() WHERE "${idCol.name}" = $1${tenantSql} RETURNING *`;
        } else {
          params = [idStr, amountNum, ...tenantParams];
          sqlQuery = `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + $2::numeric, "updatedAt" = now() WHERE "${idCol.name}" = $1${tenantSql} RETURNING *`;
        }

        if (options.skipReturning === true) {
          const sqlSkip = sqlQuery.replace(/ RETURNING \*$/, "");
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const result = await this.raw.execute(sqlSkip, params);
              const count = Number(result?.count ?? 0);
              if (count === 0) throw new Error(`Entry not found: ${idStr}`);
              return { _id: idStr };
            } catch (err: any) {
              if (
                attempt < 4 &&
                (err?.message?.includes("too many clients") || err?.code === "53300")
              ) {
                await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
                continue;
              }
              throw err;
            }
          }
        }

        let rows: any[] = [];
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            rows = (await this.raw.execute(sqlQuery, params)) || [];
            break;
          } catch (err: any) {
            if (
              attempt < 4 &&
              (err?.message?.includes("too many clients") || err?.code === "53300")
            ) {
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

  public async createModel(schemaData: any, force = false): Promise<void> {
    const tableName = schemaData._id || schemaData.id || schemaData.name || schemaData.slug;
    if (!tableName) throw new Error("Schema must have an _id or name");

    // Register before getTable AND before the DDL fast path. A restarted
    // process can already be "provisioned" (or skip DDL entirely) while its
    // in-memory table def was built without these columns.
    this.rememberMaterializedColumns(schemaData);

    await provisionPostgresTable(
      {
        getTable: (col) => this.getTable(col),
        raw: this.raw,
        sql: this.sql,
        provisionedTables: this._provisionedTables,
        materializedColumns: this.materializedColumns,
        tableRegistry: this.tableRegistry,
        wrap: (op, errCode, metric, opts) => this.wrap(op, errCode, metric, opts),
      },
      schemaData,
      force,
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
  public async setTenantContext(
    tenantId: string | null,
    sql?: ReturnType<typeof postgres> | null,
  ): Promise<void> {
    this._tenantPools.currentTenantId = tenantId;
    const value = tenantId ?? "global";
    if (!this.sql) {
      throw new Error("[PostgreSQLAdapter] Database not connected — cannot set tenant context");
    }
    // Dedicated DSN pools connect to an isolated database that cannot see other tenants;
    // they may skip GUC only when they have a dedicated isolated DSN and no shared tables exist.
    const isDedicatedDsn = tenantId ? this._tenantPools.isDedicatedDsn(tenantId) : false;
    if (isDedicatedDsn && !sql) {
      return;
    }
    const tenantPool = tenantId ? this._tenantPools.get(tenantId) : undefined;
    const exec = sql ?? tenantPool;
    if (!exec) return;
    const isLocal = Boolean(sql);
    await exec`SELECT set_config('app.tenant_id', ${value}, ${isLocal})`;
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

        // ENABLE (not FORCE): the CMS typically connects as table owner, so
        // FORCE without a reserved per-request connection would hide every
        // row when app.tenant_id is unset on a pooled socket. App-level
        // WHERE tenantId=? remains the request-path isolator; RLS + GUC
        // apply inside transactions / dedicated tenant pools.
        await this.raw.execute(`ALTER TABLE "${physicalName}" ENABLE ROW LEVEL SECURITY`);

        // Create or replace the tenant isolation policy.
        // The USING clause compares the table's double-quoted "tenantId" column
        // (the exact name used in CREATE TABLE — unquoted tenant_id would fold
        // to lowercase and throw 42703) with the session variable set by
        // setTenantContext(). missing_ok=true makes an unset session context
        // Drop existing policy first to ensure idempotency across migrations
        await this.raw.execute(`DROP POLICY IF EXISTS tenant_isolation ON "${physicalName}"`);
        await this.raw.execute(
          `CREATE POLICY tenant_isolation ON "${physicalName}" FOR ALL USING ("tenantId" = current_setting('app.tenant_id', true))`,
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

  // (Removed 2026-11-07) `_evictOldestIdleTenantPool` had no caller after the
  // tenant-pool extraction; `_tenantPools.evictOldestIdle` is invoked directly.

  /**
   * Tracks query start on a dedicated tenant pool for eviction safety.
   */
  public trackTenantPoolQueryStart(tenantId: string): void {
    this._tenantPools.trackQueryStart(tenantId);
  }

  /**
   * Tracks query completion on a dedicated tenant pool.
   */
  public trackTenantPoolQueryEnd(tenantId: string): void {
    this._tenantPools.trackQueryEnd(tenantId);
  }

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
    return getPostgresTenantPool({ tenantPools: this._tenantPools }, tenantId);
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
    setPostgresTenantPool({ tenantPools: this._tenantPools }, tenantId, connectionUrl);
  }

  /**
   * Closes and removes the dedicated connection pool for a tenant.
   * After calling this, the tenant will fall back to the shared pool.
   *
   * @param tenantId - The tenant ID whose pool should be closed
   */
  public async closeTenantPool(tenantId: string): Promise<void> {
    if (await this._tenantPools.close(tenantId)) {
      logger.info(`Closed dedicated connection pool for tenant "${tenantId}"`);
    }
  }

  /**
   * Closes and removes ALL per-tenant dedicated connection pools.
   * Should be called during shutdown to release all database connections.
   */
  public async closeAllTenantPools(): Promise<void> {
    await this._tenantPools.closeAll();
  }
}
