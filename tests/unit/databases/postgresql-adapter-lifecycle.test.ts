/**
 * @file tests/unit/databases/postgresql-adapter-lifecycle.test.ts
 * @description Unit tests for PostgreSQLAdapter lifecycle: getVersion caching, clearDatabase atomicity, and cleanupExpiredData.
 */

import { describe, it, expect, vi } from "vitest";
import { PostgreSQLAdapter } from "@src/databases/postgresql/postgres-adapter";

describe("PostgreSQLAdapter lifecycle & maintenance", () => {
  it("caches getVersion after first query to eliminate roundtrips", async () => {
    let queryCount = 0;
    const mockSql: any = (_strings: TemplateStringsArray) => {
      queryCount++;
      return [{ version: "PostgreSQL 18.1 on x86_64" }];
    };

    const adapter = new PostgreSQLAdapter();
    (adapter as any).sql = mockSql;
    (adapter as any).connected = true;

    const v1 = await adapter.getVersion();
    expect(v1.success).toBe(true);
    expect(v1.data).toBe("PostgreSQL 18.1 on x86_64");
    expect(queryCount).toBe(1);

    const v2 = await adapter.getVersion();
    expect(v2.success).toBe(true);
    expect(v2.data).toBe("PostgreSQL 18.1 on x86_64");
    // Should NOT have run query a second time
    expect(queryCount).toBe(1);
  });

  it("runs bounded ctid deletion for expired sessions and tokens in parallel", async () => {
    const executedQueries: string[] = [];
    let sessionPass = 0;
    let _tokenPass = 0;

    const mockSql: any = {
      unsafe: vi.fn().mockImplementation((sqlText: string) => {
        executedQueries.push(sqlText);
        if (sqlText.includes("DELETE FROM auth_sessions")) {
          sessionPass++;
          // First pass returns 5000 (triggers loop), second pass returns 120 (terminates)
          return { count: sessionPass === 1 ? 5000 : 120 };
        }
        if (sqlText.includes("DELETE FROM auth_tokens")) {
          _tokenPass++;
          return { count: 35 };
        }
        return { count: 0 };
      }),
    };

    const adapter = new PostgreSQLAdapter();
    (adapter as any).sql = mockSql;
    (adapter as any).connected = true;

    const res = await adapter.cleanupExpiredData();
    expect(res.success).toBe(true);
    expect(res.data?.sessions).toBe(5120);
    expect(res.data?.tokens).toBe(35);

    // Verify indexes ensured
    const indexQueries = executedQueries.filter((q) => q.includes("CREATE INDEX IF NOT EXISTS"));
    expect(indexQueries.length).toBe(3);
    expect(indexQueries.some((q) => q.includes("auth_sessions_expires_idx"))).toBe(true);
    expect(indexQueries.some((q) => q.includes("auth_tokens_consumed_updated_idx"))).toBe(true);

    // Verify ctid queries
    const ctidQueries = executedQueries.filter((q) => q.includes("WHERE ctid IN"));
    expect(ctidQueries.length).toBe(3); // 2 session passes + 1 token pass
  });

  it("atomically truncates system tables and drops dynamic tables in a single transaction", async () => {
    const executedTxQueries: string[] = [];
    const mockSql: any = (_strings: TemplateStringsArray) => {
      // Simulate information_schema query
      return [
        { table_name: "auth_users" },
        { table_name: "content_nodes" },
        { table_name: "collection_posts" },
        { table_name: "collection_comments" },
      ];
    };
    mockSql.begin = async (fn: (tx: any) => Promise<void>) => {
      const txMock = {
        unsafe: vi.fn().mockImplementation((sqlText: string) => {
          executedTxQueries.push(sqlText);
          return [];
        }),
      };
      await fn(txMock);
    };

    const adapter = new PostgreSQLAdapter();
    (adapter as any).sql = mockSql;
    (adapter as any).connected = true;

    const res = await adapter.clearDatabase();
    expect(res.success).toBe(true);

    expect(executedTxQueries.length).toBe(2);
    const truncateSql = executedTxQueries.find((q) => q.includes("TRUNCATE TABLE"));
    expect(truncateSql).toContain('"auth_users"');
    expect(truncateSql).toContain('"content_nodes"');
    expect(truncateSql).toContain("RESTART IDENTITY CASCADE");

    const dropSql = executedTxQueries.find((q) => q.includes("DROP TABLE IF EXISTS"));
    expect(dropSql).toContain('"collection_posts"');
    expect(dropSql).toContain('"collection_comments"');
    expect(dropSql).toContain("CASCADE");
  });

  it("provides queryBuilder for collections", () => {
    const adapter = new PostgreSQLAdapter();
    const qb = adapter.queryBuilder("posts");
    expect(qb).toBeDefined();
    expect(typeof qb.where).toBe("function");
  });
});
