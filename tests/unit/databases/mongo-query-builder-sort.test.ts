/**
 * @file tests/unit/databases/mongo-query-builder-sort.test.ts
 * @description
 * Paginated sort tie-breaker parity with the SQL query builder: the `_id`
 * tiebreak must follow the LAST sort key's direction so the composite stays
 * monotonic and remains servable by a compound index (a mixed-direction sort
 * forces a blocking in-memory SORT stage on MongoDB, and a filesort on SQL).
 *
 * Also pins direction normalization: the Mongo-style numeric `1`/`-1` form
 * (as `defaultPageSortOption()` and untyped passthrough callers emit) must
 * produce the same sort object as `"asc"`/`"desc"` — one
 * `normalizeSortDirection()` source of truth shared with the SQL emitters.
 *
 * ### Features:
 * - single DESC / ASC primary sort → matching `_id` tiebreak
 * - multi-field sort → tiebreak matches the last clause
 * - explicit `_id` sort is never overwritten or duplicated
 * - unpaginated queries get no tiebreak (sort is passed through unchanged)
 * - numeric `1`/`-1` directions normalize exactly like `"asc"`/`"desc"`
 * - `paginate()` ignores legacy string cursors (keyset pagination lives in `page-utils`/`findPage`)
 */

import { describe, expect, it } from "vitest";
import type { Model } from "mongoose";
import type { BaseEntity } from "@src/databases/db-interface";
import { encodePageCursor } from "@src/databases/core/page-utils";
import { MongoQueryBuilder } from "@src/databases/mongodb/mongo-query-builder";

/** Mongoose model stub that records every find() filter and sort() spec. */
function captureModel() {
  const sorts: Record<string, 1 | -1>[] = [];
  const finds: Record<string, unknown>[] = [];
  const chain: Record<string, unknown> = {};
  chain.sort = (spec: Record<string, 1 | -1>) => {
    sorts.push(spec);
    return chain;
  };
  chain.select = () => chain;
  chain.skip = () => chain;
  chain.limit = () => chain;
  chain.lean = () => chain;
  chain.exec = async () => [];
  const model = {
    find: (query: Record<string, unknown>) => {
      finds.push(query);
      return chain;
    },
  } as unknown as Model<BaseEntity>;
  return { model, finds, sorts };
}

async function sortedSpec(build: (qb: MongoQueryBuilder<BaseEntity>) => void) {
  const { model, sorts } = captureModel();
  const qb = new MongoQueryBuilder<BaseEntity>(model);
  build(qb);
  const res = await qb.execute();
  expect(res.success).toBe(true);
  return sorts.at(-1);
}

describe("MongoQueryBuilder paginated sort tie-breaker", () => {
  it("follows a DESC primary sort (no mixed direction)", async () => {
    const spec = await sortedSpec((qb) =>
      qb.sort("createdAt", "desc").paginate({ page: 1, pageSize: 10 }),
    );
    expect(spec).toEqual({ createdAt: -1, _id: -1 });
  });

  it("follows an ASC primary sort", async () => {
    const spec = await sortedSpec((qb) =>
      qb.sort("createdAt", "asc").paginate({ page: 1, pageSize: 10 }),
    );
    expect(spec).toEqual({ createdAt: 1, _id: 1 });
  });

  it("matches the LAST clause of a multi-field sort", async () => {
    const spec = await sortedSpec((qb) =>
      qb
        .orderBy([
          // `status` is a dynamic collection column — not part of the static BaseEntity shape.
          { field: "status" as unknown as keyof BaseEntity, direction: "asc" },
          { field: "createdAt", direction: "desc" },
        ])
        .paginate({ page: 1, pageSize: 10 }),
    );
    expect(spec).toEqual({ status: 1, createdAt: -1, _id: -1 });
  });

  it("never overwrites an explicit _id sort key", async () => {
    const spec = await sortedSpec((qb) =>
      qb.sort("_id", "asc").paginate({ page: 1, pageSize: 10 }),
    );
    expect(spec).toEqual({ _id: 1 });
  });

  it("keeps the historical _id ASC tiebreak when no sort is given", async () => {
    const spec = await sortedSpec((qb) => qb.paginate({ page: 2, pageSize: 10 }));
    expect(spec).toEqual({ _id: 1 });
  });

  it("adds no tiebreak when the query is not paginated", async () => {
    const spec = await sortedSpec((qb) => qb.sort("createdAt", "desc"));
    expect(spec).toEqual({ createdAt: -1 });
  });
});

