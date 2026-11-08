/**
 * @file src/databases/core/sql-crud-read.ts
 * @description SQL CRUD read pipeline implementations (findOne, findMany, streamMany, findById, exists, count).
 *
 * Features:
 * - Ultra-fast point lookup paths for {_id} and {_id, tenantId}
 * - Pre-compiled query template execution
 * - Dynamic SQL generation with column list caching
 * - Soft-delete filtering clamping
 * - Direct cursor streaming with configurable batch sizes
 */

import {
  type BaseEntity,
  type BaseQueryOptions,
  type CountOptions,
  type DatabaseId,
  type DatabaseResult,
  type FindOptions,
  type QueryFilter,
} from "../db-interface";
import { isSystemTable, RAW_DECLINED } from "./drizzle-sql-helpers";
import {
  applyTenantFilter,
  assertSafeSqlIdentifier,
  convertArrayDatesToISO,
  convertDatesToISO,
} from "./relational-utils";
import { applyLookupStatus, parseIdLookup } from "./query-primitives";
import { isSoftDeletedRow } from "../sql/read-predicates";
import { shouldUseEstimateCount } from "./page-utils";
import {
  SqlQueryBuilder,
  type SqlDialect,
  type SqlQueryBuilderCore,
  readCount,
} from "./sql-query-builder";
import {
  count as drizzleCount,
  eq,
  gt,
  and,
  sql,
  getTableName,
  type SQL,
  type Table,
  type Column,
} from "drizzle-orm";

/**
 * Structural view of the Drizzle select chain the read pipeline drives.
 * `getDrizzleInstance` is opaque on the adapter contract, so the chain is
 * described once here and asserted at that single boundary.
 */
export type DrizzleQueryChain = PromiseLike<unknown[]> & {
  limit(count: number): DrizzleQueryChain;
  offset(count: number): DrizzleQueryChain;
};

/** Read-side handle returned by `getDrizzleInstance`. */
export type DrizzleReadHandle = {
  select(selection: unknown): {
    from(table: unknown): {
      where(condition: unknown): DrizzleQueryChain;
    };
  };
};

export interface SqlCrudReadContext {
  hooks: unknown[];
  sqlDialect: SqlDialect;
  useRawFindById?: boolean;
  useDynamicSqlInFindMany?: boolean;
  convertDatesOptions: Record<string, unknown>;
  registeredSchemas: Set<string>;
  dynamicColListCache: WeakMap<
    object,
    {
      withData?: { colList: string; columns: string[] };
      withoutData?: { colList: string; columns: string[] };
    }
  >;
  escapedTableNameCache: WeakMap<object, string>;
  executeCompiled?: (sql: string, params: unknown[], options?: unknown) => Promise<unknown[]>;
  rawFindById<T>(
    table: Table | unknown,
    collection: string,
    id: DatabaseId,
    options: unknown,
  ): Promise<T | null | typeof RAW_DECLINED>;
  getTable(collection: string): Table;
  getColumn(table: unknown, name: string, forcePhysical?: boolean): Column | undefined;
  getPhysicalSelection(table: unknown): Record<string, Column>;
  getProjectedSelection(table: unknown, options: unknown): Record<string, Column> | undefined;
  mapQuery(table: unknown, query: unknown, options?: unknown): SQL | undefined;
  buildDynamicOrderBy(
    collection: string,
    table: unknown,
    tableName: string,
    options: unknown,
  ): SQL[];
  applyOrderBy(builder: unknown, table: unknown, options: unknown): unknown;
  getDrizzleInstance(options?: unknown): DrizzleReadHandle;
  executeDynamicSql(db: unknown, query: SQL, options?: unknown): Promise<unknown[]>;
  ensureTableSchemaRegistered(table: unknown, name: string): void;
  clampSoftDeleted<T extends BaseEntity>(
    table: unknown,
    query: QueryFilter<T>,
    options?: unknown,
  ): QueryFilter<T>;
  shouldExcludeData(table: unknown, options: unknown): boolean;
  isMissingTableError(err: unknown): boolean;
  estimateTableRows(table: unknown, collection: string): Promise<number | null>;
  quoteIdentifier(name: string): string;
  runHooks(
    timing: "before" | "after",
    operation: string,
    collection: string,
    data: unknown,
    options?: unknown,
  ): Promise<unknown>;
  wrap<T>(
    op: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    opts?: { skipMeta?: boolean; bypassSafeQuery?: boolean },
  ): Promise<DatabaseResult<T>>;
  findById<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    options?: FindOptions<T>,
  ): Promise<DatabaseResult<T | null>>;
}

