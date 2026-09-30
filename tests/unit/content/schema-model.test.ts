/**
 * @file tests/unit/content/schema-model.test.ts
 * @description Unit tests for the lean schema-model helpers (where, orderBy, cache hints).
 *
 * Features tested:
 * - documentMatches: scalar operators, AND/OR/NOT, relation some/none/every, dotted paths
 * - where shape caps: length 8000 / depth 6 / nodes 64 (rejected, never truncated)
 * - isFilterable guard and JSON-string `where` input
 * - parseOrderBy: forms, unknown fields, isOrderable false/function
 * - cacheControlFor / mergeCacheControl: tightest maxAge, private wins
 * - SchemaModelError codes
 */
import { describe, expect, it } from "vitest";
import {
  SchemaModelError,
  WHERE_LIMITS,
  cacheControlFor,
  documentMatches,
  mergeCacheControl,
  parseOrderBy,
} from "@src/content/schema-model";

const fields = [
  { name: "Title", db_fieldName: "title", type: "string" },
  { name: "views", db_fieldName: "views", type: "number", isOrderable: true },
  { name: "locked", db_fieldName: "locked", type: "string", isOrderable: false },
  {
    name: "limited",
    db_fieldName: "limited",
    type: "string",
    isOrderable: ({ user }: { user?: unknown }) => Boolean(user),
  },
  { name: "secret", db_fieldName: "secret", type: "string", isFilterable: false },
  {
    name: "Owner",
    db_fieldName: "ownerId",
    type: "string",
    cacheHint: { maxAge: 60, scope: "public" },
  },
  { name: "Token", db_fieldName: "token", type: "string", cacheHint: { maxAge: 300 } },
];

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof SchemaModelError) return err.code;
    return `not-schema-model: ${String(err)}`;
  }
  return "no-error";
}

describe("documentMatches", () => {
  it("matches plain equality, including a JSON-string where", () => {
    expect(documentMatches({ status: "publish" }, { status: "publish" })).toBe(true);
    expect(documentMatches({ status: "draft" }, { status: "publish" })).toBe(false);
    expect(documentMatches({ status: "publish" }, '{"status":"publish"}')).toBe(true);
    expect(documentMatches({ a: 1 }, undefined)).toBe(true);
  });

  it("applies scalar operators", () => {
    const doc = { views: 6, title: "Hello World", tags: ["a", "b"] };
    expect(documentMatches(doc, { views: { gt: 5 } })).toBe(true);
    expect(documentMatches(doc, { views: { gte: 6 } })).toBe(true);
    expect(documentMatches(doc, { views: { lt: 6 } })).toBe(false);
    expect(documentMatches(doc, { views: { lte: 6 } })).toBe(true);
    expect(documentMatches(doc, { views: { in: [1, 6] } })).toBe(true);
    expect(documentMatches(doc, { views: { not: 6 } })).toBe(false);
    expect(documentMatches(doc, { title: { contains: "lo Wo" } })).toBe(true);
    expect(documentMatches(doc, { tags: { contains: "b" } })).toBe(true);
  });

  it("combines with AND / OR / NOT", () => {
    const doc = { status: "publish", views: 6 };
    expect(documentMatches(doc, { AND: [{ status: "publish" }, { views: { gt: 5 } }] })).toBe(true);
    expect(documentMatches(doc, { OR: [{ status: "draft" }, { views: { gt: 5 } }] })).toBe(true);
    expect(documentMatches(doc, { NOT: { status: "draft" } })).toBe(true);
    expect(documentMatches(doc, { NOT: { status: "publish" } })).toBe(false);
  });

  it("evaluates relation some / none / every", () => {
    const doc = { tags: ["a", "b"] };
    expect(documentMatches(doc, { tags: { some: "a" } })).toBe(true);
    expect(documentMatches(doc, { tags: { none: "c" } })).toBe(true);
    expect(documentMatches(doc, { tags: { every: { in: ["a", "b"] } } })).toBe(true);
    expect(documentMatches(doc, { tags: { every: "a" } })).toBe(false);
    expect(documentMatches({ tags: [] }, { tags: { every: "a" } })).toBe(true);
  });

  it("resolves dotted paths", () => {
    expect(documentMatches({ meta: { published: true } }, { "meta.published": true })).toBe(true);
    expect(documentMatches({ meta: { published: false } }, { "meta.published": true })).toBe(false);
  });

  it("rejects filters on isFilterable: false fields", () => {
    expect(codeOf(() => documentMatches({ secret: "x" }, { secret: "x" }, fields))).toBe(
      "WHERE_FIELD_NOT_FILTERABLE",
    );
  });

  it("enforces the where shape caps", () => {
    expect(
      codeOf(() =>
        documentMatches({ title: "x" }, { title: { equals: "a".repeat(WHERE_LIMITS.maxLength) } }),
      ),
    ).toBe("WHERE_TOO_LARGE");

    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(codeOf(() => documentMatches({}, deep))).toBe("WHERE_TOO_DEEP");

    const wide = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`f${index}`, index]),
    );
    expect(codeOf(() => documentMatches({}, wide))).toBe("WHERE_TOO_COMPLEX");

    expect(codeOf(() => documentMatches({}, "{not json"))).toBe("WHERE_INVALID");
  });
});

