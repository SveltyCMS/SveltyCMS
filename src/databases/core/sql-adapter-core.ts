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
 * - PK upsert / upsertMany as one INSERT ON CONFLICT / ON DUPLICATE KEY
 * - shared delegation helpers (getColumn, getPhysicalSelection, mapQuery, applyOrderBy)
 * - shared prepareValues with dialect-specific JSON serialization
 * - persistTimestampsAsDate: PG binds ISO text (raw-db-ceiling shape); SQLite keeps Date
 * - sparse synthesizeInsertRow: listed columns + defaults, no NULL placeholders
 * - wrap-off insert/update: skipMeta+isWrite settles without an extra async hop
 * - shared domain module lazy-loading (auth, content, media, system, batch, collection)
 * - shared cache/registry state management
 * - materialized-column registry shared by createModel and schema prewarm
 * - prepared queryBuilder list/count via executeCompiled
 * - lazy list index for a physical sort other than updatedAt
 * - pure JSON-merge / value-preparation / soft-delete predicates live in `core/`
 */
import { BaseAdapter } from "./base-adapter";
import { logger } from "@utils/logger";
import type {
  BaseEntity,
  BaseQueryOptions,
  CountOptions,
  DatabaseResult,
  DatabaseId,
  FindOptions,
  FindPageOptions,
  FindPageResult,
  EntityCreate,
  EntityUpdate,
  QueryFilter,
  QueryBuilder,
  ICrudAdapter,
  ISqlAdapter,
} from "../db-interface";
import {
  // Aliased: the class method `applyOrderBy` below owns the plain name.
  applyOrderBy as applyOrderByHelper,
  getColumnHelper,
  getPhysicalSelection,
  isSystemTable,
  mapQuery,
  materializedColumnTypes,
  resolveSystemTableName,
  SQL_TABLE_ALIASES,
  SYSTEM_LITERAL_COLUMNS,
  rowsAffected,
  RAW_DECLINED,
  type RawFindResult,
} from "./drizzle-sql-helpers";
import { normalizeCollectionTableName } from "./collection-name";
import { generateUUID } from "@utils/native-utils";
import { nowISODateString } from "@src/utils/date";
import { getTableColumns, getTableName, asc, desc, type Column, eq, and } from "drizzle-orm";
import { type SQL } from "drizzle-orm";
import {
  applyTenantFilter,
  assertSafeSqlIdentifier,
  buildRawTenantClause,
  convertArrayDatesToISO,
  convertDatesToISO,
  convertISOToDates,
  getEffectiveTenantId,
  registerNestedDataTable,
  registerTableSchema,
  validateId,
} from "./relational-utils";
import { RelationalAuthModule } from "./relational-auth";
import { RelationalContentModule } from "./relational-content";
import { RelationalMediaModule } from "./relational-media";
import { RelationalSystemModule } from "./relational-system";
import { PROFILE_WRITE_ENABLED, profileMark } from "@utils/write-profiler";
import { BatchModule } from "./batch-module";
import { CollectionModule } from "./collection-module";
import { normalizeSortDirection } from "./page-utils";
import {
  clearJsonDataPatch,
  getJsonDataPatch,
  jsonPatchNeedsJsMerge,
  queryHasSoftDeleteKey,
} from "./query-primitives";
import {
  clearCompiledSqlCache,
  SqlQueryBuilder,
  type SqlDialect,
  SQLITE_DIALECT,
} from "./sql-query-builder";
import { type InsertDefaultEntry } from "./sql-values";
import {
  executeSqlCount,
  executeSqlExists,
  executeSqlFindById,
  executeSqlFindMany,
  executeSqlFindOne,
  executeSqlStreamMany,
  type SqlCrudReadContext,
} from "./sql-crud-read";
import {
  buildJsonUpsertMergeSet,
  executeSqlUpsert,
  executeSqlUpsertMany,
  type SqlUpsertContext,
} from "./sql-upsert";
import { executeSqlAggregate, type SqlAggregateContext } from "./sql-aggregate";
import {
  executeFindPointWireStream,
  executeFindListWireStream,
  type RawPointWireStreamResult,
  type RawListWireStreamResult,
  type SqlWireStreamContext,
} from "./sql-wire-stream";
import {
  buildDefaultSoftDeleteSet,
  executeSqlDelete,
  executeSqlDeleteMany,
  executeSqlRestore,
  type SqlCrudDeleteContext,
} from "./sql-crud-delete";
import { estimateSqlTableRows, executeSqlFindPage } from "./sql-page-runner";
import { SqlCoalescerManager, type SqlCoalescerContext } from "./sql-coalescer";
import {
  getSqlDateColumnKeys,
  getSqlInsertDefaultsPlan,
  prepareSqlValues,
  synthesizeSqlInsertRow,
  type SqlValuesContext,
} from "./sql-values";
import {
  applySqlJsonMergeToSet,
  assertTopLevelJsonPatchKey,
  buildJsonKeyPatchSetValue,
  buildJsonMergeSetValue,
  canMergeJsonPatchInOneStatement,
  hydrateSqlJsonDataPatch,
  jsonMergeWrapperExpression,
  mergeSqlJsonPatchIntoSet,
  serializeJsonPatchValue,
  type SqlJsonPatchContext,
} from "./sql-json-patch";

// ============================================================================
// System table schema pre-registration (module scope — evaluated once)
// ============================================================================
// Registers every system table's literal column list so the schema-aware fast
// branch in `convertDatesToISO` / `convertArrayDatesToISO` is available to ALL
// SQL adapters. This previously lived in the SQLite adapter, which left
// PostgreSQL and MariaDB on the per-key `DATE_FIELDS` / `JSON_FIELDS` walk.
//
// Safe as a module-scope side effect: `registerTableSchema` is idempotent and
// ADDITIVE (it merges into the single TableMeta registry), so re-evaluating this
// module can only add column knowledge — never shrink or corrupt it.
for (const [tableName, columns] of Object.entries(SYSTEM_LITERAL_COLUMNS)) {
  registerTableSchema(tableName, columns as string[]);
}

// The `data` column on the version tables IS the document snapshot, not a
// row-store blob: flattening it let the snapshot's `_id` overwrite the version
// row's primary key (revision pruning deleted nothing) and removed `data` from
// the API response.
registerNestedDataTable("contentRevisions");
registerNestedDataTable("contentDrafts");

// The curated literal lists predate a few physical columns of the auth tables.
// Register the schema-authoritative superset so the fast branch sees exactly the
// field set the un-schemed walk saw: a registered table skips the per-key
// DATE_FIELDS/JSON_FIELDS checks, so any column missing here would read back
// unparsed/unconverted (a security bug for auth data, not a perf one).
registerTableSchema("authUsers", [
  ...SYSTEM_LITERAL_COLUMNS.authUsers,
  "preferences", // JSON blob column (JSON_FIELDS)
  "failedAttempts",
  "lockoutUntil", // timestamp column (DATE_FIELDS)
]);
registerTableSchema("authSessions", [
  ...SYSTEM_LITERAL_COLUMNS.authSessions,
  "amr", // JSON array column — normalised by normalizeSessionAmr
  "mfaVerifiedAt", // timestamp column (DATE_FIELDS)
]);

// ============================================================================
// Partial-update JSON `data` merge
// ============================================================================
// The patch marker + helpers live in `query-primitives.ts` (a leaf module — this
// file imports BatchModule, so pulling the helpers in here would create a cycle).
// Callers import them from there; this file re-exports nothing.

// ============================================================================
// Abstract SqlAdapterCore — shared base for all SQL adapters
// ============================================================================

/** Covering list index the query builder may schedule for one physical sort. */
export interface ListIndexRequest {
  column: string;
  direction: "asc" | "desc";
  /** Leading `tenantId` equality, so the index is `(tenantId, column, _id)`. */
  withTenant: boolean;
}

export type { RawPointWireStreamResult, RawListWireStreamResult };

/**
 * Sentinel for the raw point-read fast path.
 *
 * `null` from `rawFindById` now means "the SELECT ran and matched 0 rows"
 * (definitively absent); `RAW_DECLINED` means "the raw path could not run" (no
 * connection handle, a transaction without a client, or a thrown error). Before
 * this split both cases returned `null`, so a 404 `findById` ran the raw SELECT
 * and then the identical Drizzle SELECT — two round trips on every miss.
 */
export { RAW_DECLINED, type RawFindResult };

const LIST_INDEX_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Index plan for a paginated list order. Only a same-direction `(column, _id)`
 * pair is worth a B-tree. `updatedAt` and `status` already have list indexes.
 */
export function listIndexRequest(
  order: readonly { name: string; direction: "asc" | "desc" }[],
  equalityColumns: readonly string[],
): ListIndexRequest | null {
  if (order.length !== 2 || order[1].name !== "_id") return null;
  if (order[0].direction !== order[1].direction) return null;
  const column = order[0].name;
  if (column === "_id" || column === "updatedAt" || column === "status") return null;
  if (!LIST_INDEX_FIELD.test(column)) return null;
  return {
    column,
    direction: order[0].direction,
    withTenant: equalityColumns.includes("tenantId"),
  };
}