/**
 * Executes a findById point-read operation on the SQL database adapter.
 */
export async function executeSqlFindById<T extends BaseEntity>(
  ctx: SqlCrudReadContext,
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
  return ctx.wrap(
    async () => {
      const table = ctx.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);

      const clampDeleted = !options.includeDeleted && !options.bypassSafeQuery;

      if (ctx.useRawFindById) {
        const rawResult = await ctx.rawFindById<T>(table, collection, id, options);
        if (rawResult !== RAW_DECLINED) {
          if (rawResult !== null && clampDeleted && isSoftDeletedRow(rawResult)) return null;
          return rawResult as T | null;
        }
      }

      const idCol = ctx.getColumn(table, "_id") || ctx.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      const conditions: SQL[] = [eq(idCol as Column, id as string)];
      const tenantCol = ctx.getColumn(table, "tenantId");
      applyTenantFilter(conditions, tenantCol, options);
      const isDeletedCol = clampDeleted ? ctx.getColumn(table, "isDeleted") : null;
      if (isDeletedCol) conditions.push(eq(isDeletedCol as Column, false));

      const results = await ctx
        .getDrizzleInstance(options)
        .select(ctx.getProjectedSelection(table, options))
        .from(table)
        .where(and(...conditions))
        .limit(1);

      if (results.length === 0) return null;
      const excludeData = ctx.shouldExcludeData(table, options);
      return excludeData
        ? (convertDatesToISO(results[0], {
            ...ctx.convertDatesOptions,
            table: collection,
            inPlace: true,
            skipJson: true,
          }) as T)
        : (convertDatesToISO(results[0], {
            ...ctx.convertDatesOptions,
            table: collection,
            inPlace: true,
          }) as T);
    },
    "FIND_BY_ID_FAILED",
    undefined,
    { skipMeta: options.skipMeta === true },
  );
}

/**
 * Executes a findOne query operation on the SQL database adapter.
 */