describe("MongoQueryBuilder sort direction normalization", () => {
  // `status` is a dynamic collection column — not part of the static BaseEntity shape.
  const field = "status" as unknown as keyof BaseEntity;
  // Mongo-style numeric directions, as `defaultPageSortOption()` / untyped
  // passthrough callers emit them. Narrow documented cast — the public builder
  // signature is `"asc" | "desc"`; `any` would hide the regression.
  const numericAsc = 1 as unknown as "asc";
  const numericDesc = -1 as unknown as "desc";

  it('maps a numeric 1 to the same ascending sort as "asc"', async () => {
    const numeric = await sortedSpec((qb) => qb.sort(field, numericAsc));
    const wire = await sortedSpec((qb) => qb.sort(field, "asc"));
    expect(numeric).toEqual({ status: 1 });
    expect(numeric).toEqual(wire);
  });

  it('maps a numeric -1 to the same descending sort as "desc"', async () => {
    const numeric = await sortedSpec((qb) => qb.sort(field, numericDesc));
    const wire = await sortedSpec((qb) => qb.sort(field, "desc"));
    expect(numeric).toEqual({ status: -1 });
    expect(numeric).toEqual(wire);
  });

  it("drives the _id tiebreak from the normalized direction when paginated", async () => {
    // Regression: the literal `=== "asc"` comparison inverted `1` to DESC and
    // emitted { status: -1, _id: -1 } — the mixed-direction class that broke
    // SQL keyset pagination (page N+1 repeated page N).
    const spec = await sortedSpec((qb) =>
      qb.sort(field, numericAsc).paginate({ page: 1, pageSize: 10 }),
    );
    expect(spec).toEqual({ status: 1, _id: 1 });
  });
});

describe("MongoQueryBuilder cursor contract (keyset is owned by page-utils/findPage)", () => {
  // Dynamic schema key — not part of the static BaseEntity shape.
  const field = "createdAt" as unknown as keyof BaseEntity;
  // Wire + Mongo-style numeric directions; the deleted branch compared
  // `=== "desc"` and mapped `-1` to `$gt` — the inverse seek direction.
  const directions: Array<"asc" | "desc" | undefined> = [
    "asc",
    "desc",
    1 as unknown as "asc",
    -1 as unknown as "desc",
    undefined,
  ];

  it.each(directions)(
    "ignores a legacy 'field:value' string cursor (direction: %s)",
    async (sortDirection) => {
      const { model, finds } = captureModel();
      const qb = new MongoQueryBuilder<BaseEntity>(model);
      qb.paginate({
        page: 1,
        pageSize: 10,
        cursor: "createdAt:2024-01-01T00:00:00.000Z",
        sortField: field as string,
        sortDirection,
      });
      const res = await qb.execute();
      expect(res.success).toBe(true);
      // No $lt/$gt comparison may leak in from a string cursor — a reintroduced
      // branch would inject { createdAt: { $lt | $gt: "…" } } here.
      expect(finds.at(-1)).toEqual({});
    },
  );

  it("never consumes the opaque keyset cursor emitted by page-utils", async () => {
    const { model, finds } = captureModel();
    const qb = new MongoQueryBuilder<BaseEntity>(model);
    qb.paginate({
      pageSize: 10,
      cursor: encodePageCursor({ id: "row-1", f: "createdAt", v: 123, d: "asc" }),
    });
    const res = await qb.execute();
    expect(res.success).toBe(true);
    expect(finds.at(-1)).toEqual({});
  });
});
