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
import {
  buildPointWireSqlTemplates,
  collectSafeMaterializedColumns,
  resolvePointWireQuery,
  validateWireListInput,
  type PointWireSqlTemplates,
} from "../sql/wire-stream-shared";
import type { BaseQueryOptions, DatabaseId } from "../db-interface";
import type { RawPointWireStreamResult, RawListWireStreamResult } from "../core/sql-adapter-core";
import { logger } from "@src/utils/logger";

export interface PostgresWireExecutor {
  getColumn(table: unknown, colName: string): unknown;
  sql: unknown;
}

interface ListWireSql {
  base: string;
  tenant: string;
  basePub: string | null;
  tenantPub: string | null;
  tenantNull: string;
  tenantPubNull: string | null;
}

export class PostgresWireStreamEngine {
  private _pointSqlCache = new WeakMap<object, PointWireSqlTemplates>();
  private _listSqlCache = new WeakMap<object, Map<string, ListWireSql>>();

  /**
   * Direct-to-Wire point stream optimization for PostgreSQL.
   */
  async findPointWireStream(
    executor: PostgresWireExecutor,
    exec: {
      unsafe(sqlText: string, params: unknown[], opts?: { prepare?: boolean }): Promise<unknown[]>;
    } | null,
    table: object,
    tableName: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult> {
    if (!exec) return { kind: "declined" };

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

        const updatedAtSelect = executor.getColumn(table, "updatedAt") ? '"updatedAt"' : "''";
        const safeTable = `"${assertSafeSqlIdentifier(tableName, "table")}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");

        const pairs: string[] = [`'_id', "_id"`];
        if (hasStatusCol) pairs.push(`'status', "status"`);
        if (hasSlugCol) pairs.push(`'slug', "slug"`);
        for (const name of matCols) {
          pairs.push(`'${name}', "${name}"`);
        }

        const doc = `jsonb_build_object(${pairs.join(", ")})`;
        const selectPrefix = `SELECT (CASE WHEN "data" IS NULL OR "data" = '{}'::jsonb THEN ${doc} ELSE ("data" || ${doc}) END)::text AS doc_text, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;
        const delSuffix = executor.getColumn(table, "isDeleted") ? ` AND "isDeleted" = false` : "";

        cachedWireSql = buildPointWireSqlTemplates({
          selectPrefix,
          idExpr: `"_id" = $1`,
          tenantExpr: `"tenantId" = $2`,
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

      const rows = (await exec.unsafe(resolved.sqlText, resolved.params, {
        prepare: true,
      })) as Array<{
        doc_text?: unknown;
        updated_at?: unknown;
      }>;
      if (!Array.isArray(rows) || rows.length === 0) return { kind: "missing" };
      const first = rows[0];
      const docText =
        typeof first.doc_text === "string"
          ? first.doc_text
          : JSON.stringify(first.doc_text ?? null);
      const wireBody = `{"success":true,"data":${docText}}`;
      const updatedAtVal = first.updated_at;
      const updatedToken =
        typeof updatedAtVal === "string"
          ? updatedAtVal
          : updatedAtVal instanceof Date
            ? updatedAtVal.toISOString()
            : String(updatedAtVal ?? "");
      return {
        kind: "found",
        wireBody,
        etag: `"${String(id)}-${updatedToken}"`,
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
    exec: {
      unsafe(sqlText: string, params: unknown[], opts?: { prepare?: boolean }): Promise<unknown[]>;
    } | null,
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
    if (!exec) return { kind: "declined" };

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
        const safeTable = `"${assertSafeSqlIdentifier(tableName, "table")}"`;
        const hasSlugCol = !!executor.getColumn(table, "slug");
        const hasStatusCol = !!executor.getColumn(table, "status");
        const updatedAtSelect = executor.getColumn(table, "updatedAt")
          ? 'coalesce(extract(epoch from "updatedAt") * 1000, 0)'
          : "0";

        let doc: string;
        if (isProjected) {
          const pairs = dedupedProjectedCols.map((col) => `'${col}', "${col}"`);
          doc = `jsonb_build_object(${pairs.join(", ")})`;
        } else {
          const matCols = collectSafeMaterializedColumns(table);
          if (!matCols) return { kind: "declined" };
          const pairs: string[] = [`'_id', "_id"`];
          if (hasStatusCol) pairs.push(`'status', "status"`);
          if (hasSlugCol) pairs.push(`'slug', "slug"`);
          for (const name of matCols) {
            pairs.push(`'${name}', "${name}"`);
          }
          const materialized = `jsonb_build_object(${pairs.join(", ")})`;
          doc = `(CASE WHEN "data" IS NULL OR "data" = '{}'::jsonb THEN ${materialized} ELSE ("data" || ${materialized}) END)`;
        }

        const subSelect = `SELECT ${doc} AS doc, ${updatedAtSelect} AS updated_at FROM ${safeTable}`;
        const wrap = (wherePart: string, limitIdx: number, offsetIdx: number) => `
          SELECT coalesce(jsonb_agg(sub.doc), '[]'::jsonb)::text AS wire_body,
                 coalesce(max(sub.updated_at), 0)::text AS max_updated_at
          FROM (${subSelect} ${wherePart ? `WHERE ${wherePart}` : ""} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}) sub
        `;

        const hasDel = !!executor.getColumn(table, "isDeleted");
        const delOnly = hasDel ? `"isDeleted" = false` : "";
        const delAnd = hasDel ? ` AND "isDeleted" = false` : "";
        const andDel = (s: string) => (s ? `${s}${delAnd}` : delOnly);

        cachedWireSql = {
          base: wrap(andDel(""), 1, 2),
          tenant: wrap(andDel(`"tenantId" = $1`), 2, 3),
          basePub: hasStatusCol ? wrap(andDel(`"status" IN ('publish', 'published')`), 1, 2) : null,
          tenantPub: hasStatusCol
            ? wrap(andDel(`"status" IN ('publish', 'published') AND "tenantId" = $1`), 2, 3)
            : null,
          tenantNull: wrap(andDel(`"tenantId" IS NULL`), 1, 2),
          tenantPubNull: hasStatusCol
            ? wrap(andDel(`"status" IN ('publish', 'published') AND "tenantId" IS NULL`), 1, 2)
            : null,
        };
        tableCache.set(cacheKey, cachedWireSql);
      }

      const tenantClause = buildRawTenantClause(options, "postgres", { paramIndex: 1 });
      const hasTenantParam = tenantClause.params.length > 0;
      const hasTenantClause = tenantClause.sql !== "";
      const wantPublished = options?.requirePublished === true;
      if (wantPublished && !cachedWireSql.basePub) return { kind: "declined" };

      let sqlText: string;
      let params: unknown[];
      if (hasTenantClause) {
        if (hasTenantParam) {
          sqlText = wantPublished ? cachedWireSql.tenantPub! : cachedWireSql.tenant;
          params = [tenantClause.params[0], limit, offset];
        } else {
          sqlText = wantPublished ? cachedWireSql.tenantPubNull! : cachedWireSql.tenantNull;
          params = [limit, offset];
        }
      } else {
        sqlText = wantPublished ? cachedWireSql.basePub! : cachedWireSql.base;
        params = [limit, offset];
      }

      const rows = (await exec.unsafe(sqlText, params, { prepare: true })) as Array<{
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
        `[Postgres rawFindListWireStream] falling back: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { kind: "declined" };
    }
  }
}
