/**
 * @file src/databases/core/sql-query-builder.ts
 * @description
 * Dialect-parameterized QueryBuilder implementation shared by the SQLite,
 * MariaDB and PostgreSQL adapters (Drizzle ORM).
 *
 * The three engines previously shipped ~80% duplicated builder classes with
 * drifting semantics (PostgreSQL skipped ISODateString conversion on read
 * paths, silently dropped unknown sort fields, treated select() as a no-op
 * and threw on function-based where()). This class is the single
 * implementation; per-engine behavior is expressed through the SqlDialect
 * constant supplied at construction time.
 *
 * ### Features:
 * - where / whereIn / whereNotIn / whereBetween / whereNull / whereNotNull
 * - hybrid-schema JSON fallbacks (dynamic fields materialized in the `data` blob)
 * - keyset-cursor paginate() with offset fallback
 * - direction-matched `_id` tie-breaker on paginated reads (index-friendly total order)
 * - prepared list plans: equality + physical ORDER BY + limit/offset compile once
 *   and run through the driver statement cache (the admin list shape)
 * - search (LIKE/ILIKE per dialect) with JSON fallback
 * - projection via select(); no-op exclude/distinct/groupBy/hint/timeout
 * - count / exists / findOne / findOneOrFail / updateMany / deleteMany
 * - optional streaming (PostgreSQL only)
 * - ISODateString normalization on every read path (all engines)
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  getTableName,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type Column,
  type SQL,
} from "drizzle-orm";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseResult,
  FindOptions,
  PaginationOptions,
  QueryBuilder,
  QueryFilter,
  QueryOptimizationHints,
} from "../db-interface";
import { normalizeSortDirection } from "./page-utils";
import { coerceDateColumnValue } from "./drizzle-sql-helpers";
import {
  assertSafeSqlIdentifier,
  convertArrayDatesToISO,
  convertDatesToISO,
  convertISOToDates,
  createDatabaseError,
  getEffectiveTenantId,
  shouldBypassTenantCheck,
} from "./relational-utils";
import { getJsonDataPatch } from "./json-data-patch";

/**
 * Per-engine behavior surface for the shared SQL query builder.
 * All divergence between the SQLite, MariaDB and PostgreSQL builders is
 * expressed here — the class itself contains no engine-specific branches.
 */
export interface SqlDialect {
  /** Stable id so compiled SQL for one engine is never reused on another. */
  id: "sqlite" | "mariadb" | "postgresql";
  /** Bind placeholder. `index` is 0-based (`?` or `$1`). */
  bindAt(index: number): string;
  /** Quote a physical identifier. The name has already passed `assertSafeSqlIdentifier`. */
  quoteIdent(name: string): string;
  /** true when UPDATE/DELETE can use RETURNING to count affected rows (PostgreSQL). */
  supportsReturning: boolean;
  /** true when the driver can stream query results row-by-row (PostgreSQL). */
  streamSupported: boolean;
  /** LIKE (case-sensitive) vs ILIKE (case-insensitive) — PostgreSQL uses ILIKE. */
  likeOperator: "LIKE" | "ILIKE";
  /** MariaDB JSON columns round-trip double-encoded and need the double-parse flag. */
  mariaDoubleParseJson: boolean;
  /**
   * Bind-value coercion for JSON-extract comparisons. MariaDB
   * `JSON_UNQUOTE(JSON_EXTRACT(...))` and PostgreSQL `data->>` render JSON
   * scalars as text, so booleans (and PostgreSQL numbers) must bind as text;
   * SQLite `json_extract` is typed and needs no coercion.
   */
  coerceJsonValue(value: unknown): unknown;
  /** Extracts the affected-row count from a non-RETURNING Drizzle write result. */
  extractAffectedRows(result: unknown): number;
}

