/**
 * @file tests/unit/core/relational-utils.test.ts
 * @description Focused unit tests for the centralized tenant filter helpers.
 * Ensures single source of truth for bypass, global/null/undefined handling,
 * no mutation of caller options, and correct condition generation for SQL + object paths.
 *
 * Complements the existing safeQuery tests (Mongo) and withTenant/forTenant tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as utils from "@src/databases/core/relational-utils";
import type { BaseQueryOptions } from "@src/databases/db-interface";

describe("relational-utils — id + error helpers", () => {
  it("generateId returns 32 hex chars (UUID without dashes)", () => {
    const id = utils.generateId();
    expect(id).toMatch(/^[0-9a-f]{32}$/i);
    expect(utils.validateId(id)).toBe(true);
  });

  it("generateId produces unique values", () => {
    const a = utils.generateId();
    const b = utils.generateId();
    expect(a).not.toBe(b);
  });

  it("validateId accepts 32-hex and dashed UUID forms", () => {
    expect(utils.validateId("a".repeat(32))).toBe(true);
    expect(utils.validateId("A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4")).toBe(true);
    expect(utils.validateId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("validateId rejects empty, short, and invalid strings", () => {
    expect(utils.validateId("")).toBe(false);
    expect(utils.validateId("not-an-id")).toBe(false);
    expect(utils.validateId("g".repeat(32))).toBe(false); // non-hex
    expect(utils.validateId("a".repeat(31))).toBe(false);
  });

  it("createDatabaseError shapes code, message, status, and original details", () => {
    const original = { code: "SQLITE_ERROR", errno: 1 };
    const err = utils.createDatabaseError("INSERT_FAILED", "insert failed", original, 500);
    expect(err).toMatchObject({
      code: "INSERT_FAILED",
      message: "insert failed",
      statusCode: 500,
      originalCode: "SQLITE_ERROR",
      details: original,
    });
  });

  it("createDatabaseError pulls nested originalCode when present", () => {
    const err = utils.createDatabaseError("X", "msg", {
      originalError: { code: "NESTED" },
    });
    expect(err.originalCode).toBe("NESTED");
  });

  it("normalizePath strips leading/trailing and collapses slashes", () => {
    expect(utils.normalizePath("/a//b/")).toBe("a/b");
    expect(utils.normalizePath("foo/bar")).toBe("foo/bar");
  });
});

describe("relational-utils — convertDatesToISO json flattening", () => {
  it("flattens native jsonb data objects onto the row (PostgreSQL)", () => {
    utils.registerTableSchema("collection_bench-articles", [
      "_id",
      "slug",
      "data",
      "createdAt",
      "updatedAt",
    ]);

    const row = {
      _id: "abc123",
      slug: "bench-articles",
      data: { enabled: true, label: "Bench Articles" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };

    const converted = utils.convertDatesToISO(row, { table: "collection_bench-articles" });

    expect(converted.enabled).toBe(true);
    expect(converted.label).toBe("Bench Articles");
    expect(converted.slug).toBe("bench-articles");
    expect(converted.data).toEqual({ enabled: true, label: "Bench Articles" });
    expect(converted.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("still flattens string-encoded JSON data columns (SQLite/MariaDB)", () => {
    utils.registerTableSchema("collection_posts", ["_id", "data", "createdAt"]);

    const row = {
      _id: "post-1",
      data: '{"enabled":true,"title":"Hello"}',
      createdAt: "2026-03-01T12:00:00.000Z",
    };

    const converted = utils.convertDatesToISO(row, { table: "collection_posts" });

    expect(converted.enabled).toBe(true);
    expect(converted.title).toBe("Hello");
    expect(converted.data).toEqual({ enabled: true, title: "Hello" });
  });

  it("normalizes SQLite INTEGER-ms timestamps to ISODateString (raw reads)", () => {
    utils.registerTableSchema("collection_sqlite_raw", ["_id", "createdAt", "updatedAt"]);

    const row = {
      _id: "raw-1",
      createdAt: 1786272221268, // epoch ms — what SQLite INTEGER columns return
      updatedAt: 1786272221269,
      status: "draft",
    };

    // Full path (fresh row object)
    const converted = utils.convertDatesToISO(row, { table: "collection_sqlite_raw" });
    expect(converted.createdAt).toBe(new Date(1786272221268).toISOString());
    expect(converted.updatedAt).toBe(new Date(1786272221269).toISOString());

    // inPlace fast path (same row reference, still normalized)
    const again = utils.convertDatesToISO(converted, {
      table: "collection_sqlite_raw",
      inPlace: true,
    });
    expect(again).toBe(converted);
    expect(converted.createdAt).toBe(new Date(1786272221268).toISOString());
  });

  it("normalizes postgres.js timestamptz strings to ISODateString (raw reads)", () => {
    utils.registerTableSchema("collection_pg_raw", ["_id", "createdAt"]);

    const row = { _id: "pg-1", createdAt: "2026-08-09 22:25:38.488+00" };
    const converted = utils.convertDatesToISO(row, { table: "collection_pg_raw" });
    expect(converted.createdAt).toBe("2026-08-09T22:25:38.488Z");

    // inPlace fast path
    const row2 = { _id: "pg-2", createdAt: "2026-08-09 22:25:38+00" };
    utils.convertDatesToISO(row2, { table: "collection_pg_raw", inPlace: true });
    expect(row2.createdAt).toBe("2026-08-09T22:25:38.000Z");
  });

  it("does not mangle small numbers or non-date values in date columns", () => {
    utils.registerTableSchema("collection_mixed", ["_id", "expires", "count"]);

    const row = { _id: "m-1", expires: 42, count: 3 };
    const converted = utils.convertDatesToISO(row, { table: "collection_mixed" });

    // 42 is not epoch-ms (below the post-1973 guard) — untouched.
    expect(converted.expires).toBe(42);
    expect(converted.count).toBe(3);
  });

  it("normalizes epoch timestamps on unregistered tables via DATE_FIELDS fallback", () => {
    const row = { _id: "u-1", createdAt: 1786272221268 };
    const converted = utils.convertDatesToISO(row, {});
    expect(converted.createdAt).toBe(new Date(1786272221268).toISOString());
  });

  it("TableMeta single source of truth — derived views stay consistent", () => {
    // Base-only registration first (the drift class: late boolean registration
    // used to never update the bool map).
    utils.registerTableSchema("collection_meta_drift", ["_id", "createdAt", "updatedAt"]);
    // Late registration WITH materialized + boolean columns must augment.
    utils.registerTableSchema(
      "collection_meta_drift",
      ["_id", "createdAt", "updatedAt", "title", "enabled"],
      ["enabled"],
    );

    // The guard validates every derived view against the record.
    expect(() => utils.assertTableRegistryConsistent("collection_meta_drift")).not.toThrow();
    expect(() => utils.assertTableRegistryConsistent("meta_drift")).not.toThrow();

    const meta = utils.getTableMeta("collection_meta_drift");
    expect(meta).toBeDefined();
    expect(meta!.columns).toContain("enabled");
    expect(meta!.dateCols).toEqual(expect.arrayContaining(["createdAt", "updatedAt"]));
    expect(meta!.boolCols.has("enabled")).toBe(true);
    expect(meta!.mergeSkipKeys.has("title")).toBe(true);

    // Hot-path getters agree with the record.
    expect(utils.getTableBooleanColumns("collection_meta_drift")?.has("enabled")).toBe(true);
    expect(utils.getTableDateColumns("collection_meta_drift")).toEqual(meta!.dateCols);
  });
});

describe("relational-utils — tenant filter centralization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fakeTenantCol = { name: "tenantId" }; // shape sufficient for eq/isNull to not explode

  it("applies tenant condition when tenantId provided and no bypass", () => {
    const conditions: any[] = [];
    const options: BaseQueryOptions = { tenantId: "tenant-123" as any };

    utils.applyTenantFilter(conditions, fakeTenantCol, options);

    expect(conditions.length).toBe(1);
    // The pushed item is the result of eq(col, value) — truthy object from drizzle
    expect(conditions[0]).toBeTruthy();
  });

  it("honors bypassTenantCheck and adds nothing", () => {
    const conditions: any[] = [];
    const options: BaseQueryOptions = {
      tenantId: "tenant-xyz" as any,
      bypassTenantCheck: true,
    };

    utils.applyTenantFilter(conditions, fakeTenantCol, options);

    expect(conditions.length).toBe(0);
  });

  it("produces isNull condition for explicit null tenantId (system/global rows)", () => {
    const conditions: any[] = [];
    const options: BaseQueryOptions = { tenantId: null };

    utils.applyTenantFilter(conditions, fakeTenantCol, options);

    expect(conditions.length).toBe(1);
    // We can't deeply inspect the SQL AST without running, but presence + the helper path is validated
    expect(conditions[0]).toBeTruthy();
  });

  it("skips filter for undefined or 'global' tenantId", () => {
    const conditions: any[] = [];

    utils.applyTenantFilter(conditions, fakeTenantCol, { tenantId: undefined });
    utils.applyTenantFilter(conditions, fakeTenantCol, {
      tenantId: "global" as any,
    });

    expect(conditions.length).toBe(0);
  });

  it("never mutates the input options object", () => {
    const options: BaseQueryOptions = {
      tenantId: "t-1" as any,
      filter: { foo: "bar" },
    };
    const snapshot = JSON.stringify(options);
    const conditions: any[] = [];

    utils.applyTenantFilter(conditions, fakeTenantCol, options);
    utils.getEffectiveTenantId(options);
    utils.shouldBypassTenantCheck(options);

    expect(JSON.stringify(options)).toBe(snapshot);
  });

  it("applyTenantFilterToObject returns new object and applies tenant (or skips on bypass)", () => {
    const base = { status: "active" };
    const opts: BaseQueryOptions = { tenantId: "t-abc" as any };

    const result1 = utils.applyTenantFilterToObject(base, opts);
    expect(result1).not.toBe(base); // new object
    expect(result1).toEqual({ status: "active", tenantId: "t-abc" });

    const bypass = utils.applyTenantFilterToObject(base, {
      ...opts,
      bypassTenantCheck: true,
    });
    expect(bypass).toEqual({ status: "active" }); // no tenant added
    expect(bypass).toBe(base); // unchanged ref (efficient, no clone when skipping)
  });

  it("applyTenantFilterToMongoQuery provides symmetric non-mutating behavior", () => {
    const q = { slug: "hello" };
    const res = utils.applyTenantFilterToMongoQuery(q, {
      tenantId: "t-mongo" as any,
    });
    expect(res).toEqual({ slug: "hello", tenantId: "t-mongo" });
    expect(res).not.toBe(q);
  });

  it("buildRawTenantFilter produces correct fragments (or empty) for the raw SQL atomic paths", () => {
    expect(utils.buildRawTenantFilter({ tenantId: "t-1" as any }, "sqlite")).toBe(
      ` AND "tenantId" = 't-1'`,
    );
    expect(utils.buildRawTenantFilter({ tenantId: "t-2" as any }, "postgres")).toBe(
      ` AND "tenantId" = 't-2'`,
    );
    expect(utils.buildRawTenantFilter({ tenantId: "t-3" as any }, "mysql")).toBe(
      ` AND \`tenantId\` = 't-3'`,
    );

    expect(
      utils.buildRawTenantFilter({
        bypassTenantCheck: true,
        tenantId: "x" as any,
      }),
    ).toBe("");
    expect(utils.buildRawTenantFilter({ tenantId: "global" as any })).toBe("");
    expect(utils.buildRawTenantFilter({ tenantId: undefined })).toBe("");
  });

  it("buildRawTenantClause uses bound placeholders per dialect", () => {
    expect(utils.buildRawTenantClause({ tenantId: "t-1" as any }, "sqlite")).toEqual({
      sql: ` AND "tenantId" = ?`,
      params: ["t-1"],
    });
    expect(utils.buildRawTenantClause({ tenantId: "t-2" as any }, "mysql")).toEqual({
      sql: " AND `tenantId` = ?",
      params: ["t-2"],
    });
    expect(
      utils.buildRawTenantClause({ tenantId: "t-3" as any }, "postgres", { paramIndex: 3 }),
    ).toEqual({
      sql: ` AND "tenantId" = $3`,
      params: ["t-3"],
    });
  });

  it("assertSafeSqlIdentifier / assertFiniteAmount guard atomicIncrement inputs", () => {
    expect(utils.assertSafeSqlIdentifier("viewCount")).toBe("viewCount");
    expect(utils.assertFiniteAmount(5)).toBe(5);
    expect(() => utils.assertSafeSqlIdentifier("a;drop table")).toThrow(/Invalid SQL identifier/);
    expect(() => utils.assertFiniteAmount(Number.NaN)).toThrow(/finite number/);
  });

  it("assertSafeSqlIdentifier rejects identifiers that would exceed Postgres NAMEDATALEN (63)", () => {
    // 63 chars is fine (PG truncates at 64)
    const exactly63 = "a".repeat(63);
    expect(utils.assertSafeSqlIdentifier(exactly63)).toBe(exactly63);
    // 64+ chars would be silently truncated by Postgres → must throw at DDL time
    expect(() => utils.assertSafeSqlIdentifier("a".repeat(64))).toThrow(/63 chars/);
    // Typical worst case: idx_<uuid32>_<fieldName> leaves only 26 chars for the field
    const uuidLike = "550e8400e29b41d4a716446655440000"; // 32 chars
    expect(() =>
      utils.assertSafeSqlIdentifier(`idx_${uuidLike}_${"b".repeat(27)}`, "index"),
    ).toThrow(/63 chars/);
  });
});
