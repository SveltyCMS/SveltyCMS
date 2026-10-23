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
import { getMaterializedFieldColumns } from "../core/drizzle-sql-helpers";
import type { BaseQueryOptions, DatabaseId } from "../db-interface";
import type { RawPointWireStreamResult, RawListWireStreamResult } from "../core/sql-adapter-core";
import { versionTokenString } from "@utils/optimistic-lock";
import { logger } from "@src/utils/logger";

export interface MariadbWireExecutor {
  getColumn(table: any, colName: string): any;
  getRawExec(options: BaseQueryOptions): (sqlText: string, params?: any[]) => Promise<any[]>;
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
  dataExpr: string;
  updatedAtSelect: string;
  safeTable: string;
  sortCol: string;
  sortDirection: string;
}

export class MariadbWireStreamEngine {
  private _pointSqlCache = new WeakMap<object, PointWireSql>();
  private _listSqlCache = new WeakMap<object, Map<string, ListWireSql>>();

  /**
   * Direct-to-Wire point stream optimization for MariaDB:
   * Generates `{ success: true, data: { ... } }` directly inside MariaDB C engine
   * via JSON_OBJECT and JSON_SET, completely bypassing V8 JS object hydration and JSON.stringify.
   */
  async findPointWireStream(
    executor: MariadbWireExecutor,
    table: any,
    tableName: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    try {
      const hasDataCol = !!executor.getColumn(table, "data");
      if (!hasDataCol) return { kind: "declined" };

      const idCol = executor.getColumn(table, "_id") || executor.getColumn(table, "id");
      if (!idCol) return { kind: "declined" };
      const idColName = idCol.name || "_id";

      const hasUpdatedAtCol = !!executor.getColumn(table, "updatedAt");
      const updatedAtSelect = hasUpdatedAtCol ? "`updatedAt`" : "NULL";
      // 🔒 Soft-delete clamp for the public wire plane (see findPointWireStream).
      const hasDeletedCol = !!executor.getColumn(table, "isDeleted");
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");

      let cachedWireSql = this._pointSqlCache.get(table);
      if (!cachedWireSql) {
        const safeTable = `\`${assertSafeSqlIdentifier(tableName, "table")}\``;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const overrides: string[] = [`'$."_id"', \`${idColName}\``];
        if (hasStatusCol) overrides.push(`'$."status"', \`status\``);
        if (hasSlugCol) overrides.push(`'$."slug"', \`slug\``);
        const boolCols = getTableBooleanColumns(tableName);
        for (const rawName of getMaterializedFieldColumns(table)) {
          if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
          const name = assertSafeSqlIdentifier(rawName, "column");
          const col = `\`${name}\``;
          overrides.push(`'$."${name}"', ${boolCols?.has(rawName) ? `(${col} = 1)` : col}`);
        }

        const dataExpr = `JSON_SET(COALESCE(\`data\`, '{}')${overrides.map((o) => `, ${o}`).join("")})`;
        const selectPrefix = `SELECT JSON_OBJECT('success', true, 'data', ${dataExpr}) AS wire_body, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;

        const del = hasDeletedCol ? " AND `isDeleted` = 0" : "";
        cachedWireSql = {
          selectPrefix,
          base: `${selectPrefix} WHERE \`${idColName}\` = ?${del} LIMIT 1`,
          tenant: `${selectPrefix} WHERE \`${idColName}\` = ? AND \`tenantId\` = ?${del} LIMIT 1`,
          basePub: hasStatusCol
            ? `${selectPrefix} WHERE \`${idColName}\` = ? AND \`status\` IN ('publish', 'published')${del} LIMIT 1`
            : null,
          tenantPub: hasStatusCol
            ? `${selectPrefix} WHERE \`${idColName}\` = ? AND \`status\` IN ('publish', 'published') AND \`tenantId\` = ?${del} LIMIT 1`
            : null,
        };
        this._pointSqlCache.set(table, cachedWireSql);
      }

      const useTenantCache = tenantSql === " AND `tenantId` = ?";
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
        const publishedSql = wantPublished ? " AND `status` IN ('publish', 'published')" : "";
        const deletedSql = hasDeletedCol ? " AND `isDeleted` = 0" : "";
        sqlText = `${cachedWireSql.selectPrefix} WHERE \`${idColName}\` = ?${tenantSql}${publishedSql}${deletedSql} LIMIT 1`;
        params = [String(id), ...tenantParams];
      }

