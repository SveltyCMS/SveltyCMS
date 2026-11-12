/**
 * @file tests/unit/services/response-dependency.test.ts
 * @description Unit contract for the list-body/write dependency model: query-string
 * parsing (`filter`/`sort`/`fields`), flat equality extraction, dotted-path reads, and
 * the conservative eviction verdict of `bodyAffectedByWrite`.
 *
 * Features:
 * - unfiltered bodies are always affected by every write kind
 * - scalar / `$eq` / `$in` / top-level `$and` filters reduce to a flat equality map
 * - `$ne` / `$or` / nested filters degrade to `precise: false` and always evict
 * - create/delete membership comes from `rowAfter` / `rowBefore`
 * - update verdicts come from filter fields, sort fields and the projection
 * - dotted paths (`meta.status`) are read through the row and reported by head segment
 * - malformed JSON in `filter`/`sort`/`fields` never throws and stays imprecise
 */

import { describe, expect, it } from "vitest";
import {
  bodyAffectedByWrite,
  parseListBodyDependency,
  rowMatchesEquality,
  type ListBodyDependency,
  type WriteChange,
} from "@src/databases/core/response-dependency";

/** Parse a list-request query string into a dependency. */
function dependency(params: Record<string, string>): ListBodyDependency {
  return parseListBodyDependency(new URLSearchParams(params));
}

/** Parse with a JSON-encoded `filter` object (the wire form). */
function filtered(filter: Record<string, unknown>, extra: Record<string, string> = {}) {
  return dependency({ filter: JSON.stringify(filter), ...extra });
}

function createChange(rowAfter: Record<string, unknown> | null): WriteChange {
  return { kind: "create", changedFields: Object.keys(rowAfter ?? {}), rowAfter };
}

function deleteChange(rowBefore: Record<string, unknown> | null): WriteChange {
  return { kind: "delete", changedFields: Object.keys(rowBefore ?? {}), rowBefore };
}

function updateChange(changedFields: readonly string[]): WriteChange {
  return { kind: "update", changedFields };
}

describe("parseListBodyDependency — unfiltered bodies", () => {
  it("treats an absent filter as unfiltered and precise", () => {
    const dep = dependency({});

    expect(dep.unfiltered).toBe(true);
    expect(dep.precise).toBe(true);
    expect(dep.equality).toEqual({});
    expect(dep.filterFields).toEqual([]);
    expect(dep.sortFields).toEqual([]);
    expect(dep.projectedFields).toBeNull();
  });

  it("treats `{}` / empty / whitespace filters as unfiltered", () => {
    for (const filter of ["{}", "", "   "]) {
      const dep = dependency({ filter });
      expect(dep.unfiltered, `filter=${JSON.stringify(filter)}`).toBe(true);
      expect(dep.precise).toBe(true);
      expect(dep.equality).toEqual({});
    }
  });

  it("keeps sort/fields parsing on an unfiltered body", () => {
    const dep = dependency({ sort: "-updatedAt", fields: "title" });

    expect(dep.unfiltered).toBe(true);
    expect(dep.sortFields).toEqual(["updatedAt"]);
    expect(dep.projectedFields).toEqual(["title"]);
  });

  it("is affected by every write kind", () => {
    const dep = dependency({});
    const row = { _id: "a1", status: "draft", views: 1 };

    expect(bodyAffectedByWrite(dep, createChange(row))).toBe(true);
    expect(bodyAffectedByWrite(dep, updateChange(["views"]))).toBe(true);
    expect(bodyAffectedByWrite(dep, deleteChange(row))).toBe(true);
  });
});

