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
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { collectionTableName } from "@src/databases/core/collection-name";
import { cacheService } from "@src/databases/cache/cache-service";

const TEST_COLLECTION = "find_page_count_contract";
const TEST_TENANT = "fpc-tenant";
const tenantOpts = Object.freeze({ tenantId: TEST_TENANT });

let db: any = null;
let adapter: any = null;

/** Enterprise _id contract: collection-table entries require UUIDv4 ids. */
function uid(_p: string) {
  return crypto.randomUUID();
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
    .deleteMany(TEST_COLLECTION, {}, withSystemScope("testing", { permanent: true }))
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
      .deleteMany(TEST_COLLECTION, {}, withSystemScope("testing", { permanent: true }))
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

  it("keyset walk over duplicate sort values visits every row exactly once", async () => {
    // The seeded rows alternate status (6× "active" / 6× "draft"), so sorting by
    // `status` produces large tie groups — the case where an ordering/cursor
    // direction mismatch silently repeats page N on page N+1. Both the Mongo-style
    // numeric form (-1/1) and the wire string form ("desc"/"asc") are exercised:
    // every adapter must map them to the same ORDER BY the cursor was built from.
    const reference = await adapter.crud.findPage(
      TEST_COLLECTION,
      { tenantId: TEST_TENANT },
      { ...tenantOpts, limit: 100, sort: { status: -1 }, total: "none", skipMeta: true },
    );
    validateDatabaseResult(reference, { operation: "findPage keyset reference" });
    expect(reference.success).toBe(true);
    const expected = new Set(reference.data.items.map((r: any) => String(r._id)));
    expect(expected.size).toBe(12);
    expect(reference.data.hasMore).toBe(false);

    const sequences = new Map<string, string[]>();
    for (const direction of [-1, 1, "desc", "asc"] as const) {
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      for (; pages < 10; pages++) {
        const res = await adapter.crud.findPage(
          TEST_COLLECTION,
          { tenantId: TEST_TENANT },
          {
            ...tenantOpts,
            limit: 5,
            sort: { status: direction },
            total: "none",
            skipMeta: true,
            cursor,
          },
        );
        validateDatabaseResult(res, { operation: `findPage keyset tiebreak ${direction}` });
        expect(res.success).toBe(true);
        seen.push(...res.data.items.map((r: any) => String(r._id)));
        if (!res.data.hasMore) break;
        expect(res.data.nextCursor).toBeTruthy();
        cursor = res.data.nextCursor;
      }
      // Must actually paginate (12 rows / 5 per page ≥ 2 pages).
      expect(pages).toBeGreaterThanOrEqual(2);
      // No repeats …
      expect(new Set(seen).size).toBe(seen.length);
      // … and no skips: every seeded row visited exactly once, in both directions.
      expect(new Set(seen)).toEqual(expected);
      sequences.set(String(direction), seen);
    }

    // Numeric and string directions are one contract: a SQL emitter that treats
    // `1` as DESC (or Mongo's `-1`) would walk a different row order than its own
    // cursor and show up here as a diverging sequence.
    expect(sequences.get("1")).toEqual(sequences.get("asc"));
    expect(sequences.get("-1")).toEqual(sequences.get("desc"));
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
        ...withSystemScope("testing"),
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

  /**
   * Stale-total regression: the list reader caches counts under the physical
   * table name (collection-service.ts), while the SDK write path clears the
   * schema id AND the normalised physical name (post-write.ts). After an insert
   * + write-path clear the cached total must be fresh — before the dual-spelling
   * tags it stayed stale for the full 30s TTL.
   */
  it("insert → count is fresh once the write-path tags are cleared (both spellings)", async () => {
    const physical = collectionTableName(TEST_COLLECTION);
    const filter = { tenantId: TEST_TENANT };
    const opts = { ...tenantOpts, mode: "exact" as const, skipMeta: true };

    const baselineResult = await adapter.crud.count(physical, filter, {
      ...opts,
      bypassCache: true,
    });
    validateDatabaseResult(baselineResult, { operation: "count baseline" });
    expect(baselineResult.success).toBe(true);
    const baseline = baselineResult.data as number;

    // Prime the cache with the entry the bug leaked to list pages.
    const primed = await adapter.crud.count(physical, filter, opts);
    expect(primed.success).toBe(true);
    expect(primed.data).toBe(baseline);

    const inserted = await db.crud.insert(
      TEST_COLLECTION,
      {
        _id: uid("fpc"),
        title: "Fresh total row (schema-id invalidation)",
        status: "active",
        tenantId: TEST_TENANT,
      },
      tenantOpts,
    );
    expect(inserted.success).toBe(true);

    // The write is visible to the count filter — the assertions below can only
    // fail on cache eviction, not on a filter/tenant mismatch.
    const insertedVisible = await adapter.crud.count(physical, filter, {
      ...opts,
      bypassCache: true,
    });
    validateDatabaseResult(insertedVisible, { operation: "count after insert (bypassCache)" });
    expect(insertedVisible.success).toBe(true);
    expect(insertedVisible.data as number).toBe(baseline + 1);

    // What post-write.ts clears on create/update/delete: the schema id AND the
    // normalised physical table name. The reader caches counts under the physical
    // name and `collectionTableName` is not invertible, so a schema-id-only clear
    // cannot evict the physical-spelled entry.
    await cacheService.clearByTags(
      [
        `collection:${TEST_COLLECTION}`,
        `count:${TEST_COLLECTION}`,
        `collection:${physical}`,
        `count:${physical}`,
      ],
      TEST_TENANT,
    );

    const afterWritePathClear = await adapter.crud.count(physical, filter, opts);
    validateDatabaseResult(afterWritePathClear, { operation: "count after insert" });
    expect(afterWritePathClear.success).toBe(true);
    expect(afterWritePathClear.data).toBe(baseline + 1);

    // Physical-name invalidation (BaseAdapter.invalidateQueryCache / Mongo crud)
    // must evict count entries too.
    const secondInsert = await db.crud.insert(
      TEST_COLLECTION,
      {
        _id: uid("fpc"),
        title: "Fresh total row (physical-name invalidation)",
        status: "active",
        tenantId: TEST_TENANT,
      },
      tenantOpts,
    );
    expect(secondInsert.success).toBe(true);

    const secondVisible = await adapter.crud.count(physical, filter, {
      ...opts,
      bypassCache: true,
    });
    validateDatabaseResult(secondVisible, { operation: "count after second insert (bypassCache)" });
    expect(secondVisible.success).toBe(true);
    expect(secondVisible.data as number).toBe(baseline + 2);

    await cacheService.clearByTags([`collection:${physical}`, `count:${physical}`], TEST_TENANT);

    const afterPhysicalClear = await adapter.crud.count(physical, filter, opts);
    validateDatabaseResult(afterPhysicalClear, { operation: "count after second insert" });
    expect(afterPhysicalClear.success).toBe(true);
    expect(afterPhysicalClear.data).toBe(baseline + 2);
  });
});
