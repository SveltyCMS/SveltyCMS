/**
 * @file src/databases/postgresql/postgresql-wire-stream.ts
 * @description Direct-to-Wire SQL query generation and execution for PostgreSQL.
 *
 * Features:
 * - Aggregates point and list rows directly inside the PostgreSQL engine using `jsonb_build_object` and `jsonb_agg`.
 * - Completely bypasses V8 object allocation and JSON.stringify.
 * - Prepared statement compilation caching keyed by schema table identity and sort parameters.
 */

import { assertSafeSqlIdentifier, buildRawTenantClause } from "../core/relational-utils";
import { getMaterializedFieldColumns } from "../core/drizzle-sql-helpers";
import type { BaseQueryOptions, DatabaseId } from "../db-interface";
import type { RawPointWireStreamResult, RawListWireStreamResult } from "../core/sql-adapter-core";

export interface PostgresWireExecutor {
  getColumn(table: any, colName: string): any;
  sql: any;
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

export class PostgresWireStreamEngine {
  private _pointSqlCache = new WeakMap<any, PointWireSql>();
  private _listSqlCache = new WeakMap<any, Map<string, ListWireSql>>();

  /**
   * Direct-to-Wire point stream optimization for PostgreSQL.
   */
  async findPointWireStream(
    executor: PostgresWireExecutor,
    exec: any,
    table: any,
    tableName: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    if (!exec) return { kind: "declined" };

    try {
      const hasDataCol = !!executor.getColumn(table, "data");
      if (!hasDataCol) return { kind: "declined" };

      const hasUpdatedAtCol = !!executor.getColumn(table, "updatedAt");
      const updatedAtSelect = hasUpdatedAtCol
        ? 'coalesce(extract(epoch from "updatedAt") * 1000, 0)'
        : "0";

      let cachedWireSql = this._pointSqlCache.get(table);
      if (!cachedWireSql) {
        const safeTable = `"${assertSafeSqlIdentifier(tableName, "table")}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const pairs: string[] = [`'_id', "_id"`];
        if (hasStatusCol) pairs.push(`'status', "status"`);
        if (hasSlugCol) pairs.push(`'slug', "slug"`);
        for (const rawName of getMaterializedFieldColumns(table)) {
          if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
          const name = assertSafeSqlIdentifier(rawName, "column");
          pairs.push(`'${name}', "${name}"`);
        }

        const doc = `jsonb_build_object(${pairs.join(", ")})`;
        const dataExpr = `(CASE WHEN "data" IS NULL THEN ${doc} ELSE ("data" || ${doc}) END)`;
        const selectPrefix = `SELECT (jsonb_build_object('success', true, 'data', ${dataExpr}))::text AS wire_body, ${updatedAtSelect}::text AS updated_at FROM ${safeTable}`;

        cachedWireSql = {
          selectPrefix,
          base: `${selectPrefix} WHERE "_id" = $1 LIMIT 1`,
          tenant: `${selectPrefix} WHERE "_id" = $1 AND "tenantId" = $2 LIMIT 1`,
          basePub: hasStatusCol
            ? `${selectPrefix} WHERE "_id" = $1 AND "status" IN ('publish', 'published') LIMIT 1`
            : null,
          tenantPub: hasStatusCol
            ? `${selectPrefix} WHERE "_id" = $1 AND "status" IN ('publish', 'published') AND "tenantId" = $2 LIMIT 1`
            : null,
        };
        this._pointSqlCache.set(table, cachedWireSql);
      }

      const tenantClause = buildRawTenantClause(options, "postgres", { paramIndex: 2 });
      const hasTenant = tenantClause.sql !== "";
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      const sqlText = wantPublished
        ? hasTenant
          ? cachedWireSql.tenantPub!
          : cachedWireSql.basePub!
        : hasTenant
          ? cachedWireSql.tenant
          : cachedWireSql.base;
      const params = hasTenant ? [String(id), ...tenantClause.params] : [String(id)];
      const rows = await exec.unsafe(sqlText, params, { prepare: true });
      if (!Array.isArray(rows) || rows.length === 0) return { kind: "missing" };
      const first = rows[0];
      return {
        kind: "found",
        wireBody:
          typeof first.wire_body === "string" ? first.wire_body : JSON.stringify(first.wire_body),
        etag: `"${String(id)}-${String(first.updated_at ?? "")}"`,
      };
    } catch {
      return { kind: "declined" };
    }
  }

  /**
   * Raw list direct-to-wire streaming for PostgreSQL (2027 architecture).
   * Aggregates rows directly in the PostgreSQL engine using `jsonb_agg`.
   */
  async findListWireStream(
    executor: PostgresWireExecutor,
    exec: any,
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
    if (!exec) return { kind: "declined" };

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
      const updatedAtSelect = hasUpdatedAtCol
        ? 'coalesce(extract(epoch from "updatedAt") * 1000, 0)'
        : "0";

      let tableCache = this._listSqlCache.get(table);
      if (!tableCache) {
        tableCache = new Map();
        this._listSqlCache.set(table, tableCache);
      }

      let cachedWireSql = tableCache.get(sortKey);
      if (!cachedWireSql) {
        const safeTable = `"${assertSafeSqlIdentifier(tableName, "table")}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const pairs: string[] = [`'_id', "_id"`];
        if (hasStatusCol) pairs.push(`'status', "status"`);
        if (hasSlugCol) pairs.push(`'slug', "slug"`);
        for (const rawName of getMaterializedFieldColumns(table)) {
          if (!/^[A-Za-z0-9_]+$/.test(rawName)) return { kind: "declined" };
          const name = assertSafeSqlIdentifier(rawName, "column");
          pairs.push(`'${name}', "${name}"`);
        }

        const doc = `jsonb_build_object(${pairs.join(", ")})`;
        const dataExpr = `(CASE WHEN "data" IS NULL THEN ${doc} ELSE ("data" || ${doc}) END)`;
        const subSelect = `SELECT ${dataExpr} AS doc, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;
        const orderClause = `ORDER BY ${sortCol} ${sortDirection}`;

        const wrap = (wherePart: string, limitIdx: number, offsetIdx: number) => `
          SELECT coalesce(jsonb_agg(sub.doc), '[]'::jsonb)::text AS wire_body,
                 coalesce(max(sub.updated_at), 0)::text AS max_updated_at
          FROM (${subSelect} ${wherePart ? `WHERE ${wherePart}` : ""} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}) sub
        `;

        cachedWireSql = {
          base: wrap("", 1, 2),
          tenant: wrap(`"tenantId" = $1`, 2, 3),
          basePub: hasStatusCol ? wrap(`"status" IN ('publish', 'published')`, 1, 2) : null,
          tenantPub: hasStatusCol
            ? wrap(`"status" IN ('publish', 'published') AND "tenantId" = $1`, 2, 3)
            : null,
        };
        tableCache.set(sortKey, cachedWireSql);
      }

      const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 50;
      const offset = typeof options.offset === "number" && options.offset >= 0 ? options.offset : 0;
      const tenantClause = buildRawTenantClause(options, "postgres", { paramIndex: 1 });
      const hasTenant = tenantClause.sql !== "";
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      let sqlText: string;
      let params: unknown[];
      if (hasTenant) {
        sqlText = wantPublished ? cachedWireSql.tenantPub! : cachedWireSql.tenant;
        params = [tenantClause.params[0], limit, offset];
      } else {
        sqlText = wantPublished ? cachedWireSql.basePub! : cachedWireSql.base;
        params = [limit, offset];
      }

      const rows = await exec.unsafe(sqlText, params, { prepare: true });
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
        `[Postgres rawFindListWireStream] falling back: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { kind: "declined" };
    }
  }
}
