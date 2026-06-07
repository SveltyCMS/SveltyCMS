/**
 * @file src/services/search-service.ts
 * @description Database-agnostic full-text search service with weighted column support.
 *
 * Provides a unified search interface across all four supported database backends:
 * - PostgreSQL: tsvector/tsquery with weighted columns (A, B, C)
 * - MariaDB: MATCH...AGAINST with FULLTEXT index
 * - SQLite: FTS5 virtual tables
 * - MongoDB: $text index with field weights
 *
 * Falls back to ILIKE/LIKE pattern matching when FTS is not configured.
 *
 * Features:
 * - weighted column search (title:A, content:B, description:C)
 * - database-agnostic abstract interface
 * - per-DB FTS index migration SQL
 * - highlight-aware result formatting
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
 */
export class SearchService {
  /**
   * Searches a collection for the given query across weighted columns.
   * Automatically detects the database backend and uses its native FTS capabilities.
   */
  async search(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      return { items: [], total: 0, highlights: {}, query: "", dbType: "unknown" };
    }

    const trimmedQuery = query.trim();
    const dbType = this.detectDbType();

    try {
      switch (dbType) {
        case "postgresql":
          return this.searchPostgres(collection, trimmedQuery, options);
        case "mariadb":
          return this.searchMariaDB(collection, trimmedQuery, options);
        case "sqlite":
          return this.searchSQLite(collection, trimmedQuery, options);
        case "mongodb":
          return this.searchMongoDB(collection, trimmedQuery, options);
        default:
          return this.searchFallback(collection, trimmedQuery, options);
      }
    } catch (err) {
      logger.error("[SearchService] Search failed, falling back to LIKE", err);
      return this.searchFallback(collection, trimmedQuery, options);
    }
  }

  /**
   * PostgreSQL full-text search using tsvector/tsquery with weighted columns.
   * Weights: A (high), B (medium), C (low), D (lowest).
   */
  private async searchPostgres(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!dbAdapterInstance) return this.emptyResponse(query);

    const columns = options?.columns ?? [
      { name: "title", weight: "A" },
      { name: "content", weight: "B" },
      { name: "description", weight: "C" },
    ];

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const language = options?.language ?? "english";

    // Build tsvector expression with weights
    const weightParts = columns
      .filter((col) => col.weight)
      .map(
        (col) =>
          `setweight(to_tsvector('${language}', coalesce("${col.name}", '')), '${col.weight}')`,
      );
    const tsvectorExpr = weightParts.join(" || ");

    // Build tsquery from user input — prefix matching for partial terms
    const tsqueryTerms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `${term}:*`)
      .join(" & ");
    const tsquery = `to_tsquery('${language}', '${tsqueryTerms.replace(/'/g, "''")}')`;

    const filterSQL = this.buildFilterSQL(options);

    // Use raw SQL via the adapter's find method
    const rawSQL = `
      SELECT
        *,
        ts_rank(${tsvectorExpr}, ${tsquery}) AS relevance
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
      dbAdapterInstance.crud.find(collection, {} as any, { rawSql: true, sql: rawSQL } as any),
      dbAdapterInstance.crud.find(collection, {} as any, { rawSql: true, sql: countSQL } as any),
    ]);

    return this.formatResponse(dataResult, countResult, query, "postgresql");
  }

  /**
   * MariaDB full-text search using MATCH...AGAINST with FULLTEXT index.
   */
  private async searchMariaDB(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!dbAdapterInstance) return this.emptyResponse(query);

    const columns = options?.columns ?? [
      { name: "title" },
      { name: "content" },
      { name: "description" },
    ];

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const columnNames = columns.map((c) => `\`${c.name}\``).join(", ");
    const filterSQL = this.buildFilterSQL(options, "mysql");

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
      dbAdapterInstance.crud.find(collection, {} as any, { rawSql: true, sql: rawSQL } as any),
      dbAdapterInstance.crud.find(collection, {} as any, { rawSql: true, sql: countSQL } as any),
    ]);

    return this.formatResponse(dataResult, countResult, query, "mariadb");
  }

  /**
   * SQLite full-text search using FTS5 virtual tables.
   * Falls back to LIKE if FTS5 virtual table is not configured.
   */
  private async searchSQLite(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!dbAdapterInstance) return this.emptyResponse(query);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    try {
      // Try FTS5 first: lookup from <collection>_fts virtual table
      const ftsTable = `${collection}_fts`;
      const ftsQuery = query
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t.replace(/"/g, '""')}"`)
        .join(" AND ");

      const rawSQL = `
        SELECT c.*, bm25(${ftsTable}) AS relevance
        FROM "${ftsTable}" fts
        JOIN "${collection}" c ON c._id = fts.rowid
        WHERE ${ftsTable} MATCH '${ftsQuery.replace(/'/g, "''")}'
        ORDER BY relevance
        LIMIT ${limit} OFFSET ${offset}
      `;

      const result = await dbAdapterInstance.crud.find(
        collection,
        {} as any,
        {
          rawSql: true,
          sql: rawSQL,
        } as any,
      );

      if (result.success && result.data) {
        return this.formatResponse(result, null, query, "sqlite");
      }
    } catch {
      logger.debug("[SearchService] FTS5 not available, falling back to LIKE");
    }

    // Fallback to LIKE
    return this.searchFallback(collection, query, options);
  }

  /**
   * MongoDB full-text search using $text index with field weights.
   */
  private async searchMongoDB(
    collection: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    if (!dbAdapterInstance) return this.emptyResponse(query);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    try {
      const result = await dbAdapterInstance.crud.findMany(
        collection,
        {
          $text: { $search: query },
        } as any,
        {
          limit,
          offset,
          tenantId: options?.tenantId as any,
        },
      );

      if (result.success && result.data) {
        const items = result.data as unknown as SearchResultItem[];
        return {
          items,
          total: items.length,
          highlights: {},
          query,
          dbType: "mongodb",
        };
      }
    } catch {
      logger.debug("[SearchService] $text not available, falling back to regex");
    }

    // Fallback: use $regex
    const regexFilter = { $regex: query, $options: "i" };
    const orFilter = [
      { title: regexFilter },
      { content: regexFilter },
      { description: regexFilter },
    ];

    const result = await dbAdapterInstance.crud.findMany(
      collection,
      {
        $or: orFilter,
      } as any,
      {
        limit,
        offset,
        tenantId: options?.tenantId as any,
      },
    );

    return this.formatResponse(result, null, query, "mongodb");
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
  private buildFilterSQL(
    options?: SearchOptions,
    dialect: "pg" | "mysql" | "sqlite" = "pg",
  ): string {
    const conditions: string[] = [];

    if (options?.tenantId) {
      const quote = dialect === "mysql" ? "`" : '"';
      conditions.push(`${quote}tenantId${quote} = '${options.tenantId.replace(/'/g, "''")}'`);
    }

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null) {
          const quote = dialect === "mysql" ? "`" : '"';
          const strVal = String(value).replace(/'/g, "''");
          conditions.push(`${quote}${key}${quote} = '${strVal}'`);
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
