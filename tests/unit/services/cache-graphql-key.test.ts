/**
 * @file tests/unit/services/cache-graphql-key.test.ts
 * @description Bounded memoization of normalized GraphQL response cache keys.
 *
 * Features:
 * - identical raw query/variables/filter/user inputs hit the memo
 * - distinct inputs miss and are stored
 * - semantically equal, string-different variables produce the same key
 * - user id and publication filter participate in the key
 * - the memo is capped and evicts the oldest entry
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  GRAPHQL_RESPONSE_KEY_MEMO_MAX,
  buildGraphQLResponseCacheKey,
  clearGraphQLResponseKeyMemo,
  getGraphQLResponseKeyMemoStats,
} from "@src/services/cache/response-cache";

describe("buildGraphQLResponseCacheKey memoization", () => {
  beforeEach(() => {
    clearGraphQLResponseKeyMemo();
  });

  it("hits the memo for identical raw inputs", () => {
    const variables = { limit: 10, status: "publish" };
    const first = buildGraphQLResponseCacheKey("query Q { entries }", variables, "all", "u1");
    const afterFirst = getGraphQLResponseKeyMemoStats();
    const second = buildGraphQLResponseCacheKey("query Q { entries }", variables, "all", "u1");

    expect(second).toBe(first);
    expect(getGraphQLResponseKeyMemoStats().size).toBe(1);
    expect(afterFirst.misses).toBe(1);
    expect(getGraphQLResponseKeyMemoStats().hits).toBe(1);
  });

  it("misses and stores a distinct query", () => {
    buildGraphQLResponseCacheKey("query A { a }", undefined);
    buildGraphQLResponseCacheKey("query B { b }", undefined);

    const stats = getGraphQLResponseKeyMemoStats();
    expect(stats.size).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hits).toBe(0);
  });

  it("produces the same key for semantically equal, string-different variables", () => {
    // Raw memo keys differ (so this exercises the compute path twice); the
    // normalized key must still be identical because keys are deep-sorted.
    const fromObject = buildGraphQLResponseCacheKey("query Q { x }", { b: 2, a: 1 });
    const reordered = buildGraphQLResponseCacheKey("query Q { x }", { a: 1, b: 2 });
    const fromString = buildGraphQLResponseCacheKey("query Q { x }", '{"b":2,"a":1}');

    expect(reordered).toBe(fromObject);
    expect(fromString).toBe(fromObject);
  });

  it("scopes keys by user id and publication filter", () => {
    const base = buildGraphQLResponseCacheKey("query Q { x }", { a: 1 }, "all", "u1");
    const otherUser = buildGraphQLResponseCacheKey("query Q { x }", { a: 1 }, "all", "u2");
    const otherFilter = buildGraphQLResponseCacheKey("query Q { x }", { a: 1 }, "published", "u1");

    expect(otherUser).not.toBe(base);
    expect(otherFilter).not.toBe(base);
    expect(base.startsWith("u:u1:")).toBe(true);
  });

  it("never trusts an unparsable variables string", () => {
    const key = buildGraphQLResponseCacheKey("query Q { x }", "{not-json");
    expect(key).toContain("/api/graphql");
  });

  it("caps the memo and evicts the oldest entry", () => {
    for (let i = 0; i < GRAPHQL_RESPONSE_KEY_MEMO_MAX + 5; i++) {
      buildGraphQLResponseCacheKey(`query Q${i} { x }`, { i });
    }

    const full = getGraphQLResponseKeyMemoStats();
    expect(full.size).toBe(GRAPHQL_RESPONSE_KEY_MEMO_MAX);
    expect(full.max).toBe(GRAPHQL_RESPONSE_KEY_MEMO_MAX);

    // The first-inserted entry was evicted, so re-requesting it is a miss.
    const missesBefore = getGraphQLResponseKeyMemoStats().misses;
    buildGraphQLResponseCacheKey("query Q0 { x }", { i: 0 });
    expect(getGraphQLResponseKeyMemoStats().misses).toBe(missesBefore + 1);
    expect(getGraphQLResponseKeyMemoStats().size).toBe(GRAPHQL_RESPONSE_KEY_MEMO_MAX);
  });
});