export async function executeSqlFindOne<T extends BaseEntity>(
  ctx: SqlCrudReadContext,
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
  if (!options.includeDeleted && !options.bypassSafeQuery && ctx.hooks.length === 0) {
    const lookup = parseIdLookup(query);
    if (lookup) {
      const fastOpts =
        lookup.tenantId !== undefined && !options.tenantId
          ? { ...options, tenantId: String(lookup.tenantId) }
          : options;
      const byId = await ctx.findById<T>(
        collection,
        lookup.id as DatabaseId,
        fastOpts as FindOptions<T>,
      );
      if (!byId.success || !lookup.status) return byId;
      const matched = applyLookupStatus(byId.data, lookup);
      return matched === byId.data ? byId : { ...byId, data: matched };
    }
  }

  return ctx.wrap<T | null>(async () => {
    const q =
      ctx.hooks.length > 0
        ? await ctx.runHooks("before", "find", collection, query, options)
        : query;

    // After hooks, re-check for id lookup
    if (!options.includeDeleted) {
      const lookup = parseIdLookup(q);
      if (lookup) {
        const fastOpts =
          lookup.tenantId !== undefined && !options.tenantId
            ? { ...options, tenantId: String(lookup.tenantId) }
            : options;
        const byId = await ctx.findById<T>(
          collection,
          lookup.id as DatabaseId,
          fastOpts as FindOptions<T>,
        );
        if (!byId.success) throw new Error(byId.message || "findById failed");
        const data = applyLookupStatus(byId.data, lookup);
        return ctx.hooks.length > 0
          ? ((await ctx.runHooks("after", "find", collection, data, options)) as T | null)
          : data;
      }
    }

    const table = ctx.getTable(collection);
    if (!table) throw new Error(`Collection table not found: ${collection}`);
    if (!ctx.registeredSchemas.has(collection)) {
      ctx.ensureTableSchemaRegistered(table, collection);
      ctx.registeredSchemas.add(collection);
    }

    const effectiveQuery = ctx.clampSoftDeleted<T>(table, q as QueryFilter<T>, options);

    // 🚀 PRE-COMPILED TEMPLATE PATH
    if (ctx.executeCompiled && !options.transaction) {
      try {
        const builder = new SqlQueryBuilder<T>(
          ctx as unknown as SqlQueryBuilderCore,
          collection,
          ctx.sqlDialect,
        );
        builder.applyFilterAndOptions(effectiveQuery, { ...options, limit: 1 }, false);
        const compiled = builder.compile("list");
        if (compiled) {
          const rawRows = await ctx.executeCompiled(compiled.sql, compiled.params, options);
          const firstRow =
            rawRows && rawRows.length > 0 ? (rawRows[0] as Record<string, unknown>) : null;
          const excludeData = ctx.shouldExcludeData(table, options);
          const data = firstRow
            ? (convertDatesToISO(firstRow, {
                inPlace: true,
                table: collection,
                ...(excludeData ? { skipJson: true } : {}),
              }) as T)
            : null;
          return ctx.hooks.length > 0
            ? ((await ctx.runHooks("after", "find", collection, data, options)) as T | null)
            : data;
        }
      } catch (err: unknown) {
        if (ctx.isMissingTableError(err)) return null;
      }
    }

    const where = ctx.mapQuery(table, effectiveQuery, options);

    const isDynamic =
      ctx.useDynamicSqlInFindMany &&
      (collection.toLowerCase().includes("benchmark") ||
        collection.startsWith("collection_") ||
        !isSystemTable(collection));

    let results;
    let selectedColumns: string[] | null = null;
    if (isDynamic) {
      const hasCustomFields = Array.isArray(options.fields) && options.fields.length > 0;
      let columns: string[];
      let colList: string;
      if (!hasCustomFields) {
        let cachedEntry = ctx.dynamicColListCache.get(table);
        if (!cachedEntry) {
          cachedEntry = {};
          ctx.dynamicColListCache.set(table, cachedEntry);
        }
        let cached = cachedEntry["withData"];
        if (!cached) {
          const selection = ctx.getProjectedSelection(table, options);
          columns = Object.keys(selection as Record<string, Column>);
          colList = columns
            .map((c) => ctx.quoteIdentifier(assertSafeSqlIdentifier(c, "column")))
            .join(", ");
          cached = { colList, columns };
          cachedEntry["withData"] = cached;
        }
        columns = cached.columns;
        colList = cached.colList;
      } else {
        const selection = ctx.getProjectedSelection(table, options);
        columns = Object.keys(selection as Record<string, Column>);
        colList = columns
          .map((c) => ctx.quoteIdentifier(assertSafeSqlIdentifier(c, "column")))
          .join(", ");
      }
      selectedColumns = columns;

      let escapedTable = ctx.escapedTableNameCache.get(table);
      if (!escapedTable) {
        escapedTable = ctx.quoteIdentifier(assertSafeSqlIdentifier(getTableName(table), "table"));
        ctx.escapedTableNameCache.set(table, escapedTable);
      }

      let sqlQuery = sql`SELECT ${sql.raw(colList)} FROM ${sql.raw(
        escapedTable,
      )} WHERE ${where || sql`1=1`}`;

      const sortConditions = ctx.buildDynamicOrderBy(
        collection,
        table,
        getTableName(table),
        options,
      );
      if (sortConditions.length > 0) {
        sqlQuery = sql`${sqlQuery} ORDER BY ${sql.join(sortConditions, sql`, `)}`;
      }
      sqlQuery = sql`${sqlQuery} LIMIT 1`;

      const db = ctx.getDrizzleInstance(options);
      results = await ctx.executeDynamicSql(db, sqlQuery, options);
    } else {
      const db = ctx.getDrizzleInstance(options);
      let queryBuilder = db
        .select(ctx.getProjectedSelection(table, options))
        .from(table)
        .where(where);
      queryBuilder = ctx.applyOrderBy(queryBuilder, table, options) as typeof queryBuilder;
      results = await queryBuilder.limit(1);
    }

    let firstRow = results.length ? results[0] : null;
    if (firstRow && Array.isArray(firstRow)) {
      const cols = selectedColumns ?? Object.keys(ctx.getProjectedSelection(table, options) ?? {});
      const obj: Record<string, unknown> = {};
      for (let c = 0; c < cols.length; c++) {
        const val = firstRow[c];
        if (val !== undefined) obj[cols[c]] = val;
      }
      firstRow = obj;
    }

    const data = firstRow
      ? (convertDatesToISO(firstRow, {
          inPlace: true,
          table: collection,
        }) as T)
      : null;
    return ctx.hooks.length > 0
      ? ((await ctx.runHooks("after", "find", collection, data, options)) as T | null)
      : data;
  }, "FIND_ONE_FAILED");
}

/**
 * Executes a findMany query operation on the SQL database adapter.
 */