describe("parseListBodyDependency — equality, sort and projection parsing", () => {
  it("flattens a scalar filter value", () => {
    const dep = filtered({ status: "published" });

    expect(dep.unfiltered).toBe(false);
    expect(dep.precise).toBe(true);
    expect(dep.equality).toEqual({ status: "published" });
    expect(dep.filterFields).toEqual(["status"]);
  });

  it("flattens `{ $eq }` and multi-field filters", () => {
    const dep = filtered({ views: { $eq: 10 }, status: "published" });

    expect(dep.precise).toBe(true);
    expect(dep.equality).toEqual({ views: "10", status: "published" });
    expect(dep.filterFields).toEqual(["views", "status"]);
  });

  it("flattens `{ $in: [scalars] }`", () => {
    const dep = filtered({ status: { $in: ["draft", "review"] } });

    expect(dep.precise).toBe(true);
    expect(dep.equality).toEqual({ status: ["draft", "review"] });
  });

  it("flattens clauses wrapped in a top-level `$and`", () => {
    const dep = filtered({ $and: [{ status: "published" }, { lang: { $in: ["en"] } }] });

    expect(dep.precise).toBe(true);
    expect(dep.equality).toEqual({ status: "published", lang: ["en"] });
    expect(dep.filterFields).toEqual(["status", "lang"]);
  });

  it("parses `-field,field` and JSON-array sort forms, stripping direction markers", () => {
    expect(dependency({ sort: "-views,title" }).sortFields).toEqual(["views", "title"]);
    expect(dependency({ sort: JSON.stringify(["-views", "title"]) }).sortFields).toEqual([
      "views",
      "title",
    ]);
    expect(dependency({ sort: JSON.stringify([" -views", "+title"]) }).sortFields).toEqual([
      "views",
      "title",
    ]);
  });

  it("parses comma and JSON-array `fields` forms", () => {
    expect(dependency({ fields: "title,views" }).projectedFields).toEqual(["title", "views"]);
    expect(dependency({ fields: JSON.stringify(["title", "views"]) }).projectedFields).toEqual([
      "title",
      "views",
    ]);
    expect(dependency({ fields: "" }).projectedFields).toBeNull();
    expect(dependency({ fields: "[]" }).projectedFields).toBeNull();
  });
});

describe("parseListBodyDependency — imprecise filters", () => {
  it("marks `$ne` imprecise but keeps the field list", () => {
    const dep = filtered({ status: { $ne: "draft" } });

    expect(dep.precise).toBe(false);
    expect(dep.equality).toBeNull();
    expect(dep.unfiltered).toBe(false);
    expect(dep.filterFields).toEqual(["status"]);
  });

  it("marks `$or` imprecise and collects the branch fields", () => {
    const dep = filtered({ $or: [{ status: "published" }, { status: "draft" }] });

    expect(dep.precise).toBe(false);
    expect(dep.equality).toBeNull();
    expect(dep.filterFields).toEqual(["status"]);
  });

  it("marks a nested document comparison imprecise", () => {
    const dep = filtered({ meta: { status: "published" } });

    expect(dep.precise).toBe(false);
    expect(dep.equality).toBeNull();
    expect(dep.filterFields).toEqual(["meta"]);
  });

  it("evicts every write kind for an imprecise dependency", () => {
    const dep = filtered({ $or: [{ status: "published" }, { views: { $gt: 100 } }] });
    const row = { _id: "a1", status: "published", views: 5 };

    expect(bodyAffectedByWrite(dep, createChange(row))).toBe(true);
    expect(bodyAffectedByWrite(dep, updateChange(["title"]))).toBe(true);
    expect(bodyAffectedByWrite(dep, deleteChange(row))).toBe(true);
  });
});

describe("bodyAffectedByWrite — create membership", () => {
  const published = filtered({ status: "published" });
  const draft = filtered({ status: "draft" });
  const unfiltered = dependency({});

  it("ignores a draft row for a `status=published` body", () => {
    expect(bodyAffectedByWrite(published, createChange({ _id: "a1", status: "draft" }))).toBe(
      false,
    );
  });

  it("affects a `status=draft` body with the same row", () => {
    expect(bodyAffectedByWrite(draft, createChange({ _id: "a1", status: "draft" }))).toBe(true);
  });

  it("affects the unfiltered body with the same row", () => {
    expect(bodyAffectedByWrite(unfiltered, createChange({ _id: "a1", status: "draft" }))).toBe(
      true,
    );
  });

  it("affects a matching filtered body and omits non-members from `$in`", () => {
    const inReview = filtered({ status: { $in: ["draft", "review"] } });

    expect(bodyAffectedByWrite(inReview, createChange({ status: "review" }))).toBe(true);
    expect(bodyAffectedByWrite(inReview, createChange({ status: "published" }))).toBe(false);
  });

  it("stays conservative when the created row is unknown", () => {
    expect(bodyAffectedByWrite(published, createChange(null))).toBe(true);
  });
});

describe("bodyAffectedByWrite — delete membership", () => {
  const published = filtered({ status: "published" });
  const unfiltered = dependency({});

  it("ignores deletion of a row that never matched the filter", () => {
    expect(bodyAffectedByWrite(published, deleteChange({ _id: "a1", status: "draft" }))).toBe(
      false,
    );
  });

  it("affects the body when the deleted row matched", () => {
    expect(bodyAffectedByWrite(published, deleteChange({ _id: "a1", status: "published" }))).toBe(
      true,
    );
  });

  it("affects the unfiltered body and stays conservative on an unknown row", () => {
    expect(bodyAffectedByWrite(unfiltered, deleteChange({ _id: "a1", status: "draft" }))).toBe(
      true,
    );
    expect(bodyAffectedByWrite(published, deleteChange(null))).toBe(true);
  });
});

