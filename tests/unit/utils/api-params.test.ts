/**
 * @file tests/unit/utils/api-params.test.ts
 * @description Unit tests for parseCollectionQueryParams fast-path parser.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_SIZE,
  clampPageSize,
  parseCollectionQueryParams,
  parsePaginationQueryParams,
} from "@src/utils/api-params";

describe("parseCollectionQueryParams", () => {
  it("should return defaults when searchParams is empty", () => {
    const params = parseCollectionQueryParams(new URLSearchParams());
    expect(params.limit).toBe(50);
    expect(params.offset).toBe(0);
    expect(params.cursor).toBeUndefined();
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

  it("passes the opaque keyset cursor through verbatim", () => {
    const cursor = "azI6ZDpjb3VudDpuOjEyMzphYmM";
    const params = parseCollectionQueryParams(new URLSearchParams({ cursor }));
    expect(params.cursor).toBe(cursor);
  });

  it("ignores an empty cursor value", () => {
    const params = parseCollectionQueryParams(new URLSearchParams({ cursor: "" }));
    expect(params.cursor).toBeUndefined();
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

describe("page-size ceiling (MAX_PAGE_SIZE)", () => {
  it("caps an over-cap limit instead of rejecting it", () => {
    const params = parseCollectionQueryParams(new URLSearchParams({ limit: "100000000" }));
    expect(params.limit).toBe(MAX_PAGE_SIZE);
  });

  it("leaves a normal limit untouched", () => {
    const params = parseCollectionQueryParams(new URLSearchParams({ limit: "25" }));
    expect(params.limit).toBe(25);
  });

  it("keeps the default page size when no limit is given", () => {
    expect(parseCollectionQueryParams(new URLSearchParams()).limit).toBe(50);
    expect(parsePaginationQueryParams(new URLSearchParams()).limit).toBe(50);
  });

  it("applies the same ceiling to parsePaginationQueryParams", () => {
    expect(parsePaginationQueryParams(new URLSearchParams({ limit: "100000000" })).limit).toBe(
      MAX_PAGE_SIZE,
    );
    expect(parsePaginationQueryParams(new URLSearchParams({ limit: "25" })).limit).toBe(25);
  });

  it("clampPageSize keeps the lenient fallback semantics", () => {
    expect(clampPageSize("100000000")).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(200)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(25)).toBe(25);
    expect(clampPageSize(undefined, 50)).toBe(50);
    expect(clampPageSize(null, 50)).toBe(50);
    expect(clampPageSize(0, 50)).toBe(50);
    expect(clampPageSize(-5, 50)).toBe(50);
    expect(clampPageSize("not-a-number", 50)).toBe(50);
    expect(clampPageSize(Infinity, 50)).toBe(50);
  });
});