describe("parseOrderBy", () => {
  it("parses the documented forms", () => {
    expect(parseOrderBy("title", fields)).toEqual({ field: "title", direction: "asc" });
    expect(parseOrderBy("+title", fields)).toEqual({ field: "title", direction: "asc" });
    expect(parseOrderBy("-views", fields)).toEqual({ field: "views", direction: "desc" });
    expect(parseOrderBy("views:desc", fields)).toEqual({ field: "views", direction: "desc" });
    expect(parseOrderBy("views asc", fields)).toEqual({ field: "views", direction: "asc" });
  });

  it("rejects unknown and non-orderable fields", () => {
    expect(codeOf(() => parseOrderBy("nope", fields))).toBe("ORDERBY_UNKNOWN_FIELD");
    expect(codeOf(() => parseOrderBy("locked", fields))).toBe("ORDERBY_FIELD_NOT_ORDERABLE");
    expect(codeOf(() => parseOrderBy("limited", fields))).toBe("ORDERBY_FIELD_NOT_ORDERABLE");
    expect(parseOrderBy("limited", fields, { user: { _id: "u1" } })).toEqual({
      field: "limited",
      direction: "asc",
    });
    expect(codeOf(() => parseOrderBy("", fields))).toBe("ORDERBY_INVALID");
  });
});

describe("cacheControlFor / mergeCacheControl", () => {
  it("emits the tightest maxAge and keeps private scope", () => {
    expect(cacheControlFor(fields, ["ownerId"])).toBe("public, max-age=60");
    expect(cacheControlFor(fields, ["token"])).toBe("private, max-age=300");
    expect(cacheControlFor(fields, ["ownerId", "token"])).toBe("private, max-age=60");
    expect(cacheControlFor(fields)).toBe("private, max-age=60");
  });

  it("returns null when no requested field declares a hint", () => {
    expect(cacheControlFor(fields, ["title"])).toBeNull();
    expect(cacheControlFor([])).toBeNull();
  });

  it("merges private wins and the minimum maxAge", () => {
    expect(mergeCacheControl(null, "public, max-age=60")).toBe("public, max-age=60");
    expect(mergeCacheControl("public, max-age=60", null)).toBe("public, max-age=60");
    expect(mergeCacheControl("public, max-age=60", "private, max-age=300")).toBe(
      "private, max-age=60",
    );
    expect(mergeCacheControl("no-store", "public, max-age=10")).toBe("public, max-age=10");
    expect(mergeCacheControl(null, null)).toBeNull();
  });

  it("carries a stable code on SchemaModelError", () => {
    const error = new SchemaModelError("message", "SOME_CODE");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SchemaModelError");
    expect(error.code).toBe("SOME_CODE");
  });
});
