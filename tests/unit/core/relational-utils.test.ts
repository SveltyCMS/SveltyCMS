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
});
