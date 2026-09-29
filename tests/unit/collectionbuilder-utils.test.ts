/**
 * @file tests/unit/collectionbuilder-utils.test.ts
 * @description Unit tests for collection builder pure utility functions.
 */

import { describe, expect, it } from "vitest";
import type { ContentNodeInput, ContentNodeOperation } from "@src/content/types";
import {
  getDescendantIds,
  uniquePathForCategory,
  validateMinimumCollectionFields,
  validateStructureOperation,
} from "@src/routes/(app)/config/collectionbuilder/collectionbuilder-utils";

const field = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  label: "Title",
  db_fieldName: "title",
  widget: { Name: "Input", key: "Input" },
  ...overrides,
});

const nodeOp = (type: ContentNodeOperation["type"], node: Partial<ContentNodeInput>) =>
  ({ type, node: { path: "/x", ...node } }) as ContentNodeOperation;

describe("validateMinimumCollectionFields", () => {
  it("rejects a field-less collection in every payload shape", () => {
    expect(validateMinimumCollectionFields([])).toMatchObject({ ok: false });
    expect(validateMinimumCollectionFields({})).toMatchObject({ ok: false });
    expect(validateMinimumCollectionFields(undefined)).toMatchObject({ ok: false });
  });

  it("accepts one well-formed field (array and field-map shapes)", () => {
    expect(validateMinimumCollectionFields([field()])).toEqual({ ok: true });
    expect(validateMinimumCollectionFields({ "0": field() })).toEqual({ ok: true });
  });

  it("rejects a field without a database field name", () => {
    const result = validateMinimumCollectionFields([field({ db_fieldName: "  " })]);
    expect(result).toEqual({
      ok: false,
      message: "Field 1 (“Title”) needs a database field name (db_fieldName) before saving.",
    });
  });

  it("falls back to the field `name` for identity", () => {
    expect(validateMinimumCollectionFields([{ name: "title", widget: { Name: "Input" } }])).toEqual(
      { ok: true },
    );
  });

  it("rejects a field without a widget/type and accepts a bare `type`", () => {
    expect(validateMinimumCollectionFields([field({ widget: {} })])).toEqual({
      ok: false,
      message: "Field “title” needs a widget (type) before saving.",
    });
    expect(validateMinimumCollectionFields([{ db_fieldName: "title", type: "text" }])).toEqual({
      ok: true,
    });
  });

  it("rejects non-object field entries", () => {
    expect(validateMinimumCollectionFields(["title"])).toMatchObject({ ok: false });
  });
});

describe("validateStructureOperation", () => {
  it("requires a non-empty path", () => {
    expect(
      validateStructureOperation(
        nodeOp("create", { name: "Blog", nodeType: "category", path: "  " }),
      ),
    ).toBe("A structure node needs a path before it can be saved.");
  });

  it("requires a name for create/rename/update", () => {
    expect(validateStructureOperation(nodeOp("create", { name: "", nodeType: "category" }))).toBe(
      "A category needs a name before it can be saved.",
    );
    expect(
      validateStructureOperation(nodeOp("rename", { name: "  ", nodeType: "collection" })),
    ).toBe("A collection node needs a name before it can be saved.");
    expect(validateStructureOperation(nodeOp("update", { name: "", nodeType: "collection" }))).toBe(
      "A collection node needs a name before it can be saved.",
    );
  });

  it("allows path-only move/delete ops", () => {
    expect(validateStructureOperation(nodeOp("move", {}))).toBeNull();
    expect(validateStructureOperation(nodeOp("delete", {}))).toBeNull();
  });

  it("accepts a named create", () => {
    expect(
      validateStructureOperation(nodeOp("create", { name: "Blog", nodeType: "category" })),
    ).toBeNull();
  });
});

describe("getDescendantIds", () => {
  it("returns only the category itself when no children", () => {
    const flat = [
      { _id: "cat-1", parentId: undefined },
      { _id: "col-1", parentId: "other-cat" },
    ];
    expect(getDescendantIds("cat-1", flat)).toEqual(["cat-1"]);
  });

  it("returns category and all descendants", () => {
    const flat = [
      { _id: "cat-1", parentId: undefined },
      { _id: "col-1", parentId: "cat-1" },
      { _id: "col-2", parentId: "cat-1" },
      { _id: "subcat-1", parentId: "cat-1" },
      { _id: "col-3", parentId: "subcat-1" },
    ];
    const result = getDescendantIds("cat-1", flat);
    expect(result).toHaveLength(5);
    expect(result).toContain("cat-1");
    expect(result).toContain("col-1");
    expect(result).toContain("col-2");
    expect(result).toContain("subcat-1");
    expect(result).toContain("col-3");
  });

  it("handles deeply nested hierarchies", () => {
    const flat = [
      { _id: "root", parentId: undefined },
      { _id: "l1", parentId: "root" },
      { _id: "l2", parentId: "l1" },
      { _id: "l3", parentId: "l2" },
      { _id: "leaf", parentId: "l3" },
    ];
    expect(getDescendantIds("root", flat)).toHaveLength(5);
  });

  it("does not include unrelated nodes", () => {
    const flat = [
      { _id: "cat-a", parentId: undefined },
      { _id: "col-a1", parentId: "cat-a" },
      { _id: "cat-b", parentId: undefined },
      { _id: "col-b1", parentId: "cat-b" },
    ];
    const result = getDescendantIds("cat-a", flat);
    expect(result).toHaveLength(2);
    expect(result).toContain("cat-a");
    expect(result).toContain("col-a1");
  });

  it("returns empty for non-existent id", () => {
    const flat = [{ _id: "cat-1", parentId: undefined }];
    expect(getDescendantIds("nonexistent", flat)).toEqual(["nonexistent"]);
  });
});

describe("uniquePathForCategory", () => {
  it("generates a simple slug path", () => {
    expect(uniquePathForCategory("Blog Posts")).toBe("/blog-posts");
  });

  it("defaults to 'category' for empty input", () => {
    expect(uniquePathForCategory("")).toBe("/category");
    expect(uniquePathForCategory("   ")).toBe("/category");
    expect(uniquePathForCategory("!@#$%")).toBe("/category");
  });

  it("strips special characters", () => {
    expect(uniquePathForCategory("Hello World!")).toBe("/hello-world");
    expect(uniquePathForCategory("Foo & Bar")).toBe("/foo--bar");
  });

  it("deduplicates against existing paths", () => {
    const existing = new Set(["/blog-posts", "/blog-posts-1"]);
    expect(uniquePathForCategory("Blog Posts", existing)).toBe("/blog-posts-2");
  });

  it("case-insensitive deduplication", () => {
    const existing = new Set(["/my-page"]);
    expect(uniquePathForCategory("My Page", existing)).toBe("/my-page-1");
  });

  it("handles many collisions", () => {
    const existing = new Set(["/test", "/test-1", "/test-2", "/test-3"]);
    expect(uniquePathForCategory("Test", existing)).toBe("/test-4");
  });
});
