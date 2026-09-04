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
import { normalizeCollectionTableName } from "../core/collection-name";
import { SqlQueryBuilder, SQLITE_DIALECT } from "../core/sql-query-builder";
import { TransactionModule } from "./transaction-module";
import { withMigrationLock } from "../migration-lock";
import { getHardwareProfile } from "@utils/hardware-profile";

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
 * 🚀 PERFORMANCE: High-performance Re-entrant FIFO Mutex for serializing SQLite writes.
 * - Zero Promise chaining allocations when uncontended.
 * - Direct O(1) waiter hand-off without deep microtask Promise chain latency.
 * - Full re-entrancy support via AsyncLocalStorage.
 */
class Mutex {
  private _locked = false;
  private _waiting: Array<() => void> = [];
  private storage = new AsyncLocalStorage<boolean>();

  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.storage.getStore()) {
      return fn();
    }

    if (this._locked) {
      await new Promise<void>((resolve) => this._waiting.push(resolve));
    }
    this._locked = true;

    try {
      return await this.storage.run(true, fn);
    } finally {
      const next = this._waiting.shift();
      if (next) {
        next();
      } else {
        this._locked = false;
      }
    }
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

  /** tableName → INSERT SQL (no RETURNING — row is synthesized, same as PostgreSQL). */
  private _insertTemplateCache = new Map<string, { cols: string[]; sqlText: string }>();
  /** table|cols|returning|tenant → UPDATE SQL. */
  private _updateSqlCache = new Map<string, string>();
  private _sqliteSelectColsCache = new WeakMap<object, string>();
  /**
   * Pre-assembled findById SQL (entry engine). Tenant variants bake the
   * parameterized `AND "tenantId" = ?` clause — values stay bound, never inlined.
   * Postgres/Maria keep driver-prepared tagged/`execute` paths instead.
   */
  private _rawFindByIdSqlCache = new WeakMap<
    object,
    {
      withData: string;
      withoutData: string;
      withDataTenant: string;
      withoutDataTenant: string;
    }
  >();

  /** Clients whose prepare() is wrapped with a per-SQL statement cache. */
  protected _preparedStatementClients = new Set<any>();

  /**
   * Clear all cached prepared statements (call after any DDL that changes
   * table shape: createModel, clearDatabase, migrations).
   */
  protected clearStatementCaches(): void {
    for (const client of this._preparedStatementClients) {
      try {
        client.clearStatementCache?.();
      } catch {
        /* safe */
      }
    }
    this._statementCache.clear();
    this._insertTemplateCache.clear();
    this._updateSqlCache.clear();
  }

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
    const direct = err?.code === "SQLITE_ERROR" || err?.code === "ERR_SQLITE_ERROR";
    const viaCause = err?.cause?.code === "SQLITE_ERROR" || err?.cause?.code === "ERR_SQLITE_ERROR";
    const hasMsg =
      err?.message?.includes("no such table") || err?.cause?.message?.includes("no such table");
    // Fallback: message-only match catches Drizzle/SQLite wrapper errors
    // that lose the SQLITE_ERROR code in the chain
    return hasMsg || direct || viaCause;
  }

  protected async executeDynamicSql(
    db: any,
    sqlQuery: SQL,
    _options?: BaseQueryOptions,
  ): Promise<any[]> {
    try {
      const rendered = (
        sqlQuery as { toQuery?: (opts: unknown) => { sql: string; params: unknown[] } }
      ).toQuery?.({
        escapeName: (n: string) => `"${n.replace(/"/g, '""')}"`,
        escapeParam: () => "?",
      });
      if (rendered?.sql && Array.isArray(rendered.params)) {
        const rows = this.prepareAndExecute(rendered.sql, "all", ...rendered.params);
        return Array.isArray(rows) ? rows : [];
      }
    } catch {
      /* fall through to Drizzle values() */
    }
    return (db as { values: (q: SQL) => Promise<any[]> }).values(sqlQuery);
  }

  protected async rawFindById<T>(
    table: any,
    collection: string,
    id: DatabaseId,
    options: FindOptions<T>,
  ): Promise<T | null> {
    try {
      // Read-path schema registration: raw reads must normalize SQLite INTEGER
      // ms timestamps to ISODateString even on read-only workloads.
      if (!this._registeredSchemas.has(collection)) {
        this.ensureTableSchemaRegistered(table, collection);
        this._registeredSchemas.add(collection);
      }
      const tableName = getTableName(table);
      // Bound parameters for _id + tenantId (no string interpolation of identifiers/values)
      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
        options,
        "sqlite",
      );
      // Projection: when fields are all physical columns, skip the data blob
      // (avoids JSON.parse + flattenDataColumn on the hot read path).
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

      let cachedSql = this._rawFindByIdSqlCache.get(table);
      if (!cachedSql) {
        let selectWithoutData = this._sqliteSelectColsCache.get(table);
        if (!selectWithoutData) {
          selectWithoutData = this.getRawFindByIdCols(table, false)
            .map((c) => `"${c}"`)
            .join(", ");
          this._sqliteSelectColsCache.set(table, selectWithoutData);
        }
        const quoted = `"${tableName}"`;
        cachedSql = {
          withData: `SELECT * FROM ${quoted} WHERE "_id" = ? LIMIT 1`,
          withoutData: `SELECT ${selectWithoutData} FROM ${quoted} WHERE "_id" = ? LIMIT 1`,
          withDataTenant: `SELECT * FROM ${quoted} WHERE "_id" = ? AND "tenantId" = ? LIMIT 1`,
          withoutDataTenant: `SELECT ${selectWithoutData} FROM ${quoted} WHERE "_id" = ? AND "tenantId" = ? LIMIT 1`,
        };
        this._rawFindByIdSqlCache.set(table, cachedSql);
      }
      // Parameterized sqlite tenant clause is stable (` AND "tenantId" = ?`).
      // Any other fragment falls back to concat so we never bind the wrong SQL.
      const useTenantCache = tenantSql === ` AND "tenantId" = ?`;
      let rawSql: string;
      if (useTenantCache) {
        rawSql = wantsData ? cachedSql.withDataTenant : cachedSql.withoutDataTenant;
      } else if (!tenantSql) {
        rawSql = wantsData ? cachedSql.withData : cachedSql.withoutData;
      } else {
        const selectCols = wantsData ? "*" : (this._sqliteSelectColsCache.get(table) ?? "*");
        rawSql = `SELECT ${selectCols} FROM "${tableName}" WHERE "_id" = ?${tenantSql} LIMIT 1`;
      }

      const rawRow = this.prepareAndExecute(rawSql, "get", String(id), ...tenantParams);
      if (rawRow) {
        if (!wantsData) {
          // Projected read: normalize dates/booleans without the blob parse.
          return utils.convertDatesToISO(rawRow, {
            inPlace: true,
            table: collection,
            skipJson: true,
          }) as T;
        }
        // inPlace: the driver row is a fresh object — parse/flatten the data
        // blob in place instead of copying every key into a new object.
        return utils.convertDatesToISO(rawRow, { inPlace: true, table: collection }) as T;
      }
      return null;
    } catch (rawErr: any) {
      logger.debug("[SQLite raw findById prototype] falling back to Drizzle:", rawErr?.message);
      return null;
    }
  }

  /**
   * Raw single-statement INSERT…RETURNING for SQLite — same prepared-cache
   * reuse as rawFindById. Dates bind as epoch-ms integers (the adapter stores
   * INTEGER timestamps); objects are JSON-stringified (data column). Skips the
   * Drizzle AST build on the hot write path.
   *
   * Parameter coercion (boolean→1/0, Date→epoch ms, object→JSON text,
   * Uint8Array→binary) is handled centrally by prepareAndExecute — do NOT
   * pre-map here (double coercion cost + Uint8Array blobs would corrupt).
   */
  protected async rawInsertReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    values: Record<string, any>,
    _options: BaseQueryOptions,
  ): Promise<T | null> {
    try {
      const tableName = getTableName(table);
      if (Object.keys(values).length === 0) return null;
      const synthesized = this.synthesizeInsertRow(table, values);
      const cols = Object.keys(synthesized);
      const cacheKey = `${tableName}|${cols.join(",")}`;
      let tpl = this._insertTemplateCache.get(cacheKey);
      if (!tpl) {
        const colList = cols
          .map((c) => `"${utils.assertSafeSqlIdentifier(c, "column")}"`)
          .join(", ");
        const placeholders = cols.map(() => "?").join(", ");
        const sqlText = `INSERT INTO "${utils.assertSafeSqlIdentifier(tableName, "table")}" (${colList}) VALUES (${placeholders})`;
        tpl = { cols, sqlText };
        if (this._insertTemplateCache.size >= 256) {
          const oldest = this._insertTemplateCache.keys().next().value;
          if (oldest) this._insertTemplateCache.delete(oldest);
        }
        this._insertTemplateCache.set(cacheKey, tpl);
      }
      const params = tpl.cols.map((c) => synthesized[c]);
      await this.prepareAndExecuteWrite(tpl.sqlText, "run", ...params);
      return utils.convertDatesToISO(synthesized, {
        ...this.convertDatesOptions,
        table: collection,
      }) as T;
    } catch {
      return null;
    }
  }

  /**
   * Raw single-statement multi-row INSERT…RETURNING for SQLite.
   * Parameter coercion (boolean→1/0, Date→epoch ms, object→JSON text) is handled centrally by prepareAndExecute.
   */
  protected override async rawInsertManyReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    batchValues: Record<string, any>[],
    _options: BaseQueryOptions,
  ): Promise<T[] | null> {
    try {
      const len = batchValues.length;
      if (len === 0) return [];
      const tableName = getTableName(table);
      const cols = Object.keys(batchValues[0]);
      if (cols.length === 0) return null;

      const colList = cols.map((c) => `"${utils.assertSafeSqlIdentifier(c, "column")}"`).join(", ");
      const rowPlaceholder = `(${cols.map(() => "?").join(", ")})`;
      const rowTuples: string[] = [];
      const allParams: any[] = [];

      for (let r = 0; r < len; r++) {
        const row = batchValues[r];
        rowTuples.push(rowPlaceholder);
        for (let c = 0; c < cols.length; c++) {
          allParams.push(row[cols[c]]);
        }
      }

      const rawSql = `INSERT INTO "${tableName}" (${colList}) VALUES ${rowTuples.join(", ")} RETURNING *`;
      const rows = await this.prepareAndExecuteWrite(rawSql, "all", ...allParams);
      if (Array.isArray(rows) && rows.length > 0) {
        return utils.convertArrayDatesToISO(rows, {
          ...this.convertDatesOptions,
          table: collection,
        }) as T[];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Raw single-statement UPDATE…RETURNING for SQLite — same prepared-cache
   * reuse as rawInsertReturning/rawFindById. The base SqlAdapterCore.update()
   * pays Drizzle's per-call AST build + `.returning()` SQL generation
   * (~2× INSERT latency on the hot write path); this keeps UPDATE at INSERT
   * parity with one bound statement + one round trip.
   *
   * `values` is the preparedValues output with the PK already stripped; all
   * columns are bound (stable SQL text → statement-cache hits).
   *
   * skipReturning (full-document callers): runs the UPDATE without RETURNING
   * and reconstructs the row from the prepared values — the no-read-back path
   * mirrors the Drizzle branch at raw-statement cost.
   *
   * Returns null to defer to the Drizzle `.returning()` path.
   */
  protected async rawUpdateReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    values: Record<string, any>,
    idCol: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<T | null> {
    try {
      const columns = Object.keys(values);
      if (columns.length === 0) return null;

      const tableName = getTableName(table);
      const idColName = idCol?.name || "_id";
      const params: unknown[] = [];
      for (let i = 0; i < columns.length; i++) params.push(values[columns[i]]);

      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
        options,
        "sqlite",
      );
      const skipReturning = (options as { skipReturning?: boolean })?.skipReturning === true;
      const cacheKey = `${tableName}|${columns.join(",")}|${skipReturning ? 1 : 0}|${tenantSql}`;
      let rawSql = this._updateSqlCache.get(cacheKey);
      if (!rawSql) {
        const setPairs: string[] = [];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          const phys = this.getColumn(table, col);
          const safeCol = utils.assertSafeSqlIdentifier(phys?.name ?? col, "column");
          setPairs.push(`"${safeCol}" = ?`);
        }
        const whereSql = `"${utils.assertSafeSqlIdentifier(idColName, "column")}" = ?${tenantSql}`;
        const setSql = setPairs.join(", ");
        rawSql = skipReturning
          ? `UPDATE "${utils.assertSafeSqlIdentifier(tableName, "table")}" SET ${setSql} WHERE ${whereSql}`
          : `UPDATE "${utils.assertSafeSqlIdentifier(tableName, "table")}" SET ${setSql} WHERE ${whereSql} RETURNING *`;
        if (this._updateSqlCache.size >= 256) {
          const oldest = this._updateSqlCache.keys().next().value;
          if (oldest) this._updateSqlCache.delete(oldest);
        }
        this._updateSqlCache.set(cacheKey, rawSql);
      }

      if (skipReturning) {
        await this.prepareAndExecuteWrite(rawSql, "run", ...params, String(id), ...tenantParams);
        const reconstructed = {
          ...values,
          [idColName]: id,
        } as Record<string, unknown>;
        return utils.convertDatesToISO(reconstructed, {
          ...this.convertDatesOptions,
          table: collection,
        }) as unknown as T;
      }

      const rows = await this.prepareAndExecuteWrite(
        rawSql,
        "all",
        ...params,
        String(id),
        ...tenantParams,
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return utils.convertDatesToISO(rows[0], {
          ...this.convertDatesOptions,
          table: collection,
        }) as T;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Raw heterogeneous bulk UPDATE for SQLite — one prepared statement instead
   * of N per-row UPDATEs (BatchModule.bulkUpdate's transactional fallback loop).
   *
   * Builds `SET "col" = CASE "_id" WHEN ? THEN ? … ELSE "col" END` for every
   * varying column (rows omitting a column fall through to ELSE), plain
   * `"constCol" = ?` for columns every row sets to the same value (updatedAt,
   * tenantId), and `WHERE "_id" IN (…)` + the parameterized tenant clause.
   *
   * Values come from prepareUpdateValues (same semantics as crud.update:
   * ISO→Date, dynamic data blob, updatedAt/tenantId stamps). Parameter
   * coercion (Date→epoch ms, boolean→1/0, object→JSON text) is handled
   * centrally by prepareAndExecute — do NOT pre-map here.
   *
   * Chunked under SQLITE_MAX_VARIABLE_NUMBER (conservative 900, matching
   * executeUpsertById) and wrapped in BEGIN IMMEDIATE/COMMIT so the batch is
   * all-or-nothing. Returns null on ANY failure — the caller then falls back
   * to the transactional per-row loop (nothing was committed).
   */
  public override async rawBulkUpdate(
    table: any,
    _collection: string,
    updates: Array<{ id: DatabaseId; data: Partial<Record<string, unknown>> }>,
    now: Date,
    options: BaseQueryOptions,
  ): Promise<{ modifiedCount: number } | null> {
    try {
      if (updates.length < 2) return null;
      const tableName = getTableName(table);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) return null;
      const idColName = idCol?.name || "_id";

      // 🛡️ TENANT ISOLATION: fail-closed guard (BatchModule asserts too; keep
      // defense-in-depth for direct calls) + parameterized tenant WHERE.
      const tenantCol = this.getColumn(table, "tenantId");
      if (tenantCol) utils.applyTenantFilter([], tenantCol, options);
      const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
        options,
        "sqlite",
      );

      // Prepare per-row values once — same shape as crud.update's SET clause
      // (id column included by prepareValues, stripped from SET below).
      const prepared = updates.map((u) =>
        this.prepareUpdateValues(table, u.data, u.id as string, now, options),
      );

      // Union of SET columns (PK excluded — it is the CASE matcher / WHERE key).
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

      // Params per row: one CASE match id per varying column (WHEN/THEN = 2
      // params) + one id in WHERE IN. Constant columns add a single param.
      const maxParams = 900;
      const maxRowsPerChunk = Math.max(1, Math.floor(maxParams / (setCols.length * 2 + 1)));

      let modifiedCount = 0;
      const runChunks = () => {
        for (let start = 0; start < prepared.length; start += maxRowsPerChunk) {
          const chunk = prepared.slice(start, start + maxRowsPerChunk);
          const chunkIds = updates.slice(start, start + maxRowsPerChunk).map((u) => String(u.id));

          const setPairs: string[] = [];
          const params: unknown[] = [];
          for (const col of setCols) {
            const phys = this.getColumn(table, col);
            const safeCol = utils.assertSafeSqlIdentifier(phys?.name ?? col, "column");

            // Constant column (every row sets the identical value) → plain SET.
            // Value-based comparison: `{}` data blobs and same-timestamp Dates
            // are distinct object refs but semantically constant.
            const sameValue = (a: unknown, b: unknown): boolean => {
              if (a === b) return true;
              if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
              if (a && b && typeof a === "object" && typeof b === "object") {
                return JSON.stringify(a) === JSON.stringify(b);
              }
              return false;
            };
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
              setPairs.push(`"${safeCol}" = ?`);
              params.push(firstVal);
              continue;
            }

            // Varying column → per-row CASE; rows without the column fall to ELSE.
            const whens: string[] = [];
            for (let i = 0; i < chunk.length; i++) {
              const values = chunk[i];
              if (!Object.hasOwn(values, col)) continue;
              whens.push("WHEN ? THEN ?");
              params.push(chunkIds[i], values[col]);
            }
            const safeIdCol = utils.assertSafeSqlIdentifier(idColName, "column");
            setPairs.push(
              `"${safeCol}" = CASE "${safeIdCol}" ${whens.join(" ")} ELSE "${safeCol}" END`,
            );
          }

          const idPlaceholders = chunkIds.map(() => "?").join(", ");
          const rawSql = `UPDATE "${utils.assertSafeSqlIdentifier(tableName, "table")}" SET ${setPairs.join(", ")} WHERE "${utils.assertSafeSqlIdentifier(idColName, "column")}" IN (${idPlaceholders})${tenantSql}`;
          const res = this.prepareAndExecute(
            rawSql,
            "run",
            ...params,
            ...chunkIds,
            ...tenantParams,
          );
          modifiedCount += (res as { changes?: number })?.changes ?? 0;
        }
      };

      // Atomicity across chunks: BEGIN IMMEDIATE acquires the write lock up
      // front; unless the caller already owns a transaction (options.transaction
      // → inside Drizzle's txn). 🔒 The whole BEGIN…COMMIT span runs under the
      // write mutex (withWriteLock) so no other writer interleaves mid-span;
      // reentrant when the caller's span already holds the lock.
      return this.withWriteLock(async () => {
        if (!options.transaction) {
          this.prepareAndExecute("BEGIN IMMEDIATE", "run");
          try {
            runChunks();
            this.prepareAndExecute("COMMIT", "run");
          } catch (err) {
            try {
              this.prepareAndExecute("ROLLBACK", "run");
            } catch {
              /* already aborted */
            }
            throw err;
          }
        } else {
          runChunks();
        }

        return { modifiedCount };
      });
    } catch {
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
      // 🛡️ Identifier allow-list: this name is embedded in raw SQL identifiers
      // (SELECT/INSERT/DDL) across the adapter. Dash-stripping alone did not
      // stop quote/backtick breakout from admin-typed collection names — fail
      // closed BEFORE any SQL is assembled.
      utils.assertSafeSqlIdentifier(cleanId, "collection");
      // ⚠️ Composite length guard: the interpolated identifier is
      // `collection_${cleanId}` (11-char prefix). A bare-label pass alone is
      // not enough — the composite can exceed SQLite's identifier limits and
      // would be silently truncated, colliding with a longer sibling name.
      // Fail closed on the FINAL identifier (normalizeCollectionTableName is
      // the single source of truth for the physical name derivation).
      const tableName = utils.assertSafeSqlIdentifier(
        normalizeCollectionTableName(collection),
        "table",
      );

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
      // 🚀 ROW-STORE HYBRID: materialized scalar columns (populated by
      // createModel — covers benchmark/auto-provisioned collections that have
      // no content_nodes structure row).
      const fromMap =
        this.materializedColumns.get(collection) ||
        this.materializedColumns.get(tableName) ||
        this.materializedColumns.get(cleanName);
      if (fromMap) {
        for (const [name, type] of fromMap.entries()) {
          if (!columnsToAdd.has(name)) columnsToAdd.set(name, type);
        }
      }

      try {
        const client = this._sqlite ? this.sqlite : null;
        if (client) {
          let row: any = null;
          if (client.query) {
            row = client
              .query(`SELECT data FROM content_nodes WHERE _id = ? LIMIT 1`)
              .get(cleanName);
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
                  // Row-store hybrid: every scalar field becomes a column
                  // (indexed/unique fields too, when scalar-shaped).
                  if (helpers.shouldMaterializeField(field)) {
                    const fieldName = field.db_fieldName || field.label;
                    if (fieldName && !columnsToAdd.has(fieldName)) {
                      let colType = "text";
                      if (field.type === "number" || field.type === "integer") {
                        colType = "integer";
                      } else if (field.type === "boolean") {
                        colType = "boolean";
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
    const booleanCols: string[] = ["isDeleted"];
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
      // 🚀 ROW-STORE PARITY: the provisioning DDL adds these four materialized
      // columns to EVERY collection table (createModel base DDL). They must be
      // in the Drizzle def too, otherwise the read SELECT (built from the def)
      // omits them — the "ghost column" class: writes persisted slug/… to the
      // physical column while the API read served rows without them.
      collection: text("collection"),
      slug: text("slug"),
      locale: text("locale"),
      publishedAt: integer("publishedAt", { mode: "timestamp_ms" }),
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
          colName === "data" ||
          colName === "collection" ||
          colName === "slug" ||
          colName === "locale" ||
          colName === "publishedAt"
        )
          continue;
        if (colType === "boolean") {
          columns[colName] = integer(colName, { mode: "boolean" });
          booleanCols.push(colName);
        } else if (colType === "integer") {
          columns[colName] =
            colName === "publishedAt"
              ? integer(colName, { mode: "timestamp_ms" })
              : integer(colName);
        } else {
          columns[colName] = text(colName);
        }
      }
    }

    registerTableSchema(name, Object.keys(columns), booleanCols);

    return sqliteTable(name, columns, (t) => {
      const idxs: Record<string, any> = {
        tenantIdx: index(`${name}_tenant_idx`).on(t.tenantId),
        statusIdx: index(`${name}_status_idx`).on(t.status),
        updatedIdx: index(`${name}_updated_idx`).on(t.updatedAt),
        // Canonical tenant-scoped list query served by one index
        tenantStatusUpdatedIdx: index(`${name}_tenant_status_updated`).on(
          t.tenantId,
          t.status,
          t.updatedAt,
        ),
        // Status-less tenant list (default list page, ORDER BY updatedAt DESC)
        tenantUpdatedIdx: index(`${name}_tenant_updated`).on(t.tenantId, t.updatedAt),
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
        const batchValues: Record<string, any>[] = Array.from({ length: len });
        for (let i = 0; i < len; i++) {
          const item = data[i];
          const id = (item as any)._id || generateUUID();
          batchValues[i] = this.prepareValues(table, item, id, now, options);
        }

        // When already inside an outer transaction (seed multi-batch / explicit txn),
        // do not nest another BEGIN — SQLite forbids nested transactions and it
        // doubles fsync cost. RETURNING is skipped only when the caller opted in
        // explicitly (testing.ts seeds pass skipReturning: true) — the ambient
        // BENCHMARK env check was removed so benchmarks measure the production path.
        const skipReturning = (options as any)?.skipReturning === true;
        const inOuterTxn = Boolean(options?.transaction);

        // 🚀 RAW FAST PATH: single multi-VALUES INSERT is atomic on SQLite, so
        // the explicit BEGIN/COMMIT wrapper is unnecessary. One prepared
        // statement (stable SQL text → statement cache) beats the Drizzle AST
        // for 100 rows. Chunked to stay under SQLITE_MAX_VARIABLE_NUMBER (999).
        // Falls back to the Drizzle path on any error or outer-transaction use.
        if (!inOuterTxn) {
          // 🛡️ Partial-write guard: once ANY chunk executed, falling back to
          // Drizzle would re-insert the already-committed rows (PK collisions /
          // duplicates). Only a clean pre-write failure may fall through.
          let executedChunks = 0;
          try {
            // Union of column keys across rows — rows may omit optional
            // physical columns (status/slug/…) and the column default applies.
            const cols = new Set<string>();
            for (let i = 0; i < len; i++) {
              for (const k in batchValues[i]) cols.add(k);
            }
            // prepareValues omits createdAt when the caller supplies _id, and
            // the physical SQLite DDL has no createdAt default — always write
            // both timestamps (undefined rows are filled in the bind loop).
            cols.add("createdAt");
            cols.add("updatedAt");
            if (cols.size > 0) {
              const colListArr = Array.from(cols);
              const maxParams = 900;
              const chunkSize = Math.max(1, Math.floor(maxParams / colListArr.length));
              const colList = colListArr
                .map((c) => `"${utils.assertSafeSqlIdentifier(c, "column")}"`)
                .join(", ");
              const rowsOut: any[] = [];
              for (let start = 0; start < len; start += chunkSize) {
                const chunk = batchValues.slice(start, start + chunkSize);
                const params: any[] = [];
                const valuesSql: string[] = [];
                for (const row of chunk) {
                  const rowPlaceholders: string[] = [];
                  for (const c of colListArr) {
                    const v = row[c];
                    // Missing/undefined values: SQLite has no DEFAULT keyword
                    // in VALUES, and binding undefined writes NULL — which
                    // overrides the column default (measured: createdAt became
                    // NULL). Fill the Drizzle-table-definition defaults
                    // explicitly; nullable optional columns bind NULL.
                    if (v === undefined) {
                      if (c === "createdAt" || c === "updatedAt") params.push(now.getTime());
                      else if (c === "isDeleted") params.push(0);
                      else if (c === "status") params.push("draft");
                      else if (c === "data") params.push("{}");
                      else params.push(null);
                      rowPlaceholders.push("?");
                      continue;
                    }
                    if (v instanceof Date) params.push(v.getTime());
                    else if (v !== null && typeof v === "object" && !Array.isArray(v))
                      params.push(JSON.stringify(v));
                    else params.push(v);
                    rowPlaceholders.push("?");
                  }
                  valuesSql.push(`(${rowPlaceholders.join(", ")})`);
                }
                const sqlText = `INSERT INTO "${getTableName(table)}" (${colList}) VALUES ${valuesSql.join(", ")}${skipReturning ? "" : " RETURNING *"}`;
                const rawRows = await this.prepareAndExecuteWrite(sqlText, "all", ...params);
                executedChunks++;
                if (Array.isArray(rawRows) && rawRows.length > 0) rowsOut.push(...rawRows);
              }
              if (skipReturning) {
                // Seed / system-bulk callers don't consume the rows — returning
                // the prepared values WITHOUT JSON.parse/flatten conversion
                // halves the per-row bulk cost (the conversion was previously
                // identical on both paths, making skipReturning a no-op win).
                return batchValues as unknown as T[];
              }
              if (rowsOut.length === len) {
                return utils.convertArrayDatesToISO(rowsOut, { table: collection }) as T[];
              }
              // RETURNING mismatch after committed chunks — re-inserting via
              // the Drizzle path would duplicate the committed rows.
              if (executedChunks > 0) {
                throw new Error(
                  `Partial insertMany write for "${collection}" (${rowsOut.length}/${len} rows returned)`,
                );
              }
            }
          } catch (rawErr) {
            if (executedChunks > 0) {
              // Chunks already committed — re-running via Drizzle would throw
              // SQLITE_CONSTRAINT_PRIMARYKEY or duplicate rows. Fail instead.
              throw rawErr;
            }
            /* fall through to the Drizzle path below (nothing written yet) */
          }
        }

        const runInsert = async (dbOrTx: any) => {
          const query = dbOrTx.insert(table).values(batchValues);
          if (!skipReturning && this._insertManyReturningSupported !== false) {
            try {
              const results = await (query as any).returning();
              this._insertManyReturningSupported = true;
              return utils.convertArrayDatesToISO(results as any, {
                table: collection,
              }) as T[];
            } catch (err: any) {
              this._insertManyReturningSupported = false;
              logger.debug("[SQLite] insertMany returning fallback:", err.message);
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
        };

        const db = this.getDrizzleInstance(options);
        if (inOuterTxn) {
          return await runInsert(db);
        }
        // 🔒 TRANSACTION SPAN: the Drizzle BEGIN…COMMIT fallback runs under the
        // write mutex so no other writer interleaves mid-transaction.
        return await this.withWriteLock(() => db.transaction(async (tx: any) => runInsert(tx)));
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
  // Wrap override — single-writer safety for SQLite
  // --------------------------------------------------------------------------
  // The write mutex is NO LONGER held for the whole `wrap` body: CPU-only work
  // (prepareValues, row synthesis, hooks) must not serialize other writers.
  // Instead, single-statement writes lock at the statement level
  // (prepareAndExecuteWrite) and multi-statement transaction spans lock
  // explicitly via withWriteLock. This override is now a plain pass-through.

  public override async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
    _options?: any,
  ): Promise<DatabaseResult<T>> {
    return super.wrap(fn, code, message, _options);
  }

  /**
   * Write critical-section hook — runs `fn` under the SQLite single-writer
   * mutex. Use for multi-statement transaction spans (BEGIN…COMMIT).
   * Reentrant via AsyncLocalStorage: nested calls inside an active span
   * (e.g. writes inside the TransactionModule) execute directly.
   */
  public withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
    return SQLiteAdapterCore.writeMutex.runExclusive(async () => fn());
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
    return new SqlQueryBuilder(this, collection, SQLITE_DIALECT);
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
        const { bootstrapSystemSchema } = await import("../core/system-schema-bootstrap");
        // 🛡️ HARDENING: File-based lock so only one instance runs boot provisioning
        await withMigrationLock(this as any, "sqlite", async () => {
          await bootstrapSystemSchema("sqlite", this._sqlite);
        });
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
        const collectionName = normalizeCollectionTableName(String(row._id));
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
    // The base may resolve WITHOUT an extension (config-fallback path builds
    // `<folder>/<dbName>`). extname would be "" and replace() would then
    // PREPEND the suffix to the absolute path → an invalid worker file
    // (e.g. `_test_0D:/...`). Guard so the worker file always gets a real name.
    const workerPath = ext
      ? base.replace(ext, `_test_${index}${ext}`)
      : `${base}_test_${index}.sqlite`;
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
    // 🎯 PROFILE_DB=1: exec timing + busy-retry counts (WAL checkpoint stalls /
    // lock contention are invisible per request without this). Zero overhead
    // when the env flag is unset.
    const profileDb = typeof process !== "undefined" && process.env.PROFILE_DB === "1";
    const t0 = profileDb ? performance.now() : 0;
    try {
      // node:sqlite only binds null/number/bigint/string/Uint8Array — JS
      // booleans throw "Provided value cannot be bound". Coerce once here so
      // every raw path (insert/update/bulk/atomic) binds like the Drizzle path:
      // - booleans → 1/0
      // - Dates → epoch ms (never JSON.stringify, which yields a quoted string
      //   that integer timestamp columns reject)
      // - Uint8Array/Buffer → kept binary (JSON.stringify would corrupt blobs
      //   into {"type":"Buffer",...} text)
      // - plain objects → JSON text
      const len = params.length;
      let bound = params;
      if (len > 0) {
        let needsCoerce = false;
        for (let i = 0; i < len; i++) {
          const p = params[i];
          if (typeof p === "boolean" || typeof p === "object") {
            needsCoerce = true;
            break;
          }
        }
        if (needsCoerce) {
          bound = [];
          bound.length = len;
          for (let i = 0; i < len; i++) {
            const p = params[i];
            if (typeof p === "boolean") bound[i] = p ? 1 : 0;
            else if (p instanceof Date) bound[i] = p.getTime();
            else if (p instanceof Uint8Array) bound[i] = p;
            else if (p !== null && typeof p === "object") bound[i] = JSON.stringify(p);
            else bound[i] = p;
          }
        }
      }
      let out: any;
      if (method === "all") out = stmt.all(...bound);
      else if (method === "get") out = stmt.get(...bound);
      else if (method === "run") out = stmt.run(...bound);
      else if (method === "values") out = stmt.values(...bound);
      else out = stmt.all(...bound);
      return out;
    } catch (err: any) {
      if (profileDb && /busy|locked/i.test(String(err?.message || ""))) {
        const m = this.metrics as any;
        m.busyRetries = (m.busyRetries || 0) + 1;
      }
      logger.error(`[SQLite] Execution error: ${sqlText}`, err);
      throw err;
    } finally {
      if (profileDb) {
        const m = this.metrics as any;
        m.queryTimeMs = (m.queryTimeMs || 0) + (performance.now() - t0);
      }
    }
  }

  /**
   * Execute a WRITE statement under the write mutex. The critical section is
   * the statement itself — the surrounding CPU work (prepareValues, row
   * synthesis, response conversion) runs outside the lock so other writers
   * are not serialized behind it. Reentrant: inside an active withWriteLock
   * span / transaction (AsyncLocalStorage) the lock is already held and
   * execution is direct.
   */
  public prepareAndExecuteWrite(
    sqlText: string,
    method: "all" | "get" | "run" | "values" = "all",
    ...params: any[]
  ): any {
    return SQLiteAdapterCore.writeMutex.runExclusive(() =>
      this.prepareAndExecute(sqlText, method, ...params),
    );
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
        if (isNonSelect) {
          return this.prepareAndExecuteWrite(sqlText, method, ...params);
        }
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
    supportsAggregation: false,
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
      queryCount?: number;
      avgQueryMs?: number;
      busyRetries?: number;
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
      const data: {
        healthy: boolean;
        latency: number;
        activeConnections: number;
        queryCount?: number;
        avgQueryMs?: number;
        busyRetries?: number;
      } = {
        healthy: true,
        latency: performance.now() - start,
        activeConnections: 1,
      };
      // 🎯 PROFILE_DB=1 wait/queue breakdown (see prepareAndExecute).
      const m = this.metrics as any;
      if (m.queryTimeMs !== undefined && m.queryTimeMs > 0) {
        data.queryCount = m.queryCount || 0;
        data.avgQueryMs = m.queryTimeMs / (m.queryCount || 1);
        data.busyRetries = m.busyRetries || 0;
      }
      return { success: true, data };
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
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info(
        `[upsertNative] Table: ${tableName}, ID: ${values._id}, source: ${values.source}, tenant: ${values.tenantId}`,
      );
    }
    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        // 🛡️ Conflict-target column names become raw SQL identifiers — assert
        // the allow-list (fail closed) instead of trusting quote-doubling alone.
        const rawNames = conflictTarget.map((col: any) => {
          const name = col && typeof col === "object" && "name" in col ? col.name : String(col);
          return `"${utils.assertSafeSqlIdentifier(name, "conflict-target")}"`;
        });
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
        const nowMs = now.getTime();
        const { sql: tenantSql, params: tenantParams } = utils.buildRawTenantClause(
          options,
          "sqlite",
        );
        const dataCol = this.getColumn(table, "data");
        const idStr = String(id);
        // Identifiers may be embedded; values (_id, amount, tenantId, timestamp) are always bound.
        const safeField = utils.assertSafeSqlIdentifier(field);
        const amountNum = utils.assertFiniteAmount(amount);
        // 🚀 ROW-STORE HYBRID: materialized numeric fields live in a column —
        // increment the column directly (json_set on `data` would no-op for new
        // rows whose field never entered the blob).
        const fieldIsColumn = !!this.getColumn(table, field);

        // Bind amount + timestamp as parameters (stable SQL text → statement cache hits)
        const updateReturning = fieldIsColumn
          ? `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + ?, "updatedAt" = ? WHERE "${idCol.name}" = ?${tenantSql} RETURNING *`
          : dataCol
            ? `UPDATE "${tableName}" SET "data" = json_set(coalesce("data", '{}'), '$.${safeField}', coalesce(json_extract(coalesce("data", '{}'), '$.${safeField}'), 0) + ?), "updatedAt" = ? WHERE "${idCol.name}" = ?${tenantSql} RETURNING *`
            : `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + ?, "updatedAt" = ? WHERE "${idCol.name}" = ?${tenantSql} RETURNING *`;

        // 🔒 SPAN LOCK: the UPDATE (+ its SELECT read-back) must be atomic —
        // another writer must not interleave between the increment and the
        // returned-row read.
        return this.withWriteLock(async () => {
          try {
            const rows = this.prepareAndExecute(
              updateReturning,
              "all",
              amountNum,
              nowMs,
              idStr,
              ...tenantParams,
            );
            if (Array.isArray(rows) && rows.length > 0) {
              return utils.convertDatesToISO(rows[0], {
                table: collection,
              }) as Record<string, unknown>;
            }
          } catch (err: any) {
            logger.debug(`SQLite RETURNING failed, using inline SELECT fallback: ${err.message}`);
          }

          const updateSql = fieldIsColumn
            ? `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + ?, "updatedAt" = ? WHERE "${idCol.name}" = ?${tenantSql}`
            : dataCol
              ? `UPDATE "${tableName}" SET "data" = json_set(coalesce("data", '{}'), '$.${safeField}', coalesce(json_extract(coalesce("data", '{}'), '$.${safeField}'), 0) + ?), "updatedAt" = ? WHERE "${idCol.name}" = ?${tenantSql}`
              : `UPDATE "${tableName}" SET "${safeField}" = coalesce("${safeField}", 0) + ?, "updatedAt" = ? WHERE "${idCol.name}" = ?${tenantSql}`;

          this.prepareAndExecute(updateSql, "run", amountNum, nowMs, idStr, ...tenantParams);

          const selectRows = this.prepareAndExecute(
            `SELECT * FROM "${tableName}" WHERE "${idCol.name}" = ?${tenantSql} LIMIT 1`,
            "all",
            idStr,
            ...tenantParams,
          );
          if (!Array.isArray(selectRows) || selectRows.length === 0) {
            throw new Error(`Entry not found after increment: ${idStr}`);
          }
          return utils.convertDatesToISO(selectRows[0], {
            table: collection,
          }) as Record<string, unknown>;
        });
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

    // 🚀 FAST PATH: table already provisioned in this process — skip all DDL.
    // _provisionedTables is populated by _warmTableRegistry() at boot and by
    // the full DDL path below. A `force` flag overrides for schema migrations.
    if (!force && this._provisionedTables.has(normalizedName)) return;

    const table = this.getTable(normalizedName);
    const physicalName = getTableName(table as any);

    await this.wrap(
      async () => {
        const debugMode = process.env.BENCHMARK_DEBUG === "true";

        const ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" TEXT PRIMARY KEY, "tenantId" TEXT, "collection" TEXT, "slug" TEXT, "locale" TEXT, "status" TEXT DEFAULT 'draft', "publishedAt" INTEGER, "isDeleted" INTEGER DEFAULT 0, "createdAt" INTEGER, "updatedAt" INTEGER, "data" TEXT);`;
        if (debugMode) logger.debug(`[DB Provision] [SQLITE] Executing DDL for ${physicalName}`);
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
          const materialized = new Map<string, string>();
          for (const field of schemaData.fields) {
            // Row-store hybrid: scalar fields become physical columns — the
            // `data` blob keeps only dynamic fields for new rows.
            if (helpers.shouldMaterializeField(field)) {
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
                  materialized.set(
                    fieldName,
                    colType === "INTEGER"
                      ? field.type === "boolean"
                        ? "boolean"
                        : "integer"
                      : "text",
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

        const allColumnsToEnsure = [...columns, ...dynamicCols];
        registerTableSchema(normalizedName, [
          "_id",
          "data",
          ...allColumnsToEnsure.map((c) => c.name),
        ]);

        // Collect which dynamic columns are actually present after ALTER TABLE.
        // This avoids noisy CREATE INDEX errors when a column couldn't be added
        // (e.g. under node:sqlite proxy driver where ALTER TABLE may silently fail).
        const addedColumns = new Set<string>();
        // One PRAGMA per table — the previous per-column loop re-read table_info N times.
        let existingCols = new Set<string>();
        try {
          const tableInfo = this.prepareAndExecute(
            `PRAGMA table_info("${physicalName}")`,
            "all",
          ) as any[];
          if (Array.isArray(tableInfo)) {
            existingCols = new Set(tableInfo.map((c: any) => c.name as string));
          }
        } catch {
          /* table may not exist yet — ALTER path still runs */
        }
        for (const col of allColumnsToEnsure) {
          try {
            // Defense-in-depth: schema-defined column names are interpolated as identifiers
            const safeColName = utils.assertSafeSqlIdentifier(col.name, "column");
            const exists = existingCols.has(safeColName);
            if (!exists) {
              await this.raw.execute(
                `ALTER TABLE "${physicalName}" ADD COLUMN "${safeColName}" ${col.type}`,
              );
              // 🚀 SELF-HEALING BACKFILL: legacy rows keep their field values in
              // the `data` blob — copy them into the new column so filters and
              // sorts on the materialized field match old rows too (idempotent:
              // only NULL columns are filled; repeated createModel calls no-op).
              try {
                await this.raw.execute(
                  `UPDATE "${physicalName}" SET "${safeColName}" = json_extract("data", '$.${safeColName}') WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL`,
                );
              } catch {
                /* backfill is best-effort */
              }
              existingCols.add(safeColName);
            }
            addedColumns.add(safeColName);
          } catch {
            /* safe — column may already exist or ALTER TABLE unsupported */
          }
        }

        for (const col of dynamicCols) {
          if (!addedColumns.has(col.name)) continue;
          try {
            const indexName = `${physicalName}_${col.name}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${col.name}")`,
            );
            // 🚀 Covering composite index for filter+sort on dynamic columns:
            // WHERE tenantId=? AND status=? ORDER BY col.name, _id
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_status_${col.name}_id" ON "${physicalName}" ("tenantId", "status", "${col.name}", "_id")`,
            );
          } catch {
            /* safe */
          }
        }

        // 🚀 COMPOSITE INDEX for the canonical tenant list query:
        // WHERE tenantId=? AND status=? ORDER BY updatedAt DESC LIMIT n.
        // Single-column indexes force a temp B-tree sort; this serves the
        // whole query from one index (measured: listPlain 102 → ~8k RPS at 100k rows).
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_status_updated" ON "${physicalName}" ("tenantId", "status", "updatedAt")`,
          );
        } catch {
          /* safe */
        }
        // 🚀 KEYSET TIEBREAKER variant: findPage appends "_id" to the default
        // sort (updatedAt DESC, _id DESC) so pages never overlap when rows
        // share a timestamp. Including _id in the index keeps that ORDER BY
        // index-served (no temp B-tree sort). New name on purpose — existing
        // deployments keep the legacy 3-column index via IF NOT EXISTS.
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_status_updated_id" ON "${physicalName}" ("tenantId", "status", "updatedAt", "_id")`,
          );
        } catch {
          /* safe */
        }

        // 🚀 COMPOSITE INDEX for the status-less tenant list (the default list
        // page): WHERE tenantId=? ORDER BY updatedAt DESC LIMIT n. Without it
        // SQLite scans the tenant index and sorts in a temp B-tree (~0.2ms/1k
        // rows, growing linearly); with it the query is served directly from
        // the index (measured ~6× faster, flat at 10k+ rows).
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_updated" ON "${physicalName}" ("tenantId", "updatedAt")`,
          );
        } catch {
          /* safe */
        }
        // 🚀 KEYSET TIEBREAKER variant of the status-less tenant index (see above).
        try {
          await this.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_updated_id" ON "${physicalName}" ("tenantId", "updatedAt", "_id")`,
          );
        } catch {
          /* safe */
        }

        logger.info(`[SQLITE Adapter] Provisioned table: ${physicalName}`);
        this._provisionedTables.add(normalizedName);
        // DDL changed the table shape — cached statements may reference old columns
        this.clearStatementCaches();
        // The pre-DDL table def (base columns only) is stale — rebuild with the
        // materialized columns on next getTable.
        this.tableRegistry.delete(tableName);
        this.tableRegistry.delete(normalizedName);
        this.tableRegistry.delete(normalizeCollectionTableName(normalizedName));
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
    // Use process.versions.bun instead of typeof Bun — avoids TS "Cannot find name 'Bun'"
    const isBun = !!(versions as any).bun;
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
        // Standard dynamic import — "bun:sqlite" is declared in app.d.ts and
        // listed in Vite's externals, so it is never statically bundled. The
        // outer isBun guard (process.versions.bun) keeps this off the Node
        // path; a failure still falls through to the node:sqlite fallback.
        // (Previously used `new Function('return import(...)')` — an RCE-class
        // eval sink that external scanners ban categorically.)
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

        // 🚀 PREPARED-STATEMENT CACHE: Drizzle's SQLiteBunSession.prepareQuery
        // calls client.prepare(query.sql) on EVERY query (no reuse). Caching by
        // SQL text turns per-call sqlite3_prepare (~4µs, 6.6x slower) into a
        // Map hit. Statements are safe to reuse: Drizzle never finalizes them
        // (session.js only calls stmt.run/all/values) and each call binds params
        // afresh. Schema-changing operations (createModel/clearDatabase) clear
        // the cache via clearStatementCaches().
        const stmtCache = new Map<string, any>();
        const origPrepare = sqlite.prepare.bind(sqlite);
        sqlite.prepare = (sqlText: string) => {
          let stmt = stmtCache.get(sqlText);
          if (!stmt) {
            stmt = origPrepare(sqlText);
            if (stmtCache.size < 2000) stmtCache.set(sqlText, stmt);
          }
          return stmt;
        };
        sqlite.clearStatementCache = () => stmtCache.clear();
        this._preparedStatementClients.add(sqlite);

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
                // Dates → epoch ms (JSON.stringify yields a quoted string that
                // integer timestamp columns reject); Uint8Array/Buffer → kept
                // binary (node:sqlite binds those natively — stringifying
                // corrupts blobs into {"type":"Buffer",...} text).
                if (p instanceof Date) return p.getTime();
                if (p instanceof Uint8Array) return p;
                if (p !== null && typeof p === "object") return JSON.stringify(p);
                return p;
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

    const VALID_SYNC_MODES = new Set(["OFF", "NORMAL", "FULL", "EXTRA"]);
    const rawSync = process.env.SQLITE_SYNCHRONOUS?.toUpperCase().trim();
    const syncMode = rawSync && VALID_SYNC_MODES.has(rawSync) ? rawSync : "NORMAL";

    const rawTimeout = process.env.SQLITE_BUSY_TIMEOUT?.trim();
    const busyTimeout = rawTimeout && /^\d+$/.test(rawTimeout) ? rawTimeout : "30000";

    const rawCheckpoint = process.env.SQLITE_WAL_AUTOCHECKPOINT?.trim();
    const walCheckpoint = rawCheckpoint && /^\d+$/.test(rawCheckpoint) ? rawCheckpoint : "4000";

    const hw = getHardwareProfile();
    const cacheSizeKb = hw.sqliteCacheSizeKb;
    const mmapBytes = hw.sqliteMmapSizeBytes;

    safeExec("PRAGMA journal_mode=WAL");
    safeExec(`PRAGMA synchronous=${syncMode}`);
    safeExec("PRAGMA foreign_keys=ON");
    safeExec("PRAGMA page_size=8192");
    safeExec(`PRAGMA busy_timeout=${busyTimeout}`);
    safeExec("PRAGMA temp_store=MEMORY");
    safeExec(`PRAGMA mmap_size=${mmapBytes}`);
    safeExec(`PRAGMA cache_size=-${cacheSizeKb}`);
    safeExec(`PRAGMA wal_autocheckpoint=${walCheckpoint}`);
  }

  private async resolvePath(config: string | SQLiteConfig): Promise<string> {
    const path = await import("node:path");
    const fs = await import("node:fs");

    let dbPath = typeof config === "string" ? config : config.connectionString;

    // Host may be a direct SQLite file path (test bridge passes host=auditFile
    // in db.ts when no config file exists yet).
    if (!dbPath && config && typeof config === "object") {
      const host = (config as any).host;
      if (
        typeof host === "string" &&
        host &&
        host !== "localhost" &&
        host !== "127.0.0.1" &&
        !host.includes("://")
      ) {
        const name = (config as any).DB_NAME;
        if (host.endsWith(".sqlite") || host.endsWith(".db") || host.endsWith(":memory:")) {
          dbPath = host;
        } else if (name) {
          dbPath = `${host.endsWith("/") || host.endsWith("\\") ? host : `${host}/`}${name}`;
        }
      }
    }

    if (!dbPath) {
      const { isSetupComplete } = await import("@utils/setup-check-fast");
      const isTestHarness =
        process.env.TEST_MODE === "true" ||
        process.env.VITEST === "true" ||
        process.env.BUN_TEST === "true" ||
        process.env.BENCHMARK === "true";
      // Env DB_NAME is an explicit test-mode contract (the E2E/integration
      // harnesses pass it when no private.test.ts exists yet — e.g. the setup
      // wizard boot). The guard below only refuses when NO name is given.
      const rawDbName = (config as any).DB_NAME || process.env.DB_NAME;
      // 🛡️ EXTENSION CANONICALIZATION: config-state's resolveSqlitePath
      // (connection-string path) always appends ".sqlite". This fallback
      // previously built `folder/<name>` WITHOUT the extension, so processes
      // with and without a config landed on DIFFERENT files for the same
      // logical DB (seed → sveltycms_test.sqlite, server → sveltycms_test)
      // and benchmark logins 401'd against an empty sibling file. Append the
      // extension here too so every code path resolves identically.
      const dbName =
        rawDbName &&
        !rawDbName.endsWith(".sqlite") &&
        !rawDbName.endsWith(".db") &&
        !rawDbName.endsWith(":memory:")
          ? `${rawDbName}.sqlite`
          : rawDbName;
      const isTestDb =
        isTestHarness || (dbName && (dbName.includes("test") || dbName.includes("benchmark")));
      const defaultDbFolder = isTestDb ? "config/test-database" : "config/database";

      // 🛡️ FAIL-CLOSED: automated harnesses must never silently fall back to
      // the live/default name (sveltycms.db). A config object without DB_NAME
      // used to land benchmark data in `config/test-database/sveltycms.db`,
      // mixing test state under the live DB name across runs. Require an
      // explicit name (or DB_PATH) instead of guessing.
      if (isTestHarness && !dbName) {
        throw new Error(
          `[SQLite] Refused to connect without DB_NAME in test/benchmark mode. ` +
            `Pass DB_NAME (or set DB_PATH) explicitly so tests never use the live ` +
            `default file. Received config: ${JSON.stringify(config)}`,
        );
      }

      dbPath =
        process.env.DB_PATH ||
        (dbName
          ? `${defaultDbFolder}/${dbName}`
          : isSetupComplete()
            ? `${defaultDbFolder}/sveltycms.db`
            : ":memory:");
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
