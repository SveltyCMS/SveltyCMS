/**
 * @file tests/unit/databases/postgresql-fts-adapter.test.ts
 * @description Unit tests for PostgresFtsAdapter: language resolution, query generation, and parameters.
 */

import { describe, it, expect, vi } from "vitest";
import { PostgresFtsAdapter } from "@src/databases/postgresql/fts-adapter";

describe("PostgresFtsAdapter", () => {
  it("returns empty result immediately for empty or whitespace query without executing SQL", async () => {
    const mockSql = { unsafe: vi.fn() };
    const mockAdapter: any = { sql: mockSql };
    const fts = new PostgresFtsAdapter(mockAdapter);

    const r1 = await fts.search("posts", "");
    expect(r1.success).toBe(true);
    if (r1.success) {
      expect(r1.data).toEqual({ items: [], total: 0 });
    }
    expect(mockSql.unsafe).not.toHaveBeenCalled();

    const r2 = await fts.search("posts", "   ");
    expect(r2.success).toBe(true);
    if (r2.success) {
      expect(r2.data).toEqual({ items: [], total: 0 });
    }
    expect(mockSql.unsafe).not.toHaveBeenCalled();
  });

  it("safely resolves language to allow-listed languages only", async () => {
    let capturedParams: unknown[] = [];
    const mockSql = {
      unsafe: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return [
          {
            _id: "1",
            title: "Hello",
            relevance: 0.8,
            total: "1",
          },
        ];
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    // Injection attempt in language
    await fts.search("posts", "hello", { language: "malicious'; DROP TABLE users;--" });
    // Should fall back safely to "english"
    expect(capturedParams[0]).toBe("english");

    // Valid language
    await fts.search("posts", "hello", { language: "german" });
    expect(capturedParams[0]).toBe("german");
  });

  it("parameterizes prefix search using alphanumeric tokenization", async () => {
    let capturedParams: unknown[] = [];
    const mockSql = {
      unsafe: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return [
          {
            _id: "1",
            title: "PostgreSQL Guide",
            total: "1",
          },
        ];
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    await fts.search("posts", "postgr guid");
    expect(capturedParams[0]).toBe("english");
    expect(capturedParams[1]).toBe("postgr:* & guid:*");
  });

  it("uses websearch_to_tsquery when query contains operators", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const mockSql = {
      unsafe: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return [
          {
            _id: "1",
            title: "Enterprise",
            total: "1",
          },
        ];
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    await fts.search("posts", '"exact phrase" or simple');
    expect(capturedSql).toContain("websearch_to_tsquery");
    expect(capturedParams[1]).toBe('"exact phrase" or simple');
  });

  it("applies tenant isolation and filters via bound parameters", async () => {
    let capturedParams: unknown[] = [];
    let capturedSql = "";
    const mockSql = {
      unsafe: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return [];
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
      currentTenantId: "tenant-xyz",
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    await fts.search("posts", "test", {
      filters: { status: "published" },
      limit: 25,
      offset: 10,
    });

    expect(capturedSql).toContain('"tenantId" = $3');
    expect(capturedSql).toContain(`"data"->>'status'`);
    expect(capturedParams).toContain("tenant-xyz");
    expect(capturedParams).toContain("published");
    expect(capturedParams).toContain(25);
    expect(capturedParams).toContain(10);
  });

  it("provisions stored tsvector column and GIN index concurrently skipping non-existent weights", async () => {
    const executedSqls: string[] = [];
    const mockSql = {
      unsafe: vi.fn().mockImplementation((sql: string, _params: unknown[]) => {
        executedSqls.push(sql);
        if (sql.includes("information_schema.columns")) {
          // Table has data blob and title, but not 'custom_missing'
          return [{ column_name: "data" }, { column_name: "title" }, { column_name: "_id" }];
        }
        return [{ _id: "1", title: "PostgreSQL", total: "1", relevance: 0.9 }];
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    await fts.search("posts", "postgres", {
      columns: [
        { name: "title", weight: "A" },
        { name: "custom_missing", weight: "B" },
      ],
    });

    const alterSql = executedSqls.find((s) => s.includes("ALTER TABLE"));
    expect(alterSql).toBeDefined();
    expect(alterSql).toContain("ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS");
    expect(alterSql).toContain("coalesce(\"title\", data->>'title', '')");
    // custom_missing exists in data blob so data->>'custom_missing' is used
    expect(alterSql).toContain("data->>'custom_missing'");

    const createIdxSql = executedSqls.find((s) => s.includes("CREATE INDEX CONCURRENTLY"));
    expect(createIdxSql).toBeDefined();
    expect(createIdxSql).toContain("USING gin (fts)");

    const analyzeSql = executedSqls.find((s) => s.includes("ANALYZE"));
    expect(analyzeSql).toBeDefined();
  });

  it("falls back to ILIKE ONLY for PostgreSQL error codes 42703 and 42P01", async () => {
    const executedSqls: string[] = [];
    const mockSql = {
      unsafe: vi.fn().mockImplementation((sql: string) => {
        executedSqls.push(sql);
        if (sql.includes("information_schema.columns")) {
          return [{ column_name: "fts" }, { column_name: "title" }, { column_name: "_id" }];
        }
        if (sql.includes("ts_rank") || sql.includes("to_tsquery")) {
          // Simulate 42703 column does not exist when executing tsvector query
          const err: any = new Error('column "non_existent" does not exist');
          err.code = "42703";
          throw err;
        }
        return [{ _id: "1", total: "1" }];
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    const res = await fts.search("posts", "needle");
    expect(res.success).toBe(true);
    const ilikeSql = executedSqls.find((s) => s.includes("ILIKE"));
    expect(ilikeSql).toBeDefined();
    expect(ilikeSql).toContain("ESCAPE '\\'");
  });

  it("fails closed without running ILIKE on general connection or syntax errors", async () => {
    const executedSqls: string[] = [];
    const mockSql = {
      unsafe: vi.fn().mockImplementation((sql: string) => {
        executedSqls.push(sql);
        const err: any = new Error("Connection terminated unexpectedly");
        err.code = "ECONNRESET";
        throw err;
      }),
    };

    const mockAdapter: any = {
      sql: mockSql,
      getTable: vi.fn().mockReturnValue(null),
    };
    const fts = new PostgresFtsAdapter(mockAdapter);

    const res = await fts.search("posts", "needle");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.message).toContain("Connection terminated");
    }
    const ilikeSql = executedSqls.find((s) => s.includes("ILIKE"));
    expect(ilikeSql).toBeUndefined();
  });
});
