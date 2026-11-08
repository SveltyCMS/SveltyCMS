/**
 * @file src/databases/postgresql/update-templates.ts
 * @description Prepared SQL UPDATE and VALUES-join batch UPDATE template generation and execution.
 *
 * Features:
 * - Bucketed VALUES-join UPDATE templates for multi-row operations
 * - Column cast generation (jsonb, timestamptz, numeric, boolean)
 * - Single-row UPDATE...RETURNING prepared statement caching
 * - LRU bounded template cache caps (max 256 entries)
 * - Tenant isolation clause binding
 */

import { getTableName, getTableColumns, type Table } from "drizzle-orm";
import { logger } from "@utils/logger";
import {
  assertSafeSqlIdentifier,
  buildRawTenantClause,
  convertDatesToISO,
  getEffectiveTenantId,
} from "../core/relational-utils";
import { getJsonDataPatch } from "../core/query-primitives";
import { RAW_DECLINED, type RawFindResult } from "../core/drizzle-sql-helpers";
import { PROFILE_WRITE_ENABLED, profileMark } from "@utils/write-profiler";
import type { BaseEntity, BaseQueryOptions, DatabaseId } from "../db-interface";

export const UPDATE_BATCH_SIZE_BUCKETS = [2, 4, 8, 16];
export const MAX_UPDATE_BATCH_SIZE =
  UPDATE_BATCH_SIZE_BUCKETS[UPDATE_BATCH_SIZE_BUCKETS.length - 1];
const IMPOSSIBLE_ID = "__svelty_sentinel_never_matches__";

export interface PostgresUpdateContext {
  sql?: unknown;
  getColumn(
    table: unknown,
    name: string,
  ): { name?: string; dataType?: string; columnType?: string } | undefined;
  getTxnSql(options: BaseQueryOptions): unknown;
  convertDatesOptions: Record<string, unknown>;
  updateValuesTemplateCache: Map<string, Array<{ size: number; sqlText: string }>>;
  updateTemplateCache: Map<
    string,
    {
      columns: string[];
      isJsonMap: boolean[];
      sqlWithReturning: string;
      sqlSkipReturning: string;
    }
  >;
}

export function bindPgParam(v: unknown, asJson: boolean): unknown {
  if (v === undefined) return null;
  if (asJson) return v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export function pgUpdateCastExpr(
  getColumn: (
    table: unknown,
    col: string,
  ) => { name?: string; dataType?: string; columnType?: string } | undefined,
  table: unknown,
  col: string,
  i: number,
): string {
  const phys = getColumn(table, col);
  const isJson = col === "data" || String(phys?.columnType).includes("Json");
  if (isJson) return `u.c${i}::jsonb`;
  if (phys?.dataType === "date" || String(phys?.columnType).includes("Timestamp")) {
    return `u.c${i}::timestamptz`;
  }
  if (phys?.dataType === "boolean") return `u.c${i}::boolean`;
  if (phys?.dataType === "number" || String(phys?.columnType).includes("Int")) {
    return `u.c${i}::numeric`;
  }
  return `u.c${i}`;
}

export function resolveUpdateProjection(
  table: unknown,
  fields: string[],
  getColumn: (t: unknown, name: string) => { name?: string } | undefined,
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    const phys = getColumn(table, f);
    if (!phys) continue;
    const name = phys.name ?? f;
    if (seen.has(name)) continue;
    seen.add(name);
    resolved.push(name);
  }
  return resolved;
}

export function getUpdateValuesTemplates(
  ctx: PostgresUpdateContext,
  table: unknown,
  tableName: string,
  idColName: string,
  columns: string[],
  hasTenant: boolean,
  skipReturning: boolean,
): Array<{ size: number; sqlText: string }> {
  const key = `${tableName}:${idColName}:${hasTenant ? "t" : "o"}:${skipReturning ? "s" : "r"}:${columns.join(",")}`;
  const hit = ctx.updateValuesTemplateCache.get(key);
  if (hit) return hit;

  const safeTableName = assertSafeSqlIdentifier(tableName, "table");
  const safeIdCol = assertSafeSqlIdentifier(idColName, "column");
  const setClauses = columns.map((col, i) => {
    const phys = ctx.getColumn(table, col);
    const physical = phys?.name ?? col;
    return `"${assertSafeSqlIdentifier(physical, "column")}" = ${pgUpdateCastExpr((t, c) => ctx.getColumn(t, c), table, col, i)}`;
  });
  const aliasCols = [
    ...columns.map((_, i) => `c${i}`),
    "_id",
    ...(hasTenant ? ["_tenantId"] : []),
  ].join(", ");
  const where = hasTenant
    ? `t."${safeIdCol}" = u._id AND t."tenantId" = u._tenantId`
    : `t."${safeIdCol}" = u._id`;

  const templates = UPDATE_BATCH_SIZE_BUCKETS.map((size) => {
    const rowsSql: string[] = [];
    let p = 0;
    for (let r = 0; r < size; r++) {
      const cells: string[] = [];
      for (let c = 0; c < columns.length; c++) cells.push(`$${++p}::text`);
      cells.push(`$${++p}::text`);
      if (hasTenant) cells.push(`$${++p}::text`);
      rowsSql.push(`(${cells.join(", ")})`);
    }
    const sqlText = `UPDATE "${safeTableName}" AS t SET ${setClauses.join(", ")} FROM (VALUES ${rowsSql.join(", ")}) AS u(${aliasCols}) WHERE ${where}${skipReturning ? "" : " RETURNING t.*"}`;
    return { size, sqlText };
  });
  ctx.updateValuesTemplateCache.set(key, templates);
  if (ctx.updateValuesTemplateCache.size >= 256) {
    const oldest = ctx.updateValuesTemplateCache.keys().next().value;
    if (oldest !== undefined) ctx.updateValuesTemplateCache.delete(oldest);
  }
  return templates;
}

