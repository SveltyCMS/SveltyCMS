/**
 * @file tests/unit/databases/sql-json-merge.test.ts
 * @description
 * Unit coverage for the pure JSON-merge helpers: the dialect wrapper text, the
 * one-statement exactness boundary, and the shallow null-keeping JS merge.
 *
 * ### Features:
 * - PostgreSQL wrapper is the exact `jsonb || jsonb` form
 * - "operator" dialects merge every patch in SQL
 * - "subset" dialects defer nested objects and explicit nulls to JS
 * - shallow merge overwrites keys and keeps explicit nulls
 */

import { describe, expect, it } from "vitest";
import {
  canMergeJsonPatchInOneStatement,
  jsonMergeWrapperExpression,
  mergeJsonPatchShallow,
} from "@src/databases/sql/json-merge";

describe("jsonMergeWrapperExpression", () => {
  it("wraps the column in the exact jsonb shallow-merge operator", () => {
    expect(jsonMergeWrapperExpression(`"data"`)).toEqual({
      prefix: `COALESCE("data", '{}'::jsonb) || `,
      suffix: `::jsonb`,
    });
  });
});

describe("canMergeJsonPatchInOneStatement", () => {
  it("always allows SQL merging for operator dialects", () => {
    expect(canMergeJsonPatchInOneStatement("operator", { nested: { a: 1 } })).toBe(true);
    expect(canMergeJsonPatchInOneStatement("operator", { removed: null })).toBe(true);
  });

  it("restricts subset dialects to shallow-safe patches", () => {
    expect(canMergeJsonPatchInOneStatement("subset", { title: "x", views: 3 })).toBe(true);
    expect(canMergeJsonPatchInOneStatement("subset", { tags: ["a"] })).toBe(true);
    expect(canMergeJsonPatchInOneStatement("subset", { nested: { a: 1 } })).toBe(false);
    expect(canMergeJsonPatchInOneStatement("subset", { removed: null })).toBe(false);
  });
});

describe("mergeJsonPatchShallow", () => {
  it("overwrites patched keys and keeps unmentioned stored keys", () => {
    expect(
      mergeJsonPatchShallow({ title: "old", views: 1, tags: ["a"] }, { title: "new", views: 2 }),
    ).toEqual({ title: "new", views: 2, tags: ["a"] });
  });

  it("keeps explicit nulls instead of deleting the key", () => {
    expect(mergeJsonPatchShallow({ relation: { id: "1" } }, { relation: null })).toEqual({
      relation: null,
    });
  });

  it("does not mutate the stored blob and ignores inherited patch keys", () => {
    const stored = { title: "old" };
    const patch = Object.create({ inherited: true }) as Record<string, unknown>;
    patch.title = "new";

    const merged = mergeJsonPatchShallow(stored, patch);

    expect(merged).toEqual({ title: "new" });
    expect(stored).toEqual({ title: "old" });
    expect(Object.hasOwn(merged, "inherited")).toBe(false);
  });
});
