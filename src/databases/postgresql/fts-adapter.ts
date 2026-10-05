/**
 * @file src/databases/postgresql/fts-adapter.ts
 * @description
 * PostgreSQL Full-Text Search adapter using generated tsvector columns,
 * GIN indexes, and websearch/prefix tsquery parsing with weighted relevance ranking.
 *
 * Features:
 * - Provisioned `fts tsvector` generated column combining physical columns and `data->>'field'`
 * - GIN index acceleration with bitmap index scans
 * - Single-scan execution returning items, ts_rank relevance, and `count(*) OVER ()` total
 * - Safe parameterized query parsing: `websearch_to_tsquery` and sanitized prefix `to_tsquery`
 * - Strict regconfig allow-list preventing language injection
 * - Tenant isolation via `buildRawTenantClause` and soft-delete filtering
 * - Parameterized ILIKE fallback with wildcard escaping restricted to missing column/table errors
 */

import type { IFtsAdapter, DatabaseResult, BaseQueryOptions } from "../db-interface";
import type { IDBAdapter } from "../db-interface";
import postgres from "postgres";
import { logger } from "@utils/logger";
import { assertSafeSqlIdentifier, buildRawTenantClause } from "../core/relational-utils";
import { normalizeCollectionTableName } from "../core/collection-name";
import { getTableName } from "drizzle-orm";
import { pgSafeIndexName } from "./adapter-core";

const ALLOWED_LANGUAGES = new Set([
  "danish",
  "dutch",
  "english",
  "finnish",
  "french",
  "german",
  "hungarian",
  "italian",
  "norwegian",
  "portuguese",
  "romanian",
  "russian",
  "simple",
  "spanish",
  "swedish",
  "turkish",
]);

export class PostgresFtsAdapter implements IFtsAdapter {
  private adapter: IDBAdapter;
  private _provisionedTables = new Set<string>();
  private _tsvectorCache = new Map<string, string>();

  constructor(adapter: IDBAdapter) {
    this.adapter = adapter;
  }

  private _resolveLanguage(lang?: string): string {
    const candidate = String(lang || "english").toLowerCase();
    return ALLOWED_LANGUAGES.has(candidate) ? candidate : "english";
  }

  private _getTsVectorExpr(
    table: any,
    columns: Array<{ name: string; weight?: "A" | "B" | "C" | "D" }>,
    language: string,
  ): string {
    const core = this.adapter as any;
    const normalizedCols = columns.map((c) => ({
      name: c.name,
      weight: c.weight ?? "D",
    }));
    const key = `${language}:${normalizedCols.map((c) => `${c.name}:${c.weight}`).join(",")}`;
    let expr = this._tsvectorCache.get(key);
    if (!expr) {
      const weightParts = normalizedCols.map((col) => {
        const safeCol = assertSafeSqlIdentifier(col.name, "column");
        const hasPhys = Boolean(core.getColumn ? core.getColumn(table, col.name) : false);
        return hasPhys
          ? `setweight(to_tsvector('${language}'::regconfig, coalesce("${safeCol}", data->>'${safeCol}', '')), '${col.weight}')`
          : `setweight(to_tsvector('${language}'::regconfig, coalesce(data->>'${safeCol}', '')), '${col.weight}')`;
      });
      expr = weightParts.join(" || ");
      this._tsvectorCache.set(key, expr);
    }
    return expr;
  }

  private async ensureFtsProvisioned(
    tableName: string,
    safeTable: string,
    _table: any,
    columns: Array<{ name: string; weight: "A" | "B" | "C" | "D" }>,
    language: string,
  ): Promise<boolean> {
    if (this._provisionedTables.has(safeTable)) return true;
    const core = this.adapter as any;
    if (!core?.sql) return false;

    let client: ReturnType<typeof postgres> | null = null;
    let indexName: string | null = null;
    try {
      // Query existing physical columns to check for fts, data, and materialized columns
      const existingCols = await core.sql.unsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tableName],
      );
      if (!Array.isArray(existingCols) || existingCols.length === 0) {
        return false;
      }

      const colSet = new Set<string>(existingCols.map((r: any) => String(r.column_name)));
      if (colSet.has("fts")) {
        this._provisionedTables.add(safeTable);
        return true;
      }

