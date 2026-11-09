/**
 * @file tests/unit/databases/wire-stream-shared.test.ts
 * @description Unit tests for shared Direct-to-Wire SQL compilation, validation, and tenant binding helpers.
 *
 * Features:
 * - Verifies `buildPointWireSqlTemplates` and `resolvePointWireQuery` across tenant/published permutations
 * - Verifies `validateWireListInput` deterministic `_id` tie-breaking, identifier safety, and projection deduplication
 * - Verifies `validateSpec` Valibot AI layout spec validation from `@src/services/json-render/catalog`
 */

import { describe, expect, it } from "vitest";
import {
  buildPointWireSqlTemplates,
  resolvePointWireQuery,
  validateWireListInput,
  type WireColumnLookup,
} from "@src/databases/core/sql-wire-stream";
import type { DatabaseId } from "@src/databases/db-interface";
import { validateSpec } from "@src/services/json-render/catalog";
import { deepClone } from "@utils/native-utils";

describe("wire-stream-shared", () => {
  const templates = buildPointWireSqlTemplates({
    selectPrefix: 'SELECT "data" FROM "posts"',
    idExpr: '"_id" = $1',
    tenantExpr: '"tenant_id" = $2',
    tenantColQuoted: '"tenant_id"',
    statusColQuoted: '"status"',
    hasStatusCol: true,
    delSuffix: ' AND "is_deleted" = false',
    idColName: "_id",
  });

  describe("buildPointWireSqlTemplates & resolvePointWireQuery", () => {
    it("resolves tenant-scoped point read with parameters [id, tenantId]", () => {
      const resolved = resolvePointWireQuery(templates, "post-1" as DatabaseId, {
        tenantId: "tenant-a" as DatabaseId,
      });
      expect(resolved).toEqual({
        sqlText:
          'SELECT "data" FROM "posts" WHERE "_id" = $1 AND "tenant_id" = $2 AND "is_deleted" = false LIMIT 1',
        params: ["post-1", "tenant-a"],
      });
    });

    it("resolves published tenant-scoped point read when requirePublished is true", () => {
      const resolved = resolvePointWireQuery(templates, "post-1" as DatabaseId, {
        tenantId: "tenant-a" as DatabaseId,
        requirePublished: true,
      });
      expect(resolved).toEqual({
        sqlText:
          'SELECT "data" FROM "posts" WHERE "_id" = $1 AND "status" IN (\'publish\', \'published\') AND "tenant_id" = $2 AND "is_deleted" = false LIMIT 1',
        params: ["post-1", "tenant-a"],
      });
    });

    it("resolves null-tenant point read when tenantId is explicitly null", () => {
      const resolved = resolvePointWireQuery(templates, "post-1" as DatabaseId, {
        tenantId: null,
      });
      expect(resolved).toEqual({
        sqlText:
          'SELECT "data" FROM "posts" WHERE "_id" = $1 AND "tenant_id" IS NULL AND "is_deleted" = false LIMIT 1',
        params: ["post-1"],
      });
    });

    it("returns null when requirePublished is requested on a table without status column", () => {
      const noStatusTemplates = buildPointWireSqlTemplates({
        selectPrefix: 'SELECT "data" FROM "logs"',
        idExpr: '"_id" = $1',
        tenantExpr: '"tenant_id" = $2',
        tenantColQuoted: '"tenant_id"',
        statusColQuoted: '"status"',
        hasStatusCol: false,
        delSuffix: "",
      });
      expect(
        resolvePointWireQuery(noStatusTemplates, "log-1" as DatabaseId, {
          requirePublished: true,
        }),
      ).toBeNull();
    });
  });

  describe("validateWireListInput", () => {
    const knownCols = new Set(["_id", "data", "status", "created_at", "title"]);
    const mockExecutor: WireColumnLookup = {
      getColumn: (_table: unknown, colName: string) => (knownCols.has(colName) ? {} : null),
    };

    it("adds deterministic _id tie-breaker with matching sort direction when sorting by a non-_id column", () => {
      const res = validateWireListInput(
        mockExecutor,
        {},
        { sortField: "created_at", sortDirection: "desc", limit: 25, offset: 10 },
        '"',
      );
      expect(res).not.toBeNull();
      expect(res?.orderClause).toBe('ORDER BY "created_at" DESC, "_id" DESC');
      expect(res?.limit).toBe(25);
      expect(res?.offset).toBe(10);
    });

    it("does not duplicate _id in ORDER BY when sorting directly by _id", () => {
      const res = validateWireListInput(
        mockExecutor,
        {},
        { sortField: "_id", sortDirection: "asc" },
        "`",
      );
      expect(res?.orderClause).toBe("ORDER BY `_id` ASC");
    });

    it("deduplicates projected fields, maps id -> _id, and prepends _id when missing", () => {
      const res = validateWireListInput(
        mockExecutor,
        {},
        { fields: ["title", "status", "title"] },
        '"',
      );
      expect(res?.isProjected).toBe(true);
      expect(res?.dedupedProjectedCols).toEqual(["_id", "title", "status"]);
    });

    it("rejects unsafe identifiers or unknown columns", () => {
      expect(
        validateWireListInput(mockExecutor, {}, { sortField: "created_at; DROP TABLE" }, '"'),
      ).toBeNull();
      expect(
        validateWireListInput(mockExecutor, {}, { fields: ["non_existent_col"] }, '"'),
      ).toBeNull();
      expect(validateWireListInput(mockExecutor, {}, { fields: ["data"] }, '"')).toBeNull();
    });
  });
});

describe("json-render catalog validateSpec (Valibot)", () => {
  it("validates a well-formed AI layout spec", () => {
    const valid = {
      root: "main",
      elements: {
        main: {
          type: "VerticalLayout",
          children: ["heading"],
        },
        heading: {
          type: "Text",
          props: { label: "System Status", content: "Healthy" },
        },
      },
    };
    expect(validateSpec(valid)).toEqual(valid);
  });

  it("returns null for malformed specs", () => {
    expect(validateSpec(null)).toBeNull();
    expect(validateSpec({ root: 123, elements: {} })).toBeNull();
    expect(validateSpec({ root: "main" })).toBeNull();
  });
});

describe("native-utils deepClone Date preservation", () => {
  it("clones nested Date instances without mutating or stringifying them", () => {
    const d = new Date("2026-11-01T12:00:00.000Z");
    const src = { title: "Entry", createdAt: d, nested: [d] };
    const cloned = deepClone(src);
    expect(cloned).toEqual(src);
    expect(cloned.createdAt).toBeInstanceOf(Date);
    expect(cloned.createdAt).not.toBe(d);
    expect(cloned.createdAt.getTime()).toBe(d.getTime());
    expect(cloned.nested[0]).toBeInstanceOf(Date);
    expect(cloned.nested[0]).not.toBe(d);
  });
});
