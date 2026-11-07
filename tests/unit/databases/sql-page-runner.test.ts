/**
 * @file tests/unit/databases/sql-page-runner.test.ts
 * @description
 * Unit tests for the SQL pagination and row count estimation runner.
 * Asserts cursor decoding, limit+1 pagination behavior, and engine-specific
 * table row estimation (PostgreSQL, MariaDB, SQLite).
 */

import { describe, expect, it, vi } from "vitest";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  extractEstimateNumber,
  estimateSqlTableRows,
  executeSqlFindPage,
  type SqlPageRunnerContext,
} from "@src/databases/core/sql-page-runner";

const dummyTable = sqliteTable("test_users", {
  _id: text("_id"),
  title: text("title"),
});

describe("SQL Page Runner & Row Estimation", () => {
  describe("extractEstimateNumber", () => {
    it("extracts integer from plain array response", () => {
      expect(extractEstimateNumber([{ n: 42 }], "n")).toBe(42);
      expect(extractEstimateNumber([{ count: "100" }], "count")).toBe(100);
      expect(extractEstimateNumber([{ n: 12.8 }], "n")).toBe(12);
    });

    it("handles object containing rows array (e.g. postgres.js / pg)", () => {
      expect(extractEstimateNumber({ rows: [{ n: 55 }] }, "n")).toBe(55);
    });

    it("returns null on invalid or negative counts", () => {
      expect(extractEstimateNumber(null, "n")).toBeNull();
      expect(extractEstimateNumber([], "n")).toBeNull();
      expect(extractEstimateNumber([{ n: -5 }], "n")).toBeNull();
      expect(extractEstimateNumber([{ n: "invalid" }], "n")).toBeNull();
    });
  });

  describe("estimateSqlTableRows", () => {
    it("queries pg_class for PostgreSQL", async () => {
      const mockRaw = { execute: vi.fn().mockResolvedValue([{ n: 1500 }]) };
      const ctx: SqlPageRunnerContext = {
        type: "postgresql",
        raw: mockRaw,
        findMany: vi.fn(),
        count: vi.fn(),
      };
      const estimate = await estimateSqlTableRows(ctx, dummyTable, "test_users");
      expect(estimate).toBe(1500);
      expect(mockRaw.execute).toHaveBeenCalledWith(expect.stringContaining("pg_class"), [
        "test_users",
      ]);
    });

    it("queries information_schema for MariaDB/MySQL", async () => {
      const mockRaw = { execute: vi.fn().mockResolvedValue([{ n: 2300 }]) };
      const ctx: SqlPageRunnerContext = {
        type: "mariadb",
        raw: mockRaw,
        findMany: vi.fn(),
        count: vi.fn(),
      };
      const estimate = await estimateSqlTableRows(ctx, dummyTable, "test_users");
      expect(estimate).toBe(2300);
      expect(mockRaw.execute).toHaveBeenCalledWith(
        expect.stringContaining("information_schema.TABLES"),
        ["test_users"],
      );
    });

    it("queries sqlite_stat1 for SQLite", async () => {
      const mockRaw = { execute: vi.fn().mockResolvedValue([{ n: 500 }]) };
      const ctx: SqlPageRunnerContext = {
        type: "sqlite",
        raw: mockRaw,
        findMany: vi.fn(),
        count: vi.fn(),
      };
      const estimate = await estimateSqlTableRows(ctx, dummyTable, "test_users");
      expect(estimate).toBe(500);
      expect(mockRaw.execute).toHaveBeenCalledWith(expect.stringContaining("sqlite_stat1"), [
        "test_users",
      ]);
    });
  });

  describe("executeSqlFindPage", () => {
    it("executes limit+1 pagination and sets hasMore correctly", async () => {
      const rows = [
        { _id: "1", title: "Row 1" },
        { _id: "2", title: "Row 2" },
        { _id: "3", title: "Row 3" }, // 3 items for limit=2 -> hasMore=true
      ];
      const ctx: SqlPageRunnerContext = {
        type: "sqlite",
        raw: { execute: vi.fn() },
        findMany: vi.fn().mockResolvedValue({ success: true, data: rows }),
        count: vi.fn().mockResolvedValue({ success: true, data: 10 }),
      };

      const res = await executeSqlFindPage(ctx, "items", {}, { limit: 2, total: "exact" });
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.items).toHaveLength(2);
      expect(res.data.hasMore).toBe(true);
      expect(res.data.total).toBe(10);
      expect(ctx.count).toHaveBeenCalled();
    });
  });
});