      const hasDataCol = colSet.has("data");

      // Build generated column expression skipping fields that exist in neither columns nor data
      const weightExprs: string[] = [];
      for (const col of columns) {
        const hasPhys = colSet.has(col.name);
        if (!hasPhys && !hasDataCol) {
          // A generated column cannot be added if neither exists. Check information_schema and skip that weight.
          continue;
        }
        const safeCol = assertSafeSqlIdentifier(col.name, "column");
        const weight = col.weight ?? "D";
        if (hasPhys && hasDataCol) {
          weightExprs.push(
            `setweight(to_tsvector('${language}'::regconfig, coalesce("${safeCol}", data->>'${safeCol}', '')), '${weight}')`,
          );
        } else if (hasPhys) {
          weightExprs.push(
            `setweight(to_tsvector('${language}'::regconfig, coalesce("${safeCol}", '')), '${weight}')`,
          );
        } else {
          weightExprs.push(
            `setweight(to_tsvector('${language}'::regconfig, coalesce(data->>'${safeCol}', '')), '${weight}')`,
          );
        }
      }

      if (weightExprs.length === 0) return false;

      const genExpr = weightExprs.join(" || ");
      await core.sql.unsafe(
        `ALTER TABLE "${safeTable}" ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (${genExpr}) STORED`,
      );

      const rawIndexName = `${tableName}_fts_idx`;
      indexName = assertSafeSqlIdentifier(pgSafeIndexName(rawIndexName), "index");

