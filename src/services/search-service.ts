/**
 * @file src/services/search-service.ts
 * @description Database-agnostic full-text search service.
 *
 * Thin orchestrator that delegates to the database adapter's IFtsAdapter.
 * Falls back to universal LIKE-based pattern matching when no FTS adapter is available.
 *
 * Features:
 * - delegates to adapter.fts.search() for native FTS
 * - universal ILIKE/LIKE fallback across all DBs
 * - formatted SearchResponse with highlights support
 */

import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import { logger } from "@utils/logger";

/** FTS search options */
export interface SearchOptions {
  /** Columns to search with optional weight (A-D) */
  columns?: Array<{ name: string; weight?: "A" | "B" | "C" | "D" }>;
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Tenant scope filter */
  tenantId?: string | null;
  /** Additional filters */
  filters?: Record<string, unknown>;
  /** Locale for language-specific tokenization */
  language?: string;
  /** Minimum similarity threshold (0.0-1.0) */
  minSimilarity?: number;
  /** Whether to return highlight snippets */
  withHighlights?: boolean;
  /** Field to sort by */
  sortField?: string;
  /** Sort direction */
  sortDirection?: "asc" | "desc";
}

/** A single search result */
export interface SearchResultItem {
  _id: string;
  title?: string;
  content?: string;
  description?: string;
  highlights?: Record<string, string[]>;
  relevance?: number;
  [key: string]: unknown;
}

/** Search response */
export interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  highlights: Record<string, string[]>;
  query: string;
  dbType: string;
}

/**
 * Database-agnostic full-text search service.
 * Delegates to adapter-specific IFtsAdapter when available,
 * falling back to universal LIKE-based pattern matching.
 */
export class SearchService {
  /**
   * Searches a collection for the given query across weighted columns.
   * Delegates to the database adapter's FTS adapter if available,
   * otherwise uses LIKE-based fallback.
   */
  async search(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      return {
        items: [],
        total: 0,
        highlights: {},
        query: "",
        dbType: "unknown",
      };
    }

    const trimmedQuery = query.trim();
    const dbType = this.detectDbType();

    // Use the adapter's FTS implementation if available
    const fts = dbAdapterInstance?.fts;

    if (fts) {
      try {
        const result = await fts.search(collection, trimmedQuery, {
          columns: options?.columns,
          limit: options?.limit,
          offset: options?.offset,
          tenantId: options?.tenantId as any,
          language: options?.language,
          filters: options?.filters,
        });

        if (result.success && result.data) {
          return {
            items: result.data.items as SearchResultItem[],
            total: result.data.total,
            highlights: {},
            query: trimmedQuery,
            dbType,
          };
        }
      } catch (err) {
        logger.error("[SearchService] FTS adapter failed, falling back to LIKE", err);
      }
    }

