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
 * - deterministic `_id` tie-breaker on paginated reads
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
  DatabaseResult,
  PaginationOptions,
  QueryBuilder,
  QueryOptimizationHints,
} from "../db-interface";
import * as utils from "./relational-utils";

/**
 * Per-engine behavior surface for the shared SQL query builder.
 * All divergence between the SQLite, MariaDB and PostgreSQL builders is
 * expressed here — the class itself contains no engine-specific branches.
 */
export interface SqlDialect {
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

export const SQLITE_DIALECT: SqlDialect = {
  supportsReturning: false,
  streamSupported: false,
  likeOperator: "LIKE",
  mariaDoubleParseJson: false,
  coerceJsonValue: (value) => value,
  extractAffectedRows: (result) => (result as { changes: number }).changes,
};

export const MARIADB_DIALECT: SqlDialect = {
  supportsReturning: false,
  streamSupported: false,
  likeOperator: "LIKE",
  mariaDoubleParseJson: true,
  coerceJsonValue: (value) => (typeof value === "boolean" ? String(value) : value),
  extractAffectedRows: (result) => (result as [{ affectedRows: number }])[0].affectedRows,
};

export const POSTGRES_DIALECT: SqlDialect = {
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

  constructor(core: SqlQueryBuilderCore, collection: string, dialect: SqlDialect) {
    this.core = core;
    this.collection = collection;
    this.dialect = dialect;
  }

  private get table() {
    return this.core.getTable(this.collection) as unknown as Record<string, Column>;
  }

  private get db() {
    return this.core.db;
  }

  /** Options passed to date normalization on every read path. */
  private get dateConversionOptions(): { mariaDoubleParseJson?: boolean } | undefined {
    return this.dialect.mariaDoubleParseJson ? { mariaDoubleParseJson: true } : undefined;
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

    for (const [key, value] of Object.entries(conditions)) {
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
        } else {
          this.conditions.push(eq(column, value as string | number | boolean));
        }
      } else if (value === null) {
        // 🚀 HYBRID SCHEMA SUPPORT: dynamic fields live in the JSON `data` blob
        this.conditions.push(isNull(this.core.getJsonField(key)));
      } else {
        // 🚀 HYBRID SCHEMA SUPPORT: JSON extraction for dynamic fields
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

  whereIn<K extends keyof T>(field: K, values: NonNullable<T[K]>[]): this {
    const column = this.table[field as string];
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
    return this;
  }

  whereNotIn<K extends keyof T>(field: K, values: NonNullable<T[K]>[]): this {
    const column = this.table[field as string];
    if (column) {
      const condition = notInArray(column, values as (string | number | boolean)[]);
      if (condition) {
        this.conditions.push(condition);
      }
    }
    return this;
  }

  whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this {
    const column = this.table[field as string];
    if (column) {
      const condition = and(
        gte(column, min as string | number | boolean),
        lte(column, max as string | number | boolean),
      );
      if (condition) {
        this.conditions.push(condition);
      }
    }
    return this;
  }

  whereNull<K extends keyof T>(field: K): this {
    const column = this.table[field as string];
    if (column) {
      this.conditions.push(isNull(column));
    }
    return this;
  }

  whereNotNull<K extends keyof T>(field: K): this {
    const column = this.table[field as string];
    if (column) {
      this.conditions.push(sql`${column} IS NOT NULL`);
    }
    return this;
  }

  search(query: string, fields?: (keyof T)[]): this {
    const pattern = "%" + query + "%";
    const likeCondition = (column: Column | SQL): SQL =>
      sql`${column} ${sql.raw(this.dialect.likeOperator)} ${pattern}`;

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
        if (direction === "after") {
          this.conditions.push(sql`${idCol} > ${options.cursor}`);
          this.sortOptions.push({ field: "_id" as keyof T, direction: "asc" });
        } else {
          this.conditions.push(sql`${idCol} < ${options.cursor}`);
          this.sortOptions.push({ field: "_id" as keyof T, direction: "desc" });
        }
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

    if (this.sortOptions.length > 0) {
      const orderBys = this.sortOptions.map((s) => {
        const order = s.direction === "desc" ? desc : asc;
        const fieldName = s.field as string;
        // Resolve MongoDB-convention fields (e.g. _createdAt → createdAt)
        const column = this.table[fieldName] ?? this.table[fieldName.replace(/^_/, "")];
        if (!column) {
          // 🚀 HYBRID SCHEMA SUPPORT: JSON sorting for dynamic fields
          return order(this.core.getJsonField(fieldName));
        }
        return order(column);
      });
      q = q.orderBy(...orderBys);
    }

    // 🚀 STABILITY TIE-BREAKER: Ensure deterministic ordering for paginated queries
    if (this.limitValue !== undefined || this.skipValue !== undefined) {
      const idCol = this.table["_id"];
      if (idCol) {
        q = q.orderBy(asc(idCol));
      }
    }

    if (this.limitValue !== undefined) {
      q = q.limit(this.limitValue);
    }
    if (this.skipValue !== undefined) {
      q = q.offset(this.skipValue);
    }

    return q;
  }

  async count(): Promise<DatabaseResult<number>> {
    const startTime = Date.now();
    try {
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
    const res = await this.count();
    if (res.success) {
      return { ...res, data: res.data > 0 };
    }
    return res as unknown as DatabaseResult<boolean>;
  }

  async execute(): Promise<DatabaseResult<T[]>> {
    const startTime = Date.now();
    try {
      const q = this.buildQuery();
      const results = await q;
      return {
        success: true,
        data: utils.convertArrayDatesToISO(
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
      const q = this.buildQuery();
      const stream = await (q as any).stream();
      const convert = utils.convertDatesToISO;

      async function* generator() {
        for await (const row of stream) {
          yield convert(row) as T;
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
      const q = this.buildQuery().limit(1);
      const [result] = await q;
      return {
        success: true,
        data: result
          ? (utils.convertDatesToISO(
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
        error: utils.createDatabaseError("NOT_FOUND", "Document not found"),
      };
    }
    return res as DatabaseResult<T>;
  }

  async updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = Date.now();
    try {
      let q = this.db
        .update(this.table)
        .set(
          utils.convertISOToDates({
            ...data,
            updatedAt: new Date(),
          }) as unknown as Record<string, unknown>,
        )
        .$dynamic();
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
