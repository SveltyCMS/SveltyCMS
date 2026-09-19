/**
 * @file tests/unit/graphql/fast-path.test.ts
 * @description Single-root GraphQL query matcher used to skip Yoga/JIT.
 *
 * Features tested:
 * - health / allCollections signatures (with comments + query keyword)
 * - mutations and multi-field queries stay on Yoga
 * - client-supplied limits are capped by the shared MAX_PAGE_SIZE bound
 */

import { describe, expect, it } from "vitest";
import { matchSingleFieldQuery, matchCollectionQuery } from "@src/routes/api/graphql/cost-analyzer";
import { MAX_PAGE_SIZE } from "@utils/api-params";

describe("matchSingleFieldQuery", () => {
  it("matches health and collection-list bench queries including comment noise", () => {
    expect(
      matchSingleFieldQuery(
        `query { contentSystemHealth { state version collectionCount } } # n:12`,
      ),
    ).toEqual({
      field: "contentSystemHealth",
      selections: ["state", "version", "collectionCount"],
    });
    expect(matchSingleFieldQuery(`query { allCollections { _id name } }`)).toEqual({
      field: "allCollections",
      selections: ["_id", "name"],
    });
  });

  it("rejects mutations and multi-root queries", () => {
    expect(matchSingleFieldQuery(`mutation { createEntry { _id } }`)).toBeNull();
    expect(
      matchSingleFieldQuery(`query { allCollections { _id } contentSystemHealth { state } }`),
    ).toBeNull();
  });
});

describe("matchCollectionQuery (fast-path)", () => {
  it("matches single collection queries with pagination arguments", () => {
    expect(
      matchCollectionQuery(
        `query { Articles(pagination: { limit: 10, page: 2 }) { _id title status views } }`,
      ),
    ).toEqual({
      field: "Articles",
      selections: ["_id", "title", "status", "views"],
      limit: 10,
      page: 2,
    });
  });

  it("matches collection queries with top-level limit argument", () => {
    expect(
      matchCollectionQuery(`query { BenchmarkStable(limit: 20) { _id title count } }`),
    ).toEqual({
      field: "BenchmarkStable",
      selections: ["_id", "title", "count"],
      limit: 20,
      page: 1,
    });
  });

  it("matches simple collection queries without arguments", () => {
    expect(matchCollectionQuery(`query { Posts { _id title } }`)).toEqual({
      field: "Posts",
      selections: ["_id", "title"],
      limit: 50,
      page: 1,
    });
  });

  it("rejects relational queries with nested selection sets so Yoga handles them", () => {
    expect(
      matchCollectionQuery(`query { Articles { _id title author { name email } } }`),
    ).toBeNull();
  });

  it("caps an over-cap limit with the shared MAX_PAGE_SIZE bound", () => {
    const matched = matchCollectionQuery(
      `query { Articles(pagination: { limit: 100000000 }) { _id title } }`,
    );
    expect(matched?.limit).toBe(MAX_PAGE_SIZE);
    expect(matched?.page).toBe(1);
  });

  it("caps a top-level over-cap limit argument", () => {
    expect(matchCollectionQuery(`query { Articles(limit: 100000000) { _id } }`)?.limit).toBe(
      MAX_PAGE_SIZE,
    );
  });

  it("leaves a normal limit untouched", () => {
    expect(matchCollectionQuery(`query { Articles(limit: 25) { _id } }`)?.limit).toBe(25);
  });

  it("keeps the default 50 when no limit is given", () => {
    expect(matchCollectionQuery(`query { Articles { _id } }`)?.limit).toBe(50);
  });
});