      const rawExec = executor.getRawExec(options);
      const rows = (await rawExec(sqlText, params)) as any[];
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
    table: any,
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
      const hasDataCol = !!executor.getColumn(table, "data");
      if (!hasDataCol) return { kind: "declined" };

      const requestedFields = options.fields;
      const isProjected = Array.isArray(requestedFields) && requestedFields.length > 0;
      if (isProjected) {
        for (const f of requestedFields) {
          if (!/^[A-Za-z0-9_]+$/.test(f)) return { kind: "declined" };
          if (f === "data") return { kind: "declined" };
          const colName = f === "id" ? "_id" : f;
          if (!executor.getColumn(table, colName)) {
            return { kind: "declined" };
          }
        }
      }

      const sortField = options.sortField;
      const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
      let sortCol = "`_id`";
      if (sortField) {
        if (!/^[A-Za-z0-9_]+$/.test(sortField)) return { kind: "declined" };
        if (!executor.getColumn(table, sortField)) return { kind: "declined" };
        sortCol = `\`${assertSafeSqlIdentifier(sortField, "column")}\``;
      }
      const sortKey = `${sortCol}:${sortDirection}`;
      const cacheKey = isProjected ? `${sortKey}:f:${requestedFields.join(",")}` : sortKey;

      const hasUpdatedAtCol = !!executor.getColumn(table, "updatedAt");
      const updatedAtSelect = hasUpdatedAtCol
        ? "COALESCE(UNIX_TIMESTAMP(`updatedAt`) * 1000, 0)"
        : "0";
      const hasDeletedCol = !!executor.getColumn(table, "isDeleted");
      const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(options, "mysql");

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
        const boolCols = getTableBooleanColumns(tableName);

        let dataExpr: string;
        if (isProjected) {
          const pairs: string[] = [];
          const seen = new Set<string>();
          for (const rawName of requestedFields) {
            const colName = rawName === "id" ? "_id" : rawName;
            if (seen.has(colName)) continue;
            seen.add(colName);
            const safeCol = assertSafeSqlIdentifier(colName, "column");
            const col = `\`${safeCol}\``;
            const value = boolCols?.has(colName) ? `(${col} = 1)` : col;
            pairs.push(`'${safeCol}', ${value}`);
          }
          if (!seen.has("_id") && executor.getColumn(table, "_id")) {
            pairs.unshift(`'_id', \`_id\``);
          }
          dataExpr = `JSON_OBJECT(${pairs.join(", ")})`;
        } else {
          const overrides: string[] = [`'$."_id"', \`_id\``];
          if (hasStatusCol) overrides.push(`'$."status"', \`status\``);
          if (hasSlugCol) overrides.push(`'$."slug"', \`slug\``);
          for (const rawName of getMaterializedFieldColumns(table)) {
            if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
            const name = assertSafeSqlIdentifier(rawName, "column");
            const col = `\`${name}\``;
            overrides.push(`'$."${name}"', ${boolCols?.has(rawName) ? `(${col} = 1)` : col}`);
          }
          dataExpr = `JSON_SET(COALESCE(\`data\`, '{}')${overrides.map((o) => `, ${o}`).join("")})`;
        }

        const subSelect = `SELECT ${dataExpr} AS doc, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;
        const orderClause = `ORDER BY ${sortCol} ${sortDirection}`;

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
          sortCol,
          sortDirection,
        };
        tableCache.set(cacheKey, cachedWireSql);
      }

      const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 50;
      const offset = typeof options.offset === "number" && options.offset >= 0 ? options.offset : 0;
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
          FROM (SELECT ${cachedWireSql.dataExpr} AS doc, ${cachedWireSql.updatedAtSelect} AS updated_at FROM ${cachedWireSql.safeTable} ${combinedWhere ? `WHERE ${combinedWhere}` : ""} ORDER BY ${cachedWireSql.sortCol} ${cachedWireSql.sortDirection} LIMIT ? OFFSET ?) sub
        `;
        params = [...tenantParams, limit, offset];
      }

      const rawExec = executor.getRawExec(options);
      const rows = (await rawExec(sqlText, params)) as any[];
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
