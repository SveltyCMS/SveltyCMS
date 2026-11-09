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
import {
  buildPointWireSqlTemplates,
  collectSafeMaterializedColumns,
  resolvePointWireQuery,
  validateWireListInput,
  type PointWireSqlTemplates,
} from "../core/sql-wire-stream";
import type { BaseQueryOptions, DatabaseId } from "../db-interface";
import type { RawPointWireStreamResult, RawListWireStreamResult } from "../core/sql-adapter-core";
import { logger } from "@src/utils/logger";

export interface SqliteWireExecutor {
  getColumn(table: unknown, colName: string): unknown;
  prepareAndExecute(sqlText: string, mode: "get" | "all" | "run", ...params: unknown[]): unknown;
}

interface ListWireSql {
  base: string;
  tenant: string;
  tenantNull: string;
  basePub: string | null;
  tenantPub: string | null;
  tenantPubNull: string | null;
}

export class SqliteWireStreamEngine {
  private _pointSqlCache = new WeakMap<object, PointWireSqlTemplates>();
  private _listSqlCache = new WeakMap<object, Map<string, ListWireSql>>();

  /**
   * Direct-to-Wire point stream optimization for SQLite:
   * Generates `{ success: true, data: { ... } }` directly inside SQLite C engine
   * via json_object and json_set, completely bypassing V8 JS object hydration and JSON.stringify.
   */
  async findPointWireStream(
    executor: SqliteWireExecutor,
    table: object,
    tableName: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    try {
      let cachedWireSql = this._pointSqlCache.get(table);
      if (cachedWireSql === undefined) {
        if (!executor.getColumn(table, "data")) {
          this._pointSqlCache.set(table, { declined: true } as PointWireSqlTemplates);
          return { kind: "declined" };
        }

        const matCols = collectSafeMaterializedColumns(table);
        if (!matCols) {
          this._pointSqlCache.set(table, { declined: true } as PointWireSqlTemplates);
          return { kind: "declined" };
        }

        const updatedAtSelect = executor.getColumn(table, "updatedAt") ? '"updatedAt"' : "NULL";
        const hasDeletedCol = !!executor.getColumn(table, "isDeleted");
        const safeTable = assertSafeSqlIdentifier(tableName, "table");
        const quoted = `"${safeTable}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const overrides: string[] = [`'$."_id"', "_id"`];
        if (hasStatusCol) overrides.push(`'$."status"', "status"`);
        if (hasSlugCol) overrides.push(`'$."slug"', "slug"`);
        const boolCols = getTableBooleanColumns(tableName);
        for (const name of matCols) {
          const col = `"${name}"`;
          const value = boolCols?.has(name)
            ? `json(CASE WHEN ${col} = 1 THEN 'true' WHEN ${col} = 0 THEN 'false' ELSE json_quote(${col}) END)`
            : col;
          overrides.push(`'$."${name}"', ${value}`);
        }

        const dataExpr = `json_set(COALESCE("data", '{}')${overrides.map((o) => `, ${o}`).join("")})`;
        const selectPrefix = `SELECT json_object('success', json('true'), 'data', ${dataExpr}) AS wire_body, ${updatedAtSelect} AS updated_at FROM ${quoted}`;
        const delSuffix = hasDeletedCol ? ` AND "isDeleted" = 0` : "";

        cachedWireSql = buildPointWireSqlTemplates({
          selectPrefix,
          idExpr: `"_id" = ?`,
          tenantExpr: `"tenantId" = ?`,
          tenantColQuoted: `"tenantId"`,
          statusColQuoted: `"status"`,
          hasStatusCol,
          delSuffix,
        });
        this._pointSqlCache.set(table, cachedWireSql);
      } else if (cachedWireSql.declined) {
        return { kind: "declined" };
      }

      const resolved = resolvePointWireQuery(cachedWireSql, id, options);
      if (!resolved) return { kind: "declined" };

      const rawRow = executor.prepareAndExecute(resolved.sqlText, "get", ...resolved.params) as
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
    } catch (err: unknown) {
      logger.debug(
        "[SQLite rawFindPointWireStream] falling back:",
        err instanceof Error ? err.message : String(err),
      );
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
    table: object,
    tableName: string,
    options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      fields?: string[];
    },
  ): Promise<RawListWireStreamResult> {
    try {
      const v = validateWireListInput(executor, table, options, '"');
      if (!v) return { kind: "declined" };
      const { isProjected, dedupedProjectedCols, orderClause, cacheKey, limit, offset } = v;

      let tableCache = this._listSqlCache.get(table);
      if (!tableCache) {
        tableCache = new Map();
        this._listSqlCache.set(table, tableCache);
      }

      let cachedWireSql = tableCache.get(cacheKey);
      if (!cachedWireSql) {
        const safeTable = assertSafeSqlIdentifier(tableName, "table");
        const quoted = `"${safeTable}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");
        const updatedAtSelect = executor.getColumn(table, "updatedAt") ? '"updatedAt"' : "0";
        const hasDeletedCol = !!executor.getColumn(table, "isDeleted");
        const boolCols = getTableBooleanColumns(tableName);

        let dataExpr: string;
        if (isProjected) {
          const pairs = dedupedProjectedCols.map((safeCol) => {
            const col = `"${safeCol}"`;
            const value = boolCols?.has(safeCol)
              ? `json(CASE WHEN ${col} = 1 THEN 'true' WHEN ${col} = 0 THEN 'false' ELSE json_quote(${col}) END)`
              : col;
            return `'${safeCol}', ${value}`;
          });
          dataExpr = `json_object(${pairs.join(", ")})`;
        } else {
          const matCols = collectSafeMaterializedColumns(table);
          if (!matCols) return { kind: "declined" };
          const overrides: string[] = [`'$."_id"', "_id"`];
          if (hasStatusCol) overrides.push(`'$."status"', "status"`);
          if (hasSlugCol) overrides.push(`'$."slug"', "slug"`);
          for (const name of matCols) {
            const col = `"${name}"`;
            const value = boolCols?.has(name)
              ? `json(CASE WHEN ${col} = 1 THEN 'true' WHEN ${col} = 0 THEN 'false' ELSE json_quote(${col}) END)`
              : col;
            overrides.push(`'$."${name}"', ${value}`);
          }
          dataExpr = `json_set(COALESCE("data", '{}')${overrides.map((o) => `, ${o}`).join("")})`;
        }

        const subSelect = `SELECT ${dataExpr} AS doc, ${updatedAtSelect} AS updated_at FROM ${quoted}`;
        const wrap = (wherePart: string) => `
          SELECT coalesce(json_group_array(json(doc)), '[]') AS wire_body,
                 coalesce(max(updated_at), 0) AS max_updated_at
          FROM (${subSelect} ${wherePart ? `WHERE ${wherePart}` : ""} ${orderClause} LIMIT ? OFFSET ?);
        `;

        const delOnly = hasDeletedCol ? `"isDeleted" = 0` : "";
        const delAnd = hasDeletedCol ? ` AND "isDeleted" = 0` : "";
        const andDel = (s: string) => (s ? `${s}${delAnd}` : delOnly);
        cachedWireSql = {
          base: wrap(andDel("")),
          tenant: wrap(andDel(`"tenantId" = ?`)),
          tenantNull: wrap(andDel(`"tenantId" IS NULL`)),
          basePub: hasStatusCol ? wrap(andDel(`"status" IN ('publish', 'published')`)) : null,
          tenantPub: hasStatusCol
            ? wrap(andDel(`"status" IN ('publish', 'published') AND "tenantId" = ?`))
            : null,
          tenantPubNull: hasStatusCol
            ? wrap(andDel(`"status" IN ('publish', 'published') AND "tenantId" IS NULL`))
            : null,
        };
        tableCache.set(cacheKey, cachedWireSql);
      }

      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "sqlite");
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      let sqlText: string;
      let params: unknown[];
      if (tenantSql === ` AND "tenantId" = ?`) {
        sqlText = wantPublished ? cachedWireSql.tenantPub! : cachedWireSql.tenant;
        params = [...tenantParams, limit, offset];
      } else if (tenantSql === ` AND "tenantId" IS NULL`) {
        sqlText = wantPublished ? cachedWireSql.tenantPubNull! : cachedWireSql.tenantNull;
        params = [limit, offset];
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
    } catch (err: unknown) {
      logger.debug(
        "[SQLite rawFindListWireStream] falling back:",
        err instanceof Error ? err.message : String(err),
      );
      return { kind: "declined" };
    }
  }
}
