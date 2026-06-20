/**
 * @file src/databases/mariadb/fts-adapter.ts
 * @description
 * MariaDB Full-Text Search adapter using MATCH...AGAINST with FULLTEXT index.
 *
 * Features:
 * - boolean mode MATCH...AGAINST queries
 * - LIKE fallback when FULLTEXT index is unavailable
 */

import type { IFtsAdapter, DatabaseResult } from "../db-interface";
import type { IDBAdapter } from "../db-interface";

export class MariaDBFtsAdapter implements IFtsAdapter {
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
      { name: "title" },
      { name: "content" },
      { name: "description" },
    ];

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    try {
      return await this.searchWithMatch(collection, query, columns, limit, offset, options);
    } catch {
      return this.searchWithLike(collection, query, columns, limit, offset, options);
    }
  }

  private async searchWithMatch(
    collection: string,
    query: string,
    columns: Array<{ name: string }>,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const columnNames = columns.map((c) => `\`${c.name}\``).join(", ");
    const filterSQL = this.buildFilterSQL(options);

    const matchExpr = `MATCH(${columnNames}) AGAINST('${query.replace(/'/g, "''")}' IN BOOLEAN MODE)`;

    const rawSQL = `
      SELECT *, ${matchExpr} AS relevance
      FROM \`${collection}\`
      WHERE ${matchExpr}
      ${filterSQL}
      ORDER BY relevance DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSQL = `
      SELECT COUNT(*) AS total
      FROM \`${collection}\`
      WHERE ${matchExpr}
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

  private async searchWithLike(
    collection: string,
    query: string,
    columns: Array<{ name: string }>,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const colNames = columns.map((c) => c.name);
    const escapedQuery = query
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "''")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const orConditions = colNames.map((col) => `\`${col}\` LIKE '%${escapedQuery}%'`).join(" OR ");
    const filterSQL = this.buildFilterSQL(options);

    const rawSQL = `
      SELECT *, 0.5 AS relevance
      FROM \`${collection}\`
      WHERE (${orConditions})
      ${filterSQL}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSQL = `
      SELECT COUNT(*) AS total
      FROM \`${collection}\`
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
      conditions.push(`\`tenantId\` = '${options.tenantId.replace(/'/g, "''")}'`);
    }

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null) {
          const strVal = String(value).replace(/'/g, "''");
          conditions.push(`\`${key}\` = '${strVal}'`);
        }
      }
    }

    return conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  }
}
