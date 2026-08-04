/**
 * @file tests/integration/databases/find-page-count-contract.test.ts
 * @description
 * Cross-adapter contract for product-layer list/count APIs:
 * - crud.findPage (limit+1 hasMore, optional total)
 * - crud.count modes (exact | estimate | auto)
 * - short-lived count cache (L1) + bypassCache
 *
 * Layer: **integration** (real adapter via ensureFullInitialization).
 * Unit: pure helpers in tests/unit/core/page-utils.test.ts + count-cache.test.ts.
 * E2E: not applicable until admin list UIs call findPage (adapter contract only).
 *
 * ### Run
 *   bun test --timeout 300000 tests/integration/databases/find-page-count-contract.test.ts
 *   DB_TYPE=mongodb|postgresql|mariadb bun test --timeout 300000 tests/integration/databases/find-page-count-contract.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validateDatabaseResult } from "@tests/helpers/result-validator";
import { ensureFullInitialization, getDb } from "@src/databases/db";

const TEST_COLLECTION = "find_page_count_contract";
const TEST_TENANT = "fpc-tenant";
const tenantOpts = Object.freeze({ tenantId: TEST_TENANT });

let db: any = null;
let adapter: any = null;

function uid(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeAll(async () => {
  const result = await ensureFullInitialization();
  db = getDb();
  adapter = result?.adapter || db;
  if (!db) throw new Error("Database not initialized");

  expect(typeof adapter.crud?.findPage).toBe("function");
  expect(typeof adapter.crud?.count).toBe("function");

  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: TEST_COLLECTION,
        name: TEST_COLLECTION,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }

  // Clean slate then seed a known page size (+1 for hasMore)
  await db.crud
    .deleteMany(TEST_COLLECTION, {}, { bypassTenantCheck: true, permanent: true })
    .catch(() => {});

  for (let i = 0; i < 12; i++) {
    const res = await db.crud.insert(
      TEST_COLLECTION,
      {
        _id: uid("fpc"),
        title: `Page row ${i}`,
        status: i % 2 === 0 ? "active" : "draft",
        tenantId: TEST_TENANT,
      },
      tenantOpts,
    );
    expect(res.success).toBe(true);
  }
}, 120_000);

afterAll(async () => {
  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(TEST_COLLECTION, {}, { bypassTenantCheck: true, permanent: true })
      .catch(() => {});
  }
});

describe("findPage contract", () => {
  it("returns items + hasMore from limit+1 without requiring total", async () => {
    const result = await adapter.crud.findPage(
      TEST_COLLECTION,
      { tenantId: TEST_TENANT },
      { ...tenantOpts, limit: 5, total: "none", skipMeta: true },
    );
    validateDatabaseResult(result, { operation: "findPage" });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data.items)).toBe(true);
    expect(result.data.items.length).toBe(5);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.pageSize).toBe(5);
    expect(result.data.total).toBeUndefined();
    expect(typeof result.data.nextCursor === "string" || result.data.nextCursor === undefined).toBe(
      true,
    );
  });

  it("hasMore is false when remaining rows fit in one page", async () => {
    const result = await adapter.crud.findPage(
      TEST_COLLECTION,
      { tenantId: TEST_TENANT },
      { ...tenantOpts, limit: 100, total: "none", skipMeta: true },
    );
    validateDatabaseResult(result, { operation: "findPage (last page)" });
    expect(result.success).toBe(true);
    expect(result.data.hasMore).toBe(false);
    expect(result.data.items.length).toBeGreaterThanOrEqual(12);
    expect(result.data.nextCursor).toBeUndefined();
  });

  it("total: exact attaches a finite total", async () => {
    const result = await adapter.crud.findPage(
      TEST_COLLECTION,
      { tenantId: TEST_TENANT },
      {
        ...tenantOpts,
        limit: 5,
        total: "exact",
        skipMeta: true,
        bypassCache: true,
      },
    );
    validateDatabaseResult(result, { operation: "findPage (total exact)" });
    expect(result.success).toBe(true);
    expect(typeof result.data.total).toBe("number");
    expect(result.data.total).toBeGreaterThanOrEqual(12);
  });

  it("keyset cursor advances without overlapping first-page ids", async () => {
    const first = await adapter.crud.findPage(
      TEST_COLLECTION,
      { tenantId: TEST_TENANT },
      { ...tenantOpts, limit: 4, total: "none", skipMeta: true },
    );
    validateDatabaseResult(first, { operation: "findPage page1" });
    expect(first.success).toBe(true);
    expect(first.data.hasMore).toBe(true);
    expect(first.data.nextCursor).toBeTruthy();

    const second = await adapter.crud.findPage(
      TEST_COLLECTION,
      { tenantId: TEST_TENANT },
      {
        ...tenantOpts,
        limit: 4,
        total: "none",
        skipMeta: true,
        cursor: first.data.nextCursor,
      },
    );
    validateDatabaseResult(second, { operation: "findPage page2 keyset" });
    expect(second.success).toBe(true);
    expect(second.data.items.length).toBeGreaterThan(0);

    const firstIds = new Set(first.data.items.map((r: any) => String(r._id)));
    for (const row of second.data.items) {
      expect(firstIds.has(String(row._id))).toBe(false);
    }
  });
});

describe("count mode contract", () => {
  it("exact count with tenant filter returns a non-negative integer", async () => {
    const result = await adapter.crud.count(
      TEST_COLLECTION,
      { status: "active" },
      { ...tenantOpts, mode: "exact", bypassCache: true, skipMeta: true },
    );
    validateDatabaseResult(result, { operation: "count exact" });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("number");
    expect(result.data).toBeGreaterThanOrEqual(0);
  });

  it("estimate mode on empty untenanted filter succeeds (stats or exact fallback)", async () => {
    const result = await adapter.crud.count(
      TEST_COLLECTION,
      {},
      {
        mode: "estimate",
        bypassCache: true,
        skipMeta: true,
        bypassTenantCheck: true,
      },
    );
    validateDatabaseResult(result, { operation: "count estimate" });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("number");
    expect(result.data).toBeGreaterThanOrEqual(0);
  });

  it("tenant-scoped auto never fails closed (exact path under tenant)", async () => {
    const result = await adapter.crud.count(
      TEST_COLLECTION,
      {},
      { ...tenantOpts, mode: "auto", bypassCache: true, skipMeta: true },
    );
    validateDatabaseResult(result, { operation: "count auto tenant" });
    expect(result.success).toBe(true);
    expect(result.data).toBeGreaterThanOrEqual(12);
  });
});

describe("count cache contract", () => {
  it("repeated exact counts return the same value (cache or DB)", async () => {
    const opts = {
      ...tenantOpts,
      mode: "exact" as const,
      skipMeta: true,
    };
    const filter = { status: "active" };
    const a = await adapter.crud.count(TEST_COLLECTION, filter, opts);
    const b = await adapter.crud.count(TEST_COLLECTION, filter, opts);
    validateDatabaseResult(a, { operation: "count cache a" });
    validateDatabaseResult(b, { operation: "count cache b" });
    expect(a.success && b.success).toBe(true);
    expect(a.data).toBe(b.data);
  });

  it("bypassCache still returns a valid count", async () => {
    const result = await adapter.crud.count(
      TEST_COLLECTION,
      { status: "draft" },
      { ...tenantOpts, mode: "exact", bypassCache: true, skipMeta: true },
    );
    validateDatabaseResult(result, { operation: "count bypassCache" });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("number");
  });
});
