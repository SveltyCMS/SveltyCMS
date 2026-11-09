/**
 * @file tests/unit/databases/page-utils-default-sort.test.ts
 * @description
 * `isDefaultListSort` decides whether the PostgreSQL adapter provisions the
 * tenant-less `(updatedAt DESC, _id DESC)` covering index. A false positive
 * would provision an index for an arbitrary sort; a false negative leaves the
 * SDK's default list order on a parallel seq scan + top-N sort (measured
 * 60.8ms vs 0.022ms at 215k rows).
 *
 * ### Features:
 * - every sort spelling the SDK and adapter accept (tuple array, object,
 *   shorthand string, single-key prefix)
 * - direction normalisation (`1`/`"asc"`, `-1`/`"desc"`)
 */

import { describe, expect, it } from "vitest";
import { defaultListSortOption, isDefaultListSort } from "@src/databases/core/page-utils";

describe("isDefaultListSort", () => {
  it("accepts the SDK default option in every supported spelling", () => {
    expect(isDefaultListSort(defaultListSortOption())).toBe(true);
    expect(isDefaultListSort({ updatedAt: -1, _id: -1 })).toBe(true);
    expect(isDefaultListSort([{ updatedAt: "desc" }, { _id: "desc" }])).toBe(true);
    expect(isDefaultListSort([["updatedAt", "desc"]])).toBe(true);
  });

  it("accepts the updatedAt-only prefix the covering index also serves", () => {
    expect(isDefaultListSort({ updatedAt: -1 })).toBe(true);
    expect(isDefaultListSort("-updatedAt")).toBe(true);
  });

  it("rejects a different order or a different tiebreaker direction", () => {
    expect(isDefaultListSort(undefined)).toBe(false);
    expect(isDefaultListSort({})).toBe(false);
    expect(isDefaultListSort({ updatedAt: 1, _id: 1 })).toBe(false);
    expect(isDefaultListSort("updatedAt")).toBe(false);
    expect(isDefaultListSort({ views: -1 })).toBe(false);
    expect(
      isDefaultListSort([
        ["updatedAt", "desc"],
        ["_id", "asc"],
      ]),
    ).toBe(false);
    expect(
      isDefaultListSort([
        ["views", "desc"],
        ["_id", "desc"],
      ]),
    ).toBe(false);
  });
});