describe("bodyAffectedByWrite — update verdicts", () => {
  it("affects a `views`-sorted body when only `views` changes", () => {
    const dep = filtered({ status: "published" }, { sort: "-views", fields: "title" });

    expect(bodyAffectedByWrite(dep, updateChange(["views"]))).toBe(true);
  });

  it("affects a body that projects `views`", () => {
    const dep = filtered({ status: "published" }, { sort: "title", fields: "title,views" });

    expect(bodyAffectedByWrite(dep, updateChange(["views"]))).toBe(true);
  });

  it("affects an all-fields body", () => {
    const dep = filtered({ status: "published" }, { sort: "title" });

    expect(bodyAffectedByWrite(dep, updateChange(["views"]))).toBe(true);
  });

  it("ignores a `views` change for a body that neither sorts nor projects it", () => {
    const dep = filtered({ status: "published" }, { sort: "title", fields: "title" });

    expect(bodyAffectedByWrite(dep, updateChange(["views"]))).toBe(false);
  });

  it("affects the body when a filter field changes but is neither sorted nor projected", () => {
    const dep = filtered({ status: "published" }, { sort: "title", fields: "title" });

    expect(bodyAffectedByWrite(dep, updateChange(["status"]))).toBe(true);
  });
});

describe("dotted paths", () => {
  const dep = filtered({ "meta.status": "published" }, { sort: "title", fields: "title" });

  it("reports the head segment in `filterFields` and keeps the dotted equality key", () => {
    expect(dep.precise).toBe(true);
    expect(dep.filterFields).toEqual(["meta"]);
    expect(dep.equality).toEqual({ "meta.status": "published" });
  });

  it("reads the nested value off the row for create membership", () => {
    expect(bodyAffectedByWrite(dep, createChange({ meta: { status: "published" } }))).toBe(true);
    expect(bodyAffectedByWrite(dep, createChange({ meta: { status: "draft" } }))).toBe(false);
    expect(bodyAffectedByWrite(dep, createChange({ meta: {} }))).toBe(false);
  });

  it("treats a patch of either the head or the full path as a filter change", () => {
    expect(bodyAffectedByWrite(dep, updateChange(["meta"]))).toBe(true);
    expect(bodyAffectedByWrite(dep, updateChange(["meta.status"]))).toBe(true);
    expect(bodyAffectedByWrite(dep, updateChange(["title"]))).toBe(true); // title is projected
    expect(bodyAffectedByWrite(dep, updateChange(["views"]))).toBe(false);
  });

  it("compares container row values conservatively", () => {
    expect(rowMatchesEquality({ meta: "published" }, { meta: { status: "published" } })).toBe(true);
    expect(
      rowMatchesEquality({ "meta.status": "published" }, { meta: { status: "published" } }),
    ).toBe(true);
    expect(rowMatchesEquality({ "meta.status": "published" }, { meta: "published" })).toBe(false);
  });
});

describe("malformed query parameters", () => {
  it("never throws on malformed `filter` JSON and stays imprecise", () => {
    let dep: ListBodyDependency | undefined;
    expect(() => {
      dep = dependency({ filter: "{not-json" });
    }).not.toThrow();

    expect(dep?.precise).toBe(false);
    expect(dep?.equality).toBeNull();
    expect(dep?.unfiltered).toBe(false);
    expect(bodyAffectedByWrite(dep as ListBodyDependency, updateChange(["title"]))).toBe(true);
  });

  it("never throws on malformed `sort` JSON and stays imprecise", () => {
    const dep = dependency({ filter: JSON.stringify({ status: "published" }), sort: "[broken" });

    expect(dep.precise).toBe(false);
    expect(dep.equality).toBeNull();
    expect(bodyAffectedByWrite(dep, updateChange(["title"]))).toBe(true);
  });

  it("never throws on malformed `fields` JSON and falls back to all fields", () => {
    const dep = dependency({
      filter: JSON.stringify({ status: "published" }),
      fields: '["title"',
    });

    expect(dep.precise).toBe(false);
    expect(dep.projectedFields).toBeNull();
  });
});