export function getUpdateTemplate(
  ctx: PostgresUpdateContext,
  table: unknown,
  tableName: string,
  columns: string[],
  idColName: string,
  tenantSql: string,
  mergeJsonData: boolean,
  fields?: string[] | null,
  skipJson?: boolean,
) {
  const fieldsKey = fields && fields.length > 0 ? fields.join(",") : skipJson ? "nojson" : "all";
  const key = `${tableName}:${idColName}:${tenantSql}:${mergeJsonData ? "m" : "r"}:${columns.join(",")}:${fieldsKey}`;
  let tpl = ctx.updateTemplateCache.get(key);
  if (!tpl) {
    const isJsonMap: boolean[] = [];
    const setPairs: string[] = [];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const phys = ctx.getColumn(table, col);
      const physName = phys?.name ?? col;
      const safeCol = assertSafeSqlIdentifier(physName, "column");
      const isJson = physName === "data" || phys?.dataType === "json";
      isJsonMap[i] = isJson;
      setPairs.push(
        isJson && mergeJsonData
          ? `"${safeCol}" = COALESCE("${safeCol}", '{}'::jsonb) || $${i + 1}::jsonb`
          : isJson
            ? `"${safeCol}" = $${i + 1}::jsonb`
            : `"${safeCol}" = $${i + 1}`,
      );
    }
    const idIdx = columns.length + 1;
    const safeIdCol = assertSafeSqlIdentifier(idColName, "column");
    const safeTable = assertSafeSqlIdentifier(tableName, "table");
    const setSql = setPairs.join(", ");
    const whereSql = `"${safeIdCol}" = $${idIdx}${tenantSql}`;
    let returningClause = "*";
    if (fields && fields.length > 0) {
      const resolved = resolveUpdateProjection(table, fields, (t, f) => ctx.getColumn(t, f));
      if (resolved.length > 0) {
        const hasUnresolvedDynamic = fields.some((f) => !ctx.getColumn(table, f));
        if (hasUnresolvedDynamic && !resolved.includes("data") && ctx.getColumn(table, "data")) {
          resolved.push("data");
        }
        returningClause = resolved
          .map((c) => `"${assertSafeSqlIdentifier(c, "column")}"`)
          .join(", ");
      }
    } else if (skipJson) {
      const physCols = getTableColumns(table as Table) as Record<
        string,
        { name?: string; dataType?: string }
      >;
      const nonJsonCols = Object.keys(physCols).filter((c) => {
        const colObj = physCols[c];
        return (colObj?.name ?? c) !== "data" && colObj?.dataType !== "json";
      });
      if (nonJsonCols.length > 0) {
        returningClause = nonJsonCols
          .map((c) => `"${assertSafeSqlIdentifier(physCols[c]?.name ?? c, "column")}"`)
          .join(", ");
      }
    }
    const sqlWithReturning = `UPDATE "${safeTable}" SET ${setSql} WHERE ${whereSql} RETURNING ${returningClause}`;
    const sqlSkipReturning = `UPDATE "${safeTable}" SET ${setSql} WHERE ${whereSql}`;
    tpl = {
      columns,
      isJsonMap,
      sqlWithReturning,
      sqlSkipReturning,
    };
    ctx.updateTemplateCache.set(key, tpl);
    if (ctx.updateTemplateCache.size >= 256) {
      const oldest = ctx.updateTemplateCache.keys().next().value;
      if (oldest !== undefined) ctx.updateTemplateCache.delete(oldest);
    }
  }
  return tpl;
}