/** Index names must fit PostgreSQL NAMEDATALEN (63) and MariaDB's 64-char limit. */
export function boundedSqlIndexName(name: string): string {
  if (name.length <= 63) return name;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const suffix = `_${hash.toString(16).padStart(8, "0")}`;
  return `${name.slice(0, 63 - suffix.length)}${suffix}`;
}

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

  /**
   * Resolve a collection name to its Drizzle table definition.
   * Cached in `tableRegistry`. Handles system tables, collection_ prefix normalization,
   * safe identifier validation, and dynamic materialized column injection.
   */
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
      // (SELECT/INSERT/DDL) across the adapter. Dash-stripping alone did not
      // stop quote/backtick breakout from admin-typed collection names — fail
      // closed BEFORE any SQL is assembled.
      assertSafeSqlIdentifier(cleanId, "collection");
      // ⚠️ Composite length guard: the interpolated identifier is
      // `collection_${cleanId}` (11-char prefix). A bare-label pass alone is
      // not enough — the composite can exceed identifier limits.
      // Fail closed on the FINAL identifier (normalizeCollectionTableName is
      // the single source of truth for the physical name derivation).
      const tableName = assertSafeSqlIdentifier(normalizeCollectionTableName(collection), "table");

      const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
      if (isSystemTable(cleanName) && cleanName !== collection) {
        return this.getTable(cleanName);
      }

      // 🚀 ROW-STORE HYBRID: materialized scalar fields (populated by
      // createModel) exist in the Drizzle def so filters/sorts/writes use the
      // column; the `data` blob keeps only dynamic fields.
      const columnsToAdd = this.getColumnsToAdd(collection, tableName, cleanName);
      const dynamicTable = this.createDynamicTableDefinition(tableName, columnsToAdd);
      this.tableRegistry.set(collection, dynamicTable);
      return dynamicTable;
    } finally {
      this._resolving.delete(collection);
    }
  }

  /**
   * Hook for resolving dynamic columns to add to dynamic collection tables.
   * Default implementation checks materializedColumns registry.
   */
  protected getColumnsToAdd(
    collection: string,
    tableName: string,
    cleanName: string,
  ): Map<string, string> | undefined {
    return (
      this.materializedColumns.get(cleanName) ||
      this.materializedColumns.get(tableName) ||
      this.materializedColumns.get(collection) ||
      undefined
    );
  }

  /** Return dialect-specific JSON field extraction SQL (e.g., json_extract, JSON_EXTRACT, data->>). */
  public abstract getJsonField(field: string): SQL;

  /**
   * Called when a sort targets a dynamic `data` field with no physical column.
   * Adapters with an expression-index capability (PostgreSQL) schedule a lazy
   * `CREATE INDEX IF NOT EXISTS` here so repeated sorts stop paying the
   * scan+sort (see `postgresql/adapter-core.ts`). Default: no-op.
   */
  protected onDynamicSort(_collection: string, _tableName: string, _field: string): void {}

  /**
   * Called once per `findMany` with the effective options. Adapters override to
   * provision an index for a PHYSICAL sort the caller never asked for — the
   * SDK's default `updatedAt desc, _id desc` (`defaultListSortOption`).
   * `onDynamicSort` cannot cover it: it only fires for fields that resolve to a
   * JSON extraction, while `updatedAt` and `_id` are real columns. Default: no-op.
   */
  protected onFindMany(_collection: string, _options: unknown): void {}

  /**
   * One attempt per (table, column, direction, tenant prefix). A failed build
   * stays marked so a hot list does not retry DDL on every request.
   */
  private _listSortIndexKeys = new Set<string>();

  /**
   * Query-builder hook: a paginated physical sort that is not the stock
   * `(updatedAt, _id)` order. Schedules one covering index and returns.
   * `updatedAt` already has `(tenantId, updatedAt, _id)`.
   */
  public noteListSort(
    collection: string,
    order: readonly { name: string; direction: "asc" | "desc" }[],
    equalityColumns: readonly string[],
  ): void {
    if (process.env.SVELTY_LAZY_SORT_INDEXES === "0") return;
    const plan = listIndexRequest(order, equalityColumns);
    if (!plan) return;
    let tableName: string;
    try {
      const table = this.getTable(collection);
      if (!table || !this.getColumn(table, plan.column)) return;
      const resolved = getTableName(table);
      if (typeof resolved !== "string" || resolved.length === 0) return;
      tableName = resolved;
    } catch {
      return;
    }
    const key = `${tableName}\0${plan.column}\0${plan.direction}\0${plan.withTenant ? "1" : "0"}`;
    if (this._listSortIndexKeys.has(key) || this._listSortIndexKeys.size >= 64) return;
    this._listSortIndexKeys.add(key);
    try {
      this.scheduleListSortIndex(tableName, plan);
    } catch {
      /* The read still runs. The key stays so DDL is not retried per request. */
    }
  }

  /** Dialect DDL for {@link noteListSort}. Default: no index. */
  protected scheduleListSortIndex(_tableName: string, _plan: ListIndexRequest): void {}

  /** Engine-specific SQL dialect instance (SQLite, MariaDB, PostgreSQL). Default: SQLite dialect. */
  public get sqlDialect(): SqlDialect {
    return SQLITE_DIALECT;
  }

  /**
   * Unified QueryBuilder factory shared across all SQL adapters.
   */
  public queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T> {
    return new SqlQueryBuilder<T>(this, collection, this.sqlDialect);
  }

  /**
   * Driver statement cache for a compiled queryBuilder list or count.
   * PostgreSQL overrides this to pass `prepare: true` (the measured findMany win).
   * SQLite and MariaDB `raw.execute` already prepares.
   */
  public async executeCompiled(
    sqlText: string,
    params: readonly unknown[],
    _options?: BaseQueryOptions,
  ): Promise<unknown[]> {
    const rows = await this.raw.execute(sqlText, [...params]);
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Fired after materialized columns are registered for a collection.
   * PostgreSQL drops a leftover `(data->>'field')` expression index so an
   * update of the real column does not also maintain the blob index.
   */
  protected onMaterializedFieldsRegistered(
    _physicalTable: string,
    _columns: Map<string, string>,
  ): void {}

  /**
   * Record which scalar fields live in real columns, under every spelling
   * `getTable` might be called with, and drop any cached blob-only def.
   *
   * `createModel` is not the only boot path. Production and benchmark servers
   * load compiled schemas with reconciliation skipped, then `getTable` caches
   * a definition built while this map is empty. Later writes see no `views`
   * column and fold the patch into `data`. Registering here is what makes
   * `materialize: true` (and numeric fields) take effect on that path.
   */
  public rememberMaterializedColumns(schema: {
    _id?: string;
    id?: string;
    name?: string;
    slug?: string;
    fields?: unknown;
  }): void {
    const columns = materializedColumnTypes(schema?.fields);
    if (columns.size === 0) return;

    const ids = [schema._id, schema.id, schema.name, schema.slug].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    const keys = new Set<string>();
    for (const id of ids) {
      const bare = id.replace(/-/g, "");
      keys.add(id);
      keys.add(bare);
      keys.add(id.toLowerCase());
      keys.add(bare.toLowerCase());
      try {
        // Physical spelling (hyphens stripped, one collection_ prefix). A
        // hand-built `collection_${id}` maps hyphenated ids to the wrong table.
        const physical = normalizeCollectionTableName(id);
        keys.add(physical);
        keys.add(physical.toLowerCase());
      } catch {
        /* Unsafe collection id — the logical spellings above still apply. */
      }
    }
    for (const key of keys) {
      this.materializedColumns.set(key, columns);
      this.tableRegistry.delete(key);
      this.dynamicTables.delete(key);
    }
    this.clearStatementCaches();

    const primary = ids[0];
    if (!primary) return;
    try {
      this.onMaterializedFieldsRegistered(normalizeCollectionTableName(primary), columns);
    } catch {
      /* Identifier rejected — the registry entries above are still in place. */
    }
  }

  /**
   * Clear cached prepared statement templates and SQL strings.
   * Called after DDL operations or schema mutations.
   */
  public clearStatementCaches(): void {
    this._rawFindByIdSqlCache = new WeakMap();
    // DDL that adds a physical column invalidates every cached `SELECT *` plan
    // in the shared query builder (the cache key is shape-only, not column-list).
    clearCompiledSqlCache();
  }

  /** FIFO-evict a Map cache at `cap` entries. */
  protected evictIfFull(cache: Map<unknown, unknown>, cap = 256): void {
    if (cache.size >= cap) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  /** Create a Drizzle dynamic table definition using dialect-specific column types. */
  public abstract createDynamicTableDefinition(
    name: string,
    columnsToAdd?: Map<string, string>,
  ): any;

  private _rawColsCache = new WeakMap<object, { withData: string[]; withoutData: string[] }>();
  private _dynamicColListCache = new WeakMap<
    object,
    {
      withData?: { colList: string; columns: string[] };
      withoutData?: { colList: string; columns: string[] };
    }
  >();
  private _escapedTableNameCache = new WeakMap<object, string>();

  /**
   * Stable column list for raw findById SELECTs — base columns + registered
   * materialized columns (sorted extras keep the SQL text stable per schema
   * state; statement caches are cleared on DDL). The `data` blob is included
   * only for full-doc reads.
   *
   * 🚀 ZERO-ALLOCATION PATH: Memoized per table instance via WeakMap.
   */
  protected getRawFindByIdCols(table: any, wantsData: boolean): string[] {
    let cached = this._rawColsCache.get(table);
    if (!cached) {
      const baseNoData = ["_id", "status", "tenantId", "createdAt", "updatedAt", "isDeleted"];
      const baseWithData = [
        "_id",
        "status",
        "tenantId",
        "createdAt",
        "updatedAt",
        "isDeleted",
        "data",
      ];
      let cols: Record<string, unknown> | undefined = this._tableColumnsCache.get(table);
      if (!cols) {
        try {
          const resolved = getTableColumns(table);
          if (resolved) cols = resolved as any;
        } catch {
          /* safe */
        }
      }
      if (cols) {
        const extras = Object.keys(cols).filter(
          (c) => !baseWithData.includes(c) && !c.startsWith("Symbol(") && c !== "_",
        );
        extras.sort();
        cached = {
          withData: [...baseWithData, ...extras],
          withoutData: [...baseNoData, ...extras],
        };
      } else {
        cached = {
          withData: baseWithData,
          withoutData: baseNoData,
        };
      }
      this._rawColsCache.set(table, cached);
    }
    return wantsData ? cached.withData : cached.withoutData;
  }

  /** Check whether an error indicates "table does not exist" for this dialect. */
  protected abstract isMissingTableError(err: any): boolean;

  // --------------------------------------------------------------------------
  // Overridable template hooks — defaults suitable for MariaDB/PostgreSQL;
  // SQLite overrides several of these.
  // --------------------------------------------------------------------------

  /** Options bag passed to convertDatesToISO / convertArrayDatesToISO. */
  public get convertDatesOptions(): Record<string, any> {
    return { inPlace: true };
  }

  /**
   * True when timestamp columns must be bound as JS Date (SQLite timestamp_ms,
   * MariaDB DATETIME). PostgreSQL overrides this: postgres.js binds ISO text
   * (`bindPgParam` Date→toISOString), so keeping ISO strings avoids the
   * ISO→Date→ISO round-trip the raw-db-ceiling probe never pays.
   */
  public get persistTimestampsAsDate(): boolean {
    return true;
  }

  /** Shared write stamp — Date for Date-binding dialects, ISO string for PG. */
  protected writeNow(): Date | string {
    return this.persistTimestampsAsDate ? new Date() : nowISODateString();
  }

  /**
   * Public hook for queryBuilder reads — same maps `findMany` registers so
   * list conversion hits the in-place schema path instead of a generic key walk.
   */
  public registerReadSchema(collection: string): void {
    if (this._registeredSchemas.has(collection)) return;
    const table = this.getTable(collection);
    if (!table) return;
    this.ensureTableSchemaRegistered(table, collection);
    this._registeredSchemas.add(collection);
  }

  /**
   * 🚀 SCHEMA REGISTRATION: Lazily registers a table's columns for zero-overhead
   * date/JSON conversion. Called on first access to each table. Eliminates
   * per-row Set.has() lookups for known columns.
   *
   * Idempotent: returns immediately if the table was already registered.
   */
  public ensureTableSchemaRegistered(table: any, name: string): void {
    if (!table || typeof table !== "object") return;
    try {
      const columns = Object.keys(table);
      // Filter out Drizzle internal symbols and metadata
      const realCols = columns.filter(
        (c) => !c.startsWith("Symbol(") && !c.startsWith("@@") && c !== "_" && c !== "name",
      );
      if (realCols.length > 0) {
        registerTableSchema(name, realCols);
      }
    } catch {
      // Schema extraction is best-effort — fallback to full-key iteration if it fails
    }
  }

  // Instance-level cache to skip even the Map.has() call after first registration
  protected _registeredSchemas = new Set<string>();

  public get registeredSchemas(): Set<string> {
    return this._registeredSchemas;
  }

  public get dynamicColListCache() {
    return this._dynamicColListCache;
  }

  public get escapedTableNameCache() {
    return this._escapedTableNameCache;
  }

  protected _insertDefaultsPlanCache = new WeakMap<object, InsertDefaultEntry[]>();

  public getInsertDefaultsPlanCache(): WeakMap<object, InsertDefaultEntry[]> {
    return this._insertDefaultsPlanCache;
  }

  public getTableColumnsCache(): Map<any, Record<string, Column>> {
    return this._tableColumnsCache;
  }

  public getDateKeyCache(): WeakMap<object, Set<string>> {
    return this._dateKeyCache;
  }

  protected getInsertDefaultsPlan(tableCols: Record<string, any>) {
    return getSqlInsertDefaultsPlan(this as unknown as SqlValuesContext, tableCols);
  }

  /**
   * Reconstruct the inserted row from prepared values + column defaults.
   * Sparse: omit columns with neither a value nor a client-side default so
   * the INSERT lists only bound params.
   */
  protected synthesizeInsertRow(
    table: any,
    values: Record<string, any>,
    opts?: { intBooleans?: boolean },
  ): Record<string, any> {
    return synthesizeSqlInsertRow(this as unknown as SqlValuesContext, table, values, opts);
  }

  /** Whether INSERT … RETURNING is supported natively. */
  public get insertReturnsRows(): boolean {
    return false;
  }

  /** Whether UPDATE … RETURNING is supported natively. */
  public get updateReturnsRows(): boolean {
    return false;
  }

  /** Whether prepareValues should JSON.stringify object values (SQLite TEXT columns need it). */
  public get shouldJsonSerializeInPrepare(): boolean {
    return false;
  }

  /**
   * How a partial update merges the patch's dynamic fields into the `data`
   * column (MongoDB gets the same semantics from `$set` per field).
   */
  public get jsonPatchMergeMode(): "operator" | "subset" {
    return "operator";
  }

  protected async hydrateJsonDataPatch(
    values: Record<string, unknown>,
    table: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<void> {
    return hydrateSqlJsonDataPatch(
      this as unknown as SqlJsonPatchContext,
      values,
      table,
      id,
      options,
    );
  }

  public jsonMergeWrapper(colSql: string): { prefix: string; suffix: string } {
    return jsonMergeWrapperExpression(colSql);
  }

  public canMergeJsonInOneStatement(patch: Record<string, unknown>): boolean {
    return canMergeJsonPatchInOneStatement(this.jsonPatchMergeMode, patch);
  }

  public jsonMergeSetValue(table: any, patch: Record<string, unknown>): SQL {
    return buildJsonMergeSetValue(this as unknown as SqlJsonPatchContext, table, patch);
  }

  public applyJsonMergeToSet(
    values: Record<string, unknown>,
    table: any,
    patch: Record<string, unknown>,
  ): void {
    applySqlJsonMergeToSet(this as unknown as SqlJsonPatchContext, values, table, patch);
  }

  public async mergeJsonPatchIntoSet(
    values: Record<string, unknown>,
    table: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<void> {
    return mergeSqlJsonPatchIntoSet(
      this as unknown as SqlJsonPatchContext,
      values,
      table,
      id,
      options,
    );
  }

  protected assertTopLevelJsonPatchKey(key: string): string {
    return assertTopLevelJsonPatchKey(key);
  }

  protected serializeJsonPatchValue(key: string, value: unknown): string {
    return serializeJsonPatchValue(key, value);
  }

  public jsonKeyPatchSetValue(table: any, column: string, patch: Record<string, unknown>): SQL {
    return buildJsonKeyPatchSetValue(this as unknown as SqlJsonPatchContext, table, column, patch);
  }

  public jsonKeyPatchExpression(
    _colSql: string,
    _entries: ReadonlyArray<readonly [string, string]>,
  ): SQL {
    throw new Error(`${this.type}: key-level JSON patching is not implemented for this adapter`);
  }

  /**
   * Read only the JSON `data` column of one row. Returned `null` means "no such
   * row" — the caller treats that as an error (a merge needs something to merge
   * into). Adapters whose dialect merges in SQL never call it.
   */
  public async readJsonDataColumn(
    _table: any,
    _id: DatabaseId,
    _options: BaseQueryOptions,
  ): Promise<Record<string, unknown> | null> {
    return null;
  }

  /** Whether findMany uses a raw-SQL dynamic path for benchmark/heavy tables. */
  protected get useDynamicSqlInFindMany(): boolean {
    return false;
  }

  /**
   * Quote a SQL identifier for this dialect. ANSI double quotes work for
   * SQLite/PostgreSQL; MariaDB needs backticks unless ANSI_QUOTES is enabled
   * (it is NOT in MariaDB's default sql_mode, so double quotes mean strings).
   */
  protected quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /** Cached parameterized SQL statements for raw point reads. */
  protected _rawFindByIdSqlCache = new WeakMap<
    object,
    {
      withData: string;
      withoutData: string;
      withDataTenant: string;
      withoutDataTenant: string;
      withDataNull: string;
      withoutDataNull: string;
      selectWithData: string;
      selectWithoutData: string;
    }
  >();

  /**
   * Low-level driver execution hook for raw point-read SELECT queries.
   * Takes raw SQL text and bound parameters, respecting transaction context.
   * Returns array of row objects, or null if transaction was declined, not supported, or client unavailable.
   */
  protected async rawExec<R = Record<string, unknown>>(
    _sqlText: string,
    _params: readonly unknown[],
    _options?: BaseQueryOptions,
  ): Promise<R[] | null> {
    return null;
  }

  /** Whether findById has an adapter-specific raw-SQL optimization. */
  protected get useRawFindById(): boolean {
    return true;
  }

  /** Execute a raw SQL query for the dynamic findMany path. */
  protected async executeDynamicSql(
    _db: any,
    sqlQuery: SQL,
    _options?: BaseQueryOptions,
  ): Promise<any[]> {
    // Default: PostgreSQL-style (execute returns rows array or {rows: [...]})
    const execResult = await _db.execute(sqlQuery);
    if (Array.isArray(execResult)) return execResult;
    return (execResult as any).rows || [];
  }

  /**
   * Shared raw findById point-read optimization for SQL adapters.
   * Uses driver-level statement caching, safe SQL identifiers, tenant scoping,
   * and projection skipping of JSON blob. Returns RAW_DECLINED on driver error
   * or when transactions decline raw execution.
   */
  protected async rawFindById<T extends BaseEntity>(
    table: unknown,
    collection: string,
    id: DatabaseId,
    options: FindOptions<T>,
  ): Promise<RawFindResult<T>> {
    try {
      // 1. Read-path schema registration: raw reads must normalize timestamps to
      // ISODateString even on read-only workloads.
      if (!this._registeredSchemas.has(collection)) {
        this.ensureTableSchemaRegistered(table, collection);
        this._registeredSchemas.add(collection);
      }

      const tableName = getTableName(table as any);
      if (!tableName) throw new Error("Table name could not be resolved");
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      const idColName = idCol?.name || "_id";

      // 2. Projection check: when fields are all physical columns, skip the data blob
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

      // 3. Statement caching & SQL generation
      const tableObj = table as object;
      let cachedSql = this._rawFindByIdSqlCache.get(tableObj);
      if (!cachedSql) {
        const safeTable = this.quoteIdentifier(assertSafeSqlIdentifier(tableName, "table"));
        const safeIdCol = this.quoteIdentifier(assertSafeSqlIdentifier(idColName, "column"));
        const safeTenantCol = this.quoteIdentifier("tenantId");

        const selectWithData =
          this.sqlDialect.id === "sqlite"
            ? "*"
            : this.getRawFindByIdCols(table, true)
                .map((c) => this.quoteIdentifier(assertSafeSqlIdentifier(c, "column")))
                .join(", ");
        const selectWithoutData = this.getRawFindByIdCols(table, false)
          .map((c) => this.quoteIdentifier(assertSafeSqlIdentifier(c, "column")))
          .join(", ");

        const p1 = this.sqlDialect.bindAt(0);
        const p2 = this.sqlDialect.bindAt(1);

        cachedSql = {
          withData: `SELECT ${selectWithData} FROM ${safeTable} WHERE ${safeIdCol} = ${p1} LIMIT 1`,
          withoutData: `SELECT ${selectWithoutData} FROM ${safeTable} WHERE ${safeIdCol} = ${p1} LIMIT 1`,
          withDataTenant: `SELECT ${selectWithData} FROM ${safeTable} WHERE ${safeIdCol} = ${p1} AND ${safeTenantCol} = ${p2} LIMIT 1`,
          withoutDataTenant: `SELECT ${selectWithoutData} FROM ${safeTable} WHERE ${safeIdCol} = ${p1} AND ${safeTenantCol} = ${p2} LIMIT 1`,
          withDataNull: `SELECT ${selectWithData} FROM ${safeTable} WHERE ${safeIdCol} = ${p1} AND ${safeTenantCol} IS NULL LIMIT 1`,
          withoutDataNull: `SELECT ${selectWithoutData} FROM ${safeTable} WHERE ${safeIdCol} = ${p1} AND ${safeTenantCol} IS NULL LIMIT 1`,
          selectWithData,
          selectWithoutData,
        };
        this._rawFindByIdSqlCache.set(tableObj, cachedSql);
      }

      // 4. Dialect-specific tenant clause
      const dialectName =
        this.sqlDialect.id === "mariadb"
          ? "mysql"
          : this.sqlDialect.id === "postgresql"
            ? "postgres"
            : "sqlite";
      const tenantClause = buildRawTenantClause(options, dialectName, { paramIndex: 2 });
      const hasTenantParam = tenantClause.params.length > 0;
      const hasTenantClause = tenantClause.sql !== "";

      const p1 = this.sqlDialect.bindAt(0);
      const p2 = this.sqlDialect.bindAt(1);
      const safeTenantCol = this.quoteIdentifier("tenantId");

      let sqlText: string;
      if (hasTenantClause) {
        if (hasTenantParam && tenantClause.sql === ` AND ${safeTenantCol} = ${p2}`) {
          sqlText = wantsData ? cachedSql.withDataTenant : cachedSql.withoutDataTenant;
        } else if (!hasTenantParam && tenantClause.sql === ` AND ${safeTenantCol} IS NULL`) {
          sqlText = wantsData ? cachedSql.withDataNull : cachedSql.withoutDataNull;
        } else {
          const selectCols = wantsData ? cachedSql.selectWithData : cachedSql.selectWithoutData;
          const safeTable = this.quoteIdentifier(assertSafeSqlIdentifier(tableName, "table"));
          const safeIdCol = this.quoteIdentifier(assertSafeSqlIdentifier(idColName, "column"));
          sqlText = `SELECT ${selectCols} FROM ${safeTable} WHERE ${safeIdCol} = ${p1}${tenantClause.sql} LIMIT 1`;
        }
      } else {
        sqlText = wantsData ? cachedSql.withData : cachedSql.withoutData;
      }

      const params = [String(id), ...tenantClause.params];

      // 5. Driver execution hook
      const rows = await this.rawExec(sqlText, params, options);
      if (rows === null) {
        return RAW_DECLINED;
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      // 6. Normalization
      return convertDatesToISO(rows[0], {
        ...this.convertDatesOptions,
        table: collection,
        skipJson: !wantsData,
      }) as unknown as T;
    } catch (rawErr: unknown) {
      logger.debug(
        `[${this.type} raw findById] falling back to Drizzle:`,
        (rawErr as Error)?.message,
      );
      return RAW_DECLINED;
    }
  }

  /**
   * Adapter-specific direct-to-wire point stream optimization.
   *
   * Returns a discriminated result so the caller can tell a definitive
   * "row does not exist" (`missing`) from "this engine/table cannot produce a
   * native wire body" (`declined`). Before this split both cases returned
   * `null`, and the `findOne` fallback re-queried a missing row — a second
   * SELECT for the same 404 the Domain Plane then queried a third time.
   */
  public async rawFindPointWireStream(
    _table: any,
    _collection: string,
    _id: DatabaseId,
    _options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    return { kind: "declined" };
  }

  /**
   * Base rawFindListWireStream: returns `{ kind: "declined" }` by default.
   * Engines override this when in-engine aggregation yields net performance gains (e.g. SQLite).
   */
  protected async rawFindListWireStream(
    _table: any,
    _collection: string,
    _options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      fields?: string[];
    },
  ): Promise<RawListWireStreamResult> {
    return { kind: "declined" };
  }

  /**
   * Adapter-specific raw INSERT…RETURNING — returns null when not used.
   * MariaDB/PostgreSQL override this to skip Drizzle's per-call AST building
   * on the write path while keeping a single round trip (values + row back).
   */
  protected async rawInsertReturning<T extends BaseEntity>(
    _table: any,
    _collection: string,
    _values: Record<string, any>,
    _options: BaseQueryOptions,
  ): Promise<T | null> {
    return null;
  }

  /**
   * Adapter-specific raw multi-row INSERT…RETURNING — returns null when not used.
   * Skips Drizzle AST build and executes multi-tuple raw parameterized SQL.
   */
  protected async rawInsertManyReturning<T extends BaseEntity>(
    _table: any,
    _collection: string,
    _batchValues: Record<string, any>[],
    _options: BaseQueryOptions,
  ): Promise<T[] | null> {
    return null;
  }

  /**
   * Adapter-specific raw UPDATE…RETURNING — returns null when not used.
   * SQLite overrides this to skip Drizzle's per-call AST build + `.returning()`
   * SQL generation on the hot write path (UPDATE…RETURNING is one round trip
   * like INSERT…RETURNING; the raw prepared statement keeps UPDATE at INSERT
   * parity). The returned row is already date/JSON-normalized
   * (convertDatesToISO applied) — the caller only applies after-hooks.
   *
   * `values` is the preparedValues output with the PK already stripped;
   * `idCol` is the physical primary-key column.
   */
  protected async rawUpdateReturning<T extends BaseEntity>(
    _table: any,
    _collection: string,
    _values: Record<string, any>,
    _idCol: any,
    _id: DatabaseId,
    _options: BaseQueryOptions,
  ): Promise<RawFindResult<T>> {
    return RAW_DECLINED;
  }

  /**
   * Adapter-specific raw multi-row UPDATE fast path (statement coalescing) —
   * returns null when not used, which replays every row individually.
   * All rows in a batch share one column signature and the tenant shape.
   */
  protected async rawUpdateManyReturning<T extends BaseEntity>(
    _table: any,
    _collection: string,
    _batch: Array<{ id: DatabaseId; values: Record<string, any>; options: BaseQueryOptions }>,
  ): Promise<T[] | null> {
    return null;
  }

  /**
   * Adapter-specific raw heterogeneous bulk UPDATE fast path — returns null
   * when not used (BatchModule.bulkUpdate then falls back to N per-row UPDATE
   * statements inside a transaction).
   *
   * Heterogeneous payloads (each row a different document) otherwise compile N
   * statements; a single `SET "col" = CASE "_id" WHEN ? THEN ? … ELSE "col"
   * END` statement collapses the whole batch into one prepared statement while
   * preserving per-row values (rows omitting a column fall through to ELSE).
   *
   * `now` is the shared updatedAt timestamp (ISO→Date); `options` carries the
   * tenant context — the WHERE must be tenant-scoped exactly like
   * applyTenantFilter in crud.update (fail-closed under MULTI_TENANT).
   *
   * Implementations must be all-or-nothing per call: either every update is
   * applied (chunks wrapped in an explicit transaction) or no changes are
   * committed and null is returned so the caller retries on the generic path.
   */
  public async rawBulkUpdate(
    _table: any,
    _collection: string,
    _updates: Array<{ id: DatabaseId; data: Partial<Record<string, unknown>> }>,
    _now: Date,
    _options: BaseQueryOptions,
  ): Promise<{ modifiedCount: number } | null> {
    return null;
  }

  /**
   * Write critical-section hook — runs `fn` under the adapter's write
   * serialization. No-op for adapters whose drivers handle write concurrency
   * natively (PostgreSQL/MariaDB); SQLite overrides this with the single-writer
   * write mutex so multi-statement transaction spans (BEGIN…COMMIT) stay
   * atomic. Reentrant: nested calls inside an active span execute directly.
   */
  public withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(fn);
  }

  /** Resolve a collection name to a Drizzle schema object (system tables). */
  protected getAliasedTable(collection: string): any {
    const schemaRecord = this.schema as Record<string, unknown> | null | undefined;
    if (!schemaRecord) return null;
    const physicalName = resolveSystemTableName(collection);
    if (schemaRecord[physicalName]) return schemaRecord[physicalName];
    const camelName = physicalName.replace(/_([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
    if (schemaRecord[camelName]) return schemaRecord[camelName];
    if (physicalName.includes("workflow_definitions") && schemaRecord.workflowDefinitions)
      return schemaRecord.workflowDefinitions;
    if (physicalName.includes("workflow_instances") && schemaRecord.workflowInstances)
      return schemaRecord.workflowInstances;
    const alias = SQL_TABLE_ALIASES[collection];
    if (alias && schemaRecord[alias]) return schemaRecord[alias];
    if (schemaRecord[collection]) return schemaRecord[collection];
    return null;
  }

  /**
   * Return the active Drizzle database instance.
   * When called inside a transaction, uses the transactional Drizzle instance
   * instead of the pool-level instance — ensures rollback isolation.
   */
  protected getDrizzleInstance(options?: BaseQueryOptions): any {
    // If we're inside a transaction, use the transactional Drizzle instance
    if (options?.transaction && (options.transaction as any).db) {
      return (options.transaction as any).db;
    }
    return (this as any).db;
  }

  // --------------------------------------------------------------------------
  // Cache & Registry State (shared across all SQL adapters)
  // --------------------------------------------------------------------------

  protected preparedStatements = new Map<string, any>();
  protected readonly MAX_PREPARED_STATEMENTS = 500;
  protected _tableColumnsCache = new Map<any, Record<string, Column>>();
  /**
   * Per-table date-column key set (WeakMap keyed by the schemaCols object →
   * auto-invalidated when a table def is rebuilt, no manual clear needed).
   * Replaces the per-key `*Date/*At/*Time` string heuristics in prepareValues
   * (4 × `includes()` + metadata property walks per key per write) with one
   * O(columns) derivation per table def — identical predicate, cached result.
   */
  protected _dateKeyCache = new WeakMap<object, Set<string>>();
  protected tableRegistry = new Map<string, any>();
  protected dynamicTables = new Map<string, any>();
  /**
   * Row-store hybrid: materialized scalar columns per collection.
   * Filled by `rememberMaterializedColumns` (createModel and schema prewarm).
   * `getTable` reads it synchronously to build the Drizzle def — a boot that
   * only warms schemas must still register here, or number patches rewrite
   * the JSON blob and PostgreSQL builds a `(data->>'field')` expression index.
   */
  protected materializedColumns = new Map<string, Map<string, string>>();
  protected modelRegistry = new Map<string, any>();
  protected _resolving = new Set<string>();
  protected _selectionCache = new Map<string, any>();
  /**
   * 🚀 FAST-PATH: normalized collection names that have already been
   * provisioned (CREATE TABLE + ALTER + INDEX) in this process. Populated by
   * createModel and, for SQLite, by _warmTableRegistry at boot.
   * Checked at the top of every adapter's createModel() to skip repeated DDL.
   */
  protected _provisionedTables = new Set<string>();

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
      this._auth = new RelationalAuthModule(this, this.schema);
    }
    return this._auth;
  }

  public get content(): any {
    if (!this._content) {
      this._content = new RelationalContentModule(this, this.schema);
    }
    return this._content;
  }

  public get media(): any {
    if (!this._media) {
      this._media = new RelationalMediaModule(this, this.schema);
    }
    return this._media;
  }

  public get system(): any {
    if (!this._system) {
      this._system = new RelationalSystemModule(this, this.schema);
    }
    return this._system;
  }

  public get batch(): any {
    if (!this._batch) {
      this._batch = new BatchModule(this);
    }
    return this._batch;
  }

  public get collection(): any {
    if (!this._collection) {
      this._collection = new CollectionModule(this);
    }
    return this._collection;
  }

  private _crudWrapper: ICrudAdapter | null = null;
  protected _lastTableRef: { table: any; cols: Record<string, Column> | null } = {
    table: null,
    cols: null,
  };

  public get crud(): ICrudAdapter {
    return this._crudWrapper ?? (this as any);
  }

  public set crud(wrapper: ICrudAdapter) {
    this._crudWrapper = wrapper;
  }

  // --------------------------------------------------------------------------
  // Helper Delegations
  // --------------------------------------------------------------------------

  public isSystemTable(collection: string): boolean {
    return isSystemTable(collection);
  }

  public getColumn(table: any, name: string, forcePhysical = false): any {
    return getColumnHelper(table, name, this._tableColumnsCache, this._lastTableRef, forcePhysical);
  }

  /**
   * Whether the SELECT can skip the JSON `data` blob column. True when the
   * caller requested an explicit `fields` projection that contains no
   * non-physical (blob-stored) keys — the row then only carries metadata
   * columns and avoids JSON.parse + flattenDataColumn entirely.
   */
  protected shouldExcludeData(table: any, options: any): boolean {
    const fields = options?.fields;
    if (!Array.isArray(fields) || fields.length === 0) return false;
    // If ANY requested field is not a physical column it lives in the data blob.
    for (const f of fields) {
      // Explicitly requesting the blob means it must be selected — never exclude.
      if (f === "data") return false;
      if (f === "_id" || f === "id") continue;
      if (
        f === "tenantId" ||
        f === "status" ||
        f === "createdAt" ||
        f === "updatedAt" ||
        f === "createdBy" ||
        f === "updatedBy" ||
        f === "publishedAt" ||
        f === "isDeleted"
      )
        continue;
      if (!this.getColumn(table, f)) return false;
    }
    return true;
  }

  public getPhysicalSelection(table: any): any {
    return getPhysicalSelection(table, this._selectionCache, (t, n, f) =>
      getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, f),
    );
  }

  public getProjectedSelection(table: any, options: any): any {
    const fields = options?.fields;
    if (Array.isArray(fields) && fields.length > 0 && this.shouldExcludeData(table, options)) {
      const projected: any = {};
      const requestedSet = new Set(fields.map((f: string) => (f === "id" ? "_id" : f)));
      requestedSet.add("_id");
      if (this.getColumn(table, "tenantId")) requestedSet.add("tenantId");

      for (const fieldName of requestedSet) {
        const col = this.getColumn(table, fieldName);
        if (col) {
          projected[fieldName] = col;
        }
      }
      if (Object.keys(projected).length > 0) {
        return projected;
      }
    }

    return getPhysicalSelection(
      table,
      this._selectionCache,
      (t, n, f) => getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, f),
      this.shouldExcludeData(table, options),
    );
  }

  public mapQuery(table: any, query: any, options: any = {}): any {
    return mapQuery(
      table,
      query,
      options,
      (t, n) => getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, false),
      (f) => this.getJsonField(f),
      (v) => this.coerceJsonValue(v),
      (f, v) => this.getJsonEquals(f, v),
      (f, v, op) => this.getJsonCompare(f, v, op),
    );
  }

  /**
   * Dialect hook for range comparisons (`$gt`/`$gte`/`$lt`/`$lte`) on a field that
   * lives in the JSON `data` blob, or `null` to keep the extraction comparison
   * (`data->>'field' >= $1`). PostgreSQL overrides it because its extraction is TEXT,
   * which makes a numeric range LEXICOGRAPHIC — `views >= 4` missed stored `16`/`32`
   * (`'16' < '4'`). Engines with typed extraction (SQLite) or coercing comparison
   * (MariaDB) return `null` and stay on the plain path.
   */
  protected getJsonCompare(
    _field: string,
    _value: unknown,
    _op: "$gt" | "$gte" | "$lt" | "$lte",
  ): SQL | null {
    return null;
  }

  /**
   * Dialect hook: an **index-eligible** equality form for a field stored in the
   * JSON `data` blob, or `null` to keep the extraction comparison
   * (`data->>'field' = $1`), which no index can serve.
   *
   * Only reached for fields that were NOT materialized into a real column (those
   * are compared as columns and are already index-served). PostgreSQL implements it
   * as containment (`data @> '{"field": value}'::jsonb`) against the `jsonb_path_ops`
   * GIN index created with every dynamic collection table; SQLite and MariaDB have
   * no single index that serves arbitrary JSON paths, so they return `null` and rely
   * on column materialization (`indexed` / `materialize: true` fields) instead.
   */
  protected getJsonEquals(_field: string, _value: unknown): SQL | null {
    return null;
  }

  /**
   * Dialect hook: normalize bound values for JSON-extract column comparisons.
   * JSON columns render scalars dialect-specifically (MariaDB `JSON_UNQUOTE`
   * yields the text "true", Postgres `data->>` is text, SQLite json_extract is
   * typed). Default: identity.
   */
  protected coerceJsonValue(val: unknown): unknown {
    return val;
  }

  public applyOrderBy(builder: any, table: any, options: any): any {
    return applyOrderByHelper(
      builder,
      table,
      options,
      (t, n) => getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, false),
      (f) => this.getJsonField(f),
    );
  }

  /**
   * Raw-SQL ORDER BY clauses for the dynamic-table path. Shared by `findMany`
   * and `findOne` so both honor the same `options.sort` semantics (object and
   * tuple-array forms, Mongo-style numeric directions) and the Drizzle fallback
   * cannot silently diverge from the compiled plan. Physical columns resolve
   * through `getColumn`; unknown fields fall back to the JSON `data` extraction
   * and schedule the adapter's lazy sort index via `onDynamicSort`.
   */
  protected buildDynamicOrderBy(
    collection: string,
    table: any,
    tableName: string,
    options: any,
  ): SQL[] {
    if (!options?.sort) return [];

    const normalizedSorts: { field: string; direction: "asc" | "desc" }[] = [];
    if (Array.isArray(options.sort)) {
      for (const item of options.sort) {
        if (Array.isArray(item) && item.length >= 2) {
          normalizedSorts.push({
            field: item[0],
            direction: normalizeSortDirection(item[1]),
          });
        } else if (typeof item === "object" && item !== null) {
          const keys = Object.keys(item);
          if (keys.length > 0) {
            normalizedSorts.push({
              field: keys[0],
              direction: normalizeSortDirection((item as Record<string, unknown>)[keys[0]]),
            });
          }
        }
      }
    } else if (typeof options.sort === "object") {
      for (const field of Object.keys(options.sort)) {
        normalizedSorts.push({
          field,
          direction: normalizeSortDirection((options.sort as Record<string, unknown>)[field]),
        });
      }
    }

    const sortConditions: SQL[] = [];
    for (const s of normalizedSorts) {
      let sortCol = this.getColumn(table, s.field, false);
      if (!sortCol) {
        const dataCol = this.getColumn(table, "data", false);
        if (dataCol) {
          sortCol = this.getJsonField(s.field);
          // Lazy sort-index hook: adapters with an expression-index capability
          // (PostgreSQL) schedule a one-time index build so the NEXT identical
          // sort is index-served. Default no-op.
          this.onDynamicSort(collection, tableName, s.field);
        }
      }
      if (sortCol) {
        sortConditions.push(s.direction === "asc" ? asc(sortCol) : desc(sortCol));
      }
    }

    return sortConditions;
  }

  // --------------------------------------------------------------------------
  // prepareValues (shared logic, dialect hooks for JSON serialization)
  // --------------------------------------------------------------------------

  /** Stamp update flags without mutating or cloning the caller's options object. */
  protected prepareUpdateValues(
    table: any,
    data: any,
    id: any,
    now: Date | string,
    options: any,
  ): any {
    return this.prepareValues(table, data, id, now, options, true);
  }

  protected getDateColumnKeys(schemaCols: Record<string, any>): Set<string> {
    return getSqlDateColumnKeys(this as unknown as SqlValuesContext, schemaCols);
  }

  public prepareValues(
    table: any,
    data: any,
    id: any,
    now: Date | string,
    options: any,
    isUpdateOverride = false,
  ): any {
    return prepareSqlValues(
      this as unknown as SqlValuesContext,
      table,
      data,
      id,
      now,
      options,
      isUpdateOverride,
    );
  }

  // --------------------------------------------------------------------------
  // CRUD: findOne
  // --------------------------------------------------------------------------

  /**
   * Soft-delete clamp for collection reads.
   *
   * `delete()` without `permanent: true` only flips `isDeleted`, so a reader
   * that does not opt in via `includeDeleted` must not see those rows — the
   * same boundary Mongo's CRUD layer enforces with `safeQuery`. `findById` (and
   * every `{_id}` lookup routed through it) already clamps; this extends the
   * clamp to the list/aggregate reads (`findMany`, `findOne`, `count`,
   * `exists`, `streamMany`, `findPage`) that previously leaked deleted rows.
   *
   * No-op for tables without an `isDeleted` column, for `includeDeleted` /
   * `bypassSafeQuery` callers, and when the query already pins `isDeleted`.
   */
  protected clampSoftDeleted<T extends BaseEntity>(
    table: any,
    query: QueryFilter<T>,
    options: BaseQueryOptions,
  ): QueryFilter<T> {
    if (options?.bypassSafeQuery || options?.includeDeleted) return query;
    if (!this.getColumn(table, "isDeleted")) return query;
    if (queryHasSoftDeleteKey(query)) return query;
    return { ...(query as Record<string, unknown>), isDeleted: false } as QueryFilter<T>;
  }

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    return executeSqlFindOne(this as unknown as SqlCrudReadContext, collection, query, options);
  }

  // --------------------------------------------------------------------------
  // 🚀 Direct-to-Wire Streaming (Phase 1): findPointWireStream
  // --------------------------------------------------------------------------

  async findPointWireStream(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
    return executeFindPointWireStream(
      this as unknown as SqlWireStreamContext,
      collection,
      id,
      options,
    );
  }

  // --------------------------------------------------------------------------
  // 🚀 Direct-to-Wire Streaming (Phase 2): findListWireStream
  // --------------------------------------------------------------------------

  async findListWireStream(
    collection: string,
    options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      fields?: string[];
    } = {},
  ): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
    if (
      !options.transaction &&
      !options.requirePublished &&
      options.sortField &&
      options.sortField !== "_id" &&
      options.sortField !== "updatedAt"
    ) {
      const dir = options.sortDirection === "asc" ? "asc" : "desc";
      const withTenant =
        options.tenantId !== undefined &&
        options.tenantId !== null &&
        options.tenantId !== "global";
      this.noteListSort(
        collection,
        [
          { name: options.sortField, direction: dir },
          { name: "_id", direction: dir },
        ],
        withTenant ? ["tenantId"] : [],
      );
    }
    return executeFindListWireStream(this as unknown as SqlWireStreamContext, collection, options);
  }

  // --------------------------------------------------------------------------
  // CRUD: findMany
  // --------------------------------------------------------------------------

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return executeSqlFindMany(this as unknown as SqlCrudReadContext, collection, query, options);
  }

  // --------------------------------------------------------------------------
  // CRUD: streamMany
  // --------------------------------------------------------------------------

  async streamMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<AsyncIterable<T>>> {
    return executeSqlStreamMany(this as unknown as SqlCrudReadContext, collection, query, options);
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
  // CRUD: findPage (limit+1 hasMore — shared product path)
  // --------------------------------------------------------------------------

  async findPage<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: FindPageOptions<T> = {},
  ): Promise<DatabaseResult<FindPageResult<T>>> {
    return executeSqlFindPage(this, collection, query, options);
  }

  // --------------------------------------------------------------------------
  // CRUD: findById
  // --------------------------------------------------------------------------

  async findById<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    return executeSqlFindById(this as unknown as SqlCrudReadContext, collection, id, options);
  }

  // --------------------------------------------------------------------------
  // CRUD: exists
  // --------------------------------------------------------------------------

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<boolean>> {
    return executeSqlExists(this as unknown as SqlCrudReadContext, collection, query, options);
  }

  // --------------------------------------------------------------------------
  // CRUD: count
  // --------------------------------------------------------------------------

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: CountOptions = {},
  ): Promise<DatabaseResult<number>> {
    return executeSqlCount(this as unknown as SqlCrudReadContext, collection, query, options);
  }

  /**
   * Dialect-aware approximate row count from engine statistics.
   * Returns null when stats are unavailable (caller falls back to exact COUNT).
   */
  protected async estimateTableRows(table: any, collection: string): Promise<number | null> {
    return estimateSqlTableRows(this, table, collection);
  }

  /**
   * 🛡️ ENTERPRISE `_id` CONTRACT — O(1) gate on every entry write (shared by
   * all SQL adapters): dynamic collection tables accept only UUIDv4 ids
   * (32-hex dash-less or 36-dashed). System tables (content_nodes, auth_*, …)
   * keep slug-friendly ids. Cached system-table set + charCode scan →
   * sub-microsecond, no regex, no allocation on the happy path.
   */
  protected validateEntryId(
    collection: string,
    id: unknown,
  ): { success: false; message: string; error: { code: string; message: string } } | null {
    if (
      id === undefined ||
      id === null ||
      isSystemTable(collection) ||
      collection.startsWith("plugin_")
    ) {
      return null;
    }
    if (typeof id !== "string" || !validateId(id)) {
      return {
        success: false,
        message: `Invalid _id format for "${collection}": expected UUIDv4 (32 hex or 36 dashed chars)`,
        error: {
          code: "INVALID_ID_FORMAT",
          message: "_id must be a UUIDv4 string (32 hex or 36 dashed chars)",
        },
      };
    }
    return null;
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
    const invalid = this.validateEntryId(collection, (data as any)?._id);
    if (invalid) return invalid;
    return this.wrap(
      () => this.executeInsert(collection, data, options),
      "INSERT_FAILED",
      undefined,
      { ...options, isWrite: true, skipMeta: true },
    );
  }

  /** One INSERT (raw path preferred). Isolated so wrap does not allocate a per-call async closure. */
  private async executeInsert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: BaseQueryOptions,
  ): Promise<T> {
    const d =
      this.hooks.length > 0
        ? await this.runHooks("before", "insert", collection, data, options)
        : data;
    const table = this.getTable(collection);
    if (!table) throw new Error(`Collection table not found: ${collection}`);
    // 🚀 SCHEMA REGISTRATION: One-time per-collection, O(1) after first call
    if (!this._registeredSchemas.has(collection)) {
      this.ensureTableSchemaRegistered(table, collection);
      this._registeredSchemas.add(collection);
    }
    const id = (d as any)._id || generateUUID();
    const now = this.writeNow();
    const mPrepValues = PROFILE_WRITE_ENABLED ? profileMark("db:ins:prepare-values") : null;
    const values = this.prepareValues(table, d, id, now, options);
    mPrepValues?.();
    // Seed path only: RETURNING is pure overhead when the caller already
    // knows the row (testing.ts passes skipReturning explicitly). The
    // ambient BENCHMARK env check was removed — it made the benchmark
    // measure a non-production path (Drizzle no-returning) instead of the
    // raw INSERT…RETURNING fast path used in production.
    const skipReturning = (options as any)?.skipReturning === true;

    const runInsert = async () => {
      // Raw single-statement INSERT (SQLite/PG) — skips Drizzle AST. The
      // raw paths honor skipReturning (no-read-back synthesis) where
      // implemented; otherwise RETURNING is one round trip with the row.
      if (this.insertReturnsRows) {
        const rawResult = await this.rawInsertReturning<T>(table, collection, values, options);
        if (rawResult !== null) return rawResult;
      }
      // Drizzle timestamp columns call value.getTime() — ISO-bind dialects
      // (PostgreSQL) only convert on this rare fallback, not the raw hot path.
      const drizzleValues = this.persistTimestampsAsDate
        ? values
        : convertISOToDates(values, { ...this.convertDatesOptions, table: collection });
      const query = this.getDrizzleInstance(options).insert(table).values(drizzleValues);
      if (this.insertReturnsRows && !skipReturning) {
        const result = await (query as any).returning();
        return convertDatesToISO(result[0], {
          ...this.convertDatesOptions,
          table: collection,
          inPlace: true,
        }) as T;
      }
      await (query as any);
      return convertDatesToISO(values, {
        ...this.convertDatesOptions,
        table: collection,
        inPlace: true,
      }) as T;
    };

    /** Single-path execution with the missing-table auto-provision fallback. */
    const runWithProvision = async (): Promise<T> => {
      try {
        return await runInsert();
      } catch (err: any) {
        // Auto-provision dynamic collection tables on first write (MariaDB/Postgres).
        // Without this, plugin_settings → collection_plugin_settings fails with missing table.
        if (this.isMissingTableError(err) && typeof (this as any).createModel === "function") {
          await (this as any).createModel({
            _id: collection,
            name: collection,
            fields: [],
          });
          return runInsert();
        }
        throw err;
      }
    };

    let finalData: T;
    const mExec = PROFILE_WRITE_ENABLED ? profileMark("db:ins:exec") : null;
    if (this.insertCoalescingEnabled && !(options as any)?.transaction) {
      // Phase 2 statement coalescing: concurrent inserts for the same
      // collection that land within one tick become one multi-row statement.
      // The runSingle closure below includes the missing-table provision
      // fallback, so a replayed row keeps the full single-path semantics.
      const tableForBatch = table;
      finalData = await this.submitCoalescedInsert<T>(
        collection,
        tableForBatch,
        values,
        runWithProvision,
      );
    } else {
      finalData = await runWithProvision();
    }
    mExec?.();

    return this.hooks.length > 0
      ? await this.runHooks("after", "insert", collection, finalData, options)
      : finalData;
  }

  // --------------------------------------------------------------------------
  // Microtask INSERT coalescing (Phase 2 statement coalescing)
  // --------------------------------------------------------------------------

  /**
   * True when this engine may coalesce concurrent single-row inserts into one
   * multi-row statement. Defaults off — in-process engines (SQLite) gain
   * nothing from batching round trips; PostgreSQL overrides this.
   */
  protected get insertCoalescingEnabled(): boolean {
    return false;
  }

  public get insertCoalesceWindowMs(): number {
    return Number(process.env.SVELTY_COALESCE_INSERT_WINDOW_MS || 0);
  }

  protected _coalescerManager = new SqlCoalescerManager(this as unknown as SqlCoalescerContext);

  protected submitCoalescedInsert<T extends BaseEntity>(
    collection: string,
    _table: any,
    values: Record<string, any>,
    runSingle: () => Promise<T>,
  ): Promise<T> {
    return this._coalescerManager.submitCoalescedInsert(collection, values, runSingle);
  }

  // --------------------------------------------------------------------------
  // Tick UPDATE coalescing (Phase 2 statement coalescing)
  // --------------------------------------------------------------------------

  /**
   * True when this engine may coalesce concurrent single-row updates into one
   * multi-row statement. Defaults off; PostgreSQL overrides this.
   */
  protected get updateCoalescingEnabled(): boolean {
    return false;
  }

  public get updateCoalesceWindowMs(): number {
    return Number(
      process.env.SVELTY_COALESCE_UPDATE_WINDOW_MS || process.env.SVELTY_COALESCE_WINDOW_MS || 0,
    );
  }

  protected submitCoalescedUpdate<T extends BaseEntity>(
    collection: string,
    key: string,
    id: DatabaseId,
    values: Record<string, any>,
    options: BaseQueryOptions,
    runSingle: () => Promise<RawFindResult<T>>,
  ): Promise<RawFindResult<T>> {
    return this._coalescerManager.submitCoalescedUpdate(
      collection,
      key,
      id,
      values,
      options,
      runSingle,
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
    for (let i = 0; i < data.length; i++) {
      const invalid = this.validateEntryId(collection, (data[i] as any)?._id);
      if (invalid) return invalid;
    }
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const now = this.writeNow();
        const len = data.length;
        const batchValues = Array.from({ length: len });
        for (let i = 0; i < len; i++) {
          const item = data[i];
          const id = (item as any)._id || generateUUID();
          batchValues[i] = this.prepareValues(table, item, id, now, options);
        }

        const rawBatch = await this.rawInsertManyReturning<T>(
          table,
          collection,
          batchValues as Record<string, any>[],
          options,
        );
        if (rawBatch !== null) return rawBatch;

        const drizzleBatch = this.persistTimestampsAsDate
          ? batchValues
          : (batchValues as Record<string, any>[]).map((row) =>
              convertISOToDates({ ...row }, { ...this.convertDatesOptions, table: collection }),
            );
        const query = this.getDrizzleInstance(options).insert(table).values(drizzleBatch);
        if (this.insertReturnsRows) {
          const results = await (query as any).returning();
          return convertArrayDatesToISO(results as any, {
            ...this.convertDatesOptions,
            table: collection,
          }) as T[];
        } else {
          await (query as any);
          return convertArrayDatesToISO(batchValues as Record<string, any>[], {
            ...this.convertDatesOptions,
            table: collection,
          }) as T[];
        }
      },
      "INSERT_MANY_FAILED",
      undefined,
      { ...options, isWrite: true, skipMeta: true },
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
    const invalid = this.validateEntryId(collection, id);
    if (invalid) return invalid;
    return this.wrap(
      () => this.executeUpdate(collection, id, data, options),
      "UPDATE_FAILED",
      undefined,
      { ...options, isWrite: true, skipMeta: true, operation: "update" },
    );
  }

  /** One UPDATE (raw path preferred). Isolated so wrap does not allocate a per-call async closure. */
  private async executeUpdate<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions,
  ): Promise<T> {
    const d =
      this.hooks.length > 0
        ? await this.runHooks("before", "update", collection, data, options)
        : data;
    const table = this.getTable(collection);
    if (!table) throw new Error(`Collection table not found: ${collection}`);
    if (!this._registeredSchemas.has(collection)) {
      this.ensureTableSchemaRegistered(table, collection);
      this._registeredSchemas.add(collection);
    }
    const now = this.writeNow();
    const mPrepValuesU = PROFILE_WRITE_ENABLED ? profileMark("db:upd:prepare-values") : null;
    const values = this.prepareUpdateValues(table, d, id, now, options);
    mPrepValuesU?.();

    const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
    if (!idCol) throw new Error("ID column not found");

    // Never write the PK back in the SET clause — it's the WHERE key
    if (idCol.name in values) delete values[idCol.name];
    if ("id" in values) delete values["id"];

    // 🔀 PARTIAL-UPDATE MERGE: when this payload patches the JSON `data` blob, the
    // dialect merge operator handles it inside the UPDATE (no read). Dialects whose
    // operator is only exact for a subset of patches (SQLite/MariaDB `json_patch` /
    // `JSON_MERGE_PATCH` are RFC 7396: recursive, null-deleting) hydrate and merge
    // the blob in JS first, so every path — raw, Drizzle, or the RETURNING
    // reconstruction — writes a complete document and a PATCH can never destroy
    // the fields it did not mention.
    const jsonPatch = getJsonDataPatch(values);
    if (jsonPatch && this.jsonPatchMergeMode === "subset" && jsonPatchNeedsJsMerge(jsonPatch)) {
      await this.hydrateJsonDataPatch(values, table, id, options);
    }

    // 🚀 NO-READ-BACK PATH: when the caller sends the full document
    // (bulkUpdate, full-doc sync), RETURNING's row read-back + JSON
    // parse/conversion is pure overhead — every column the UPDATE writes
    // was built client-side in prepareValues, so the row can be
    // reconstructed from memory 1:1 (SveltyCMS DDL has no UPDATE triggers
    // or server-generated columns). Partial PATCHes keep RETURNING so
    // untouched physical columns (status/createdAt/isDeleted) stay intact
    // in the response.
    const skipReturning = (options as any)?.skipReturning === true;

    // 🚀 raw UPDATE fast path (SQLite / PostgreSQL): one prepared statement, one
    // round trip — covers both RETURNING and skipReturning (no-read-back
    // reconstruction from prepared values). Returns RAW_DECLINED when the adapter
    // has no fast path or bailed; `null` means the UPDATE ran and matched 0 rows.
    const mRawU = PROFILE_WRITE_ENABLED ? profileMark("db:upd:raw") : null;

    // Phase 2 statement coalescing: concurrent updates that share a column
    // signature (and tenant scope, and skipReturning mode) coalesce into one
    // multi-row UPDATE statement. Partitioning by effective tenant prevents
    // cross-tenant batch mixing on SQLite/MariaDB/PostgreSQL.
    const batchEligible =
      this.updateCoalescingEnabled && !(options as any)?.transaction && !jsonPatch;
    let rawRow: RawFindResult<T>;
    if (batchEligible) {
      const tenant = getEffectiveTenantId(options);
      const tenantKey = tenant === undefined ? "u" : tenant === null ? "n" : `t:${String(tenant)}`;
      const columnsKey = Object.keys(values).sort().join(",");
      const key = `${collection}\u0000${columnsKey}\u0000${tenantKey}\u0000${skipReturning ? 1 : 0}`;
      rawRow = await this.submitCoalescedUpdate<T>(collection, key, id, values, options, () =>
        this.rawUpdateReturning<T>(table, collection, values, idCol, id, options),
      );
    } else {
      rawRow = await this.rawUpdateReturning<T>(table, collection, values, idCol, id, options);
    }
    mRawU?.();
    if (rawRow !== RAW_DECLINED) {
      if (rawRow === null) {
        throw new Error(`Record ${id} not found in ${getTableName(table)}`);
      }
      return this.hooks.length > 0
        ? await this.runHooks("after", "update", collection, rawRow, options)
        : rawRow;
    }

    // The raw path may have bailed (unsupported RETURNING, transaction without a
    // raw handle, SQL error) while the patch marker is still live — the plain
    // `SET "data" = <patch>` below would then replace the blob. Merge inside the
    // UPDATE where the dialect allows it (no read at all), otherwise hydrate.
    await this.mergeJsonPatchIntoSet(values, table, id, options);

    // Built here, not before the raw path: `rawUpdateReturning` and the update
    // coalescer build their own WHERE clause, so the Drizzle AST nodes were
    // allocated and thrown away on every fast-path update.
    const conditions: SQL[] = [eq(idCol, id as any)];
    applyTenantFilter(conditions, this.getColumn(table, "tenantId"), options);

    const drizzleUpdate = this.persistTimestampsAsDate
      ? values
      : convertISOToDates(values, { ...this.convertDatesOptions, table: collection });
    const query = this.getDrizzleInstance(options)
      .update(table)
      .set(drizzleUpdate)
      .where(and(...conditions));

    if (skipReturning) {
      // 🔬 The ORM fallback path (`db:upd:orm`) — marked so a fallback row is never
      // confused with an adapter fast path when comparing statement counts or latency
      // (MariaDB's raw UPDATE path returns null, so its updates land here by design).
      const mOrm = PROFILE_WRITE_ENABLED ? profileMark("db:upd:orm") : null;
      await query;
      mOrm?.();
      // Reconstruct the row from the prepared values (full-doc callers only;
      // no affected-rows check — MariaDB reports 0 for matched-but-unchanged
      // updates, which would false-positive "not found").
      const reconstructed = {
        ...values,
        [idCol.name]: id,
      } as Record<string, unknown>;
      const finalData = convertDatesToISO(reconstructed, {
        ...this.convertDatesOptions,
        table: collection,
      }) as unknown as T;
      return this.hooks.length > 0
        ? await this.runHooks("after", "update", collection, finalData, options)
        : finalData;
    }

    if (this.updateReturnsRows) {
      const mOrm = PROFILE_WRITE_ENABLED ? profileMark("db:upd:orm") : null;
      const results = await query.returning();
      mOrm?.();
      let res = results[0];
      if (!res) {
        // Prefer optimized findById over full select *
        const byId = await this.findById<T>(collection, id, options as FindOptions<T>);
        if (!byId.success || !byId.data) {
          throw new Error(`Record ${id} not found in ${getTableName(table)}`);
        }
        return this.hooks.length > 0
          ? await this.runHooks("after", "update", collection, byId.data, options)
          : byId.data;
      }
      const finalData = convertDatesToISO(res, {
        ...this.convertDatesOptions,
        table: collection,
      }) as unknown as T;
      return this.hooks.length > 0
        ? await this.runHooks("after", "update", collection, finalData, options)
        : finalData;
    }

    await query;
    // findById is faster than findOne (raw SQL on SQLite; no mapQuery)
    const updated = await this.findById<T>(collection, id, options as FindOptions<T>);
    if (!updated.success || !updated.data) {
      throw new Error(`Record ${id} not found in ${getTableName(table)}`);
    }
    return this.hooks.length > 0
      ? await this.runHooks("after", "update", collection, updated.data, options)
      : updated.data;
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

        const values = this.prepareUpdateValues(table, data, null, this.writeNow(), options);
        const whereCondition = this.mapQuery(table, query, options);

        // 🔀 PARTIAL-UPDATE MERGE: a payload that patches the JSON `data` blob must
        // merge, not replace. One statement handles it whenever the dialect's
        // operator matches the contract (always on PostgreSQL, and on SQLite/MariaDB
        // for scalar/array patches) — no read, no extra round trip. A nested-object
        // or explicit-null patch on those two engines cannot be expressed in a single
        // SET, so the matching rows are merged individually (each one hydrates its own
        // blob) instead of silently replacing every unmentioned field.
        const jsonPatch = getJsonDataPatch(values);
        if (jsonPatch) {
          if (this.canMergeJsonInOneStatement(jsonPatch)) {
            values.data = this.jsonMergeSetValue(table, jsonPatch);
            clearJsonDataPatch(values);
          } else {
            const modifiedCount = await this.updateMatchingRowsIndividually(
              collection,
              table,
              whereCondition,
              data,
              options,
            );
            return { modifiedCount };
          }
        }

        const drizzleMany = this.persistTimestampsAsDate
          ? values
          : convertISOToDates({ ...values }, { ...this.convertDatesOptions, table: collection });

        // Atomic single UPDATE instead of N+1 sequential loop.
        // SQLite drizzle builders are lazy until `.run()`; awaiting the builder
        // alone does not execute (batch.bulkUpdate already uses this pattern).
        const queryBuilder = this.getDrizzleInstance(options)
          .update(table)
          .set(drizzleMany)
          .where(whereCondition);
        const result =
          typeof (queryBuilder as { run?: () => Promise<unknown> }).run === "function"
            ? await (queryBuilder as { run: () => Promise<unknown> }).run()
            : await queryBuilder;

        return {
          // postgres.js exposes .count, sqlite .changes, mysql2 returns the raw
          // `[ResultSetHeader, fields]` tuple — `rowsAffected` unwraps every shape
          // (reading `.affectedRows` off the tuple yielded undefined → 0, which
          // made a successful compare-and-set look like a miss).
          modifiedCount: rowsAffected(result) ?? 0,
        };
      },
      "UPDATE_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  /**
   * Merge a patch row by row, for the shapes a single `SET` cannot express (SQLite/
   * MariaDB + nested-object or explicit-null patch). Reuses the full single-row write
   * path, so the patch marker, the raw fast path and the JS hydration all behave
   * exactly as they do for `crud.update`. Returns the number of rows written.
   *
   * Membership is resolved with one projection query on the same condition; a row that
   * disappears between that read and its update simply reports no result.
   */
  private async updateMatchingRowsIndividually<T extends BaseEntity>(
    collection: string,
    table: any,
    whereCondition: SQL,
    data: EntityUpdate<T>,
    options: BaseQueryOptions,
  ): Promise<number> {
    const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
    if (!idCol) throw new Error("ID column not found");
    const rows = (await this.getDrizzleInstance(options)
      .select({ id: idCol })
      .from(table)
      .where(whereCondition)) as Array<{ id: DatabaseId }>;

    let modifiedCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const res = await this.update<T>(collection, rows[i].id, data, options);
      if (res.success) modifiedCount++;
    }
    return modifiedCount;
  }

  // --------------------------------------------------------------------------
  // CRUD: delete
  // --------------------------------------------------------------------------

  /**
   * SET payload for a soft delete: `isDeleted` plus the audit pair the trash
   * view reads. `deletedAt`/`deletedBy` are written only when the table has the
   * physical columns, so system tables that predate them keep working.
   *
   * Mongo's CRUD layer has always persisted this pair; SQL only flipped
   * `isDeleted` and stamped `updatedAt`, so the trash rendered "Deleted by:
   * System" for every relational row.
   */
  public buildSoftDeleteSet(table: any, userId?: DatabaseId | null): Record<string, unknown> {
    return buildDefaultSoftDeleteSet(this, table, userId);
  }

  // The extracted SQL modules declare a structural context; the adapter keeps
  // its members protected, so the bridge cast is scoped to these call sites.
  async delete(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions & {
      permanent?: boolean;
      userId?: DatabaseId;
    } = {},
  ): Promise<DatabaseResult<void>> {
    return executeSqlDelete(this as unknown as SqlCrudDeleteContext, collection, id, options);
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & {
      permanent?: boolean;
      userId?: DatabaseId;
    } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return executeSqlDeleteMany(
      this as unknown as SqlCrudDeleteContext,
      collection,
      query,
      options,
    );
  }

  async restore(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<void>> {
    return executeSqlRestore(this as unknown as SqlCrudDeleteContext, collection, id, options);
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
    return executeSqlUpsert(this as unknown as SqlUpsertContext, collection, query, data, options);
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    return executeSqlUpsertMany(this as unknown as SqlUpsertContext, collection, items, options);
  }

  public jsonUpsertMergeSet(table: any): SQL {
    return buildJsonUpsertMergeSet(this as unknown as SqlUpsertContext, table);
  }

  // --------------------------------------------------------------------------
  // CRUD: aggregate — MongoDB-style pipeline translated to SQL
  // --------------------------------------------------------------------------

  async aggregate<R>(
    collection: string,
    pipeline: unknown[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return executeSqlAggregate(
      this as unknown as SqlAggregateContext,
      collection,
      pipeline,
      options,
    );
  }

  /**
   * Numeric JSON extraction for aggregation: engines that render extracted JSON as
   * text need a cast before `SUM`/`AVG`. Default: the plain extraction (SQLite's
   * `json_extract` is already typed).
   */
  public getJsonNumericField(field: string): SQL {
    return this.getJsonField(field);
  }

  /**
   * Ordering-safe extraction for `$min`/`$max` on a field that is NOT a column,
   * or `null` when this dialect cannot order the field's values type-safely.
   */
  public getJsonOrderedField(field: string): SQL | null {
    return this.getJsonField(field);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  public override destroy(): void {
    if (this.preparedStatements.size > 0) this.preparedStatements.clear();
    this._coalescerManager.clear();
  }
}
