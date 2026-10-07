/**
 * @file tests/unit/databases/relational-utils.test.ts
 * @description Unit tests for relational database utilities and schema-aware conversions.
 *
 * Features:
 * - RFC 9562 UUIDv7 ID generation and formatting
 * - Standardized DatabaseError creation and nested error propagation
 * - Normalization of collection/path strings
 * - Schema registration and registry consistency verification
 * - Pre-resolved date conversion metadata and cache behavior
 * - Zero-allocation row-store hybrid merging and Date/timestamp normalization
 * - Boolean column coercion (0/1 -> false/true)
 * - Multi-tenant filter resolution and bypass checks
 */

import { describe, expect, it } from "vitest";
import {
  generateId,
  createDatabaseError,
  normalizePath,
  registerTableSchema,
  getTableMeta,
  assertTableRegistryConsistent,
  getTableMergeSkipKeys,
  getTableBooleanColumns,
  resolveDateConversionMeta,
  convertDatesToISO,
  convertArrayDatesToISO,
  getEffectiveTenantId,
  shouldBypassTenantCheck,
  getTenantCondition,
  applyTenantFilterToObject,
} from "@src/databases/core/relational-utils";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import type { DatabaseId } from "@src/databases/db-interface";

describe("relational-utils unit tests", () => {
  describe("generateId", () => {
    it("generates a 32-character hexadecimal string without hyphens", () => {
      const id = generateId();
      expect(typeof id).toBe("string");
      expect(id).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/i.test(id)).toBe(true);
    });

    it("generates unique IDs across sequential invocations", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(50);
    });
  });

  describe("createDatabaseError", () => {
    it("creates a standardized DatabaseError object", () => {
      const originalErr = { code: "PG_SYNTAX_ERROR", detail: "syntax error at or near 'SELECT'" };
      const err = createDatabaseError("QUERY_FAILED", "Failed to execute query", originalErr, 500);

      expect(err.code).toBe("QUERY_FAILED");
      expect(err.message).toBe("Failed to execute query");
      expect(err.statusCode).toBe(500);
      expect(err.originalCode).toBe("PG_SYNTAX_ERROR");
      expect(err.details).toEqual(originalErr);
    });

    it("extracts originalCode from nested originalError", () => {
      const nestedErr = { originalError: { code: "ER_DUP_ENTRY" } };
      const err = createDatabaseError("DUPLICATE_KEY", "Duplicate key", nestedErr);

      expect(err.originalCode).toBe("ER_DUP_ENTRY");
    });
  });

  describe("normalizePath", () => {
    it("strips leading and trailing slashes", () => {
      expect(normalizePath("/api/v1/content/")).toBe("api/v1/content");
      expect(normalizePath("///posts///")).toBe("posts");
    });

    it("collapses multiple consecutive slashes", () => {
      expect(normalizePath("users///profiles////details")).toBe("users/profiles/details");
    });

    it("handles single-slash or empty input", () => {
      expect(normalizePath("/")).toBe("");
      expect(normalizePath("")).toBe("");
    });
  });

  describe("registerTableSchema and registry consistency", () => {
    it("registers schema and derives boolean and merge-skip sets", () => {
      const tableName = "test_articles_custom";
      const columns = ["_id", "title", "createdAt", "updatedAt", "data", "published", "views"];
      const boolCols = ["published"];

      registerTableSchema(tableName, columns, boolCols);

      const meta = getTableMeta(tableName);
      expect(meta).toBeDefined();
      expect(meta?.columns).toContain("title");
      expect(meta?.dateCols).toEqual(expect.arrayContaining(["createdAt", "updatedAt"]));
      expect(meta?.jsonCols).toEqual(expect.arrayContaining(["data"]));
      expect(meta?.boolCols.has("published")).toBe(true);
      expect(meta?.mergeSkipKeys.has("views")).toBe(true);

      // Verify consistency assertion passes without throwing
      expect(() => assertTableRegistryConsistent(tableName)).not.toThrow();

      // Verify derived helper views
      const mergeSkip = getTableMergeSkipKeys(tableName);
      expect(mergeSkip?.has("title")).toBe(true);
      const booleans = getTableBooleanColumns(tableName);
      expect(booleans?.has("published")).toBe(true);
    });

    it("registers schema additively without losing previously registered columns", () => {
      const tableName = "test_additive_table";
      registerTableSchema(tableName, ["_id", "createdAt", "status"]);
      registerTableSchema(tableName, ["updatedAt", "isFeatured"], ["isFeatured"]);

      const meta = getTableMeta(tableName);
      expect(meta).toBeDefined();
      expect(meta?.columns).toContain("_id");
      expect(meta?.columns).toContain("createdAt");
      expect(meta?.columns).toContain("updatedAt");
      expect(meta?.columns).toContain("isFeatured");
      expect(meta?.boolCols.has("isFeatured")).toBe(true);
      expect(() => assertTableRegistryConsistent(tableName)).not.toThrow();
    });
  });

  describe("resolveDateConversionMeta", () => {
    it("returns empty schema meta for undefined table", () => {
      const meta = resolveDateConversionMeta(undefined);
      expect(meta.hasSchema).toBe(false);
      expect(meta.dateCols).toBeNull();
      expect(meta.jsonCols).toBeNull();
    });

    it("returns pre-resolved cached metadata for registered table", () => {
      const tableName = "test_meta_cache_table";
      registerTableSchema(tableName, ["_id", "createdAt", "data"]);

      const meta1 = resolveDateConversionMeta(tableName);
      const meta2 = resolveDateConversionMeta(tableName);

      expect(meta1.hasSchema).toBe(true);
      expect(meta1.dateCols).toContain("createdAt");
      expect(meta1.jsonCols).toContain("data");
      // Cache identity check
      expect(meta1).toBe(meta2);
    });

    it("differentiates skipJson flag in cache key", () => {
      const tableName = "test_meta_skip_json_table";
      registerTableSchema(tableName, ["_id", "createdAt", "data"]);

      const withJson = resolveDateConversionMeta(tableName, false);
      const withoutJson = resolveDateConversionMeta(tableName, true);

      expect(withJson.jsonCols).toContain("data");
      expect(withoutJson.jsonCols).toBeNull();
      expect(withJson).not.toBe(withoutJson);
    });
  });

  describe("convertDatesToISO and convertArrayDatesToISO", () => {
    it("converts Date objects and epoch millisecond numbers to ISO date strings", () => {
      const epochTime = 1774000000000; // > 100,000,000,000
      const dateObj = new Date("2026-05-10T12:00:00.000Z");

      const row = {
        _id: "doc1",
        createdAt: epochTime,
        updatedAt: dateObj,
        views: 42, // small int, must NOT be converted to date
      };

      const converted = convertDatesToISO(row) as Record<string, unknown>;
      expect(converted.createdAt).toBe(new Date(epochTime).toISOString());
      expect(converted.updatedAt).toBe("2026-05-10T12:00:00.000Z");
      expect(converted.views).toBe(42);
    });

    it("coerces 0 and 1 column values to booleans for registered boolean columns", () => {
      const table = "test_boolean_coercion_table";
      registerTableSchema(table, ["_id", "isActive", "isArchived"], ["isActive", "isArchived"]);

      const row = {
        _id: "doc_bool_1",
        isActive: 1,
        isArchived: 0,
      };

      const converted = convertDatesToISO(row, { table }) as Record<string, unknown>;
      expect(converted.isActive).toBe(true);
      expect(converted.isArchived).toBe(false);
    });

    it("merges JSON data blob while preserving authoritative physical columns", () => {
      const table = "test_hybrid_merge_table";
      registerTableSchema(table, ["_id", "title", "status", "data"]);

      const row = {
        _id: "doc_hybrid_1",
        title: "Authoritative Column Title",
        status: "published",
        data: JSON.stringify({
          title: "Stale Blob Title", // Should NOT override physical column
          customField: "Dynamic Value",
          tags: ["alpha", "beta"],
        }),
      };

      const converted = convertDatesToISO(row, { table }) as Record<string, unknown>;
      expect(converted.title).toBe("Authoritative Column Title");
      expect(converted.status).toBe("published");
      expect(converted.customField).toBe("Dynamic Value");
      expect(converted.tags).toEqual(["alpha", "beta"]);
      expect("data" in converted).toBe(false);
    });

    it("batch-converts an array of rows via convertArrayDatesToISO", () => {
      const table = "test_array_conversion_table";
      registerTableSchema(table, ["_id", "createdAt", "isActive"], ["isActive"]);

      const rows = [
        { _id: "1", createdAt: new Date("2026-01-01T00:00:00.000Z"), isActive: 1 },
        { _id: "2", createdAt: new Date("2026-02-01T00:00:00.000Z"), isActive: 0 },
      ];

      const converted = convertArrayDatesToISO(rows, { table });
      expect(converted).toHaveLength(2);
      expect(converted[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(converted[0].isActive).toBe(true);
      expect(converted[1].createdAt).toBe("2026-02-01T00:00:00.000Z");
      expect(converted[1].isActive).toBe(false);
    });
  });

  describe("tenant resolution and filter utilities", () => {
    it("returns undefined when tenantId is not provided or is 'global'", () => {
      expect(getEffectiveTenantId(undefined)).toBeUndefined();
      expect(getEffectiveTenantId({ tenantId: "global" as DatabaseId })).toBeUndefined();
    });

    it("returns DatabaseId or null for specific tenantId values", () => {
      expect(getEffectiveTenantId({ tenantId: "tenant_custom" as DatabaseId })).toBe(
        "tenant_custom",
      );
      expect(getEffectiveTenantId({ tenantId: null })).toBeNull();
    });

    it("evaluates shouldBypassTenantCheck with system scope", () => {
      const normalResult = shouldBypassTenantCheck({});
      expect(normalResult).toBe(false);

      const systemOpts = withSystemScope("testing");
      expect(shouldBypassTenantCheck(systemOpts)).toBe(true);
    });

    it("builds correct tenant condition or bypasses when system scoped", () => {
      const mockCol = { name: "tenantId" };

      // Normal tenant condition
      const cond = getTenantCondition(mockCol, { tenantId: "tenant-123" as DatabaseId });
      expect(cond).toBeDefined();

      // Bypassed condition
      const systemOpts = withSystemScope("testing", { tenantId: "tenant-123" as DatabaseId });
      const bypassedCond = getTenantCondition(mockCol, systemOpts);
      expect(bypassedCond).toBeUndefined();
    });

    it("applies tenantId to filter object unless bypassed", () => {
      const baseFilter = { status: "active" };
      const filtered = applyTenantFilterToObject(baseFilter, {
        tenantId: "tenant_abc" as DatabaseId,
      });
      expect(filtered).toEqual({ status: "active", tenantId: "tenant_abc" });

      const systemOpts = withSystemScope("testing", { tenantId: "tenant_abc" as DatabaseId });
      const bypassed = applyTenantFilterToObject(baseFilter, systemOpts);
      expect(bypassed).toEqual({ status: "active" });
    });
  });
});