export async function executePostgresBatchUpdateValues<T extends BaseEntity>(
  ctx: PostgresUpdateContext,
  table: unknown,
  collection: string,
  batch: Array<{ id: DatabaseId; values: Record<string, unknown>; options: BaseQueryOptions }>,
): Promise<T[] | null> {
  const len = batch.length;
  if (len === 0) return [];
  const options = batch[0].options;
  const txnSql = ctx.getTxnSql(options) as
    | { unsafe: (query: string, params?: unknown[], opts?: unknown) => Promise<unknown[]> }
    | undefined;
  if (options?.transaction && !txnSql) return null;
  const exec =
    txnSql ??
    (ctx.sql as {
      unsafe: (query: string, params?: unknown[], opts?: unknown) => Promise<unknown[]>;
    });
  try {
    const tableName = getTableName(table as Table);
    const idColName = ctx.getColumn(table, "_id")?.name ?? "_id";

    const columns = Object.keys(batch[0].values).filter(
      (c) => c !== idColName && c !== "id" && c !== "tenantId",
    );
    if (columns.length === 0) return null;

    const tenant = getEffectiveTenantId(options);
    const hasTenant = tenant !== undefined && tenant !== null;
    const skipReturning = (options as Record<string, unknown>)?.skipReturning === true;
    const templates = getUpdateValuesTemplates(
      ctx,
      table,
      tableName,
      idColName,
      columns,
      hasTenant,
      skipReturning,
    );

    const toText = (val: unknown): string | null => {
      if (val === null || val === undefined) return null;
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    };

    const results: T[] = [];
    for (let offset = 0; offset < len; offset += MAX_UPDATE_BATCH_SIZE) {
      const chunk = batch.slice(offset, offset + MAX_UPDATE_BATCH_SIZE);
      const tpl = templates.find((t) => t.size >= chunk.length);
      if (!tpl) return null;

      const params: (string | null)[] = [];
      for (let r = 0; r < tpl.size; r++) {
        const row = r < chunk.length ? chunk[r] : null;
        for (const col of columns) params.push(row ? toText(row.values[col]) : null);
        params.push(row ? String(row.id) : IMPOSSIBLE_ID);
        if (hasTenant) {
          params.push(row ? toText(getEffectiveTenantId(row.options)) : IMPOSSIBLE_ID);
        }
      }

      if (skipReturning) {
        await exec.unsafe(tpl.sqlText, params, { prepare: true });
        for (const row of chunk) {
          results.push(
            convertDatesToISO(
              { ...row.values, [idColName]: row.id },
              { ...ctx.convertDatesOptions, table: collection },
            ) as unknown as T,
          );
        }
        continue;
      }

      const rows = await exec.unsafe(tpl.sqlText, params, { prepare: true });
      for (const row of rows as Record<string, unknown>[]) {
        results.push(
          convertDatesToISO(row, {
            ...ctx.convertDatesOptions,
            table: collection,
          }) as unknown as T,
        );
      }
    }
    return results;
  } catch (err: unknown) {
    logger.debug(`[PostgreSQL] rawUpdateManyReturning fallback:`, err);
    return null;
  }
}

export async function executePostgresSingleUpdate<T extends BaseEntity>(
  ctx: PostgresUpdateContext,
  table: unknown,
  collection: string,
  values: Record<string, unknown>,
  idCol: { name?: string } | undefined,
  id: DatabaseId,
  options: BaseQueryOptions,
): Promise<RawFindResult<T>> {
  const txnSql = ctx.getTxnSql(options) as
    | { unsafe: (query: string, params?: unknown[], opts?: unknown) => Promise<unknown[]> }
    | undefined;
  if (options?.transaction && !txnSql) return RAW_DECLINED;
  const exec =
    txnSql ??
    (ctx.sql as {
      unsafe: (query: string, params?: unknown[], opts?: unknown) => Promise<unknown[]>;
    });
  if (!exec) return RAW_DECLINED;
  try {
    const columns = Object.keys(values);
    if (columns.length === 0) return RAW_DECLINED;

    const tableName = getTableName(table as Table);
    const idColName = idCol?.name || "_id";
    const tenantClause = buildRawTenantClause(options, "postgres", {
      paramIndex: columns.length + 2,
    });

    const fieldsOpt = (options as BaseQueryOptions & { fields?: string[] }).fields;
    const fields = Array.isArray(fieldsOpt) && fieldsOpt.length > 0 ? fieldsOpt : null;
    const skipJson = options?.skipJson === true;

    const tpl = getUpdateTemplate(
      ctx,
      table,
      tableName,
      columns,
      idColName,
      tenantClause.sql,
      getJsonDataPatch(values) !== undefined,
      fields,
      skipJson,
    );
    const boundValues: unknown[] = [];

    for (let i = 0; i < columns.length; i++) {
      boundValues.push(bindPgParam(values[columns[i]], tpl.isJsonMap[i]));
    }
    boundValues.push(String(id), ...tenantClause.params);

    const skipReturning = (options as Record<string, unknown>)?.skipReturning === true;

    if (skipReturning) {
      const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:upd:stmt") : null;
      await exec.unsafe(tpl.sqlSkipReturning, boundValues, { prepare: true });
      mStmt?.();
      return { [idColName]: id } as unknown as T;
    }

    const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:upd:stmt") : null;
    const rows = await exec.unsafe(tpl.sqlWithReturning, boundValues, { prepare: true });
    mStmt?.();
    if (Array.isArray(rows) && rows.length > 0) {
      return convertDatesToISO(rows[0] as Record<string, unknown>, {
        ...ctx.convertDatesOptions,
        table: collection,
        inPlace: true,
      }) as T;
    }
    return null;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") throw err;
    logger.debug(`[PostgreSQL] rawUpdateReturning fallback for ${collection}:`, err);
    return RAW_DECLINED;
  }
}