      // Build GIN index concurrently on existing populated tables without holding pool connections
      if (core._rawConnectionConfig && typeof postgres === "function") {
        client = postgres(core._rawConnectionConfig.finalConnection, {
          ...core._rawConnectionConfig.options,
          max: 1,
          idle_timeout: 10,
        });
      }
      const exec = client ?? core.sql;
      try {
        await exec.unsafe("SET statement_timeout = 0");
      } catch {}
      await exec.unsafe(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "${safeTable}" USING gin (fts)`,
      );
      try {
        await exec.unsafe(`ANALYZE "${safeTable}"`);
      } catch {}

      this._provisionedTables.add(safeTable);
      return true;
    } catch (err) {
      if (indexName) {
        const cleanupExec = client ?? core.sql;
        if (cleanupExec) {
          try {
            await cleanupExec.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
          } catch {}
        }
      }
      logger.debug(
        `[PostgresFtsAdapter] Could not provision stored fts column on ${safeTable}:`,
        err,
      );
      return false;
    } finally {
      if (client) {
        try {
          await client.end();
        } catch {}
      }
    }
  }

  async search(
    collection: string,
    query: string,
    options?: {
      columns?: Array<{ name: string; weight?: "A" | "B" | "C" | "D" }>;
      limit?: number;
      offset?: number;
      tenantId?: string | null;
      language?: string;
      filters?: Record<string, unknown>;
    },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    if (!query || !query.trim()) {
      return { success: true, data: { items: [], total: 0 } };
    }

    const columns: Array<{ name: string; weight: "A" | "B" | "C" | "D" }> = (
      options?.columns ?? [
        { name: "title", weight: "A" },
        { name: "content", weight: "B" },
        { name: "description", weight: "C" },
      ]
    ).map((c) => ({
      name: c.name,
      weight: c.weight ?? "D",
    }));

    const limit = Math.max(
      1,
      Math.min(1000, Number.isInteger(options?.limit) ? (options!.limit as number) : 50),
    );
    const offset = Math.max(0, Number.isInteger(options?.offset) ? (options!.offset as number) : 0);
    const language = this._resolveLanguage(options?.language);

    try {
      return await this.searchWithTsVector(
        collection,
        query,
        columns,
        limit,
        offset,
        language,
        options,
      );
    } catch (err: any) {
      // Fall back to ILIKE ONLY for missing column (42703) or missing table (42P01)
      if (err?.code === "42703" || err?.code === "42P01") {
        logger.debug(
          `[PostgresFtsAdapter] Falling back to ILIKE for ${collection} (${err.code}):`,
          err.message,
        );
        return this.searchWithILike(collection, query, columns, limit, offset, options);
      }
      logger.debug(`[PostgresFtsAdapter] Search error for ${collection}:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: errMsg,
        error: {
          code: (err as any)?.code ?? "FTS_SEARCH_FAILED",
          message: errMsg,
        },
      };
    }
  }

  private async searchWithTsVector(
    collection: string,
    query: string,
    columns: Array<{ name: string; weight: "A" | "B" | "C" | "D" }>,
    limit: number,
    offset: number,
    language: string,
    options?: {
      tenantId?: string | null;
      filters?: Record<string, unknown>;
    },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const core = this.adapter as any;
    if (!core?.sql) {
      throw new Error("[PostgresFtsAdapter] Database client not connected");
    }

    const table = core.getTable ? core.getTable(collection) : null;
    const tableName = table ? getTableName(table) : normalizeCollectionTableName(collection);
    const safeTable = assertSafeSqlIdentifier(tableName, "table");

    // Ensure stored tsvector column and GIN index exist
    const isProvisioned = await this.ensureFtsProvisioned(
      tableName,
      safeTable,
      table,
      columns,
      language,
    );

    // Build query representation:
    // If query has quotes or boolean operators, use websearch_to_tsquery.
    // Otherwise sanitize alphanumeric tokens and build prefix query with to_tsquery.
    const hasSpecialOperators = /["-]|\bor\b/i.test(query);
    let tsqueryFn: string;
    let queryParam: string;

    if (hasSpecialOperators) {
      tsqueryFn = "websearch_to_tsquery";
      queryParam = query.trim();
    } else {
      const tokens = query.match(/[\p{L}\p{N}]+/gu);
      if (!tokens || tokens.length === 0) {
        return { success: true, data: { items: [], total: 0 } };
      }
      tsqueryFn = "to_tsquery";
      queryParam = tokens.map((t) => `${t}:*`).join(" & ");
    }

    const params: unknown[] = [language, queryParam];

    // Tenant clause via centralized helper
    const tenantOptions: BaseQueryOptions = {
      tenantId: options?.tenantId ?? core.currentTenantId,
    };
    const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(
      tenantOptions,
      "postgres",
      { paramIndex: params.length + 1 },
    );
    params.push(...tenantParams);

    // Soft-delete filter
    const hasIsDeleted = Boolean(core.getColumn ? core.getColumn(table, "isDeleted") : true);
    const isDeletedSql = hasIsDeleted ? ` AND t."isDeleted" = false` : "";

    // Additional structured filters
    const filterClauses: string[] = [];
    if (options?.filters) {
      for (const key of Object.keys(options.filters)) {
        const val = options.filters[key];
        if (val === undefined || val === null) continue;
        const safeKey = assertSafeSqlIdentifier(key, "column");
        params.push(val);
        const paramIdx = params.length;
        const hasCol = Boolean(core.getColumn ? core.getColumn(table, key) : false);
        if (hasCol) {
          filterClauses.push(`t."${safeKey}" = $${paramIdx}`);
        } else {
          filterClauses.push(`t."data"->>'${safeKey}' = $${paramIdx}::text`);
        }
      }
    }
    const filterSql = filterClauses.length > 0 ? ` AND ${filterClauses.join(" AND ")}` : "";

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    let rawSql: string;
    if (isProvisioned) {
      // 🚀 Fast stored GIN index path: single scan with relevance + count(*) OVER ()
      rawSql = `
        SELECT t.*, ts_rank(t.fts, q) AS relevance, count(*) OVER () AS total
        FROM "${safeTable}" AS t, ${tsqueryFn}($1::regconfig, $2) q
        WHERE t.fts @@ q
          ${tenantSql}
          ${isDeletedSql}
          ${filterSql}
        ORDER BY relevance DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
    } else {
      // Dynamic on-the-fly tsvector path
      const onTheFlyExpr = this._getTsVectorExpr(table, columns, language);
      rawSql = `
        SELECT t.*, ts_rank(${onTheFlyExpr}, q) AS relevance, count(*) OVER () AS total
        FROM "${safeTable}" AS t, ${tsqueryFn}($1::regconfig, $2) q
        WHERE (${onTheFlyExpr}) @@ q
          ${tenantSql}
          ${isDeletedSql}
          ${filterSql}
        ORDER BY relevance DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
    }

    const rows = await core.sql.unsafe(rawSql, params, { prepare: true });
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: true, data: { items: [], total: 0 } };
    }

    const total = Number(rows[0]?.total ?? rows.length);
    const items = rows.map((r: any) => {
      const { relevance: _r, total: _t, fts: _f, q: _q, ...entity } = r;
      return entity;
    });

    const normalized = core.convertArrayDatesToISO
      ? core.convertArrayDatesToISO(items, {
          ...core.convertDatesOptions,
          table: collection,
        })
      : items;

    return { success: true, data: { items: normalized, total } };
  }

  private async searchWithILike(
    collection: string,
    query: string,
    columns: Array<{ name: string; weight?: string }>,
    limit: number,
    offset: number,
    options?: {
      tenantId?: string | null;
      filters?: Record<string, unknown>;
    },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const core = this.adapter as any;
    if (!core?.sql) {
      throw new Error("[PostgresFtsAdapter] Database client not connected");
    }

    const table = core.getTable ? core.getTable(collection) : null;
    const tableName = table ? getTableName(table) : normalizeCollectionTableName(collection);
    const safeTable = assertSafeSqlIdentifier(tableName, "table");

    // Parameterize search pattern with explicit wildcard escaping
    const escapedPattern = `%${query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const params: unknown[] = [escapedPattern];

    const orClauses: string[] = [];
    for (const col of columns) {
      const safeCol = assertSafeSqlIdentifier(col.name, "column");
      const hasCol = Boolean(core.getColumn ? core.getColumn(table, col.name) : false);
      if (hasCol) {
        orClauses.push(`t."${safeCol}"::text ILIKE $1 ESCAPE '\\'`);
      } else {
        orClauses.push(`(t."data"->>'${safeCol}') ILIKE $1 ESCAPE '\\'`);
      }
    }

    const whereOr = orClauses.length > 0 ? `(${orClauses.join(" OR ")})` : "TRUE";

    // Tenant filter
    const tenantOptions: BaseQueryOptions = {
      tenantId: options?.tenantId ?? core.currentTenantId,
    };
    const { sql: tenantSql, params: tenantParams } = buildRawTenantClause(
      tenantOptions,
      "postgres",
      { paramIndex: params.length + 1 },
    );
    params.push(...tenantParams);

    // Soft-delete filter
    const hasIsDeleted = Boolean(core.getColumn ? core.getColumn(table, "isDeleted") : true);
    const isDeletedSql = hasIsDeleted ? ` AND t."isDeleted" = false` : "";

    // Additional filters
    const filterClauses: string[] = [];
    if (options?.filters) {
      for (const key of Object.keys(options.filters)) {
        const val = options.filters[key];
        if (val === undefined || val === null) continue;
        const safeKey = assertSafeSqlIdentifier(key, "column");
        params.push(val);
        const paramIdx = params.length;
        const hasCol = Boolean(core.getColumn ? core.getColumn(table, key) : false);
        if (hasCol) {
          filterClauses.push(`t."${safeKey}" = $${paramIdx}`);
        } else {
          filterClauses.push(`t."data"->>'${safeKey}' = $${paramIdx}::text`);
        }
      }
    }
    const filterSql = filterClauses.length > 0 ? ` AND ${filterClauses.join(" AND ")}` : "";

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const rawSql = `
      SELECT t.*, 0.5 AS relevance, count(*) OVER () AS total
      FROM "${safeTable}" AS t
      WHERE ${whereOr}
        ${tenantSql}
        ${isDeletedSql}
        ${filterSql}
      ORDER BY t."_id" DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const rows = await core.sql.unsafe(rawSql, params, { prepare: true });
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: true, data: { items: [], total: 0 } };
    }

    const total = Number(rows[0]?.total ?? rows.length);
    const items = rows.map((r: any) => {
      const { relevance: _r, total: _t, ...entity } = r;
      return entity;
    });

    const normalized = core.convertArrayDatesToISO
      ? core.convertArrayDatesToISO(items, {
          ...core.convertDatesOptions,
          table: collection,
        })
      : items;

    return { success: true, data: { items: normalized, total } };
  }
}