    // Universal LIKE-based fallback
    try {
      return this.searchFallback(collection, trimmedQuery, options);
    } catch (err) {
      logger.error("[SearchService] LIKE fallback failed", err);
      return {
        items: [],
        total: 0,
        highlights: {},
        query: trimmedQuery,
        dbType,
      };
    }
  }

  /**
   * Fallback search using ILIKE/LIKE pattern matching for databases without FTS.
   */
  private async searchFallback(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!dbAdapterInstance) return this.emptyResponse(query);

    const columns = options?.columns?.map((c) => c.name) ?? ["title", "content", "description"];
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const escapedQuery = query.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const likePattern = `%${escapedQuery}%`;

    const orConditions = columns.map((col) => `"${col}" ILIKE '%${likePattern}%'`).join(" OR ");

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
      dbAdapterInstance.crud.find(collection, {} as any, { rawSql: true, sql: rawSQL } as any),
      dbAdapterInstance.crud.find(collection, {} as any, { rawSql: true, sql: countSQL } as any),
    ]);

    return this.formatResponse(dataResult, countResult, query, "fallback");
  }

  /**
   * Detects the current database backend type.
   */
  private detectDbType(): string {
    if (!dbAdapterInstance) return "unknown";

    const adapterName = (dbAdapterInstance.constructor?.name ?? "").toLowerCase();

    if (adapterName.includes("postgres") || adapterName.includes("pg")) return "postgresql";
    if (adapterName.includes("mariadb") || adapterName.includes("mysql")) return "mariadb";
    if (adapterName.includes("sqlite")) return "sqlite";
    if (adapterName.includes("mongo")) return "mongodb";

    return "unknown";
  }

  /**
   * Builds WHERE clause fragments from additional filters.
   */
  private buildFilterSQL(options?: SearchOptions): string {
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

  /**
   * Formats raw database results into a SearchResponse.
   */
  private formatResponse(
    dataResult: any,
    countResult: any,
    query: string,
    dbType: string,
  ): SearchResponse {
    const items: SearchResultItem[] = [];

    if (dataResult?.success && dataResult.data) {
      for (const row of dataResult.data) {
        items.push(row as SearchResultItem);
      }
    }

    let total = items.length;
    if (countResult?.success && countResult.data?.length > 0) {
      total = Number(countResult.data[0]?.total ?? total);
    }

    return { items, total, highlights: {}, query, dbType };
  }

  /**
   * Returns an empty search response.
   */
  private emptyResponse(query: string): SearchResponse {
    return { items: [], total: 0, highlights: {}, query, dbType: "unknown" };
  }

  /**
   * Returns FTS index creation SQL for each database backend.
   * Use these during migrations to set up full-text search capability.
   */
  static getFtsMigrationSQL(collection: string, columns: string[]): Record<string, string[]> {
    const sql: Record<string, string[]> = {};

    // PostgreSQL: GIN index on tsvector
    const pgColumns = columns.map((c) => `coalesce("${c}", '')`).join(" || ' ' || ");
    sql.postgresql = [
      `CREATE INDEX IF NOT EXISTS "${collection}_fts_idx" ON "${collection}" USING GIN (to_tsvector('english', ${pgColumns}));`,
    ];

    // MariaDB: FULLTEXT index
    const mysqlCols = columns.map((c) => `\`${c}\``).join(", ");
    sql.mariadb = [
      `CREATE FULLTEXT INDEX IF NOT EXISTS \`${collection}_fts_idx\` ON \`${collection}\` (${mysqlCols});`,
    ];

    // SQLite: FTS5 virtual table
    const sqliteCols = columns.join(", ");
    sql.sqlite = [
      `CREATE VIRTUAL TABLE IF NOT EXISTS "${collection}_fts" USING fts5(${sqliteCols}, content='${collection}', content_rowid='_id');`,
      `CREATE TRIGGER IF NOT EXISTS "${collection}_ai" AFTER INSERT ON "${collection}" BEGIN
        INSERT INTO "${collection}_fts"(rowid, ${sqliteCols}) VALUES (new._id, ${columns.map((c) => `new."${c}"`).join(", ")});
      END;`,
      `CREATE TRIGGER IF NOT EXISTS "${collection}_ad" AFTER DELETE ON "${collection}" BEGIN
        INSERT INTO "${collection}_fts"("${collection}_fts", rowid, ${sqliteCols}) VALUES('delete', old._id, ${columns.map((c) => `old."${c}"`).join(", ")});
      END;`,
      `CREATE TRIGGER IF NOT EXISTS "${collection}_au" AFTER UPDATE ON "${collection}" BEGIN
        INSERT INTO "${collection}_fts"("${collection}_fts", rowid, ${sqliteCols}) VALUES('delete', old._id, ${columns.map((c) => `old."${c}"`).join(", ")});
        INSERT INTO "${collection}_fts"(rowid, ${sqliteCols}) VALUES (new._id, ${columns.map((c) => `new."${c}"`).join(", ")});
      END;`,
    ];

    // MongoDB: $text index
    const mongoWeights: Record<string, string> = {};
    columns.forEach((c, i) => {
      mongoWeights[c] = i === 0 ? "title" : "content";
    });
    sql.mongodb = [
      `db.${collection}.createIndex({ ${columns.map((c) => `"${c}": "text"`).join(", ")} }, { name: "${collection}_fts_idx", weights: ${JSON.stringify(mongoWeights)} });`,
    ];

    return sql;
  }
}

export const searchService = new SearchService();
