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
 */
import { BaseAdapter } from "./base-adapter";
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
  ICrudAdapter,
  ISqlAdapter,
} from "../db-interface";
import * as helpers from "./drizzle-sql-helpers";
import { generateUUID } from "@utils/native-utils";
import { hasIsoDateTimePrefix, nowISODateString } from "@src/utils/date";
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
import {
  buildFindPageResult,
  DEFAULT_PAGE_SIZE,
  decodePageCursor,
  defaultPageSortOption,
  mergeKeysetFilter,
  resolvePageSort,
  shouldUseEstimateCount,
  withIdTiebreaker,
} from "./page-utils";
import { applyLookupStatus, extractPkConflictId, parseIdLookup } from "./lookup-query";

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
  protected get convertDatesOptions(): Record<string, any> {
    return { inPlace: true };
  }

  /**
   * True when timestamp columns must be bound as JS Date (SQLite timestamp_ms,
   * MariaDB DATETIME). PostgreSQL overrides this: postgres.js binds ISO text
   * (`bindPgParam` Date→toISOString), so keeping ISO strings avoids the
   * ISO→Date→ISO round-trip the raw-db-ceiling probe never pays.
   */
  protected get persistTimestampsAsDate(): boolean {
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
  protected ensureTableSchemaRegistered(table: any, name: string): void {
    if (!table || typeof table !== "object") return;
    try {
      const columns = Object.keys(table);
      // Filter out Drizzle internal symbols and metadata
      const realCols = columns.filter(
        (c) => !c.startsWith("Symbol(") && !c.startsWith("@@") && c !== "_" && c !== "name",
      );
      if (realCols.length > 0) {
        utils.registerTableSchema(name, realCols);
      }
    } catch {
      // Schema extraction is best-effort — fallback to full-key iteration if it fails
    }
  }

  // Instance-level cache to skip even the Map.has() call after first registration
  protected _registeredSchemas = new Set<string>();

  protected _insertDefaultsPlanCache = new WeakMap<
    object,
    Array<{
      name: string;
      def?: unknown;
      isBooleanDef?: boolean;
      defaultFn?: () => unknown;
      isTimestamp?: boolean;
    }>
  >();

  protected getInsertDefaultsPlan(tableCols: Record<string, any>) {
    let plan = this._insertDefaultsPlanCache.get(tableCols);
    if (plan) return plan;

    plan = [];
    for (const name in tableCols) {
      if (!Object.hasOwn(tableCols, name)) continue;
      const col = tableCols[name] as {
        default?: unknown;
        defaultFn?: () => unknown;
      };
      const def = col.default;
      const isTimestamp = name === "createdAt" || name === "updatedAt";
      if (
        def !== undefined &&
        (typeof def !== "object" || Object.getPrototypeOf(def) === Object.prototype)
      ) {
        plan.push({
          name,
          def,
          isBooleanDef: typeof def === "boolean",
        });
      } else if (typeof col.defaultFn === "function") {
        plan.push({
          name,
          defaultFn: col.defaultFn,
        });
      } else if (isTimestamp) {
        plan.push({
          name,
          isTimestamp: true,
        });
      }
    }
    this._insertDefaultsPlanCache.set(tableCols, plan);
    return plan;
  }

  /**
   * Reconstruct the inserted row from prepared values + column defaults.
   * Sparse: omit columns with neither a value nor a client-side default so
   * the INSERT lists only bound params (DB DEFAULT applies; postgres.js
   * does not pay a NULL bind per unused column). CMS tables have no
   * triggers / generated columns — listed columns + defaults match the
   * row the engine stores.
   */
  protected synthesizeInsertRow(
    table: any,
    values: Record<string, any>,
    opts?: { intBooleans?: boolean },
  ): Record<string, any> {
    const result: Record<string, any> = { ...values };
    // 🚀 Reuse the warm per-table column cache (populated by prepareValues /
    // getRawFindByIdCols) instead of re-walking getTableColumns per insert.
    const cached = this._tableColumnsCache.get(table);
    const tableCols = cached ?? getTableColumns(table);
    if (!cached && tableCols) this._tableColumnsCache.set(table, tableCols);

    if (tableCols) {
      const plan = this.getInsertDefaultsPlan(tableCols);
      let now: Date | string | undefined;
      const stamp = () => (now ??= this.writeNow());

      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        const name = item.name;
        if (result[name] !== undefined) continue;

        if (item.isTimestamp) {
          result[name] = stamp();
        } else if (item.defaultFn) {
          result[name] = item.defaultFn();
        } else if (item.def !== undefined) {
          result[name] = opts?.intBooleans && item.isBooleanDef ? (item.def ? 1 : 0) : item.def;
        }
      }
    }
    return result;
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

  /**
   * Quote a SQL identifier for this dialect. ANSI double quotes work for
   * SQLite/PostgreSQL; MariaDB needs backticks unless ANSI_QUOTES is enabled
   * (it is NOT in MariaDB's default sql_mode, so double quotes mean strings).
   */
  protected quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /** Whether findById has an adapter-specific raw-SQL optimization. */
  protected get useRawFindById(): boolean {
    return false;
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

  /** Adapter-specific raw findById optimisation — returns null if not used. */
  protected async rawFindById<T extends BaseEntity>(
    _table: any,
    _collection: string,
    _id: DatabaseId,
    _options: FindOptions<T>,
  ): Promise<T | null> {
    return null;
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
  ): Promise<T | null> {
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
    const schemaAny = this.schema as any;
    const alias = helpers.SQL_TABLE_ALIASES[collection];
    if (alias && schemaAny[alias]) return schemaAny[alias];
    if (schemaAny[collection]) return schemaAny[collection];
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
   * Row-store hybrid: materialized scalar columns per collection (populated by
   * createModel; getTable reads it synchronously to build the Drizzle def).
   */
  protected materializedColumns = new Map<string, Map<string, string>>();
  protected modelRegistry = new Map<string, any>();
  protected _resolving = new Set<string>();
  protected _selectionCache = new Map<string, any>();
  protected _lastTable: any = null;
  protected _lastCols: Record<string, Column> | null = null;
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
    return helpers.isSystemTable(collection);
  }

  public getColumn(table: any, name: string, forcePhysical = false): any {
    return helpers.getColumnHelper(
      table,
      name,
      this._tableColumnsCache,
      this._lastTableRef,
      forcePhysical,
    );
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
    return helpers.getPhysicalSelection(table, this._selectionCache, (t, n, f) =>
      helpers.getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, f),
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

    return helpers.getPhysicalSelection(
      table,
      this._selectionCache,
      (t, n, f) => helpers.getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, f),
      this.shouldExcludeData(table, options),
    );
  }

  public mapQuery(table: any, query: any, options: any = {}): any {
    return helpers.mapQuery(
      table,
      query,
      options,
      (t, n) => helpers.getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, false),
      (f) => this.getJsonField(f),
      (v) => this.coerceJsonValue(v),
    );
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
    return helpers.applyOrderBy(
      builder,
      table,
      options,
      (t, n) => helpers.getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, false),
      (f) => this.getJsonField(f),
    );
  }

  // --------------------------------------------------------------------------
  // prepareValues (shared logic, dialect hooks for JSON serialization)
  // --------------------------------------------------------------------------

  /** Stamp update flags without mutating the caller's options object. */
  protected prepareUpdateValues(
    table: any,
    data: any,
    id: any,
    now: Date | string,
    options: any,
  ): any {
    if (options?.isUpdate === true) return this.prepareValues(table, data, id, now, options);
    const updateOpts = options
      ? { ...options, isUpdate: true, operation: "update" }
      : { isUpdate: true, operation: "update" };
    return this.prepareValues(table, data, id, now, updateOpts);
  }

  /**
   * Date-column key set for a table def — mirrors the original per-key
   * predicate exactly (createdAt/updatedAt always; name-suffix heuristic AND
   * date/timestamp column metadata otherwise) but evaluated ONCE per table def
   * instead of per key per write. `schemaCols` is the cached getTableColumns
   * object; its identity changes when the def is rebuilt, so the WeakMap entry
   * is automatically stale-free and GC-able.
   */
  protected getDateColumnKeys(schemaCols: Record<string, any>): Set<string> {
    let keys = this._dateKeyCache.get(schemaCols);
    if (keys) return keys;

    keys = new Set<string>();
    for (const k in schemaCols) {
      if (!Object.hasOwn(schemaCols, k)) continue;
      const col = schemaCols[k];
      const isSpecial = k === "createdAt" || k === "updatedAt";
      const mayBeDate =
        isSpecial ||
        k.includes("Date") ||
        k.includes("date") ||
        k.includes("At") ||
        k.includes("Time") ||
        k.includes("time");
      if (
        isSpecial ||
        (mayBeDate &&
          (col?.dataType === "date" ||
            (col?.columnType && String(col.columnType).includes("Timestamp")) ||
            col?.config?.dataType === "date" ||
            (col?.config?.columnType && String(col.config.columnType).includes("Timestamp"))))
      ) {
        keys.add(k);
      }
    }
    this._dateKeyCache.set(schemaCols, keys);
    return keys;
  }

  public prepareValues(table: any, data: any, id: any, now: Date | string, options: any): any {
    const values: any = {};
    if (id) {
      values._id = id;
    }
    const isUpdate = options?.isUpdate === true || options?.operation === "update";
    const getCol = (t: any, n: string) =>
      helpers.getColumnHelper(t, n, this._tableColumnsCache, this._lastTableRef, false);

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
    // 🚀 PRE-COMPUTED DATE COLUMNS: the per-key `*Date/*At/*Time` heuristics
    // below are resolved ONCE per table def (getDateColumnKeys) instead of per
    // key per write. Null when schemaCols is unavailable → original fallback.
    const dateKeys = schemaCols ? this.getDateColumnKeys(schemaCols) : null;

    const hasDataCol = schemaCols?.["data"] || getCol(table, "data");
    const dynamicData: Record<string, unknown> = {};
    let hasDynamicKeys = false;

    for (const k in data) {
      if (!Object.hasOwn(data, k)) continue;
      if (k === "_id" || k === "id") continue;
      // createdAt is insert-only — never copy a caller-supplied value into SET.
      if (isUpdate && k === "createdAt") continue;

      const isPhysical = schemaCols?.[k] || getCol(table, k);

      if (isPhysical) {
        if (data[k] !== undefined) {
          let val = data[k];
          // Convert numeric timestamps or ISO date strings to Date objects for
          // Drizzle timestamp_ms columns. ONLY when the column is a real
          // date/timestamp column (or the special createdAt/updatedAt pair):
          // the bare `*Date`/`*At` suffix heuristics over-matched TEXT columns
          // (e.g. a materialized publishDate VARCHAR) and produced a Date that
          // SQLite bindings serialize as a JSON-quoted string — double-encoded
          // values that read back unparseable (temporal-integrity regression).
          let isDateColumn = false;
          if (dateKeys) {
            isDateColumn = dateKeys.has(k);
          } else {
            // Fallback (no schemaCols): identical original per-key predicate.
            const isSpecialTimestamp = k === "createdAt" || k === "updatedAt";
            const mayBeDate =
              isSpecialTimestamp ||
              k.includes("Date") ||
              k.includes("date") ||
              k.includes("At") ||
              k.includes("Time") ||
              k.includes("time");
            isDateColumn =
              isSpecialTimestamp ||
              (mayBeDate &&
                (isPhysical?.dataType === "date" ||
                  (isPhysical?.columnType && String(isPhysical.columnType).includes("Timestamp")) ||
                  isPhysical?.config?.dataType === "date" ||
                  (isPhysical?.config?.columnType &&
                    String(isPhysical.config.columnType).includes("Timestamp"))));
          }

          if (isDateColumn) {
            if (this.persistTimestampsAsDate) {
              if (typeof val === "number" && val > 0) {
                val = new Date(val);
              } else if (typeof val === "string" && hasIsoDateTimePrefix(val)) {
                const ts = Date.parse(val);
                if (!isNaN(ts)) {
                  val = new Date(ts);
                }
              }
            } else if (val instanceof Date && !Number.isNaN(val.getTime())) {
              val = val.toISOString();
            } else if (typeof val === "number" && val > 0) {
              val = new Date(val).toISOString();
            }
          } else if (
            this.shouldJsonSerializeInPrepare &&
            typeof val === "object" &&
            val !== null &&
            !(val instanceof Date)
          ) {
            val = JSON.stringify(val);
          }
          values[k] = val;
        }
      } else if (hasDataCol && k !== "tenantId" && k !== "createdAt" && k !== "updatedAt") {
        dynamicData[k] = data[k];
        hasDynamicKeys = true;
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

    // createdAt: only fill on INSERT when the caller didn't provide a value.
    // On UPDATE, never set or overwrite createdAt.
    if (
      !isUpdate &&
      (schemaCols?.["createdAt"] || getCol(table, "createdAt")) &&
      values.createdAt === undefined
    ) {
      values.createdAt = now;
    }
    if (schemaCols?.["updatedAt"] || getCol(table, "updatedAt")) {
      values.updatedAt = now;
    }

    // Map common fields explicitly
    if ((schemaCols?.["collection"] || getCol(table, "collection")) && "collection" in data) {
      values.collection = data.collection;
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

    if (hasDataCol && (!isUpdate || hasDynamicKeys || "data" in data)) {
      if (this.shouldJsonSerializeInPrepare) {
        values.data = JSON.stringify(dynamicData) || "{}";
      } else {
        values.data = dynamicData;
      }
    }

    if (!this.persistTimestampsAsDate) {
      // PG: bind ISO text (raw-db-ceiling shape). convertISOToDates would
      // allocate a Date per timestamp only for bindPgParam to toISOString it.
      return values;
    }

    const result = utils.convertISOToDates(values, {
      ...this.convertDatesOptions,
      table: getTableName(table),
    });

    // NOTE: no post-pass Date clone here — convertISOToDates already returns
    // fresh Date objects for every date column (isoDateStringToDate / new
    // Date(getTime())), and Drizzle + the raw prepared-statement paths bind
    // Date instances natively (epoch ms via prepareAndExecute coercion).
    // The former full-keys pass re-cloned every Date at pure cost.

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

    // 🚀 ALL-SQL ULTRA PATH: {_id} / {_id,tenantId} / + scalar status → findById
    // (SQLite raw SELECT, Postgres/MariaDB eq+limit — skips mapQuery translation)
    if (!options.includeDeleted && !options.bypassSafeQuery && this.hooks.length === 0) {
      const lookup = parseIdLookup(query);
      if (lookup) {
        const fastOpts =
          lookup.tenantId !== undefined && !options.tenantId
            ? { ...options, tenantId: lookup.tenantId as any }
            : options;
        const byId = await this.findById<T>(collection, lookup.id as DatabaseId, fastOpts);
        if (!byId.success || !lookup.status) return byId;
        const matched = applyLookupStatus(byId.data, lookup);
        return matched === byId.data ? byId : { ...byId, data: matched };
      }
    }

    return this.wrap(async () => {
      const q =
        this.hooks.length > 0
          ? await this.runHooks("before", "find", collection, query, options)
          : query;

      // After hooks, re-check for id lookup (optional scalar status)
      if (!options.includeDeleted) {
        const lookup = parseIdLookup(q);
        if (lookup) {
          const fastOpts =
            lookup.tenantId !== undefined && !options.tenantId
              ? { ...options, tenantId: lookup.tenantId as any }
              : options;
          const byId = await this.findById<T>(collection, lookup.id as DatabaseId, fastOpts);
          if (!byId.success) throw new Error(byId.message || "findById failed");
          const data = applyLookupStatus(byId.data, lookup);
          return this.hooks.length > 0
            ? await this.runHooks("after", "find", collection, data, options)
            : data;
        }
      }

      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      // Register schema on read too — read-only workloads (never written via
      // insert) must still get the fast date/JSON conversion path.
      if (!this._registeredSchemas.has(collection)) {
        this.ensureTableSchemaRegistered(table, collection);
        this._registeredSchemas.add(collection);
      }
      const where = this.mapQuery(table, q as any, options);

      const results = await this.getDrizzleInstance(options)
        .select(this.getPhysicalSelection(table))
        .from(table)
        .where(where)
        .limit(1);

      const data = results.length
        ? (utils.convertDatesToISO(results[0], {
            inPlace: true,
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

      // 🚀 ULTRA PATH: {_id} (+ tenantId / scalar status) → findById
      if (!options.includeDeleted && !options.bypassSafeQuery && !options.sort && !options.offset) {
        const lookup = parseIdLookup(q);
        if (lookup) {
          const fastOpts =
            lookup.tenantId !== undefined && !options.tenantId
              ? { ...options, tenantId: lookup.tenantId as any }
              : options;
          const one = await this.findById<T>(collection, lookup.id as DatabaseId, fastOpts);
          if (!one.success) throw new Error(one.message || "findById failed");
          const row = applyLookupStatus(one.data, lookup);
          const data = row ? ([row] as T[]) : ([] as T[]);
          return this.hooks.length > 0
            ? await this.runHooks("after", "find", collection, data, options)
            : data;
        }
      }

      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      // Register schema on read too (see findOne).
      if (!this._registeredSchemas.has(collection)) {
        this.ensureTableSchemaRegistered(table, collection);
        this._registeredSchemas.add(collection);
      }
      const where = this.mapQuery(table, q as any, options);

      const tableName = getTableName(table);
      const isDynamic =
        this.useDynamicSqlInFindMany &&
        (collection.toLowerCase().includes("benchmark") ||
          collection.startsWith("collection_") ||
          !helpers.isSystemTable(collection));

      let results;
      const excludeData = this.shouldExcludeData(table, options);
      try {
        if (isDynamic) {
          const hasCustomFields = Array.isArray(options.fields) && options.fields.length > 0;
          let columns: string[];
          let colList: string;

          if (!hasCustomFields) {
            let cachedEntry = this._dynamicColListCache.get(table);
            if (!cachedEntry) {
              cachedEntry = {};
              this._dynamicColListCache.set(table, cachedEntry);
            }
            const cacheKey = excludeData ? "withoutData" : "withData";
            let cached = cachedEntry[cacheKey];
            if (!cached) {
              const selection = this.getProjectedSelection(table, options);
              columns = Object.keys(selection);
              colList = columns
                .map((c) => this.quoteIdentifier(utils.assertSafeSqlIdentifier(c, "column")))
                .join(", ");
              cached = { colList, columns };
              cachedEntry[cacheKey] = cached;
            }
            columns = cached.columns;
            colList = cached.colList;
          } else {
            const selection = this.getProjectedSelection(table, options);
            columns = Object.keys(selection);
            colList = columns
              .map((c) => this.quoteIdentifier(utils.assertSafeSqlIdentifier(c, "column")))
              .join(", ");
          }

          let escapedTable = this._escapedTableNameCache.get(table);
          if (!escapedTable) {
            escapedTable = this.quoteIdentifier(utils.assertSafeSqlIdentifier(tableName, "table"));
            this._escapedTableNameCache.set(table, escapedTable);
          }

          let sqlQuery = sql`SELECT ${sql.raw(colList)} FROM ${sql.raw(
            escapedTable,
          )} WHERE ${where || sql`1=1`}`;

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
          const rawRows = await this.executeDynamicSql(db, sqlQuery, options);

          const numCols = columns.length;
          const numRows = rawRows.length;
          results = [];
          for (let r = 0; r < numRows; r++) {
            const row = rawRows[r];
            const obj: any = {};
            if (Array.isArray(row)) {
              for (let c = 0; c < numCols; c++) {
                const val = row[c];
                if (val !== undefined) obj[columns[c]] = val;
              }
            } else if (row && typeof row === "object") {
              for (let c = 0; c < numCols; c++) {
                const colName = columns[c];
                const val = row[colName];
                if (val !== undefined) obj[colName] = val;
              }
            }
            results.push(obj);
          }
        } else {
          let builder: any = this.getDrizzleInstance(options)
            .select(this.getProjectedSelection(table, options))
            .from(table)
            .where(where);
          builder = this.applyOrderBy(builder, table, options);
          if (options.limit) builder = builder.limit(options.limit);
          if (options.offset) builder = builder.offset(options.offset);
          results = await builder;
        }
      } catch (err: any) {
        if (this.isMissingTableError(err)) {
          return [];
        }
        throw err;
      }

      // Projection: when data was excluded from the SELECT there is nothing to
      // JSON-parse or flatten — but date/boolean normalization still applies
      // (parity with full reads; avoids leaking raw 0/1 or driver Dates).
      const data = excludeData
        ? utils.convertArrayDatesToISO(results as any, {
            inPlace: true,
            table: collection,
            skipJson: true,
          })
        : utils.convertArrayDatesToISO(results as any, {
            inPlace: true,
            table: collection,
          });
      return this.hooks.length > 0
        ? await this.runHooks("after", "find", collection, data, options)
        : (data as T[]);
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
      const db = this.getDrizzleInstance(options);
      const selection = this.getPhysicalSelection(table);
      const convertOpts = { ...this.convertDatesOptions, table: collection };
      const applyOrderBy = this.applyOrderBy.bind(this);
      const pageSize = 500;
      const startOffset = options.offset ?? 0;
      const maxRows = options.limit ?? Number.MAX_SAFE_INTEGER;

      async function* generator() {
        let offset = startOffset;
        let yielded = 0;
        while (yielded < maxRows) {
          const take = Math.min(pageSize, maxRows - yielded);
          let pageQuery = db.select(selection).from(table).where(where);
          pageQuery = applyOrderBy(pageQuery, table, options);
          pageQuery = pageQuery.limit(take).offset(offset);
          const results = await pageQuery;
          if (!results || results.length === 0) break;
          const data = utils.convertDatesToISO(results, convertOpts) as T[];
          for (let i = 0; i < data.length; i++) {
            yield data[i];
          }
          yielded += data.length;
          offset += data.length;
          if (data.length < take) break;
        }
      }

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
  // CRUD: findPage (limit+1 hasMore — shared product path)
  // --------------------------------------------------------------------------

  async findPage<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: FindPageOptions<T> = {},
  ): Promise<DatabaseResult<FindPageResult<T>>> {
    const pageSize = options.limit && options.limit > 0 ? options.limit : DEFAULT_PAGE_SIZE;
    // Keyset-stable ordering: append the _id tiebreaker in the same direction
    // as the primary sort (matches mergeKeysetFilter's compound (field, _id)
    // cursor) — without it, rows sharing the sort value order arbitrarily and
    // page N+1 overlaps page N.
    const sortOpt = withIdTiebreaker(
      options.sort ?? defaultPageSortOption(),
    ) as FindOptions<T>["sort"];
    const resolvedSort = resolvePageSort(sortOpt);
    const cursor = decodePageCursor(options.cursor);
    const pageQuery = cursor
      ? (mergeKeysetFilter(query as Record<string, unknown>, cursor) as QueryFilter<T>)
      : query;

    const fetchOpts: FindOptions<T> = {
      ...options,
      sort: sortOpt,
      limit: pageSize + 1,
      // Keyset supersedes offset for deep pages
      offset: cursor ? 0 : options.offset,
    };

    const totalMode = options.total ?? "none";
    // 🚀 Parallel: page fetch + optional total (count still short-TTL cached)
    const countPromise =
      totalMode !== "none"
        ? this.count(collection, query, {
            tenantId: options.tenantId,
            systemScope: options.systemScope,
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted,
            bypassSafeQuery: options.bypassSafeQuery,
            skipMeta: true,
            mode: totalMode,
          })
        : null;

    const [rowsRes, countRes] = await Promise.all([
      this.findMany<T>(collection, pageQuery, fetchOpts),
      countPromise ?? Promise.resolve(null),
    ]);

    if (!rowsRes.success) {
      return {
        success: false,
        message: rowsRes.message,
        error: rowsRes.error,
      };
    }

    let totalMeta: { total: number; estimated: boolean } | undefined;
    if (countRes && countRes.success && typeof countRes.data === "number") {
      totalMeta = {
        total: countRes.data,
        estimated: shouldUseEstimateCount(query, {
          mode: totalMode === "none" ? "auto" : totalMode,
          tenantId: options.tenantId,
          includeDeleted: options.includeDeleted,
        }),
      };
    }

    return {
      success: true,
      data: buildFindPageResult(rowsRes.data ?? [], pageSize, totalMeta, resolvedSort),
    };
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
        .select(this.getProjectedSelection(table, options))
        .from(table)
        .where(and(...conditions))
        .limit(1);

      if (results.length === 0) return null;
      const excludeData = this.shouldExcludeData(table, options);
      return excludeData
        ? (utils.convertDatesToISO(results[0], {
            ...this.convertDatesOptions,
            table: collection,
            skipJson: true,
          }) as T)
        : (utils.convertDatesToISO(results[0], {
            ...this.convertDatesOptions,
            table: collection,
          }) as T);
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
    options: CountOptions = {},
  ): Promise<DatabaseResult<number>> {
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (!table) return 0;

        // 🚀 ESTIMATE PATH: metadata/stats when unfiltered + untenanted (all SQL dialects).
        if (
          shouldUseEstimateCount(query, {
            mode: options.mode,
            tenantId: options.tenantId,
            includeDeleted: options.includeDeleted,
          })
        ) {
          const estimated = await this.estimateTableRows(table, collection);
          if (estimated !== null && estimated >= 0) return estimated;
          // Fall through to exact COUNT(*) if stats unavailable
        }

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
      },
      "COUNT_FAILED",
      undefined,
      { skipMeta: options.skipMeta, bypassSafeQuery: options.bypassSafeQuery },
    );
  }

  /**
   * Dialect-aware approximate row count from engine statistics.
   * Returns null when stats are unavailable (caller falls back to exact COUNT).
   */
  protected async estimateTableRows(table: any, _collection: string): Promise<number | null> {
    const tableName = getTableName(table);
    if (!tableName) return null;

    try {
      const dbType = (this.type || "").toLowerCase();

      if (dbType === "postgresql" || dbType === "postgres") {
        // pg_class.reltuples — planner estimate; free vs sequential COUNT(*)
        const rows = await this.raw.execute(
          `SELECT GREATEST(reltuples::bigint, 0) AS n FROM pg_class WHERE relname = $1 LIMIT 1`,
          [tableName],
        );
        const n = extractEstimateNumber(rows, "n");
        return n;
      }

      if (dbType === "mariadb" || dbType === "mysql") {
        const rows = await this.raw.execute(
          `SELECT TABLE_ROWS AS n FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
          [tableName],
        );
        return extractEstimateNumber(rows, "n");
      }

      if (dbType === "sqlite") {
        // sqlite_stat1 after ANALYZE; if missing, exact COUNT is already sub-ms
        const rows = await this.raw.execute(
          `SELECT SUM(CAST(substr(stat, 1, instr(stat || ' ', ' ') - 1) AS INTEGER)) AS n
           FROM sqlite_stat1 WHERE tbl = ?`,
          [tableName],
        );
        const n = extractEstimateNumber(rows, "n");
        // null/0 from missing ANALYZE → fall through to exact
        if (n === null || n === 0) return null;
        return n;
      }
    } catch {
      return null;
    }
    return null;
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
      helpers.isSystemTable(collection) ||
      collection.startsWith("plugin_")
    ) {
      return null;
    }
    if (typeof id !== "string" || !utils.validateId(id)) {
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
    const values = this.prepareValues(table, d, id, now, options);
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
        : utils.convertISOToDates(
            { ...values },
            { ...this.convertDatesOptions, table: collection },
          );
      const query = this.getDrizzleInstance(options).insert(table).values(drizzleValues);
      if (this.insertReturnsRows && !skipReturning) {
        const result = await (query as any).returning();
        return utils.convertDatesToISO(result[0], {
          ...this.convertDatesOptions,
          table: collection,
        }) as T;
      }
      await (query as any);
      return utils.convertDatesToISO(values, {
        ...this.convertDatesOptions,
        table: collection,
      }) as T;
    };

    let finalData: T;
    try {
      finalData = await runInsert();
    } catch (err: any) {
      // Auto-provision dynamic collection tables on first write (MariaDB/Postgres).
      // Without this, plugin_settings → collection_plugin_settings fails with missing table.
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
              utils.convertISOToDates(
                { ...row },
                { ...this.convertDatesOptions, table: collection },
              ),
            );
        const query = this.getDrizzleInstance(options).insert(table).values(drizzleBatch);
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
      { ...options, isWrite: true, skipMeta: true },
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
    const now = this.writeNow();
    const values = this.prepareUpdateValues(table, d, id, now, options);

    const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
    if (!idCol) throw new Error("ID column not found");

    // Never write the PK back in the SET clause — it's the WHERE key
    delete values[idCol.name];
    delete values["id"];

    const conditions: SQL[] = [eq(idCol, id as any)];
    const tenantCol = this.getColumn(table, "tenantId");
    utils.applyTenantFilter(conditions, tenantCol, options);

    // 🚀 NO-READ-BACK PATH: when the caller sends the full document
    // (bulkUpdate, full-doc sync), RETURNING's row read-back + JSON
    // parse/conversion is pure overhead — every column the UPDATE writes
    // was built client-side in prepareValues, so the row can be
    // reconstructed from memory 1:1 (SveltyCMS DDL has no UPDATE triggers
    // or server-generated columns). Partial PATCHes keep RETURNING so
    // untouched physical columns (status/createdAt/isDeleted) stay intact
    // in the response.
    const skipReturning = (options as any)?.skipReturning === true;

    // 🚀 raw UPDATE fast path (SQLite): one prepared statement, one round
    // trip — covers both RETURNING and skipReturning (no-read-back
    // reconstruction from prepared values). Returns null when the adapter
    // has no fast path or bailed; the Drizzle branches below fall back.
    const rawRow = await this.rawUpdateReturning<T>(table, collection, values, idCol, id, options);
    if (rawRow !== null) {
      return this.hooks.length > 0
        ? await this.runHooks("after", "update", collection, rawRow, options)
        : rawRow;
    }

    const drizzleUpdate = this.persistTimestampsAsDate
      ? values
      : utils.convertISOToDates({ ...values }, { ...this.convertDatesOptions, table: collection });
    const query = this.getDrizzleInstance(options)
      .update(table)
      .set(drizzleUpdate)
      .where(and(...conditions));

    if (skipReturning) {
      await query;
      // Reconstruct the row from the prepared values (full-doc callers only;
      // no affected-rows check — MariaDB reports 0 for matched-but-unchanged
      // updates, which would false-positive "not found").
      const reconstructed = {
        ...values,
        [idCol.name]: id,
      } as Record<string, unknown>;
      const finalData = utils.convertDatesToISO(reconstructed, {
        ...this.convertDatesOptions,
        table: collection,
      }) as unknown as T;
      return this.hooks.length > 0
        ? await this.runHooks("after", "update", collection, finalData, options)
        : finalData;
    }

    if (this.updateReturnsRows) {
      const results = await query.returning();
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
      const finalData = utils.convertDatesToISO(res, {
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
        const drizzleMany = this.persistTimestampsAsDate
          ? values
          : utils.convertISOToDates(
              { ...values },
              { ...this.convertDatesOptions, table: collection },
            );

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
          // postgres.js exposes .count; sqlite .changes; mysql2 .affectedRows
          modifiedCount:
            (result as any).count ?? (result as any).changes ?? (result as any).affectedRows ?? 0,
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
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const execWrite = async (builder: { run?: () => Promise<unknown> }) =>
          typeof builder.run === "function" ? builder.run() : builder;

        if (options.permanent && (!query || Object.keys(query).length === 0)) {
          await execWrite(
            this.getDrizzleInstance(options).delete(table) as { run?: () => Promise<unknown> },
          );
          return { deletedCount: -1 };
        }
        // 🚀 Single-statement soft/hard delete instead of findMany + N deletes.
        const whereCondition = this.mapQuery(table, query, options);
        const hasIsDeleted = !!this.getColumn(table, "isDeleted");
        const db = this.getDrizzleInstance(options);
        if (options.permanent || !hasIsDeleted) {
          await execWrite(
            db.delete(table).where(whereCondition) as { run?: () => Promise<unknown> },
          );
          return { deletedCount: -1 };
        }
        const res = await execWrite(
          db
            .update(table)
            .set({ isDeleted: true, updatedAt: new Date() })
            .where(whereCondition) as {
            run?: () => Promise<unknown>;
          },
        );
        // Affected rows differ per dialect: postgres.js -> .count, sqlite -> .changes,
        // mysql2 -> .affectedRows. Fall back to -1 (unknown) when not exposed.
        const affected =
          (res as any)?.count ?? (res as any)?.changes ?? (res as any)?.affectedRows ?? -1;
        return { deletedCount: affected };
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
    const conflictId = extractPkConflictId(query);
    const invalid = this.validateEntryId(collection, conflictId);
    if (invalid) return invalid;
    if (!conflictId) {
      return this.upsertByFind(collection, query, data, options);
    }
    return this.wrap(
      async () => {
        const rows = await this.executeUpsertById(collection, [{ id: conflictId, data }], options, {
          returning: true,
        });
        return rows[0];
      },
      "UPSERT_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    if (!items.length) return { success: true, data: [] };
    for (const item of items) {
      const invalid = this.validateEntryId(collection, extractPkConflictId(item.query));
      if (invalid) return invalid;
    }
    return this.wrap(
      async () => {
        const byId: Array<{ id: string; data: EntityCreate<T> }> = [];
        const rest: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }> = [];
        for (const item of items) {
          const id = extractPkConflictId(item.query);
          if (id) byId.push({ id, data: item.data });
          else rest.push(item);
        }
        const out: T[] = [];
        if (byId.length > 0) {
          const rows = await this.executeUpsertById(collection, byId, options, {
            returning: (options as { skipReturning?: boolean }).skipReturning !== true,
          });
          out.push(...rows);
        }
        for (const item of rest) {
          const res = await this.upsertByFind(collection, item.query, item.data, options);
          if (res.success && res.data) out.push(res.data as T);
        }
        return out;
      },
      "UPSERT_MANY_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  /** findOne then insert/update — used when the conflict target is not `_id`. */
  private async upsertByFind<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const existing = await this.findOne(collection, query, options);
    if (existing.success && existing.data) {
      const existingId =
        (existing.data as { _id?: DatabaseId; id?: DatabaseId })._id ||
        (existing.data as { id?: DatabaseId }).id;
      if (existingId) {
        return this.update(collection, existingId, data as EntityUpdate<T>, options);
      }
    }
    return this.insert(collection, data, options);
  }

  /**
   * One INSERT … ON CONFLICT (_id) / ON DUPLICATE KEY per chunk.
   * SQLite/PostgreSQL use `excluded.*`; MariaDB uses `VALUES()`.
   */
  private async executeUpsertById<T extends BaseEntity>(
    collection: string,
    rows: Array<{ id: string; data: EntityCreate<T> }>,
    options: BaseQueryOptions,
    opts: { returning: boolean },
  ): Promise<T[]> {
    const table = this.getTable(collection);
    if (!table) throw new Error(`Collection table not found: ${collection}`);
    if (!this._registeredSchemas.has(collection)) {
      this.ensureTableSchemaRegistered(table, collection);
      this._registeredSchemas.add(collection);
    }
    const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
    if (!idCol) throw new Error("ID column not found");

    const now = this.writeNow();
    const len = rows.length;
    const batchValues: Record<string, unknown>[] = Array.from({ length: len });
    for (let i = 0; i < len; i++) {
      batchValues[i] = this.prepareValues(table, rows[i].data, rows[i].id, now, options);
    }
    if (!this.persistTimestampsAsDate) {
      for (let i = 0; i < len; i++) {
        batchValues[i] = utils.convertISOToDates(
          { ...batchValues[i] },
          { ...this.convertDatesOptions, table: collection },
        );
      }
    }

    const mysql = this.type === "mariadb" || this.type === "mysql";
    const skipReturning =
      !opts.returning || (options as { skipReturning?: boolean }).skipReturning === true;
    const wantReturning = !skipReturning && this.insertReturnsRows && !mysql;

    const cols = new Set<string>();
    for (let i = 0; i < len; i++) {
      for (const k in batchValues[i]) cols.add(k);
    }
    const setObj: Record<string, unknown> = {};
    for (const k of cols) {
      if (k === "_id" || k === "id" || k === "createdAt") continue;
      const phys = utils.assertSafeSqlIdentifier(this.getColumn(table, k)?.name ?? k, "column");
      setObj[k] = mysql
        ? sql`VALUES(${sql.identifier(phys)})`
        : sql`excluded.${sql.identifier(phys)}`;
    }
    if (Object.keys(setObj).length === 0) {
      const idName = idCol.name || "_id";
      setObj[idName] = sql`${idCol}`;
    }

    const maxParams = mysql || this.type === "postgresql" ? 65_000 : 900;
    const chunkSize = Math.max(1, Math.floor(maxParams / Math.max(cols.size, 1)));

    const run = async (): Promise<T[]> => {
      const db = this.getDrizzleInstance(options);
      const out: T[] = [];
      for (let start = 0; start < len; start += chunkSize) {
        const chunk = batchValues.slice(start, start + chunkSize);
        const insert = db.insert(table).values(chunk);
        const upserted = mysql
          ? insert.onDuplicateKeyUpdate({ set: setObj })
          : insert.onConflictDoUpdate({ target: idCol, set: setObj });
        if (wantReturning) {
          const results = await (upserted as { returning: () => Promise<unknown[]> }).returning();
          out.push(
            ...(utils.convertArrayDatesToISO(results as Record<string, unknown>[], {
              ...this.convertDatesOptions,
              table: collection,
            }) as T[]),
          );
        } else {
          await helpers.executeWrite(upserted);
          out.push(
            ...(utils.convertArrayDatesToISO(chunk as Record<string, unknown>[], {
              ...this.convertDatesOptions,
              table: collection,
            }) as T[]),
          );
        }
      }
      return out;
    };

    try {
      return await run();
    } catch (err: unknown) {
      const provision = this as {
        createModel?: (schema: { _id: string; name: string; fields: [] }) => Promise<unknown>;
      };
      if (this.isMissingTableError(err) && typeof provision.createModel === "function") {
        await provision.createModel({ _id: collection, name: collection, fields: [] });
        return await run();
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // CRUD: aggregate (stub — adapters may override)
  // --------------------------------------------------------------------------

  async aggregate<R>(
    _collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    // SQL engines have no MongoDB-style aggregation pipeline, so report the
    // limitation honestly instead of silently returning an empty result that
    // callers would mistake for a real aggregation.
    return {
      success: false,
      message: "aggregate is not supported on this engine",
      error: {
        code: "NOT_SUPPORTED",
        message: "aggregate is not supported on this engine",
      },
    };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  public override destroy(): void {
    if (this.preparedStatements.size > 0) this.preparedStatements.clear();
  }
}

/** Normalize raw.execute / driver rows into a non-negative integer estimate. */
function extractEstimateNumber(rows: unknown, field: string): number | null {
  if (rows == null) return null;
  let row: any;
  if (Array.isArray(rows)) {
    row = rows[0];
  } else if (typeof rows === "object" && rows !== null && "rows" in (rows as object)) {
    row = (rows as any).rows?.[0];
  } else if (typeof rows === "object") {
    row = rows;
  }
  if (!row) return null;
  const raw = row[field] ?? row[0];
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
