/**
 * @file tests/unit/widgets/fetch-related.test.ts
 * @description Relation widget uses one `$in` list request, not N findById GETs.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchRelatedEntries, isHydratedRelation } from "@src/widgets/core/relation/fetch-related";

describe("fetchRelatedEntries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues a single list request with _id $in", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { _id: "a", title: "One" },
          { _id: "b", title: "Two" },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchRelatedEntries("posts", ["a", "b", "a"], ["title"]);
    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/collections/posts?");
    expect(url).toContain(encodeURIComponent('{"_id":{"$in":["a","b"]}}'));
    expect(url).toContain("fields=_id%2Ctitle");
  });

  it("treats SSR-populated relation objects as hydrated", () => {
    expect(isHydratedRelation({ _id: "x", title: "Hi" })).toBe(true);
    expect(isHydratedRelation("x")).toBe(false);
  });
});
