/**
 * @file src/databases/postgresql/fts-adapter.ts
 * @description
 * PostgreSQL Full-Text Search adapter using tsvector/tsquery with weighted columns.
 *
 * Features:
 * - ts_rank relevance scoring with column weights (A, B, C, D)
 * - prefix-matching via tsquery wildcard terms
 * - ILIKE fallback when tsvector GIN index is unavailable
 */

import type { IFtsAdapter, DatabaseResult } from "../db-interface";
import type { IDBAdapter } from "../db-interface";

export class PostgresFtsAdapter implements IFtsAdapter {
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
    const columns = options?.columns ?? [
      { name: "title", weight: "A" },
      { name: "content", weight: "B" },
      { name: "description", weight: "C" },
    ];

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const language = options?.language ?? "english";

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
    } catch {
      return this.searchWithILike(collection, query, columns, limit, offset, options);
    }
  }

  private async searchWithTsVector(
    collection: string,
    query: string,
    columns: Array<{ name: string; weight?: "A" | "B" | "C" | "D" }>,
    limit: number,
    offset: number,
    language: string,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const weightParts = columns
      .filter((col) => col.weight)
      .map(
        (col) =>
          `setweight(to_tsvector('${language}', coalesce("${col.name}", '')), '${col.weight}')`,
      );
    const tsvectorExpr = weightParts.join(" || ");

    const tsqueryTerms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `${term}:*`)
      .join(" & ");
    const tsquery = `to_tsquery('${language}', '${tsqueryTerms.replace(/'/g, "''")}')`;

    const filterSQL = this.buildFilterSQL(options);

    const rawSQL = `
      SELECT *, ts_rank(${tsvectorExpr}, ${tsquery}) AS relevance
      FROM "${collection}"
      WHERE ${tsvectorExpr} @@ ${tsquery}
      ${filterSQL}
      ORDER BY relevance DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSQL = `
      SELECT COUNT(*) AS total
      FROM "${collection}"
      WHERE ${tsvectorExpr} @@ ${tsquery}
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

  private async searchWithILike(
    collection: string,
    query: string,
    columns: Array<{ name: string; weight?: string }>,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const colNames = columns.map((c) => c.name);
    const escapedQuery = query.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const orConditions = colNames.map((col) => `"${col}" ILIKE '%${escapedQuery}%'`).join(" OR ");
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