export async function executeSqlFindMany<T extends BaseEntity>(
  ctx: SqlCrudReadContext,
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
  return ctx.wrap<T[]>(async () => {
    const q =
      ctx.hooks.length > 0
        ? await ctx.runHooks("before", "find", collection, query, options)
        : query;

    // 🚀 ULTRA PATH: {_id} (+ tenantId / scalar status) → findById
    if (!options.includeDeleted && !options.bypassSafeQuery && !options.sort && !options.offset) {
      const lookup = parseIdLookup(q);
      if (lookup) {
        const fastOpts =
          lookup.tenantId !== undefined && !options.tenantId
            ? { ...options, tenantId: String(lookup.tenantId) }
            : options;
        const one = await ctx.findById<T>(
          collection,
          lookup.id as DatabaseId,
          fastOpts as FindOptions<T>,
        );
        if (!one.success) throw new Error(one.message || "findById failed");
        const row = applyLookupStatus(one.data, lookup);
        const data = row ? ([row] as T[]) : ([] as T[]);
        return ctx.hooks.length > 0
          ? ((await ctx.runHooks("after", "find", collection, data, options)) as T[])
          : data;
      }
    }

    const table = ctx.getTable(collection);
    if (!table) throw new Error(`Collection table not found: ${collection}`);
    if (!ctx.registeredSchemas.has(collection)) {
      ctx.ensureTableSchemaRegistered(table, collection);
      ctx.registeredSchemas.add(collection);
    }

    const effectiveQuery = ctx.clampSoftDeleted<T>(table, q as QueryFilter<T>, options);

    // 🚀 PRE-COMPILED TEMPLATE PATH
    if (ctx.executeCompiled && !options.transaction) {
      try {
        const builder = new SqlQueryBuilder<T>(
          ctx as unknown as SqlQueryBuilderCore,
          collection,
          ctx.sqlDialect,
        );
        builder.applyFilterAndOptions(effectiveQuery, options, false);
        const compiled = builder.compile("list");
        if (compiled) {
          const rawRows = await ctx.executeCompiled(compiled.sql, compiled.params, options);
          const excludeData = ctx.shouldExcludeData(table, options);
          const data = convertArrayDatesToISO(rawRows as Record<string, unknown>[], {
            inPlace: true,
            table: collection,
            ...(excludeData ? { skipJson: true } : {}),
          });
          return ctx.hooks.length > 0
            ? ((await ctx.runHooks("after", "find", collection, data, options)) as T[])
            : (data as T[]);
        }
      } catch (err: unknown) {
        if (ctx.isMissingTableError(err)) return [];
      }
    }

    const where = ctx.mapQuery(table, effectiveQuery, options);

    const tableName = getTableName(table);
    const isDynamic =
      ctx.useDynamicSqlInFindMany &&
      (collection.toLowerCase().includes("benchmark") ||
        collection.startsWith("collection_") ||
        !isSystemTable(collection));

    let results;
    const excludeData = ctx.shouldExcludeData(table, options);
    try {
      if (isDynamic) {
        const hasCustomFields = Array.isArray(options.fields) && options.fields.length > 0;
        let columns: string[];
        let colList: string;

        if (!hasCustomFields) {
          let cachedEntry = ctx.dynamicColListCache.get(table);
          if (!cachedEntry) {
            cachedEntry = {};
            ctx.dynamicColListCache.set(table, cachedEntry);
          }
          const cacheKey = excludeData ? "withoutData" : "withData";
          let cached = cachedEntry[cacheKey];
          if (!cached) {
            const selection = ctx.getProjectedSelection(table, options);
            columns = Object.keys(selection as Record<string, Column>);
            colList = columns
              .map((c) => ctx.quoteIdentifier(assertSafeSqlIdentifier(c, "column")))
              .join(", ");
            cached = { colList, columns };
            cachedEntry[cacheKey] = cached;
          }
          columns = cached.columns;
          colList = cached.colList;
        } else {
          const selection = ctx.getProjectedSelection(table, options);
          columns = Object.keys(selection as Record<string, Column>);
          colList = columns
            .map((c) => ctx.quoteIdentifier(assertSafeSqlIdentifier(c, "column")))
            .join(", ");
        }

        let escapedTable = ctx.escapedTableNameCache.get(table);
        if (!escapedTable) {
          escapedTable = ctx.quoteIdentifier(assertSafeSqlIdentifier(tableName, "table"));
          ctx.escapedTableNameCache.set(table, escapedTable);
        }

        let sqlQuery = sql`SELECT ${sql.raw(colList)} FROM ${sql.raw(
          escapedTable,
        )} WHERE ${where || sql`1=1`}`;

        if (options.sort) {
          const sortConditions = ctx.buildDynamicOrderBy(collection, table, tableName, options);
          if (sortConditions.length > 0) {
            sqlQuery = sql`${sqlQuery} ORDER BY ${sql.join(sortConditions, sql`, `)}`;
          }
        }

        if (options.limit !== undefined) sqlQuery = sql`${sqlQuery} LIMIT ${options.limit}`;
        if (options.offset !== undefined) sqlQuery = sql`${sqlQuery} OFFSET ${options.offset}`;

        const db = ctx.getDrizzleInstance(options);
        const rawRows = await ctx.executeDynamicSql(db, sqlQuery, options);

        const numRows = rawRows.length;
        if (numRows > 0 && Array.isArray(rawRows[0])) {
          const numCols = columns.length;
          results = [];
          for (let r = 0; r < numRows; r++) {
            const row = rawRows[r] as unknown[];
            const obj: Record<string, unknown> = {};
            for (let c = 0; c < numCols; c++) {
              const val = row[c];
              if (val !== undefined) obj[columns[c]] = val;
            }
            results.push(obj);
          }
        } else {
          results = rawRows;
        }
      } else {
        const db = ctx.getDrizzleInstance(options);
        let queryBuilder = db
          .select(ctx.getProjectedSelection(table, options))
          .from(table)
          .where(where);
        queryBuilder = ctx.applyOrderBy(queryBuilder, table, options) as typeof queryBuilder;
        if (options.limit) queryBuilder = queryBuilder.limit(options.limit) as typeof queryBuilder;
        if (options.offset)
          queryBuilder = queryBuilder.offset(options.offset) as typeof queryBuilder;
        results = await queryBuilder;
      }
    } catch (err: unknown) {
      if (ctx.isMissingTableError(err)) {
        return [];
      }
      throw err;
    }

    const data = excludeData
      ? convertArrayDatesToISO(results as Record<string, unknown>[], {
          inPlace: true,
          table: collection,
          skipJson: true,
        })
      : convertArrayDatesToISO(results as Record<string, unknown>[], {
          inPlace: true,
          table: collection,
        });
    return ctx.hooks.length > 0
      ? ((await ctx.runHooks("after", "find", collection, data, options)) as T[])
      : (data as T[]);
  }, "FIND_MANY_FAILED");
}

