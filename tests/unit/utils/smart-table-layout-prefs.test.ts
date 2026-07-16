/**
 * @file tests/unit/utils/smart-table-layout-prefs.test.ts
 * @description Unit tests for Smart Table layout merge helpers.
 */

import { describe, expect, it } from "vitest";
import { mergeLayoutIntoColumns, isValidDensity } from "@components/ui/smart-table/layout-prefs";

describe("smart-table layout-prefs", () => {
  it("validates density values", () => {
    expect(isValidDensity("compact")).toBe(true);
    expect(isValidDensity("spacious")).toBe(false);
  });

  it("applies visibility and column order from prefs", () => {
    const cols = [
      { key: "a", label: "A", visible: true },
      { key: "b", label: "B", visible: true },
      { key: "c", label: "C", visible: true },
    ];
    const merged = mergeLayoutIntoColumns(cols, {
      columnOrder: ["c", "a", "b"],
      visibility: { b: false },
    });
    expect(merged.map((c) => c.key)).toEqual(["c", "a", "b"]);
    expect(merged.find((c) => c.key === "b")?.visible).toBe(false);
    expect(merged.find((c) => c.key === "a")?.visible).toBe(true);
  });

  it("returns columns unchanged when prefs null", () => {
    const cols = [{ key: "x", visible: true }];
    expect(mergeLayoutIntoColumns(cols, null)).toEqual(cols);
  });
});
