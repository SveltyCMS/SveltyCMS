/**
 * @file tests/unit/utils/api-params.test.ts
 * @description Unit tests for parseCollectionQueryParams fast-path parser.
 */

import { describe, expect, it } from "vitest";
import { parseCollectionQueryParams } from "@src/utils/api-params";

describe("parseCollectionQueryParams", () => {
  it("should return defaults when searchParams is empty", () => {
    const params = parseCollectionQueryParams(new URLSearchParams());
    expect(params.limit).toBe(50);
    expect(params.offset).toBe(0);
    expect(params.sortField).toBeUndefined();
    expect(params.sortDirection).toBe("desc");
    expect(params.publicationFilter).toBeUndefined();
    expect(params.bypassCache).toBe(false);
    expect(params.populate).toBeUndefined();
    expect(params.fields).toBeUndefined();
    expect(params.stream).toBe(false);
    expect(params.includeCount).toBe(false);
    expect(params.filter).toEqual({});
  });

  it("should parse standard pagination and sorting correctly", () => {
    const searchParams = new URLSearchParams({
      limit: "25",
      offset: "50",
      sortField: "createdAt",
      sortDirection: "asc",
    });
    const params = parseCollectionQueryParams(searchParams);
    expect(params.limit).toBe(25);
    expect(params.offset).toBe(50);
    expect(params.sortField).toBe("createdAt");
    expect(params.sortDirection).toBe("asc");
  });

  it("should support alias query keys (sort and order)", () => {
    const searchParams = new URLSearchParams({
      sort: "title",
      order: "asc",
    });
    const params = parseCollectionQueryParams(searchParams);
    expect(params.sortField).toBe("title");
    expect(params.sortDirection).toBe("asc");
  });

  it("should parse comma-separated populate and fields projection", () => {
    const searchParams = new URLSearchParams({
      populate: "author, category, tags ",
      fields: "title, slug, status ",
    });
    const params = parseCollectionQueryParams(searchParams);
    expect(params.populate).toEqual(["author", "category", "tags"]);
    expect(params.fields).toEqual(["title", "slug", "status"]);
  });

  it("should parse bracket-style filters and JSON filters", () => {
    const searchParams = new URLSearchParams();
    searchParams.set("filter[status]", "published");
    searchParams.set("filter[category]", "news");
    searchParams.set("filter", JSON.stringify({ isFeatured: true }));

    const params = parseCollectionQueryParams(searchParams);
    expect(params.filter).toEqual({
      status: "published",
      category: "news",
      isFeatured: true,
    });
  });

  it("should parse flags (bypassCache, nocache, stream, includeCount)", () => {
    const searchParams = new URLSearchParams({
      nocache: "true",
      stream: "true",
      includeCount: "true",
      publicationFilter: "published",
    });
    const params = parseCollectionQueryParams(searchParams);
    expect(params.bypassCache).toBe(true);
    expect(params.stream).toBe(true);
    expect(params.includeCount).toBe(true);
    expect(params.publicationFilter).toBe("published");
  });

  it("should ignore invalid numeric values gracefully", () => {
    const searchParams = new URLSearchParams({
      limit: "-10",
      offset: "invalid",
    });
    const params = parseCollectionQueryParams(searchParams);
    expect(params.limit).toBe(50);
    expect(params.offset).toBe(0);
  });
});
