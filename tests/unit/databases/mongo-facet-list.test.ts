/**
 * @file tests/unit/databases/mongo-facet-list.test.ts
 * @description Contract tests for MongoCrudMethods.findPage `$facet` single-round-trip.
 *
 * ### Features:
 * - data + total served from ONE aggregate call (no find/countDocuments round trips)
 * - pipeline shape: `$match` → `$sort` (with `_id` tiebreaker) → `$facet { data: [$skip, $limit pageSize+1], total: [$count] }`
 * - `$match` filter is bit-identical to the two-query countDocuments filter (tenant/status/isDeleted)
 * - offset applied inside the facet; limit+1 hasMore/nextCursor slicing preserved
 * - two-query fallback for: keyset cursors, metadata estimates, total "none",
 *   projections (`fields`), adapter `hints`, missing `aggregate`, pipeline errors
 */

import { describe, expect, it, vi } from "vitest";
import { MongoCrudMethods } from "@src/databases/mongodb/crud-methods";
import { encodePageCursor } from "@src/databases/core/page-utils";
import type { DatabaseResult } from "@src/databases/db-interface";

interface FacetHarness {
  crud: MongoCrudMethods<never>;
  aggregate: ReturnType<typeof vi.fn>;
  facetExec: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findExec: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
  estimatedDocumentCount: ReturnType<typeof vi.fn>;
}

/** Mock model + passthrough adapter — the same seam the upsert-one-rt suite uses. */
function makeHarness(options: { withoutAggregate?: boolean } = {}): FacetHarness {
  const facetExec = vi.fn();
  const aggregate = vi.fn().mockReturnValue({ exec: facetExec });

  const findExec = vi.fn();
  const chain: Record<string, unknown> = { exec: findExec };
  chain.sort = vi.fn(() => chain);
  chain.skip = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.lean = vi.fn(() => chain);
  const find = vi.fn(() => chain);

  const countDocuments = vi.fn().mockResolvedValue(42);
  const estimatedDocumentCount = vi.fn().mockResolvedValue(1337);

  const model = {
    ...(options.withoutAggregate ? {} : { aggregate }),
    find,
    countDocuments,
    estimatedDocumentCount,
    collection: { name: "posts" },
    schema: { strict: false, paths: {} },
  } as never;

  const crud = new MongoCrudMethods<never>(model, { mapQuery: (q: unknown) => q });

  return { crud, aggregate, facetExec, find, findExec, countDocuments, estimatedDocumentCount };
}

function expectSuccess<T>(res: DatabaseResult<T>): T {
  expect(res.success).toBe(true);
  if (!res.success) throw new Error(res.message || "expected success");
  return res.data;
}

const QUERY = { tenantId: "t1", status: "published", isDeleted: false };

