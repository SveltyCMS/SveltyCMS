/**
 * @file src/databases/core/sql-aggregate.ts
 * @description
 * SQL aggregation runner translating MongoDB-style aggregation pipelines into Drizzle SQL.
 * Maps match, group, project, sort, limit, and offset stages to optimized SQL queries.
 *
 * ### Features:
 * - Direct translation of aggregation pipelines via aggregation-translator
 * - Soft-delete clamping and tenant filter propagation
 * - Date and timestamp normalization back to ISO format
 * - Fail-closed handling for unsupported pipeline operations
 */

import type { BaseEntity, BaseQueryOptions, DatabaseResult, QueryFilter } from "../db-interface";
import { convertArrayDatesToISO } from "./relational-utils";
import { and, type SQL } from "drizzle-orm";
import { translateAggregation } from "./aggregation-translator";

/**
 * Structural contract required by the SQL aggregation pipeline from its host adapter.
 */
export interface SqlAggregateContext {
  readonly type: string;
  readonly convertDatesOptions: Record<string, any>;
  getTable(collection: string): any;
  getColumn(table: any, name: string): any;
  getJsonField(field: string): SQL;
  getJsonNumericField(field: string): SQL;
  getJsonOrderedField(field: string): SQL | null;
  mapQuery(table: any, query: any, options?: any): any;
  clampSoftDeleted<T extends BaseEntity>(
    table: any,
    query: QueryFilter<T>,
    options: BaseQueryOptions,
  ): QueryFilter<T>;
  getPhysicalSelection(table: any): any;
  getDrizzleInstance(options?: BaseQueryOptions): any;
  wrap<T>(
    operation: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
}

/**
 * Run an aggregation pipeline on a SQL engine.
 *
 * The pipeline is translated by `aggregation-translator.ts` into one statement:
 * `$match` → `WHERE` (through `mapQuery`, so JSON fields, `getJsonEquals`
 * containment and the tenant scope behave exactly like `find*`),
 * `$group` → `GROUP BY` with `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, `$sort` →
 * `ORDER BY`, `$skip`/`$limit` → `OFFSET`/`LIMIT`, `$count`/`$project` → the
 * select list.
 */
export async function executeSqlAggregate<R>(
  ctx: SqlAggregateContext,
  collection: string,
  pipeline: unknown[],
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<R[]>> {
  const table = ctx.getTable(collection);
  const plan = table
    ? translateAggregation(pipeline, {
        engine: ctx.type,
        field: (name) => (ctx.getColumn(table, name) as SQL | undefined) ?? ctx.getJsonField(name),
        numericField: (name) =>
          (ctx.getColumn(table, name) as SQL | undefined) ?? ctx.getJsonNumericField(name),
        match: (filter) => ctx.mapQuery(table, filter, options),
        orderedField: (name) =>
          (ctx.getColumn(table, name) as SQL | undefined) ?? ctx.getJsonOrderedField(name),
      })
    : null;

  // Fail-closed refusals are RESULTS, and they must be returned OUTSIDE `wrap()`:
  // `wrap` treats every returned value as success data, so an envelope returned
  // inside its callback reaches the caller as `{ success: true, data: { success:
  // false, … } }` — a refusal that reads as a success.
  if (plan && !plan.ok) {
    return {
      success: false,
      message: plan.message,
      error: { code: "NOT_SUPPORTED", message: plan.message },
    };
  }

  return ctx.wrap(
    async () => {
      if (!table || !plan) throw new Error(`Collection table not found: ${collection}`);

      const conditions: SQL[] = [];
      // Tenant scope, exactly like `find*`: `mapQuery` applies `applyTenantFilter`
      // for an empty filter, so an aggregation can never span tenants. The
      // soft-delete clamp applies here too — a `$count`/`$sum` dashboard must
      // not include deleted rows (parity with `findMany`/`count`).
      const baseCondition = ctx.mapQuery(
        table,
        ctx.clampSoftDeleted(table, {} as QueryFilter<BaseEntity>, options) as any,
        options,
      ) as SQL | undefined;
      if (baseCondition) conditions.push(baseCondition);
      if (plan.where) conditions.push(plan.where);
      const where = conditions.length === 0 ? undefined : and(...conditions);

      let query = ctx
        .getDrizzleInstance(options)
        .select((plan.select ?? ctx.getPhysicalSelection(table)) as Record<string, SQL>)
        .from(table)
        .where(where);
      if (plan.groupBy?.length) query = query.groupBy(...plan.groupBy);
      if (plan.orderBy?.length) query = query.orderBy(...plan.orderBy);
      if (plan.limit !== undefined) query = query.limit(plan.limit);
      if (plan.offset !== undefined) query = query.offset(plan.offset);

      const rows = (await query) as Record<string, unknown>[];
      return convertArrayDatesToISO(rows, {
        ...ctx.convertDatesOptions,
        table: collection,
      }) as R[];
    },
    "AGGREGATE_FAILED",
    undefined,
    { ...options, isWrite: false },
  );
}
