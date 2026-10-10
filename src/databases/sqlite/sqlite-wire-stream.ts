/**
 * @file src/databases/sqlite/sqlite-wire-stream.ts
 * @description Direct-to-Wire SQL query generation and execution for SQLite.
 *
 * Features:
 * - Aggregates point and list rows directly inside the SQLite C engine.
 * - Uses `json_object` and `json_group_array` to bypass V8 object allocation and JSON.stringify.
 * - Prepared statement compilation caching keyed by schema table identity and sort parameters.
 */

import {
  assertSafeSqlIdentifier,
  buildRawTenantClause,
  getTableBooleanColumns,
} from "../core/relational-utils";
import { getMaterializedFieldColumns } from "../core/drizzle-sql-helpers";
import type { BaseQueryOptions, DatabaseId } from "../db-interface";
import type { RawPointWireStreamResult, RawListWireStreamResult } from "../core/sql-adapter-core";

export interface SqliteWireExecutor {
  getColumn(table: any, colName: string): any;
  prepareAndExecute(sqlText: string, mode: "get" | "all" | "run", ...params: unknown[]): unknown;
}

interface PointWireSql {
  selectPrefix: string;
  base: string;
  tenant: string;
  basePub: string | null;
  tenantPub: string | null;
}

interface ListWireSql {
  base: string;
  tenant: string;
  basePub: string | null;
  tenantPub: string | null;
}

export class SqliteWireStreamEngine {
  private _pointSqlCache = new WeakMap<object, PointWireSql>();
  private _listSqlCache = new WeakMap<object, Map<string, ListWireSql>>();