function quoteAnsi(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteMaria(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

export const SQLITE_DIALECT: SqlDialect = {
  id: "sqlite",
  bindAt: () => "?",
  quoteIdent: quoteAnsi,
  supportsReturning: false,
  streamSupported: false,
  likeOperator: "LIKE",
  mariaDoubleParseJson: false,
  coerceJsonValue: (value) => value,
  extractAffectedRows: (result) => (result as { changes: number }).changes,
};

export const MARIADB_DIALECT: SqlDialect = {
  id: "mariadb",
  bindAt: () => "?",
  quoteIdent: quoteMaria,
  supportsReturning: false,
  streamSupported: false,
  likeOperator: "LIKE",
  mariaDoubleParseJson: true,
  coerceJsonValue: (value) => (typeof value === "boolean" ? String(value) : value),
  extractAffectedRows: (result) => (result as [{ affectedRows: number }])[0].affectedRows,
};

export const POSTGRES_DIALECT: SqlDialect = {
  id: "postgresql",
  bindAt: (index) => `$${index + 1}`,
  quoteIdent: quoteAnsi,
  supportsReturning: true,
  streamSupported: true,
  likeOperator: "ILIKE",
  mariaDoubleParseJson: false,
  coerceJsonValue: (value) =>
    typeof value === "boolean" || typeof value === "number" ? String(value) : value,
  // Unused on PostgreSQL — RETURNING row counts are read from the result length.
  extractAffectedRows: (result) => (result as unknown[]).length,
};

/**
 * Minimal structural surface the query builder needs from an SQL adapter core.
 * All three SQL adapter cores (SQLiteAdapterCore, MariaDB AdapterCore and
 * PostgresAdapterCore) satisfy it structurally.
 */
export interface SqlQueryBuilderCore {
  db: any;
  getTable(collection: string): any;
  getJsonField(field: string): SQL;
  handleError<T>(
    error: unknown,
    code: string,
    message?: string,
    options?: { suppressErrorLog?: boolean },
  ): DatabaseResult<T>;
  notImplemented<T>(method: string): DatabaseResult<T>;
  /**
   * Register date/JSON column maps so queryBuilder reads hit the in-place
   * conversion path (same maps `findMany` registers). Optional — adapters
   * that omit it still convert, just via the generic key walk.
   */
  registerReadSchema?(collection: string): void;
  /**
   * Write-path helpers (SqlAdapterCore). Present on every SQL adapter; declared
   * optional so the builder stays usable with a minimal structural core.
   * `updateMany` needs them to route blob fields into the JSON `data` column and
   * to merge a partial patch instead of replacing it.
   */
  prepareValues?(table: any, data: any, id: any, now: Date | string, options: any): any;
  canMergeJsonInOneStatement?(patch: Record<string, unknown>): boolean;
  applyJsonMergeToSet?(
    values: Record<string, unknown>,
    table: any,
    patch: Record<string, unknown>,
  ): void;
  update?<T extends BaseEntity>(
    collection: string,
    id: any,
    data: any,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  /**
   * Run a compiled list/count statement on the driver statement cache.
   * Absent on test doubles — those keep the Drizzle path.
   */
  executeCompiled?(
    sqlText: string,
    params: readonly unknown[],
    options?: BaseQueryOptions,
  ): Promise<unknown[]>;
  /**
   * First physical sort that is not the stock `updatedAt` list order.
   * Adapters may schedule a covering index. Must not block the read.
   */
  noteListSort?(
    collection: string,
    order: readonly { name: string; direction: "asc" | "desc" }[],
    equalityColumns: readonly string[],
  ): void;
}

/**
 * One leaf comparison inside a compiled `or` group — a single physical-column
 * equality, null check, or range bound. JSON fields and non-bindable operands
 * cannot be leaves.
 */
type CompiledOrLeaf =
  | { k: "eq"; name: string; value: string | number | boolean | Date }
  | { k: "isnull"; name: string }
  | { k: "gt"; name: string; value: string | number | Date }
  | { k: "gte"; name: string; value: string | number | Date }
  | { k: "lt"; name: string; value: string | number | Date }
  | { k: "lte"; name: string; value: string | number | Date };

/**
 * One alternative inside a compiled `or` group. A leaf is a single physical
 * comparison; an `and` node is a conjunction of leaves — the shape the compound
 * keyset cursor emits: `{ $or: [ {f: {$lt}}, { $and: [{f: v}, {_id: {$lt}}] } ] }`.
 * Anything deeper (nested `$or`, JSON fields, ranges of ranges) keeps the WHOLE
 * OR on the Drizzle path — an OR is never partially compiled.
 */
type CompiledOrAlt = CompiledOrLeaf | { k: "and"; alts: CompiledOrLeaf[] };

/** One comparison the prepared list plan can bind. Anything else stays on Drizzle. */
export type CompiledPred =
  | { k: "eq"; name: string; value: string | number | boolean | Date }
  | { k: "ne"; name: string; value: string | number | boolean | Date }
  | { k: "isnull"; name: string }
  | { k: "notnull"; name: string }
  | { k: "gt"; name: string; value: string | number | Date }
  | { k: "gte"; name: string; value: string | number | Date }
  | { k: "lt"; name: string; value: string | number | Date }
  | { k: "lte"; name: string; value: string | number | Date }
  | { k: "in"; name: string; values: (string | number | boolean | Date)[] }
  | { k: "notin"; name: string; values: (string | number | boolean | Date)[] }
  | {
      k: "range";
      name: string;
      min: string | number | boolean | Date;
      max: string | number | boolean | Date;
    }
  | { k: "or"; alts: CompiledOrAlt[] }
  | { k: "search_or"; names: string[]; pattern: string };

interface ResolvedOrder {
  name: string | null;
  direction: "asc" | "desc";
  column: Column | SQL;
}

const COMPILED_SQL_MAX = 256;
const compiledSqlCache = new Map<string, string>();

interface CompiledTableMeta {
  tableName: string;
  safeTable: string;
  quotedTable: string;
  columns: Record<string, Column>;
  known: Set<string>;
  quotedCols: Map<string, string>;
  allColumnsSelectSql: string;
}

const tableMetaCache = new WeakMap<object, CompiledTableMeta>();

function getCompiledTableMeta(tableObj: object, dialect: SqlDialect): CompiledTableMeta | null {
  const hit = tableMetaCache.get(tableObj);
  if (hit !== undefined) return hit;
  const columns = getTableColumns(tableObj as any) as Record<string, Column> | undefined;
  const tableName = getTableName(tableObj as any) as string | undefined;
  if (!columns || typeof tableName !== "string" || tableName.length === 0) return null;
  const safeTable = assertSafeSqlIdentifier(tableName, "table");
  const quotedTable = dialect.quoteIdent(safeTable);
  const known = new Set<string>();
  const quotedCols = new Map<string, string>();
  const names: string[] = [];
  for (const col of Object.values(columns) as Column[]) {
    if (!col || typeof col.name !== "string") return null;
    known.add(col.name);
    const safeCol = assertSafeSqlIdentifier(col.name, "column");
    const quoted = dialect.quoteIdent(safeCol);
    quotedCols.set(col.name, quoted);
    names.push(quoted);
  }
  if (names.length === 0) return null;
  const meta: CompiledTableMeta = {
    tableName,
    safeTable,
    quotedTable,
    columns,
    known,
    quotedCols,
    allColumnsSelectSql: `SELECT ${names.join(", ")}`,
  };
  tableMetaCache.set(tableObj, meta);
  return meta;
}

function rememberCompiledSql(key: string, sqlText: string): string {
  const hit = compiledSqlCache.get(key);
  if (hit !== undefined) return hit;
  if (compiledSqlCache.size >= COMPILED_SQL_MAX) {
    const oldest = compiledSqlCache.keys().next().value;
    if (oldest !== undefined) compiledSqlCache.delete(oldest);
  }
  compiledSqlCache.set(key, sqlText);
  return sqlText;
}

function isBindable(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function readCount(row: unknown): number {
  if (!row || typeof row !== "object") return 0;
  const rec = row as Record<string, unknown>;
  const raw = rec.count ?? rec.COUNT;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export class SqlQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
  private readonly core: SqlQueryBuilderCore;
  private readonly collection: string;
  private readonly dialect: SqlDialect;
  private readonly conditions: SQL[] = [];
  private sortOptions: Array<{ field: keyof T; direction: "asc" | "desc" }> = [];
  private limitValue?: number;
  private skipValue?: number;
  private selectedFields?: (keyof T)[];
  /** Physical comparisons the prepared plan can bind. */
  private predicates: CompiledPred[] = [];
  /** False once the statement needs JSON or a non-scalar/non-bindable operand. */
  private compilable = true;
  private autoTiebreakId = true;
  private _table?: Record<string, Column>;

  constructor(core: SqlQueryBuilderCore, collection: string, dialect: SqlDialect) {
    this.core = core;
    this.collection = collection;
    this.dialect = dialect;
  }

  setAutoTiebreakId(enable: boolean): this {
    this.autoTiebreakId = enable;
    return this;
  }

  private get table() {
    return (this._table ??= this.core.getTable(this.collection) as unknown as Record<
      string,
      Column
    >);
  }

  private get db() {
    return this.core.db;
  }

  private _dateConversionOptions?: {
    table: string;
    inPlace: true;
    mariaDoubleParseJson?: boolean;
  };

  /** Options passed to date normalization on every read path. */
  private get dateConversionOptions(): {
    table: string;
    inPlace: true;
    mariaDoubleParseJson?: boolean;
  } {
    return (this._dateConversionOptions ??= this.dialect.mariaDoubleParseJson
      ? { table: this.collection, inPlace: true, mariaDoubleParseJson: true }
      : { table: this.collection, inPlace: true });
  }

  /** Schema maps must be registered before in-place conversion can skip the generic key walk. */
  private prepareReadConversion(): void {
    this.core.registerReadSchema?.(this.collection);
  }

  /** Record a physical comparison. A column without a SQL name leaves the prepared plan. */
  private notePhysical(column: Column, pred: CompiledPred): void {
    if (typeof column.name !== "string" || column.name.length === 0) {
      this.compilable = false;
      return;
    }
    this.predicates.push(pred);
  }

  /**
   * Coerces a filter value for a physical column exactly like `mapQuery` does
   * (ISO strings / epoch numbers → Date for timestamp columns). The compiled plan
   * binds parameters straight to the driver, so without this an ISO string would
   * hit an INTEGER `timestamp_ms` column — SQLite compares INTEGER < TEXT (always
   * true) and keyset pages would overlap. JSON fields and non-date columns pass
   * through unchanged.
   */
  private coerceFilterValue(column: Column | undefined, value: unknown): unknown {
    if (!column || value === null || value === undefined) return value;
    return coerceDateColumnValue(column, value);
  }

  where(conditions: Partial<T> | ((item: T) => boolean)): this {
    if (typeof conditions === "function") {
      // Fail loud: a silently dropped filter can be an authorization-relevant
      // condition. JS functions cannot be translated to SQL — the old
      // PostgreSQL builder threw here for exactly this reason.
      throw new Error(
        "Function-based where conditions are not supported by SQL query builders — use plain field values, whereIn, whereBetween, whereNull or whereNotNull",
      );
    }

    for (const key in conditions) {
      if (!Object.hasOwn(conditions, key)) continue;
      const value = (conditions as any)[key];
      if (value !== null && typeof value === "object" && !(value instanceof Date)) {
        // MongoDB-style operator objects ({ $gt, $in, … }) and arrays are not
        // plain equality values. The old pg builder translated them via
        // mapQuery; the unified builders do NOT — so refuse loudly instead of
        // emitting eq(column, "[object Object]") garbage on the JSON path.
        throw new Error(
          `Operator/array values in where() are not supported (field "${String(key)}") — use whereIn, whereBetween, whereNull or whereNotNull`,
        );
      }
      const column = this.table[key];
      if (column) {
        if (value === null) {
          this.conditions.push(isNull(column));
          this.notePhysical(column, { k: "isnull", name: column.name });
        } else if (isBindable(value)) {
          const bound = this.coerceFilterValue(column, value);
          this.conditions.push(eq(column, bound as never));
          this.notePhysical(column, { k: "eq", name: column.name, value: bound as never });
        } else {
          this.conditions.push(eq(column, value as string | number | boolean));
          this.compilable = false;
        }
      } else if (value === null) {
        // 🚀 HYBRID SCHEMA SUPPORT: dynamic fields live in the JSON `data` blob
        this.compilable = false;
        this.conditions.push(isNull(this.core.getJsonField(key)));
      } else {
        // 🚀 HYBRID SCHEMA SUPPORT: JSON extraction for dynamic fields
        this.compilable = false;
        this.conditions.push(
          eq(
            this.core.getJsonField(key),
            this.dialect.coerceJsonValue(value) as string | number | boolean,
          ),
        );
      }
    }
    return this;
  }

  orWhere(clauses: Array<Record<string, unknown>>): this {
    if (!clauses.length) return this;
    // Compiled path: an OR of physical comparison groups. Each alternative is a
    // conjunction of physical leaves (the compound keyset cursor is
    // `{ $or: [ {f: {$lt}}, { $and: [{f: v}, {_id: {$lt}}] } ] }`). Anything
    // that cannot be compiled — nested `$or`, JSON fields, non-bindable or
    // multi-operator values — keeps the WHOLE predicate on Drizzle: an OR is
    // never partially compiled.
    const alts: CompiledOrAlt[] = [];
    let canCompile = true;
    for (const clause of clauses) {
      const alt = this.compileOrClause(clause);
      if (!alt) {
        canCompile = false;
        break;
      }
      alts.push(alt);
    }
    if (canCompile) {
      this.predicates.push({ k: "or", alts });
    } else {
      this.compilable = false;
    }

    // Drizzle conditions for direct builder usage (`queryBuilder().orWhere(...)`).
    const groups: SQL[] = [];
    for (const clause of clauses) {
      const condition = this.drizzleOrClause(clause);
      if (condition) groups.push(condition);
    }
    if (groups.length === 1) this.conditions.push(groups[0]);
    else if (groups.length > 1) {
      const combined = or(...groups);
      if (combined) this.conditions.push(combined);
    }
    return this;
  }

  /**
   * Compiles one OR alternative into a physical leaf or an AND-group of leaves.
   * Returns null (→ Drizzle fallback) for anything the prepared plan cannot bind.
   */
  private compileOrClause(clause: Record<string, unknown>): CompiledOrAlt | null {
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) return null;
    const leaves: CompiledOrLeaf[] = [];
    for (const key of Object.keys(clause)) {
      const value = clause[key];
      if (key === "$and") {
        // Nested conjunction inside an OR alternative (keyset's compound tie).
        if (!Array.isArray(value)) return null;
        for (const sub of value) {
          if (!sub || typeof sub !== "object" || Array.isArray(sub)) return null;
          const subKeys = Object.keys(sub);
          if (subKeys.length !== 1) return null;
          const subKey = subKeys[0];
          const leaf = this.compileOrLeaf(subKey, (sub as Record<string, unknown>)[subKey]);
          if (!leaf) return null;
          leaves.push(leaf);
        }
        continue;
      }
      if (key.startsWith("$")) return null; // nested $or / unknown operator
      const leaf = this.compileOrLeaf(key, value);
      if (!leaf) return null;
      leaves.push(leaf);
    }
    if (leaves.length === 0) return null;
    return leaves.length === 1 ? leaves[0] : { k: "and", alts: leaves };
  }

  /** Compiles a single field comparison inside an OR alternative, or null. */
  private compileOrLeaf(key: string, value: unknown): CompiledOrLeaf | null {
    const column = this.table[key];
    if (!column || typeof column.name !== "string" || column.name.length === 0) return null;
    const name = column.name;
    if (value === null) return { k: "isnull", name };
    if (isBindable(value))
      return { k: "eq", name, value: this.coerceFilterValue(column, value) as never };
    if (typeof value !== "object" || value instanceof Date || Array.isArray(value)) return null;
    const ops = value as Record<string, unknown>;
    if (Object.keys(ops).length !== 1) return null;
    if ("$eq" in ops && isBindable(ops.$eq))
      return { k: "eq", name, value: this.coerceFilterValue(column, ops.$eq) as never };
    if ("$gt" in ops && (typeof ops.$gt === "string" || typeof ops.$gt === "number"))
      return { k: "gt", name, value: this.coerceFilterValue(column, ops.$gt) as never };
    if ("$gte" in ops && (typeof ops.$gte === "string" || typeof ops.$gte === "number"))
      return { k: "gte", name, value: this.coerceFilterValue(column, ops.$gte) as never };
    if ("$lt" in ops && (typeof ops.$lt === "string" || typeof ops.$lt === "number"))
      return { k: "lt", name, value: this.coerceFilterValue(column, ops.$lt) as never };
    if ("$lte" in ops && (typeof ops.$lte === "string" || typeof ops.$lte === "number"))
      return { k: "lte", name, value: this.coerceFilterValue(column, ops.$lte) as never };
    return null;
  }

  /**
   * Translates one OR alternative into a Drizzle condition (physical or JSON
   * field), including `$and` conjunctions and range operators. Returns undefined
   * for shapes the fallback cannot express — the group is then left out rather
   * than emitting a garbage `eq(column, object)`.
   */
  private drizzleOrClause(clause: Record<string, unknown>): SQL | undefined {
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) return undefined;
    const parts: SQL[] = [];
    for (const [key, value] of Object.entries(clause)) {
      if (key === "$and") {
        if (!Array.isArray(value)) return undefined;
        const inner: SQL[] = [];
        for (const sub of value) {
          const condition = this.drizzleOrClause(sub as Record<string, unknown>);
          if (!condition) return undefined;
          inner.push(condition);
        }
        if (inner.length === 1) parts.push(inner[0]);
        else if (inner.length > 1) {
          const combined = and(...inner);
          if (combined) parts.push(combined);
        }
        continue;
      }
      if (key.startsWith("$")) return undefined;
      const condition = this.drizzleFieldCondition(key, value);
      if (!condition) return undefined;
      parts.push(condition);
    }
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return and(...parts) ?? undefined;
  }

  /** Single field → Drizzle condition (physical column or JSON blob field). */
  private drizzleFieldCondition(key: string, value: unknown): SQL | undefined {
    const column = this.table[key];
    const jsonField = () => this.core.getJsonField(key);
    if (value === null) return column ? isNull(column) : isNull(jsonField());
    if (value instanceof Date)
      return column ? eq(column, value as never) : eq(jsonField(), value as never);
    if (typeof value === "object" && !Array.isArray(value)) {
      const target: Column | SQL = column ?? jsonField();
      // Physical columns coerce dates exactly like mapQuery; JSON fields coerce
      // dialect-specifically (MariaDB/PostgreSQL render extracted scalars as text).
      const bind = (v: unknown) =>
        column ? this.coerceFilterValue(column, v) : this.dialect.coerceJsonValue(v);
      const ops = value as Record<string, unknown>;
      if ("$eq" in ops && isBindable(ops.$eq)) return eq(target, bind(ops.$eq) as never);
      if ("$ne" in ops && isBindable(ops.$ne)) return sql`${target} <> ${bind(ops.$ne)}`;
      if ("$in" in ops && Array.isArray(ops.$in))
        return inArray(target, (ops.$in as unknown[]).map(bind) as never[]);
      if ("$nin" in ops && Array.isArray(ops.$nin))
        return notInArray(target, (ops.$nin as unknown[]).map(bind) as never[]);
      if (("$gte" in ops || "$gt" in ops) && ("$lte" in ops || "$lt" in ops)) {
        return and(
          gte(target, bind(ops.$gte ?? ops.$gt) as never),
          lte(target, bind(ops.$lte ?? ops.$lt) as never),
        );
      }
      if ("$gt" in ops) return sql`${target} > ${bind(ops.$gt)}`;
      if ("$gte" in ops) return sql`${target} >= ${bind(ops.$gte)}`;
      if ("$lt" in ops) return sql`${target} < ${bind(ops.$lt)}`;
      if ("$lte" in ops) return sql`${target} <= ${bind(ops.$lte)}`;
      // Unknown operator object on a physical column keeps the historical eq()
      // shape; on a JSON field the clause is dropped instead of emitting garbage.
      return column ? eq(column, value as never) : undefined;
    }
    if (column) return eq(column, this.coerceFilterValue(column, value) as never);
    return eq(jsonField(), this.dialect.coerceJsonValue(value) as never);
  }

  whereIn<K extends keyof T>(field: K, values: NonNullable<T[K]>[]): this {
    const column = this.table[field as string];
    const name = typeof column?.name === "string" && column.name.length > 0 ? column.name : null;
    const bindable = values.length > 0 && values.every(isBindable);
    if (column && name && bindable) {
      // Compiled path: physical column + non-empty bindable array. Keep the
      // Drizzle condition too — it is harmless here and required on fallback.
      const bound = this.coerceFilterValue(column, values) as (string | number | boolean | Date)[];
      const condition = inArray(column, bound as never);
      if (condition) {
        this.conditions.push(condition);
      }
      this.predicates.push({ k: "in", name, values: [...bound] });
    } else {
      this.compilable = false;
      if (column) {
        const condition = inArray(column, values as (string | number | boolean)[]);
        if (condition) {
          this.conditions.push(condition);
        }
      } else if (values.length > 0) {
        // 🚀 HYBRID SCHEMA SUPPORT: JSON extraction for dynamic fields
        this.conditions.push(
          inArray(
            this.core.getJsonField(field as string),
            values.map((v) => this.dialect.coerceJsonValue(v)) as (string | number | boolean)[],
          ),
        );
      } else {
        this.conditions.push(sql`1=0`);
      }
    }
    return this;
  }

  whereNotIn<K extends keyof T>(field: K, values: NonNullable<T[K]>[]): this {
    const column = this.table[field as string];
    const name = typeof column?.name === "string" && column.name.length > 0 ? column.name : null;
    const bindable = values.length > 0 && values.every(isBindable);
    if (column && name && bindable) {
      const bound = this.coerceFilterValue(column, values) as (string | number | boolean | Date)[];
      const condition = notInArray(column, bound as never);
      if (condition) {
        this.conditions.push(condition);
      }
      this.predicates.push({ k: "notin", name, values: [...bound] });
    } else {
      this.compilable = false;
      if (column) {
        const condition = notInArray(column, values as (string | number | boolean)[]);
        if (condition) {
          this.conditions.push(condition);
        }
      }
    }
    return this;
  }

  whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this {
    const column = this.table[field as string];
    const name = typeof column?.name === "string" && column.name.length > 0 ? column.name : null;
    const bindable = isBindable(min) && isBindable(max);
    if (column && name && bindable) {
      const minBound = this.coerceFilterValue(column, min);
      const maxBound = this.coerceFilterValue(column, max);
      const condition = and(gte(column, minBound as never), lte(column, maxBound as never));
      if (condition) {
        this.conditions.push(condition);
      }
      this.predicates.push({
        k: "range",
        name,
        min: minBound as never,
        max: maxBound as never,
      });
    } else {
      this.compilable = false;
      if (column) {
        const condition = and(
          gte(column, min as string | number | boolean),
          lte(column, max as string | number | boolean),
        );
        if (condition) {
          this.conditions.push(condition);
        }
      } else {
        const jsonField = this.core.getJsonField(field as string);
        this.conditions.push(
          and(
            gte(jsonField, this.dialect.coerceJsonValue(min) as string | number | boolean),
            lte(jsonField, this.dialect.coerceJsonValue(max) as string | number | boolean),
          ) as SQL,
        );
      }
    }
    return this;
  }

  whereNull<K extends keyof T>(field: K): this {
    const column = this.table[field as string];
    if (column) {
      this.conditions.push(isNull(column));
      this.notePhysical(column, { k: "isnull", name: column.name });
    } else {
      this.compilable = false;
      this.conditions.push(isNull(this.core.getJsonField(field as string)));
    }
    return this;
  }

  whereNotNull<K extends keyof T>(field: K): this {
    const column = this.table[field as string];
    if (column) {
      this.conditions.push(sql`${column} IS NOT NULL`);
      this.notePhysical(column, { k: "notnull", name: column.name });
    } else {
      this.compilable = false;
      this.conditions.push(sql`${this.core.getJsonField(field as string)} IS NOT NULL`);
    }
    return this;
  }

  search(query: string, fields?: (keyof T)[]): this {
    const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
    const pattern = "%" + escaped + "%";
    // The ESCAPE char is BOUND, never inlined: on MySQL/MariaDB a backslash
    // inside a string literal is itself an escape, so `ESCAPE '\\'` written as
    // SQL text is a syntax error there (fine on SQLite/Postgres). Mirrors
    // drizzle-sql-helpers.ts so every LIKE in the codebase escapes the same way.
    const ESCAPE_CHAR = "\\";
    const likeCondition = (column: Column | SQL): SQL =>
      sql`${column} ${sql.raw(this.dialect.likeOperator)} ${pattern} ESCAPE ${ESCAPE_CHAR}`;

    const resolveField = (f: string): SQL | null => {
      const column = this.table[f];
      if (column) {
        return (column as any).dataType !== "json" ? likeCondition(column) : null;
      }
      // 🚀 HYBRID SCHEMA SUPPORT: search inside the JSON `data` blob
      return likeCondition(this.core.getJsonField(f));
    };

    if (fields && fields.length > 0) {
      const searchConditions = fields
        .map((f) => resolveField(f as string))
        .filter((c): c is SQL => c !== null);

      if (searchConditions.length > 0) {
        const condition = or(...searchConditions);
        if (condition) {
          this.conditions.push(condition);
        }
      }
    } else {
      // Default: search 'title', 'content', 'name', 'slug', 'description'
      // columns IF they exist, otherwise search inside the JSON `data` blob
      const defaultFields = ["title", "content", "name", "slug", "description"];
      const searchConditions = defaultFields.map((f) => resolveField(f) as SQL);
      this.conditions.push(or(...searchConditions) as SQL);
    }

    if (this.compilable) {
      const candidateFields =
        fields && fields.length > 0
          ? (fields as string[])
          : ["title", "content", "name", "slug", "description"];

      const physicalNames: string[] = [];
      let canCompileSearch = true;

      if (fields && fields.length > 0) {
        for (const f of candidateFields) {
          const col = this.table[f];
          if (
            col &&
            (col as any).dataType !== "json" &&
            typeof col.name === "string" &&
            col.name.length > 0
          ) {
            physicalNames.push(col.name);
          } else {
            canCompileSearch = false;
            break;
          }
        }
      } else {
        for (const f of candidateFields) {
          const col = this.table[f];
          if (
            col &&
            (col as any).dataType !== "json" &&
            typeof col.name === "string" &&
            col.name.length > 0
          ) {
            physicalNames.push(col.name);
          }
        }
        if (physicalNames.length === 0) {
          canCompileSearch = false;
        }
      }

      if (canCompileSearch && physicalNames.length > 0) {
        this.predicates.push({
          k: "search_or",
          names: physicalNames,
          pattern,
        });
      } else {
        this.compilable = false;
      }
    }

    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  skip(value: number): this {
    this.skipValue = value;
    return this;
  }

  paginate(options: PaginationOptions): this {
    // Keyset cursor pagination: O(1) seek via index instead of O(N) offset skip
    if (options.cursor) {
      const direction = options.cursorDirection || "after";
      const idCol = this.table["_id"];
      if (idCol) {
        // ⚠️ The comparison operator and the `_id` sort pushed here are one
        // contract: `> cursor` needs `_id asc` (forward seek), `< cursor` needs
        // `_id desc` (backward seek). Changing one without the other silently
        // breaks page continuation (repeats / skipped rows).
        const comparable = typeof idCol.name === "string";
        if (!comparable) this.compilable = false;
        if (direction === "after") {
          this.conditions.push(sql`${idCol} > ${options.cursor}`);
          if (comparable)
            this.predicates.push({ k: "gt", name: idCol.name, value: options.cursor });
          this.sortOptions.push({ field: "_id" as keyof T, direction: "asc" });
        } else {
          this.conditions.push(sql`${idCol} < ${options.cursor}`);
          if (comparable)
            this.predicates.push({ k: "lt", name: idCol.name, value: options.cursor });
          this.sortOptions.push({ field: "_id" as keyof T, direction: "desc" });
        }
      } else {
        this.compilable = false;
      }
      this.limitValue = options.pageSize || options.limit || 20;
    } else if (options.page && options.pageSize) {
      // Fallback: offset-based pagination
      this.skipValue = (options.page - 1) * options.pageSize;
      this.limitValue = options.pageSize;
    }
    if (options.sortField && options.sortDirection) {
      this.sort(options.sortField as keyof T, options.sortDirection);
    }
    return this;
  }

  sort<K extends keyof T>(field: K, direction: "asc" | "desc"): this {
    this.sortOptions.push({ field, direction });
    return this;
  }

  orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: "asc" | "desc" }>): this {
    this.sortOptions = [...this.sortOptions, ...sorts];
    return this;
  }

  select<K extends keyof T>(fields: K[]): this {
    this.selectedFields = fields;
    return this;
  }

  exclude<K extends keyof T>(_fields: K[]): this {
    return this;
  }

  distinct<K extends keyof T>(_field?: K): this {
    return this;
  }

  groupBy<K extends keyof T>(_field: K): this {
    return this;
  }

  hint(_hints: QueryOptimizationHints): this {
    return this;
  }

  timeout(_milliseconds: number): this {
    return this;
  }

  private buildQuery() {
    if (!this.db) {
      throw new Error("Database not connected");
    }

    let q: any;
    if (this.selectedFields) {
      const projection: Record<string, Column> = {};
      this.selectedFields.forEach((f) => {
        const column = this.table[f as string];
        if (column) {
          projection[f as string] = column;
        }
      });
      q = this.db.select(projection).from(this.table).$dynamic();
    } else {
      q = this.db.select().from(this.table).$dynamic();
    }

    if (this.conditions.length > 0) {
      q = q.where(and(...this.conditions));
    }

    const order = this.resolveOrder();
    if (order.length > 0) {
      q = q.orderBy(...order.map((o) => (o.direction === "desc" ? desc(o.column) : asc(o.column))));
    }

    if (this.limitValue !== undefined) {
      q = q.limit(this.limitValue);
    }
    if (this.skipValue !== undefined) {
      q = q.offset(this.skipValue);
    }

    return q;
  }

  /**
   * Total order for a paginated read. The `_id` tiebreak follows the LAST
   * explicit sort direction so a B-tree can serve it. JSON sorts carry a null
   * name and stay on the Drizzle path.
   */
  private resolveOrder(): ResolvedOrder[] {
    const idCol = this.table["_id"];
    const out: ResolvedOrder[] = [];
    let lastSortDirection: "asc" | "desc" | undefined;
    let ordersById = false;
    for (let i = 0; i < this.sortOptions.length; i++) {
      const s = this.sortOptions[i];
      const direction = normalizeSortDirection(s.direction);
      const fieldName = s.field as string;
      const column = this.table[fieldName] ?? this.table[fieldName.replace(/^_/, "")];
      if (!column) {
        out.push({ name: null, direction, column: this.core.getJsonField(fieldName) });
      } else {
        const name = typeof column.name === "string" ? column.name : null;
        if (idCol && column.name === idCol.name) ordersById = true;
        out.push({ name, direction, column });
      }
      lastSortDirection = direction;
    }
    if (
      this.autoTiebreakId &&
      (this.limitValue !== undefined || this.skipValue !== undefined) &&
      !ordersById &&
      idCol
    ) {
      out.push({
        name: typeof idCol.name === "string" ? idCol.name : null,
        direction: lastSortDirection === "desc" ? "desc" : "asc",
        column: idCol,
      });
    }
    return out;
  }

  /**
   * Prepared statement for physical comparisons (eq/ne/isnull/notnull/gt/gte/lt/lte, plus
   * in/notin/range/search/or of physical columns) + physical order + limit/offset, or
   * for the matching count. Returns null when the shape needs Drizzle (JSON
   * fields, non-bindable values, projections of unknown columns, or no
   * `executeCompiled`).
   */
  public compile(mode: "list" | "count"): { sql: string; params: unknown[] } | null {
    if (!this.compilable || !this.core.executeCompiled) return null;
    try {
      const table = this.table as unknown;
      if (!table || typeof table !== "object") return null;
      const meta = getCompiledTableMeta(table, this.dialect);
      if (!meta) return null;

      const params: unknown[] = [];
      const equality: string[] = [];

      // OR leaves share the param/signature bookkeeping with appendSig.
      const appendOrLeafSig = (leaf: CompiledOrLeaf): string | null => {
        if (!meta.known.has(leaf.name)) return null;
        switch (leaf.k) {
          case "eq":
            params.push(leaf.value);
            return `eq:${leaf.name}`;
          case "isnull":
            return `isnull:${leaf.name}`;
          case "gt":
            params.push(leaf.value);
            return `gt:${leaf.name}`;
          case "gte":
            params.push(leaf.value);
            return `gte:${leaf.name}`;
          case "lt":
            params.push(leaf.value);
            return `lt:${leaf.name}`;
          case "lte":
            params.push(leaf.value);
            return `lte:${leaf.name}`;
        }
      };

      // Build the predicate signature and bind params in EXACTLY the placeholder
      // order emitted below. Values never enter the signature — only shape.
      const appendSig = (pred: CompiledPred): string | null => {
        switch (pred.k) {
          case "eq":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.value);
            equality.push(pred.name);
            return `eq:${pred.name}`;
          case "ne":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.value);
            return `ne:${pred.name}`;
          case "isnull":
            if (!meta.known.has(pred.name)) return null;
            return `isnull:${pred.name}`;
          case "notnull":
            if (!meta.known.has(pred.name)) return null;
            return `notnull:${pred.name}`;
          case "gt":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.value);
            return `gt:${pred.name}`;
          case "gte":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.value);
            return `gte:${pred.name}`;
          case "lt":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.value);
            return `lt:${pred.name}`;
          case "lte":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.value);
            return `lte:${pred.name}`;
          case "in":
            if (!meta.known.has(pred.name)) return null;
            for (const v of pred.values) params.push(v);
            return `in:${pred.name}:${pred.values.length}`;
          case "notin":
            if (!meta.known.has(pred.name)) return null;
            for (const v of pred.values) params.push(v);
            return `notin:${pred.name}:${pred.values.length}`;
          case "range":
            if (!meta.known.has(pred.name)) return null;
            params.push(pred.min);
            params.push(pred.max);
            return `range:${pred.name}`;
          case "search_or":
            for (const n of pred.names) {
              if (!meta.known.has(n)) return null;
              params.push(pred.pattern);
              params.push("\\");
            }
            return `search_or(${pred.names.join("+")})`;
          case "or": {
            const parts: string[] = [];
            for (const a of pred.alts) {
              if (a.k === "and") {
                const inner: string[] = [];
                for (const leaf of a.alts) {
                  const sig = appendOrLeafSig(leaf);
                  if (sig === null) return null;
                  inner.push(sig);
                }
                parts.push(inner.join("&"));
              } else {
                const sig = appendOrLeafSig(a);
                if (sig === null) return null;
                parts.push(sig);
              }
            }
            return `or(${parts.join(",")})`;
          }
        }
      };

      const sigParts: string[] = [];
      for (let i = 0; i < this.predicates.length; i++) {
        const sig = appendSig(this.predicates[i]);
        if (sig === null) return null;
        sigParts.push(sig);
      }
      const predSig = sigParts.join(",");

      let orderSig = "";
      let order: ResolvedOrder[] | null = null;
      let namedOrder: { name: string; direction: "asc" | "desc" }[] | null = null;
      if (mode === "list") {
        order = this.resolveOrder();
        if (order.length > 0) {
          namedOrder = [];
          for (let i = 0; i < order.length; i++) {
            const o = order[i];
            if (o.name === null || !meta.known.has(o.name)) return null;
            orderSig += (orderSig ? "," : "") + o.name + ":" + o.direction;
            namedOrder.push({ name: o.name, direction: o.direction });
          }
        }
      }

      let selectSig: string;
      if (mode === "count") {
        selectSig = "count";
      } else if (this.selectedFields) {
        selectSig = this.selectedFields.join(",");
      } else {
        selectSig = "*";
      }

      let limitSig = "";
      if (mode === "list") {
        if (this.limitValue !== undefined) {
          params.push(this.limitValue);
          limitSig = "L";
        }
        if (this.skipValue !== undefined) {
          params.push(this.skipValue);
          limitSig += "O";
        }
      }

      const key = `${this.dialect.id}\0${meta.safeTable}\0${selectSig}\0${predSig}\0${orderSig}\0${limitSig}`;
      const cached = compiledSqlCache.get(key);
      if (cached !== undefined) {
        if (namedOrder && namedOrder.length > 0) {
          this.core.noteListSort?.(this.collection, namedOrder, equality);
        }
        return { sql: cached, params };
      }

      // Cache miss: assemble SQL statement once and cache. Placeholders are
      // emitted in the same order `appendSig` pushed params.
      const whereParts: string[] = [];
      let paramIdx = 0;
      const qn = (name: string) => meta.quotedCols.get(name) ?? this.dialect.quoteIdent(name);
      // OR leaves bind in the same order appendOrLeafSig pushed params.
      const emitOrLeaf = (leaf: CompiledOrLeaf): string => {
        switch (leaf.k) {
          case "eq":
            return `${qn(leaf.name)} = ${this.dialect.bindAt(paramIdx++)}`;
          case "isnull":
            return `${qn(leaf.name)} IS NULL`;
          case "gt":
            return `${qn(leaf.name)} > ${this.dialect.bindAt(paramIdx++)}`;
          case "gte":
            return `${qn(leaf.name)} >= ${this.dialect.bindAt(paramIdx++)}`;
          case "lt":
            return `${qn(leaf.name)} < ${this.dialect.bindAt(paramIdx++)}`;
          case "lte":
            return `${qn(leaf.name)} <= ${this.dialect.bindAt(paramIdx++)}`;
        }
      };
      const emitSql = (pred: CompiledPred): string => {
        switch (pred.k) {
          case "eq":
            return `${qn(pred.name)} = ${this.dialect.bindAt(paramIdx++)}`;
          case "ne":
            return `${qn(pred.name)} <> ${this.dialect.bindAt(paramIdx++)}`;
          case "isnull":
            return `${qn(pred.name)} IS NULL`;
          case "notnull":
            return `${qn(pred.name)} IS NOT NULL`;
          case "gt":
            return `${qn(pred.name)} > ${this.dialect.bindAt(paramIdx++)}`;
          case "gte":
            return `${qn(pred.name)} >= ${this.dialect.bindAt(paramIdx++)}`;
          case "lt":
            return `${qn(pred.name)} < ${this.dialect.bindAt(paramIdx++)}`;
          case "lte":
            return `${qn(pred.name)} <= ${this.dialect.bindAt(paramIdx++)}`;
          case "in":
            return `${qn(pred.name)} IN (${pred.values
              .map(() => this.dialect.bindAt(paramIdx++))
              .join(", ")})`;
          case "notin":
            return `${qn(pred.name)} NOT IN (${pred.values
              .map(() => this.dialect.bindAt(paramIdx++))
              .join(", ")})`;
          case "range":
            return `${qn(pred.name)} >= ${this.dialect.bindAt(paramIdx++)} AND ${qn(
              pred.name,
            )} <= ${this.dialect.bindAt(paramIdx++)}`;
          case "search_or": {
            const parts = pred.names.map(
              (n) =>
                `${qn(n)} ${this.dialect.likeOperator} ${this.dialect.bindAt(paramIdx++)} ESCAPE ${this.dialect.bindAt(paramIdx++)}`,
            );
            return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
          }
          case "or":
            return `(${pred.alts
              .map((a) =>
                a.k === "and" ? `(${a.alts.map(emitOrLeaf).join(" AND ")})` : emitOrLeaf(a),
              )
              .join(" OR ")})`;
        }
      };
      for (let i = 0; i < this.predicates.length; i++) {
        whereParts.push(emitSql(this.predicates[i]));
      }

      let orderSql = "";
      if (mode === "list" && order && order.length > 0) {
        const bits: string[] = [];
        for (let i = 0; i < order.length; i++) {
          const o = order[i];
          const qn = meta.quotedCols.get(o.name!) ?? this.dialect.quoteIdent(o.name!);
          bits.push(`${qn} ${o.direction === "desc" ? "DESC" : "ASC"}`);
        }
        orderSql = ` ORDER BY ${bits.join(", ")}`;
        if (namedOrder && namedOrder.length > 0) {
          this.core.noteListSort?.(this.collection, namedOrder, equality);
        }
      }

      let selectSql: string;
      if (mode === "count") {
        selectSql = "SELECT count(*) AS count";
      } else if (this.selectedFields) {
        const names: string[] = [];
        for (const field of this.selectedFields) {
          const col = meta.columns[field as string];
          if (!col || typeof col.name !== "string" || !meta.known.has(col.name)) return null;
          names.push(meta.quotedCols.get(col.name) ?? this.dialect.quoteIdent(col.name));
        }
        if (names.length === 0) return null;
        selectSql = `SELECT ${names.join(", ")}`;
      } else {
        selectSql = meta.allColumnsSelectSql;
      }

      let limitSql = "";
      if (mode === "list") {
        if (this.limitValue !== undefined) {
          limitSql += ` LIMIT ${this.dialect.bindAt(paramIdx++)}`;
        }
        if (this.skipValue !== undefined) {
          limitSql += ` OFFSET ${this.dialect.bindAt(paramIdx++)}`;
        }
      }

      const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";
      const sqlText = rememberCompiledSql(
        key,
        `${selectSql} FROM ${meta.quotedTable}${whereSql}${orderSql}${limitSql}`,
      );
      return { sql: sqlText, params };
    } catch {
      return null;
    }
  }

  /**
   * Translates a standard CRUD QueryFilter and FindOptions into query builder
   * state. If any condition cannot be compiled into a prepared plan, marks
   * this.compilable = false so callers fall back to the Drizzle dynamic path.
   */
  applyFilterAndOptions(
    query: QueryFilter<T> = {},
    options: FindOptions<T> = {},
    autoTiebreakId = false,
  ): this {
    this.autoTiebreakId = autoTiebreakId;

    if (options.fields && options.fields.length > 0) {
      const selected = [...(options.fields as (keyof T)[])];
      if (
        !selected.includes("_id" as keyof T) &&
        !selected.includes("id" as keyof T) &&
        this.table["_id"]
      ) {
        selected.unshift("_id" as keyof T);
      }
      this.select(selected);
    }

    if (options.limit !== undefined) {
      this.limit(options.limit);
    }
    if (options.offset !== undefined) {
      this.skip(options.offset);
    }

    if (options.sort) {
      if (Array.isArray(options.sort)) {
        for (const item of options.sort) {
          if (Array.isArray(item) && item.length >= 2) {
            this.sort(item[0] as keyof T, normalizeSortDirection(item[1]));
          } else if (typeof item === "object" && item !== null) {
            const keys = Object.keys(item);
            if (keys.length > 0) {
              this.sort(
                keys[0] as keyof T,
                normalizeSortDirection((item as unknown as Record<string, unknown>)[keys[0]]),
              );
            }
          }
        }
      } else if (typeof options.sort === "object") {
        for (const field of Object.keys(options.sort)) {
          this.sort(
            field as keyof T,
            normalizeSortDirection((options.sort as Record<string, unknown>)[field]),
          );
        }
      }
    }

    const tenantCol = this.table["tenantId"];
    const hasTenantCol = Boolean(tenantCol && typeof tenantCol.name === "string");
    const queryHasTenant = Object.prototype.hasOwnProperty.call(query, "tenantId");

    if (hasTenantCol && !queryHasTenant && !shouldBypassTenantCheck(options)) {
      const effectiveTenant = getEffectiveTenantId(options);
      if (effectiveTenant !== undefined) {
        if (effectiveTenant === null) {
          this.whereNull("tenantId" as keyof T);
        } else {
          this.where({ tenantId: effectiveTenant } as unknown as Partial<T>);
        }
      }
    }

    this.applyFilterObject(query as Record<string, unknown>);

    return this;
  }

  /**
   * Recursively applies one filter object: `$and` conjunctions are flattened
   * (each element is AND-ed, so predicate order is irrelevant), `$or` is
   * delegated to orWhere, and every other field goes through
   * applyFieldCondition. `$and` is what `mergeKeysetFilter` wraps a base query
   * in, so flattening it keeps keyset pages on the compiled prepared plan.
   */
  private applyFilterObject(filter: Record<string, unknown>): void {
    for (const key of Object.keys(filter)) {
      const value = filter[key];
      if (key === "$and" && Array.isArray(value)) {
        for (const sub of value) {
          if (sub && typeof sub === "object" && !Array.isArray(sub)) {
            this.applyFilterObject(sub as Record<string, unknown>);
          } else {
            this.compilable = false;
          }
        }
        continue;
      }
      if (key === "$or" && Array.isArray(value)) {
        this.orWhere(value as Array<Record<string, unknown>>);
        continue;
      }
      if (key.startsWith("$")) {
        this.compilable = false;
        continue;
      }
      this.applyFieldCondition(key, value);
    }
  }

  /**
   * Applies one field comparison to both the compiled predicates and the Drizzle
   * fallback conditions. Extracted so `$and` sub-filters translate identically to
   * top-level fields.
   */
  private applyFieldCondition(key: string, value: unknown): void {
    if (value === null) {
      this.whereNull(key as keyof T);
      return;
    }
    if (isBindable(value) || value instanceof Date) {
      this.where({ [key]: value } as unknown as Partial<T>);
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      this.compilable = false;
      return;
    }
    const valObj = value as Record<string, unknown>;
    if ("$eq" in valObj && isBindable(valObj.$eq)) {
      this.where({ [key]: valObj.$eq } as unknown as Partial<T>);
    } else if ("$ne" in valObj && isBindable(valObj.$ne)) {
      const col = this.table[key];
      if (col && typeof col.name === "string" && col.name.length > 0) {
        const bound = this.coerceFilterValue(col, valObj.$ne);
        this.conditions.push(sql`${col} <> ${bound}`);
        this.predicates.push({ k: "ne", name: col.name, value: bound as never });
      } else {
        this.compilable = false;
      }
    } else if ("$in" in valObj && Array.isArray(valObj.$in)) {
      this.whereIn(key as keyof T, valObj.$in as NonNullable<T[keyof T]>[]);
    } else if ("$nin" in valObj && Array.isArray(valObj.$nin)) {
      this.whereNotIn(key as keyof T, valObj.$nin as NonNullable<T[keyof T]>[]);
    } else if (("$gte" in valObj || "$gt" in valObj) && ("$lte" in valObj || "$lt" in valObj)) {
      const min = (valObj.$gte ?? valObj.$gt) as T[keyof T];
      const max = (valObj.$lte ?? valObj.$lt) as T[keyof T];
      this.whereBetween(key as keyof T, min, max);
    } else if (
      "$gt" in valObj &&
      (typeof valObj.$gt === "string" || typeof valObj.$gt === "number")
    ) {
      this.pushComparator("gt", key, valObj.$gt);
    } else if (
      "$gte" in valObj &&
      (typeof valObj.$gte === "string" || typeof valObj.$gte === "number")
    ) {
      this.pushComparator("gte", key, valObj.$gte);
    } else if (
      "$lt" in valObj &&
      (typeof valObj.$lt === "string" || typeof valObj.$lt === "number")
    ) {
      this.pushComparator("lt", key, valObj.$lt);
    } else if (
      "$lte" in valObj &&
      (typeof valObj.$lte === "string" || typeof valObj.$lte === "number")
    ) {
      this.pushComparator("lte", key, valObj.$lte);
    } else {
      this.compilable = false;
    }
  }

  /** Records a physical range comparison on both the compiled and Drizzle paths. */
  private pushComparator(
    kind: "gt" | "gte" | "lt" | "lte",
    key: string,
    value: string | number,
  ): void {
    const col = this.table[key];
    if (col && typeof col.name === "string" && col.name.length > 0) {
      const bound = this.coerceFilterValue(col, value);
      if (kind === "gt") this.conditions.push(sql`${col} > ${bound}`);
      else if (kind === "gte") this.conditions.push(sql`${col} >= ${bound}`);
      else if (kind === "lt") this.conditions.push(sql`${col} < ${bound}`);
      else this.conditions.push(sql`${col} <= ${bound}`);
      this.predicates.push({ k: kind, name: col.name, value: bound as never });
    } else {
      this.compilable = false;
    }
  }

  async count(): Promise<DatabaseResult<number>> {
    const startTime = Date.now();
    try {
      const compiled = this.compile("count");
      if (compiled && this.core.executeCompiled) {
        const rows = await this.core.executeCompiled(compiled.sql, compiled.params);
        return {
          success: true,
          data: readCount(rows[0]),
          meta: { executionTime: Date.now() - startTime },
        };
      }
      let q = this.db.select({ count: count() }).from(this.table).$dynamic();
      if (this.conditions.length > 0) {
        q = q.where(and(...this.conditions));
      }
      const [result] = await q;
      return {
        success: true,
        data: Number((result as { count: number }).count),
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_COUNT_FAILED");
    }
  }

  async exists(): Promise<DatabaseResult<boolean>> {
    const startTime = Date.now();
    try {
      const prevLimit = this.limitValue;
      this.limitValue = 1;
      const compiled = this.compile("list");
      this.limitValue = prevLimit;
      if (compiled && this.core.executeCompiled) {
        const rows = await this.core.executeCompiled(compiled.sql, compiled.params);
        return {
          success: true,
          data: Array.isArray(rows) && rows.length > 0,
          meta: { executionTime: Date.now() - startTime },
        };
      }
      const idCol = this.table["_id"] || this.table["id"];
      if (!idCol) {
        const res = await this.count();
        if (res.success) return { ...res, data: res.data > 0 };
        return res as unknown as DatabaseResult<boolean>;
      }
      let q = this.db.select({ id: idCol }).from(this.table).$dynamic();
      if (this.conditions.length > 0) {
        q = q.where(and(...this.conditions));
      }
      const rows = await q.limit(1);
      return {
        success: true,
        data: Array.isArray(rows) ? rows.length > 0 : Boolean(rows),
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_EXISTS_FAILED");
    }
  }

  async execute(): Promise<DatabaseResult<T[]>> {
    const startTime = Date.now();
    try {
      this.prepareReadConversion();
      const compiled = this.compile("list");
      const results =
        compiled && this.core.executeCompiled
          ? await this.core.executeCompiled(compiled.sql, compiled.params)
          : await this.buildQuery();
      return {
        success: true,
        data: convertArrayDatesToISO(
          results as Record<string, unknown>[],
          this.dateConversionOptions,
        ) as unknown as T[],
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_EXECUTE_FAILED");
    }
  }

  async stream(): Promise<DatabaseResult<AsyncIterable<T>>> {
    if (!this.dialect.streamSupported) {
      return this.core.notImplemented("queryBuilder.stream");
    }
    const startTime = Date.now();
    try {
      this.prepareReadConversion();
      const q = this.buildQuery();
      const stream = await (q as any).stream();
      const convert = convertDatesToISO;
      const opts = this.dateConversionOptions;

      async function* generator() {
        for await (const row of stream) {
          yield convert(row, opts) as T;
        }
      }

      return {
        success: true,
        data: generator() as AsyncIterable<T>,
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_STREAM_FAILED");
    }
  }

  async findOne(): Promise<DatabaseResult<T | null>> {
    const startTime = Date.now();
    try {
      this.prepareReadConversion();
      const prevLimit = this.limitValue;
      this.limitValue = 1;
      const compiled = this.compile("list");
      this.limitValue = prevLimit;
      let result: unknown = null;
      if (compiled && this.core.executeCompiled) {
        const rows = await this.core.executeCompiled(compiled.sql, compiled.params);
        result = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      } else {
        const q = this.limitValue === 1 ? this.buildQuery() : this.buildQuery().limit(1);
        const [row] = await q;
        result = row ?? null;
      }
      return {
        success: true,
        data: result
          ? (convertDatesToISO(
              result as Record<string, unknown>,
              this.dateConversionOptions,
            ) as unknown as T)
          : null,
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_FIND_ONE_FAILED");
    }
  }

  async findOneOrFail(): Promise<DatabaseResult<T>> {
    const res = await this.findOne();
    if (res.success && !res.data) {
      return {
        success: false,
        message: "Document not found",
        error: createDatabaseError("NOT_FOUND", "Document not found"),
      };
    }
    return res as DatabaseResult<T>;
  }

  async updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = Date.now();
    try {
      const table = this.table;
      // 🐛 PREPARE-PARITY: dumping the payload straight into Drizzle `.set()`
      // silently DROPPED every field that is not a physical column (the
      // Zahl-Feld class: blob fields like `title`/`count` never persisted). Route
      // through the same `prepareValues` contract `crud.update` and
      // `batch.bulkUpdate` use, so dynamic fields land in the JSON `data` blob and
      // a partial patch MERGES instead of replacing it.
      const prepared = (
        this.core.prepareValues
          ? this.core.prepareValues(table, data, undefined, new Date(), {
              isUpdate: true,
              operation: "update",
            })
          : { ...data, updatedAt: new Date() }
      ) as Record<string, unknown>;
      const jsonPatch = getJsonDataPatch(prepared);

      if (jsonPatch && this.core.canMergeJsonInOneStatement?.(jsonPatch) === false) {
        // Nested-object / explicit-null patch on SQLite/MariaDB: the dialect
        // operator cannot express a shallow merge, so each matching row is merged
        // against its own stored blob through the full single-row write path.
        const idCol = table._id ?? table.id;
        const rows = (await this.db
          .select({ id: idCol })
          .from(table)
          .where(this.conditions.length > 0 ? and(...this.conditions) : sql`1 = 1`)) as Array<{
          id: string;
        }>;
        let modifiedCount = 0;
        for (const row of rows) {
          const res = await this.core.update?.(this.collection, row.id, data as any);
          if (res?.success) modifiedCount++;
        }
        return {
          success: true,
          data: { modifiedCount },
          meta: { executionTime: Date.now() - startTime },
        };
      }

      // Single statement: merge inside the UPDATE (no read) when a patch is live.
      if (jsonPatch) this.core.applyJsonMergeToSet?.(prepared, table, jsonPatch);
      const drizzleSet = convertISOToDates(
        { ...prepared, updatedAt: prepared.updatedAt ?? new Date() },
        this.dateConversionOptions,
      ) as unknown as Record<string, unknown>;

      let q = this.db.update(this.table).set(drizzleSet).$dynamic();
      if (this.conditions.length > 0) {
        q = q.where(and(...this.conditions));
      }
      const result = await (this.dialect.supportsReturning ? q.returning() : q);
      return {
        success: true,
        data: {
          modifiedCount: this.dialect.supportsReturning
            ? (result as unknown[]).length
            : this.dialect.extractAffectedRows(result),
        },
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_UPDATE_MANY_FAILED");
    }
  }

  async deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>> {
    const startTime = Date.now();
    try {
      let q = this.db.delete(this.table).$dynamic();
      if (this.conditions.length > 0) {
        q = q.where(and(...this.conditions));
      }
      const result = await (this.dialect.supportsReturning ? q.returning() : q);
      return {
        success: true,
        data: {
          deletedCount: this.dialect.supportsReturning
            ? (result as unknown[]).length
            : this.dialect.extractAffectedRows(result),
        },
        meta: { executionTime: Date.now() - startTime },
      };
    } catch (error) {
      return this.core.handleError(error, "QUERY_BUILDER_DELETE_MANY_FAILED");
    }
  }
}
