/**
 * @file src/databases/sqlite/fts-adapter.ts
 * @description
 * SQLite Full-Text Search adapter using FTS5 virtual tables.
 *
 * Features:
 * - FTS5 MATCH queries with BM25 relevance scoring
 * - LIKE fallback when FTS5 virtual table is not configured
 */

import type { IFtsAdapter, DatabaseResult } from "../db-interface";
import type { IDBAdapter } from "../db-interface";
import { logger } from "@utils/logger";

export class SQLiteFtsAdapter implements IFtsAdapter {
  private adapter: IDBAdapter;

  constructor(adapter: IDBAdapter) {
    this.adapter = adapter;
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
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    try {
      return await this.searchWithFts5(collection, query, limit, offset, options);
    } catch {
      logger.debug("[SQLiteFtsAdapter] FTS5 not available, falling back to LIKE");
      return this.searchWithLike(collection, query, options?.columns, limit, offset, options);
    }
  }

  private async searchWithFts5(
    collection: string,
    query: string,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const ftsTable = `${collection}_fts`;
    const ftsQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"`)
      .join(" AND ");

    const filterSQL = this.buildFilterSQL(options);

    const rawSQL = `
      SELECT c.*, bm25(${ftsTable}) AS relevance
      FROM "${ftsTable}" fts
      JOIN "${collection}" c ON c._id = fts.rowid
      WHERE ${ftsTable} MATCH '${ftsQuery.replace(/'/g, "''")}'
      ${filterSQL}
      ORDER BY relevance
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await this.adapter.crud.find(
      collection,
      {} as any,
      { rawSql: true, sql: rawSQL } as any,
    );

    const items: any[] = [];
    if (result?.success && result.data) {
      for (const row of result.data) {
        items.push(row);
      }
    }

    return { success: true, data: { items, total: items.length } };
  }

  private async searchWithLike(
    collection: string,
    query: string,
    columns: Array<{ name: string; weight?: string }> | undefined,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const colNames = columns?.map((c) => c.name) ?? ["title", "content", "description"];
    const escapedQuery = query.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const orConditions = colNames.map((col) => `"${col}" LIKE '%${escapedQuery}%'`).join(" OR ");
    const filterSQL = this.buildFilterSQL(options);

    const rawSQL = `
      SELECT *, 0.5 AS relevance
      FROM "${collection}"
      WHERE (${orConditions})
      ${filterSQL}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSQL = `
      SELECT COUNT(*) AS total
      FROM "${collection}"
      WHERE (${orConditions})
      ${filterSQL}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.adapter.crud.find(collection, {} as any, { rawSql: true, sql: rawSQL } as any),
      this.adapter.crud.find(collection, {} as any, { rawSql: true, sql: countSQL } as any),
    ]);

    const items: any[] = [];
    if (dataResult?.success && dataResult.data) {
      for (const row of dataResult.data) {
        items.push(row);
      }
    }

    let total = items.length;
    if (countResult?.success && countResult.data?.length > 0) {
      total = Number((countResult.data[0] as any)?.total ?? total);
    }

    return { success: true, data: { items, total } };
  }

  private buildFilterSQL(options?: {
    tenantId?: string | null;
    filters?: Record<string, unknown>;
  }): string {
    const conditions: string[] = [];

    if (options?.tenantId) {
      conditions.push(`"tenantId" = '${options.tenantId.replace(/'/g, "''")}'`);
    }

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null) {
          const strVal = String(value).replace(/'/g, "''");
          conditions.push(`"${key}" = '${strVal}'`);
        }
      }
    }

    return conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  }
}
