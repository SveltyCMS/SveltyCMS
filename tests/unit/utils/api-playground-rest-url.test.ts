/**
 * @file tests/unit/utils/api-playground-rest-url.test.ts
 * @description The API playground (`/config/api`) must build a URL the
 * collections route actually serves as a *filtered list*, and the filter rows
 * typed in the builder must survive the round trip through
 * `parseCollectionQueryParams`. Both halves are asserted here: path + encoding.
 */

import { describe, expect, it } from "vitest";
import {
  buildCollectionRestPath,
  buildCollectionRestUrl,
  buildFilterSearchParams,
  type PlaygroundFilterRow,
} from "@utils/api-playground/rest-query-url";
import { parseCollectionQueryParams } from "@utils/api-params";

/** Decode a built URL the way the collections handler does. */
function parseBuiltUrl(url: string) {
  const parsed = new URL(url, "http://localhost");
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    params: parseCollectionQueryParams(parsed.searchParams),
  };
}

const row = (
  field: string,
  operator: PlaygroundFilterRow["operator"],
  value: string,
): PlaygroundFilterRow => ({ field, operator, value });

describe("buildCollectionRestPath", () => {
  it("targets the documented collection list endpoint", () => {
    expect(buildCollectionRestPath("posts")).toBe("/api/collections/posts");
  });

  it("does not append the /entries suffix the dispatcher reads as an entry id", () => {
    expect(buildCollectionRestPath("posts")).not.toContain("/entries");
  });

  it("encodes the collection id and rejects an empty one", () => {
    expect(buildCollectionRestPath("blog posts")).toBe("/api/collections/blog%20posts");
    expect(() => buildCollectionRestPath("  ")).toThrow();
  });
});

describe("buildFilterSearchParams", () => {
  it("always states the operator, so a row says exactly which comparison it means", () => {
    const params = buildFilterSearchParams([row("status", "eq", "published")]);
    expect([...params.keys()]).toEqual(["filter[status][eq]"]);
    expect(params.get("filter[status][eq]")).toBe("published");
  });

  it("keeps one entry per row and drops blank rows", () => {
    const params = buildFilterSearchParams([
      row("status", "eq", "published"),
      row("title", "contains", "hello"),
      row("author", "eq", "   "),
      row("   ", "eq", "nobody"),
    ]);
    expect([...params.keys()]).toEqual(["filter[status][eq]", "filter[title][contains]"]);
  });

  it("keeps two operators on the same field", () => {
    const params = buildFilterSearchParams([
      row("createdAt", "gt", "2026-01-01"),
      row("createdAt", "lt", "2026-12-31"),
    ]);
    expect([...params.keys()]).toEqual(["filter[createdAt][gt]", "filter[createdAt][lt]"]);
  });
});

describe("buildCollectionRestUrl", () => {
  it("carries the filter, sort, limit and offset the caller set", () => {
    const url = buildCollectionRestUrl({
      collectionId: "posts",
      filters: [row("status", "eq", "published")],
      sortField: "createdAt",
      sortOrder: "desc",
      limit: 20,
    });

    const built = parseBuiltUrl(url);
    expect(built.pathname).toBe("/api/collections/posts");
    expect(built.params.filter).toEqual({ status: { $eq: "published" } });
    expect(built.params.sortField).toBe("createdAt");
    expect(built.params.sortDirection).toBe("desc");
    expect(built.params.limit).toBe(20);
    expect(built.params.offset).toBe(0);
  });

  it("round-trips every operator the filter row offers", () => {
    const built = parseBuiltUrl(
      buildCollectionRestUrl({
        collectionId: "posts",
        filters: [
          row("status", "eq", "published"),
          row("status", "ne", "archived"),
          row("title", "contains", "hello world"),
          row("views", "gt", "10"),
          row("views", "lt", "1000"),
          row("tags", "in", "news, docs"),
        ],
      }),
    );

    // Operator names travel as the `$` form the query layer implements — see
    // tests/unit/api/playground-filter-pipeline.test.ts for the proof that these
    // reach the adapter and the driver as real comparisons.
    expect(built.params.filter).toEqual({
      status: { $eq: "published", $ne: "archived" },
      title: { $contains: "hello world" },
      views: { $gt: "10", $lt: "1000" },
      tags: { $in: ["news", "docs"] },
    });
  });

  it("keeps ascending sorts ascending", () => {
    const built = parseBuiltUrl(
      buildCollectionRestUrl({
        collectionId: "posts",
        filters: [row("status", "eq", "published")],
        sortField: "title",
        sortOrder: "asc",
      }),
    );
    expect(built.params.sortField).toBe("title");
    expect(built.params.sortDirection).toBe("asc");
  });

  it("sends offset, which the parser reads, instead of skip", () => {
    const url = buildCollectionRestUrl({ collectionId: "posts", offset: 40 });
    expect(url).toContain("offset=40");
    expect(url).not.toContain("skip=");
    expect(parseBuiltUrl(url).params.offset).toBe(40);
  });

  it("omits the query string when nothing is set", () => {
    expect(buildCollectionRestUrl({ collectionId: "posts" })).toBe("/api/collections/posts");
  });

  it("encodes values so the filter survives special characters", () => {
    const built = parseBuiltUrl(
      buildCollectionRestUrl({
        collectionId: "posts",
        filters: [row("title", "contains", "a&b=c[d]")],
      }),
    );
    expect(built.params.filter).toEqual({ title: { $contains: "a&b=c[d]" } });
  });

  it("is a pure builder: deterministic and does not mutate the filter rows", () => {
    // The playground fetches once per "Run" click from this URL; nothing here
    // schedules a request per keystroke.
    const filters = [row("status", "eq", "published")];
    const input = { collectionId: "posts", filters } as const;

    expect(buildCollectionRestUrl(input)).toBe(buildCollectionRestUrl(input));
    expect(filters).toEqual([{ field: "status", operator: "eq", value: "published" }]);
  });
});
