/**
 * @file tests/unit/graphql/fast-path.test.ts
 * @description Single-root GraphQL query matcher used to skip Yoga/JIT.
 *
 * Features tested:
 * - health / allCollections signatures (with comments + query keyword)
 * - mutations and multi-field queries stay on Yoga
 */

import { describe, expect, it } from "vitest";
import { matchSingleFieldQuery } from "@src/routes/api/graphql/cost-analyzer";

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
