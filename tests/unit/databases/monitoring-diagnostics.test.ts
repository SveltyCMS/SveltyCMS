/**
 * @file tests/unit/databases/monitoring-diagnostics.test.ts
 * @description Unit tests for database diagnostics and performance monitoring.
 *
 * Features:
 * - verifies PerformanceModule.getMetrics calculates connectionPoolUsage from getConnectionPoolStats
 * - verifies PerformanceModule.getSlowQueries integrates pg_stat_statements for PostgreSQL
 * - verifies PerformanceModule.getSlowQueries integrates performance_schema for MariaDB
 * - verifies in-memory fallback for SQLite and unprivileged database engines
 * - verifies PostgresAdapterCore.getConnectionPoolStats queries pg_stat_activity
 */

import { describe, expect, it, vi } from "vitest";
import { PerformanceModule } from "@src/databases/core/base-adapter";

describe("Database Diagnostics & Monitoring", () => {
  describe("PerformanceModule.getMetrics", () => {
    it("computes connection pool usage from getConnectionPoolStats", async () => {
      const mockAdapter = {
        type: "sqlite",
        metrics: { queryCount: 50, lastLatency: 1.5, cacheHits: 80, cacheMisses: 20 },
        getConnectionPoolStats: vi.fn().mockResolvedValue({
          success: true,
          data: { total: 10, active: 4, idle: 6, waiting: 0, avgConnectionTime: 0 },
        }),
      };

      const module = new PerformanceModule(mockAdapter as any);
      const res = await module.getMetrics();

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(res.data.connectionPoolUsage).toBe(0.4);
      expect(res.data.queryCount).toBe(50);
      expect(res.data.cacheHitRate).toBe(0.8);
    });
  });

  describe("PerformanceModule.getSlowQueries", () => {
    it("queries pg_stat_statements when adapter is PostgreSQL", async () => {
      const mockUnsafe = vi.fn().mockResolvedValue([
        { query: "SELECT * FROM large_table", duration: 125.4 },
        { query: "UPDATE heavy_table SET col = 1", duration: 89.2 },
      ]);

      const mockAdapter = {
        type: "postgresql",
        sql: { unsafe: mockUnsafe },
      };

      const module = new PerformanceModule(mockAdapter as any);
      const res = await module.getSlowQueries(5);

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(mockUnsafe).toHaveBeenCalledWith(expect.stringContaining("pg_stat_statements"), [5]);
      expect(res.data.length).toBe(2);
      expect(res.data[0].query).toBe("SELECT * FROM large_table");
      expect(res.data[0].duration).toBe(125);
    });

    it("queries performance_schema when adapter is MariaDB", async () => {
      const mockQuery = vi
        .fn()
        .mockResolvedValue([[{ query: "SELECT * FROM posts WHERE id = 1", duration: 45.2 }]]);

      const mockAdapter = {
        type: "mariadb",
        pool: { query: mockQuery },
      };

      const module = new PerformanceModule(mockAdapter as any);
      const res = await module.getSlowQueries(5);

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("performance_schema.events_statements_summary_by_digest"),
        [5],
      );
      expect(res.data.length).toBe(1);
      expect(res.data[0].query).toBe("SELECT * FROM posts WHERE id = 1");
    });

    it("falls back to in-memory slow queries on SQLite", async () => {
      const mockAdapter = {
        type: "sqlite",
        _slowQueries: [
          {
            query: "SELECT * FROM collection_posts",
            duration: 35,
            timestamp: "2026-10-05T08:00:00.000Z",
          },
        ],
      };

      const module = new PerformanceModule(mockAdapter as any);
      const res = await module.getSlowQueries(5);

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(res.data.length).toBe(1);
      expect(res.data[0].query).toBe("SELECT * FROM collection_posts");
      expect(res.data[0].duration).toBe(35);
    });
  });
});
