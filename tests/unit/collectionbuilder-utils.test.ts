/**
 * @file tests/unit/collectionbuilder-utils.test.ts
 * @description Unit tests for collection builder pure utility functions.
 */

import { describe, expect, it } from "vitest";
import {
  getDescendantIds,
  uniquePathForCategory,
} from "@src/routes/(app)/config/collectionbuilder/collectionbuilder-utils";

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
