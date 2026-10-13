/**
 * @file tests/unit/utils/dashboard-drilldown.test.ts
 * @description Click-through URL contract for dashboard analytics widgets.
 *
 * Features:
 * - language-prefixed route, filter_ prefix, encoding, skipped empty buckets
 */

import { describe, expect, it } from "vitest";
import { buildCollectionDrilldownHref, isFilterableBucket } from "@utils/dashboard-drilldown";
import { parseUrlFilterParams } from "@utils/collection-query-filters";

describe("buildCollectionDrilldownHref", () => {
  it("builds a plain collection link without filters", () => {
    expect(buildCollectionDrilldownHref({ language: "en", collection: "posts" })).toBe("/en/posts");
  });

  it("adds filter_ equality params that the list parser reads back", () => {
    const href = buildCollectionDrilldownHref({
      language: "de",
      collection: "posts",
      filters: { status: "publish", category: "News & Events" },
    });
    const [path, qs] = href.split("?");
    expect(path).toBe("/de/posts");
    const parsed = parseUrlFilterParams(new URLSearchParams(qs));
    // The platform URL contract is a `contains` match (see parseUrlFilterParams).
    expect(parsed.status).toEqual({ contains: "publish" });
    expect(parsed.category).toEqual({ contains: "News & Events" });
  });

  it("skips nullish and empty filter values", () => {
    const href = buildCollectionDrilldownHref({
      language: "en",
      collection: "posts",
      filters: { status: "", category: null, tag: undefined },
    });
    expect(href).toBe("/en/posts");
  });

  it("encodes path segments", () => {
    expect(buildCollectionDrilldownHref({ language: "en", collection: "a/b" })).toBe("/en/a%2Fb");
  });
});

describe("isFilterableBucket", () => {
  it("rejects the catch-all and empty buckets", () => {
    expect(isFilterableBucket("Other")).toBe(false);
    expect(isFilterableBucket("")).toBe(false);
    expect(isFilterableBucket(undefined)).toBe(false);
    expect(isFilterableBucket("publish")).toBe(true);
  });
});