const DOCS = [
  {
    _id: "a",
    tenantId: "t1",
    status: "published",
    isDeleted: false,
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    _id: "b",
    tenantId: "t1",
    status: "published",
    isDeleted: false,
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    _id: "c",
    tenantId: "t1",
    status: "published",
    isDeleted: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("MongoCrudMethods.findPage $facet single round trip", () => {
  it("serves data + total from ONE aggregate call with the exact $facet pipeline", async () => {
    const h = makeHarness();
    h.facetExec.mockResolvedValue([{ data: DOCS, total: [{ count: 7 }] }]);

    const page = expectSuccess(
      await h.crud.findPage(
        QUERY as never,
        {
          tenantId: "t1",
          limit: 2,
          sort: { updatedAt: -1 },
          total: "exact",
          skipMeta: true,
          bypassSafeQuery: true,
        } as never,
      ),
    );

    // One round trip: aggregate only — never find / countDocuments / estimate.
    expect(h.aggregate).toHaveBeenCalledTimes(1);
    expect(h.facetExec).toHaveBeenCalledTimes(1);
    expect(h.find).not.toHaveBeenCalled();
    expect(h.countDocuments).not.toHaveBeenCalled();
    expect(h.estimatedDocumentCount).not.toHaveBeenCalled();

    expect(h.aggregate.mock.calls[0][0]).toEqual([
      { $match: { tenantId: "t1", status: "published", isDeleted: false } },
      { $sort: { updatedAt: -1, _id: -1 } },
      {
        $facet: {
          data: [{ $skip: 0 }, { $limit: 3 }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    // limit+1 → hasMore slicing, filtered-set total, keyset cursor on last item.
    expect(page.items.map((r: never) => String((r as { _id?: string })._id))).toEqual(["a", "b"]);
    expect(page.hasMore).toBe(true);
    expect(page.pageSize).toBe(2);
    expect(page.total).toBe(7);
    expect(page.totalEstimated).toBeUndefined();
    expect(page.nextCursor).toBe(
      encodePageCursor({ id: "b", d: "desc", f: "updatedAt", v: "2026-01-02T00:00:00.000Z" }),
    );
  });

  it("keeps the _id tiebreaker direction in $sort for ascending orders", async () => {
    const h = makeHarness();
    h.facetExec.mockResolvedValue([{ data: [], total: [{ count: 0 }] }]);

    await h.crud.findPage(
      QUERY as never,
      {
        tenantId: "t1",
        limit: 5,
        sort: { updatedAt: 1 },
        total: "exact",
        bypassSafeQuery: true,
      } as never,
    );

    expect(h.aggregate.mock.calls[0][0][1]).toEqual({ $sort: { updatedAt: 1, _id: 1 } });
  });

  it("normalizes tuple-array sort specs to the same multi-key $sort", async () => {
    const h = makeHarness();
    h.facetExec.mockResolvedValue([{ data: [], total: [{ count: 0 }] }]);

    await h.crud.findPage(
      QUERY as never,
      {
        tenantId: "t1",
        limit: 5,
        sort: [["updatedAt", "desc"]] as never,
        total: "exact",
        bypassSafeQuery: true,
      } as never,
    );

    expect(h.aggregate.mock.calls[0][0][1]).toEqual({ $sort: { updatedAt: -1, _id: -1 } });
  });

  it("applies the caller offset inside the facet data branch", async () => {
    const h = makeHarness();
    h.facetExec.mockResolvedValue([{ data: [], total: [{ count: 0 }] }]);

    await h.crud.findPage(
      QUERY as never,
      { tenantId: "t1", limit: 50, offset: 10, total: "exact", bypassSafeQuery: true } as never,
    );

    const facet = h.aggregate.mock.calls[0][0][2].$facet as { data: unknown[]; total: unknown[] };
    expect(facet.data).toEqual([{ $skip: 10 }, { $limit: 51 }]);
    expect(facet.total).toEqual([{ $count: "count" }]);
  });

  it("reports hasMore false and no cursor when the page fits the result", async () => {
    const h = makeHarness();
    h.facetExec.mockResolvedValue([{ data: DOCS.slice(0, 2), total: [{ count: 2 }] }]);

    const page = expectSuccess(
      await h.crud.findPage(
        QUERY as never,
        { tenantId: "t1", limit: 2, total: "exact", bypassSafeQuery: true } as never,
      ),
    );

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
    expect(page.total).toBe(2);
  });

  it("maps an empty $facet total to zero", async () => {
    const h = makeHarness();
    h.facetExec.mockResolvedValue([{ data: [], total: [] }]);

    const page = expectSuccess(
      await h.crud.findPage(
        QUERY as never,
        { tenantId: "t1", limit: 10, total: "exact", bypassSafeQuery: true } as never,
      ),
    );

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(0);
  });

  it("$match filter equals the two-query countDocuments filter (filtered-set parity)", async () => {
    const facetHarness = makeHarness();
    facetHarness.facetExec.mockResolvedValue([{ data: [], total: [{ count: 0 }] }]);
    await facetHarness.crud.findPage(
      QUERY as never,
      { tenantId: "t1", limit: 5, total: "exact", bypassSafeQuery: true } as never,
    );

    // Force the two-query path via a projection (fields) — same query otherwise.
    const fallbackHarness = makeHarness();
    fallbackHarness.findExec.mockResolvedValue([]);
    await fallbackHarness.crud.findPage(
      QUERY as never,
      {
        tenantId: "t1",
        limit: 5,
        total: "exact",
        fields: ["title"] as never,
        bypassSafeQuery: true,
      } as never,
    );

    expect((facetHarness.aggregate.mock.calls[0][0][0] as { $match: unknown }).$match).toEqual(
      fallbackHarness.countDocuments.mock.calls[0][0],
    );
  });
});

describe("MongoCrudMethods.findPage two-query fallbacks", () => {
  it("keyset cursor: find gets the keyset filter, count the UNaugmented filter", async () => {
    const h = makeHarness();
    h.findExec.mockResolvedValue([]);

    const cursor = encodePageCursor({ id: "10000000-0000-7000-8000-000000000001", d: "desc" });
    const page = expectSuccess(
      await h.crud.findPage(
        QUERY as never,
        { tenantId: "t1", limit: 5, cursor, total: "exact", bypassSafeQuery: true } as never,
      ),
    );

    expect(h.aggregate).not.toHaveBeenCalled();
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).toHaveBeenCalledTimes(1);
    expect(page.total).toBe(42);
    expect(page.totalEstimated).toBeUndefined();

    expect(h.find.mock.calls[0][0]).toEqual({
      $and: [
        { tenantId: "t1", status: "published", isDeleted: false },
        { _id: { $lt: "10000000-0000-7000-8000-000000000001" } },
      ],
    });
    expect(h.countDocuments.mock.calls[0][0]).toEqual(QUERY);
  });

  it("estimate-eligible query: keeps estimatedDocumentCount, no aggregate", async () => {
    const h = makeHarness();
    h.findExec.mockResolvedValue([]);

    const page = expectSuccess(
      await h.crud.findPage(
        {} as never,
        { limit: 5, total: "auto", bypassSafeQuery: true } as never,
      ),
    );

    expect(h.aggregate).not.toHaveBeenCalled();
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.estimatedDocumentCount).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).not.toHaveBeenCalled();
    expect(page.total).toBe(1337);
    expect(page.totalEstimated).toBe(true);
  });

  it("total none: single find, no count of any kind", async () => {
    const h = makeHarness();
    h.findExec.mockResolvedValue([]);

    await h.crud.findPage(
      QUERY as never,
      { tenantId: "t1", limit: 5, total: "none", bypassSafeQuery: true } as never,
    );

    expect(h.aggregate).not.toHaveBeenCalled();
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).not.toHaveBeenCalled();
    expect(h.estimatedDocumentCount).not.toHaveBeenCalled();
  });

  it("projection (fields) request: two-query path so findMany projection is honored", async () => {
    const h = makeHarness();
    h.findExec.mockResolvedValue([]);

    await h.crud.findPage(
      QUERY as never,
      {
        tenantId: "t1",
        limit: 5,
        total: "exact",
        fields: ["title"] as never,
        bypassSafeQuery: true,
      } as never,
    );

    expect(h.aggregate).not.toHaveBeenCalled();
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).toHaveBeenCalledTimes(1);
  });

  it("adapter hints (readConcern/readPreference): two-query path", async () => {
    const h = makeHarness();
    h.findExec.mockResolvedValue([]);

    await h.crud.findPage(
      QUERY as never,
      {
        tenantId: "t1",
        limit: 5,
        total: "exact",
        hints: { mongo: { readConcern: "majority" } } as never,
        bypassSafeQuery: true,
      } as never,
    );

    expect(h.aggregate).not.toHaveBeenCalled();
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).toHaveBeenCalledTimes(1);
  });

  it("model without aggregate: two-query path still succeeds", async () => {
    const h = makeHarness({ withoutAggregate: true });
    h.findExec.mockResolvedValue([]);

    const page = expectSuccess(
      await h.crud.findPage(
        QUERY as never,
        { tenantId: "t1", limit: 5, total: "exact", bypassSafeQuery: true } as never,
      ),
    );

    expect(h.aggregate).not.toHaveBeenCalled();
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).toHaveBeenCalledTimes(1);
    expect(page.total).toBe(42);
  });

  it("aggregate pipeline error: falls back to the two-query path and still succeeds", async () => {
    const h = makeHarness();
    h.facetExec.mockRejectedValue(new Error("sort exceeded memory limit"));
    h.findExec.mockResolvedValue([]);

    const page = expectSuccess(
      await h.crud.findPage(
        QUERY as never,
        { tenantId: "t1", limit: 5, total: "exact", bypassSafeQuery: true } as never,
      ),
    );

    expect(h.aggregate).toHaveBeenCalledTimes(1);
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.countDocuments).toHaveBeenCalledTimes(1);
    expect(page.total).toBe(42);
  });
});
