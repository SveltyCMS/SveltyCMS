/**
 * @file tests/unit/graphql/fast-path.test.ts
 * @description Single-root GraphQL query matcher used to skip Yoga/JIT.
 *
 * Features tested:
 * - health / allCollections signatures (with comments + query keyword)
 * - mutations and multi-field queries stay on Yoga
 */

import { describe, expect, it } from "vitest";
import { matchSingleFieldQuery, matchCollectionQuery } from "@src/routes/api/graphql/cost-analyzer";

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
});
