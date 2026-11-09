/**
 * @file src/databases/mariadb/mariadb-wire-stream.ts
 * @description Direct-to-Wire SQL query generation and execution for MariaDB.
 *
 * Features:
 * - Aggregates point and list rows directly inside the MariaDB C engine.
 * - Uses `JSON_OBJECT`, `JSON_SET`, and `JSON_ARRAYAGG` to bypass V8 object allocation and JSON.stringify.
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
import { versionTokenString } from "@utils/optimistic-lock";
import { logger } from "@src/utils/logger";

export interface MariadbWireExecutor {
  getColumn(table: unknown, colName: string): unknown;
  getRawExec(
    options: BaseQueryOptions,
  ): (sqlText: string, params?: unknown[]) => Promise<unknown[]>;
}

interface ListWireSql {
  base: string;
  tenant: string;
  basePub: string | null;
  tenantPub: string | null;
  dataExpr: string;
  updatedAtSelect: string;
  safeTable: string;
  orderClause: string;
}

export class MariadbWireStreamEngine {
  private _pointSqlCache = new WeakMap<object, PointWireSqlTemplates>();
  private _listSqlCache = new WeakMap<object, Map<string, ListWireSql>>();

  /**
   * Direct-to-Wire point stream optimization for MariaDB:
   * Generates `{ success: true, data: { ... } }` directly inside MariaDB C engine
   * via JSON_OBJECT and JSON_SET, completely bypassing V8 JS object hydration and JSON.stringify.
   */
  async findPointWireStream(
    executor: MariadbWireExecutor,
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

        const idCol = (executor.getColumn(table, "_id") || executor.getColumn(table, "id")) as
          | { name?: string }
          | undefined;
        if (!idCol) {
          this._pointSqlCache.set(table, { declined: true } as PointWireSqlTemplates);
          return { kind: "declined" };
        }
        const idColName = idCol.name || "_id";

        const matCols = collectSafeMaterializedColumns(table);
        if (!matCols) {
          this._pointSqlCache.set(table, { declined: true } as PointWireSqlTemplates);
          return { kind: "declined" };
        }

        const updatedAtSelect = executor.getColumn(table, "updatedAt")
          ? "CONCAT(DATE_FORMAT(`updatedAt`, '%Y-%m-%dT%H:%i:%s.'), LPAD(FLOOR(MICROSECOND(`updatedAt`) / 1000), 3, '0'), 'Z')"
          : "NULL";
        const hasDeletedCol = !!executor.getColumn(table, "isDeleted");
        const safeTable = `\`${assertSafeSqlIdentifier(tableName, "table")}\``;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const overrides: string[] = [`'$."_id"', \`${idColName}\``];
        if (hasStatusCol) overrides.push(`'$."status"', \`status\``);
        if (hasSlugCol) overrides.push(`'$."slug"', \`slug\``);
        const boolCols = getTableBooleanColumns(tableName);
        for (const name of matCols) {
          const col = `\`${name}\``;
          overrides.push(`'$."${name}"', ${boolCols?.has(name) ? `(${col} = 1)` : col}`);
        }

        const dataExpr = `JSON_SET(COALESCE(\`data\`, '{}')${overrides.map((o) => `, ${o}`).join("")})`;
        const selectPrefix = `SELECT CAST(JSON_OBJECT('success', true, 'data', ${dataExpr}) AS CHAR) AS wire_body, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;
        const delSuffix = hasDeletedCol ? " AND `isDeleted` = 0" : "";

        cachedWireSql = buildPointWireSqlTemplates({
          selectPrefix,
          idExpr: `\`${idColName}\` = ?`,
          tenantExpr: "`tenantId` = ?",
          tenantColQuoted: "`tenantId`",
          statusColQuoted: "`status`",
          hasStatusCol,
          delSuffix,
          idColName,
        });
        this._pointSqlCache.set(table, cachedWireSql);
      } else if (cachedWireSql.declined) {
        return { kind: "declined" };
      }

      const resolved = resolvePointWireQuery(cachedWireSql, id, options);
      if (!resolved) return { kind: "declined" };

      const rawExec = executor.getRawExec(options);
      const rows = (await rawExec(resolved.sqlText, resolved.params)) as Array<{
        wire_body?: unknown;
        updated_at?: unknown;
      }>;
      if (!Array.isArray(rows) || rows.length === 0) return { kind: "missing" };
      const first = rows[0];
      const wireBody =
        typeof first.wire_body === "string" ? first.wire_body : JSON.stringify(first.wire_body);
      return {
        kind: "found",
        wireBody,
        etag: `"${String(id)}-${versionTokenString(first.updated_at)}"`,
      };
    } catch (err: unknown) {
      logger.debug(
        `[MariaDB rawFindPointWireStream] falling back: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { kind: "declined" };
    }
  }

  /**
   * Raw list direct-to-wire streaming for MariaDB.
   * Aggregates rows directly in the MariaDB C engine using `JSON_ARRAYAGG`,
   * completely bypassing V8 object allocation and JSON.stringify.
   */
  async findListWireStream(
    executor: MariadbWireExecutor,
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
      const v = validateWireListInput(executor, table, options, "`");
      if (!v) return { kind: "declined" };
      const { isProjected, dedupedProjectedCols, orderClause, cacheKey, limit, offset } = v;

      const hasDeletedCol = !!executor.getColumn(table, "isDeleted");
      let tableCache = this._listSqlCache.get(table);
      if (!tableCache) {
        tableCache = new Map();
        this._listSqlCache.set(table, tableCache);
      }

      let cachedWireSql = tableCache.get(cacheKey);
      if (!cachedWireSql) {
        const safeTable = `\`${assertSafeSqlIdentifier(tableName, "table")}\``;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");
        const updatedAtSelect = executor.getColumn(table, "updatedAt")
          ? "COALESCE(UNIX_TIMESTAMP(`updatedAt`) * 1000, 0)"
          : "0";
        const boolCols = getTableBooleanColumns(tableName);

        let dataExpr: string;
        if (isProjected) {
          const pairs = dedupedProjectedCols.map((safeCol) => {
            const col = `\`${safeCol}\``;
            const value = boolCols?.has(safeCol) ? `(${col} = 1)` : col;
            return `'${safeCol}', ${value}`;
          });
          dataExpr = `JSON_OBJECT(${pairs.join(", ")})`;
        } else {
          const matCols = collectSafeMaterializedColumns(table);
          if (!matCols) return { kind: "declined" };
          const overrides: string[] = [`'$."_id"', \`_id\``];
          if (hasStatusCol) overrides.push(`'$."status"', \`status\``);
          if (hasSlugCol) overrides.push(`'$."slug"', \`slug\``);
          for (const name of matCols) {
            const col = `\`${name}\``;
            overrides.push(`'$."${name}"', ${boolCols?.has(name) ? `(${col} = 1)` : col}`);
          }
          dataExpr = `JSON_SET(COALESCE(\`data\`, '{}')${overrides.map((o) => `, ${o}`).join("")})`;
        }

        const subSelect = `SELECT ${dataExpr} AS doc, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;
        const wrap = (wherePart: string) => `
          SELECT COALESCE(JSON_ARRAYAGG(sub.doc), '[]') AS wire_body,
                 COALESCE(MAX(sub.updated_at), 0) AS max_updated_at
          FROM (${subSelect} ${wherePart ? `WHERE ${wherePart}` : ""} ${orderClause} LIMIT ? OFFSET ?) sub
        `;

        const delOnly = hasDeletedCol ? "`isDeleted` = 0" : "";
        const delAnd = hasDeletedCol ? " AND `isDeleted` = 0" : "";
        const andDel = (s: string) => (s ? `${s}${delAnd}` : delOnly);
        cachedWireSql = {
          base: wrap(andDel("")),
          tenant: wrap(andDel("`tenantId` = ?")),
          basePub: hasStatusCol ? wrap(andDel("`status` IN ('publish', 'published')")) : null,
          tenantPub: hasStatusCol
            ? wrap(andDel("`status` IN ('publish', 'published') AND `tenantId` = ?"))
            : null,
          dataExpr,
          updatedAtSelect,
          safeTable,
          orderClause,
        };
        tableCache.set(cacheKey, cachedWireSql);
      }

      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");
      const useTenantCache = tenantSql === " AND `tenantId` = ?";
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      let sqlText: string;
      let params: unknown[];
      if (useTenantCache) {
        sqlText = wantPublished ? cachedWireSql.tenantPub! : cachedWireSql.tenant;
        params = [tenantParams[0], limit, offset];
      } else if (!tenantSql) {
        sqlText = wantPublished ? cachedWireSql.basePub! : cachedWireSql.base;
        params = [limit, offset];
      } else {
        const publishedSql = wantPublished ? "`status` IN ('publish', 'published')" : "";
        const deletedSql = hasDeletedCol ? "`isDeleted` = 0" : "";
        const combinedWhere = [
          tenantSql ? tenantSql.replace(/^ AND /, "") : "",
          publishedSql,
          deletedSql,
        ]
          .filter(Boolean)
          .join(" AND ");
        sqlText = `
          SELECT COALESCE(JSON_ARRAYAGG(sub.doc), '[]') AS wire_body,
                 COALESCE(MAX(sub.updated_at), 0) AS max_updated_at
          FROM (SELECT ${cachedWireSql.dataExpr} AS doc, ${cachedWireSql.updatedAtSelect} AS updated_at FROM ${cachedWireSql.safeTable} ${combinedWhere ? `WHERE ${combinedWhere}` : ""} ${cachedWireSql.orderClause} LIMIT ? OFFSET ?) sub
        `;
        params = [...tenantParams, limit, offset];
      }

      const rawExec = executor.getRawExec(options);
      const rows = (await rawExec(sqlText, params)) as Array<{
        wire_body?: unknown;
        max_updated_at?: unknown;
      }>;
      if (!Array.isArray(rows) || rows.length === 0) {
        return { kind: "found", wireBody: "[]", etag: `"list-0-${limit}-${offset}"` };
      }
      const first = rows[0];
      const wireBody =
        typeof first.wire_body === "string" ? first.wire_body : JSON.stringify(first.wire_body);
      const etag = `"list-${String(first.max_updated_at ?? "0")}-${limit}-${offset}"`;
      return {
        kind: "found",
        wireBody,
        etag,
      };
    } catch (err: unknown) {
      logger.debug(
        `[MariaDB rawFindListWireStream] falling back: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { kind: "declined" };
    }
  }
}