/**
 * Keyset streaming is only equivalent to offset streaming when the caller starts
 * at the first row and either imposes no order or orders solely by `_id` asc.
 * Any other sort could reorder rows across pages and silently skip/duplicate them.
 */
function isIdAscendingStreamSort(sort: FindOptions<BaseEntity>["sort"]): boolean {
  if (sort === undefined) return true;
  if (Array.isArray(sort)) {
    return sort.length === 1 && sort[0]?.[0] === "_id" && sort[0]?.[1] === "asc";
  }
  const fields = Object.keys(sort);
  return fields.length === 1 && fields[0] === "_id" && sort._id === "asc";
}

/**
 * Executes a streamMany async iterator query on the SQL database adapter.
 */
export async function executeSqlStreamMany<T extends BaseEntity>(
  ctx: SqlCrudReadContext,
  collection: string,
  query: QueryFilter<T>,
  options: FindOptions<T> = {},
): Promise<DatabaseResult<AsyncIterable<T>>> {
  return ctx.wrap(async () => {
    const q =
      ctx.hooks.length > 0
        ? await ctx.runHooks("before", "find", collection, query, options)
        : query;
    const table = ctx.getTable(collection);
    if (!table) throw new Error(`Collection table not found: ${collection}`);
    const where = ctx.mapQuery(
      table,
      ctx.clampSoftDeleted(table, q as QueryFilter<T>, options),
      options,
    );
    const db = ctx.getDrizzleInstance(options);
    const selection = ctx.getPhysicalSelection(table);
    const convertOpts = { ...ctx.convertDatesOptions, table: collection };
    const applyOrderBy = ctx.applyOrderBy.bind(ctx);
    const pageSize = 500;
    const startOffset = options.offset ?? 0;
    const maxRows = options.limit ?? Number.MAX_SAFE_INTEGER;

    // `_id` keyset pagination needs a physical id column and a total order that
    // starts at the first row; anything else keeps the legacy offset loop.
    const idCol =
      startOffset === 0 && isIdAscendingStreamSort(options.sort)
        ? ctx.getColumn(table, "_id")
        : undefined;
    const keysetOptions: FindOptions<T> = { ...options, sort: { _id: "asc" } };

    async function* generator() {
      if (idCol) {
        let lastId: DatabaseId | undefined;
        let yielded = 0;
        while (yielded < maxRows) {
          const take = Math.min(pageSize, maxRows - yielded);
          const pageWhere = lastId === undefined ? where : and(where, gt(idCol, lastId));
          let pageQuery = db.select(selection).from(table).where(pageWhere);
          pageQuery = applyOrderBy(pageQuery, table, keysetOptions) as typeof pageQuery;
          pageQuery = pageQuery.limit(take);
          const results = await pageQuery;
          if (!results || results.length === 0) break;
          const data = convertDatesToISO(results, convertOpts) as T[];
          for (let i = 0; i < data.length; i++) {
            yield data[i];
          }
          yielded += data.length;
          const nextId = data[data.length - 1]?._id;
          if (nextId === undefined || nextId === null) break;
          lastId = nextId;
          if (data.length < take) break;
        }
        return;
      }

      let offset = startOffset;
      let yielded = 0;
      while (yielded < maxRows) {
        const take = Math.min(pageSize, maxRows - yielded);
        let pageQuery = db.select(selection).from(table).where(where);
        pageQuery = applyOrderBy(pageQuery, table, options) as typeof pageQuery;
        pageQuery = pageQuery.limit(take).offset(offset);
        const results = await pageQuery;
        if (!results || results.length === 0) break;
        const data = convertDatesToISO(results, convertOpts) as T[];
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

/**
 * Executes an exists query on the SQL database adapter.
 */
export async function executeSqlExists<T extends BaseEntity>(
  ctx: SqlCrudReadContext,
  collection: string,
  query: QueryFilter<T>,
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<boolean>> {
  return ctx.wrap(async () => {
    const table = ctx.getTable(collection);
    if (!table) return false;
    const idCol = ctx.getColumn(table, "_id") || ctx.getColumn(table, "id");
    if (!idCol) throw new Error("ID column not found");
    const where = ctx.mapQuery(table, ctx.clampSoftDeleted(table, query, options), options);
    const db = ctx.getDrizzleInstance(options);
    const results = await db.select({ id: idCol }).from(table).where(where).limit(1);
    return results.length > 0;
  }, "EXISTS_FAILED");
}

/**
 * Executes a count query on the SQL database adapter.
 */
export async function executeSqlCount<T extends BaseEntity>(
  ctx: SqlCrudReadContext,
  collection: string,
  query: QueryFilter<T> = {},
  options: CountOptions = {},
): Promise<DatabaseResult<number>> {
  return ctx.wrap(
    async () => {
      const table = ctx.getTable(collection);
      if (!table) return 0;

      if (
        shouldUseEstimateCount(query, {
          mode: options.mode,
          tenantId: options.tenantId,
          includeDeleted: options.includeDeleted,
        })
      ) {
        const estimated = await ctx.estimateTableRows(table, collection);
        if (estimated !== null && estimated >= 0) return estimated;
      }

      const effectiveQuery = ctx.clampSoftDeleted(table, query || ({} as QueryFilter<T>), options);

      if (ctx.executeCompiled && !options.transaction) {
        try {
          const builder = new SqlQueryBuilder<T>(
            ctx as unknown as SqlQueryBuilderCore,
            collection,
            ctx.sqlDialect,
          );
          builder.applyFilterAndOptions(effectiveQuery, options, false);
          const compiled = builder.compile("count");
          if (compiled) {
            const rows = await ctx.executeCompiled(compiled.sql, compiled.params, options);
            return readCount(rows[0]);
          }
        } catch (err: unknown) {
          if (ctx.isMissingTableError(err)) return 0;
        }
      }

      const where = ctx.mapQuery(table, effectiveQuery, options);
      try {
        const db = ctx.getDrizzleInstance(options) as unknown as {
          select: (sel: unknown) => {
            from: (tbl: unknown) => {
              where: (wh: unknown) => Promise<Array<{ count: number }>>;
            };
          };
        };
        const result = await db.select({ count: drizzleCount() }).from(table).where(where);
        return result[0].count;
      } catch (err: unknown) {
        if (ctx.isMissingTableError(err)) {
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