  /**
   * Direct-to-Wire point stream optimization for SQLite:
   * Generates `{ success: true, data: { ... } }` directly inside SQLite C engine
   * via json_object and json_patch, completely bypassing V8 JS object hydration and JSON.stringify.
   */
  async findPointWireStream(
    executor: SqliteWireExecutor,
    table: any,
    tableName: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    try {
      const hasDataCol = !!executor.getColumn(table, "data");
      if (!hasDataCol) return { kind: "declined" };

      const hasUpdatedAtCol = !!executor.getColumn(table, "updatedAt");
      const updatedAtSelect = hasUpdatedAtCol ? '"updatedAt"' : "NULL";
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "sqlite");

      let cachedWireSql = this._pointSqlCache.get(table);
      if (!cachedWireSql) {
        const quoted = `"${tableName}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const overrides: string[] = [`'$."_id"', "_id"`];
        if (hasStatusCol) overrides.push(`'$."status"', "status"`);
        if (hasSlugCol) overrides.push(`'$."slug"', "slug"`);
        const boolCols = getTableBooleanColumns(tableName);
        for (const rawName of getMaterializedFieldColumns(table)) {
          if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
          const name = assertSafeSqlIdentifier(rawName, "column");
          const col = `"${name}"`;
          const value = boolCols?.has(rawName)
            ? `json(CASE WHEN ${col} = 1 THEN 'true' WHEN ${col} = 0 THEN 'false' ELSE json_quote(${col}) END)`
            : col;
          overrides.push(`'$."${name}"', ${value}`);
        }

        const dataExpr = `json(json_set(COALESCE("data", '{}')${overrides.map((o) => `, ${o}`).join("")}))`;
        const selectPrefix = `SELECT json_object('success', json('true'), 'data', ${dataExpr}) AS wire_body, ${updatedAtSelect} AS updated_at FROM ${quoted}`;

        cachedWireSql = {
          selectPrefix,
          base: `${selectPrefix} WHERE "_id" = ? LIMIT 1`,
          tenant: `${selectPrefix} WHERE "_id" = ? AND "tenantId" = ? LIMIT 1`,
          basePub: hasStatusCol
            ? `${selectPrefix} WHERE "_id" = ? AND "status" IN ('publish', 'published') LIMIT 1`
            : null,
          tenantPub: hasStatusCol
            ? `${selectPrefix} WHERE "_id" = ? AND "status" IN ('publish', 'published') AND "tenantId" = ? LIMIT 1`
            : null,
        };
        this._pointSqlCache.set(table, cachedWireSql);
      }

      const useTenantCache = tenantSql === ` AND "tenantId" = ?`;
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      let sqlText: string;
      let params: unknown[];
      if (useTenantCache) {
        sqlText = wantPublished ? cachedWireSql.tenantPub! : cachedWireSql.tenant;
        params = [String(id), ...tenantParams];
      } else if (!tenantSql) {
        sqlText = wantPublished ? cachedWireSql.basePub! : cachedWireSql.base;
        params = [String(id)];
      } else {
        const publishedSql = wantPublished ? ` AND "status" = 'publish'` : "";
        sqlText = `${cachedWireSql.selectPrefix} WHERE "_id" = ?${tenantSql}${publishedSql} LIMIT 1`;
        params = [String(id), ...tenantParams];
      }

      const rawRow = executor.prepareAndExecute(sqlText, "get", ...params) as
        | { wire_body: string; updated_at: number | string }
        | undefined;

      if (!rawRow || !rawRow.wire_body) return { kind: "missing" };
      return {
        kind: "found",
        wireBody:
          typeof rawRow.wire_body === "string"
            ? rawRow.wire_body
            : JSON.stringify(rawRow.wire_body),
        etag: `"${String(id)}-${String(rawRow.updated_at ?? "")}"`,
      };
    } catch (err: any) {
      logger.debug("[SQLite rawFindPointWireStream] falling back:", err?.message);
      return { kind: "declined" };
    }
  }

  /**
   * Direct-to-Wire List Streaming for SQLite (Phase 2 & 3).
   *
   * Aggregates rows directly in the SQLite engine using `json_group_array`,
   * completely bypassing V8 object allocation and JSON.stringify.
   */
  async findListWireStream(
    executor: SqliteWireExecutor,
    table: any,
    tableName: string,
    options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
    },
  ): Promise<RawListWireStreamResult> {
    try {
      const hasDataCol = !!executor.getColumn(table, "data");
      if (!hasDataCol) return { kind: "declined" };

      const sortField = options.sortField;
      const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
      let sortCol = '"_id"';
      if (sortField) {
        if (!/^[A-Za-z0-9_]+$/.test(sortField)) return { kind: "declined" };
        if (!executor.getColumn(table, sortField)) return { kind: "declined" };
        sortCol = `"${assertSafeSqlIdentifier(sortField, "column")}"`;
      }
      const sortKey = `${sortCol}:${sortDirection}`;

      const hasUpdatedAtCol = !!executor.getColumn(table, "updatedAt");
      const updatedAtSelect = hasUpdatedAtCol ? '"updatedAt"' : "0";
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "sqlite");

      let tableCache = this._listSqlCache.get(table);
      if (!tableCache) {
        tableCache = new Map();
        this._listSqlCache.set(table, tableCache);
      }

      let cachedWireSql = tableCache.get(sortKey);
      if (!cachedWireSql) {
        const quoted = `"${tableName}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const overrides: string[] = [`'$."_id"', "_id"`];
        if (hasStatusCol) overrides.push(`'$."status"', "status"`);
        if (hasSlugCol) overrides.push(`'$."slug"', "slug"`);
        const boolCols = getTableBooleanColumns(tableName);
        for (const rawName of getMaterializedFieldColumns(table)) {
          if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
          const name = assertSafeSqlIdentifier(rawName, "column");
          const col = `"${name}"`;
          const value = boolCols?.has(rawName)
            ? `json(CASE WHEN ${col} = 1 THEN 'true' WHEN ${col} = 0 THEN 'false' ELSE json_quote(${col}) END)`
            : col;
          overrides.push(`'$."${name}"', ${value}`);
        }

        const dataExpr = `json(json_set(COALESCE("data", '{}')${overrides.map((o) => `, ${o}`).join("")}))`;
        const subSelect = `SELECT ${dataExpr} AS doc, ${updatedAtSelect} AS updated_at FROM ${quoted}`;
        const orderClause = `ORDER BY ${sortCol} ${sortDirection} LIMIT ? OFFSET ?`;

        const wrap = (wherePart: string) => `
          SELECT coalesce(json_group_array(json(doc)), '[]') AS wire_body,
                 coalesce(max(updated_at), 0) AS max_updated_at
          FROM (${subSelect} ${wherePart ? `WHERE ${wherePart}` : ""} ${orderClause});
        `;

        cachedWireSql = {
          base: wrap(""),
          tenant: wrap(`"tenantId" = ?`),
          basePub: hasStatusCol ? wrap(`"status" IN ('publish', 'published')`) : null,
          tenantPub: hasStatusCol
            ? wrap(`"status" IN ('publish', 'published') AND "tenantId" = ?`)
            : null,
        };
        tableCache.set(sortKey, cachedWireSql);
      }

      const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 50;
      const offset = typeof options.offset === "number" && options.offset >= 0 ? options.offset : 0;
      const useTenantCache = tenantSql === ` AND "tenantId" = ?`;
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      let sqlText: string;
      let params: unknown[];
      if (useTenantCache) {
        sqlText = wantPublished ? cachedWireSql.tenantPub! : cachedWireSql.tenant;
        params = [...tenantParams, limit, offset];
      } else if (!tenantSql) {
        sqlText = wantPublished ? cachedWireSql.basePub! : cachedWireSql.base;
        params = [limit, offset];
      } else {
        return { kind: "declined" };
      }

      const rawRow = executor.prepareAndExecute(sqlText, "get", ...params) as
        | { wire_body?: string; max_updated_at?: number }
        | undefined;

      const wireBody = rawRow?.wire_body ?? "[]";
      const etag = `"list-${String(rawRow?.max_updated_at ?? 0)}-${limit}-${offset}"`;
      return {
        kind: "found",
        wireBody,
        etag,
      };
    } catch (err: any) {
      logger.debug("[SQLite rawFindListWireStream] falling back:", err?.message);
      return { kind: "declined" };
    }
  }
}
