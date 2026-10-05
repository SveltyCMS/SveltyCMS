/**
 * @file tests/unit/databases/virtual-field-projections.test.ts
 * @description Unit tests for Virtual Field SQL Projections (Omit JSON Blob Transfer).
 *
 * Features:
 * - verifies shouldExcludeData correctly skips data column when virtual fields are requested
 * - verifies getProjectedSelection synthesizes native SQL JSON extraction expressions
 * - verifies getJsonExtractSql parity across SQLite, PostgreSQL, and MariaDB
 * - verifies convertDatesToISO preserves extracted virtual fields with skipJson: true
 */

import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SqlAdapterCore } from "@src/databases/core/sql-adapter-core";
import { convertDatesToISO } from "@src/databases/core/relational-utils";
import type { DatabaseResult } from "@src/databases/db-interface";

class MockSqlAdapter extends SqlAdapterCore {
  public readonly type = "mock-sql";
  public readonly schema = {};
  public db: unknown = {};
  public raw = { execute: async () => [], client: null };

  public mockTable = sqliteTable("test_collection", {
    _id: text("_id").primaryKey(),
    tenantId: text("tenantId"),
    status: text("status"),
    data: text("data"),
  });

  public getTable(_collection: string): unknown {
    return this.mockTable;
  }

  public getJsonField(field: string): SQL {
    return sql`json_extract(data, ${`$."${field}"`})`;
  }

  public getJsonExtractSql(field: string): string {
    return `json_extract("data", '$."${field}"')`;
  }

  public createDynamicTableDefinition(_tableName: string): unknown {
    return this.mockTable;
  }

  protected isMissingTableError(): boolean {
    return false;
  }

  public async transaction<T>(
    fn: (
      transaction: import("@src/databases/db-interface").DatabaseTransaction,
    ) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    return fn({} as never);
  }

  public testShouldExcludeData(table: unknown, options: unknown): boolean {
    return this.shouldExcludeData(table, options);
  }
}

describe("Virtual Field SQL Projections", () => {
  const adapter = new MockSqlAdapter();
  const table = adapter.mockTable;

  describe("shouldExcludeData", () => {
    it("returns false when no fields option is provided (full row read)", () => {
      expect(adapter.testShouldExcludeData(table, {})).toBe(false);
      expect(adapter.testShouldExcludeData(table, { fields: [] })).toBe(false);
    });

    it("returns false when 'data' column is explicitly requested", () => {
      expect(adapter.testShouldExcludeData(table, { fields: ["_id", "data"] })).toBe(false);
      expect(adapter.testShouldExcludeData(table, { fields: ["data", "title"] })).toBe(false);
    });

    it("returns true when specific virtual or physical fields are requested without 'data'", () => {
      expect(adapter.testShouldExcludeData(table, { fields: ["_id", "title"] })).toBe(true);
      expect(adapter.testShouldExcludeData(table, { fields: ["title", "slug", "views"] })).toBe(
        true,
      );
      expect(adapter.testShouldExcludeData(table, { fields: ["status"] })).toBe(true);
    });
  });

  describe("getProjectedSelection", () => {
    it("synthesizes native extraction for virtual fields and includes physical columns", () => {
      const selection = adapter.getProjectedSelection(table, {
        fields: ["title", "slug", "status"],
      });

      // Mandatory physical columns
      expect(selection._id).toBeDefined();
      expect(selection.tenantId).toBeDefined();
      expect(selection.status).toBeDefined();

      // Virtual fields synthesized as aliased SQL
      expect(selection.title).toBeDefined();
      expect(selection.slug).toBeDefined();
      // Raw data column is omitted from projection!
      expect(selection.data).toBeUndefined();
    });

    it("returns physical selection including data when fields includes 'data'", () => {
      const selection = adapter.getProjectedSelection(table, {
        fields: ["_id", "data"],
      });

      expect(selection._id).toBeDefined();
      expect(selection.data).toBeDefined();
    });
  });

  describe("getJsonExtractSql dialect parity", () => {
    it("produces valid extraction SQL for SQLite", async () => {
      const { SQLiteAdapterCore } = await import("@src/databases/sqlite/adapter-core");
      const probe = Object.create(SQLiteAdapterCore.prototype);
      expect(probe.getJsonExtractSql("title")).toBe('json_extract("data", \'$."title"\')');
      expect(probe.getJsonExtractSql("meta.author")).toBe(
        'json_extract("data", \'$."meta"."author"\')',
      );
    });

    it("produces valid extraction SQL for PostgreSQL", async () => {
      const { PostgresAdapterCore } = await import("@src/databases/postgresql/adapter-core");
      const probe = Object.create(PostgresAdapterCore.prototype);
      expect(probe.getJsonExtractSql("title")).toBe("\"data\"->>'title'");
      expect(probe.getJsonExtractSql("meta.author")).toBe("\"data\"#>>'{meta,author}'");
    });

    it("produces valid extraction SQL for MariaDB", async () => {
      const { AdapterCore: MariaDbAdapterCore } =
        await import("@src/databases/mariadb/adapter-core");
      const probe = Object.create(MariaDbAdapterCore.prototype);
      expect(probe.getJsonExtractSql("title")).toBe(
        "JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.title'))",
      );
      expect(probe.getJsonExtractSql("meta.author")).toBe(
        "JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.meta.author'))",
      );
    });
  });

  describe("convertDatesToISO with projected virtual fields", () => {
    it("preserves extracted virtual fields while skipping JSON parsing when skipJson is true", () => {
      const rawRow = {
        _id: "test-id-123",
        tenantId: "tenant-abc",
        title: "Optimized Document",
        views: 42,
        createdAt: "2026-10-05T08:00:00.000Z",
      };

      const result = convertDatesToISO(rawRow, {
        table: "test_collection",
        skipJson: true,
      }) as Record<string, unknown>;

      expect(result._id).toBe("test-id-123");
      expect(result.tenantId).toBe("tenant-abc");
      expect(result.title).toBe("Optimized Document");
      expect(result.views).toBe(42);
      expect("data" in result).toBe(false);
    });
  });
});
