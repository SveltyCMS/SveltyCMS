/**
 * @file tests/unit/routes/mediagallery-grid-window.test.ts
 * @description Pure windowing math for the media gallery grid.
 *
 * Features:
 * - column-track counting from resolved `grid-template-columns`
 * - row-aligned window bounds with overscan
 * - spacer heights that keep the scroll range identical to the full list
 * - clamps for empty lists, one-row lists and unmeasured geometry
 */

import { describe, expect, it } from "vitest";
import {
  computeGridWindow,
  countGridColumns,
  shouldVirtualize,
} from "../../../src/routes/(app)/mediagallery/grid-window";

describe("countGridColumns", () => {
  it("counts a resolved auto-fill track list", () => {
    expect(countGridColumns("180px 180px 180px")).toBe(3);
  });

  it("treats a sizing function as one track", () => {
    expect(countGridColumns("minmax(140px, 1fr) minmax(140px, 1fr)")).toBe(2);
  });

  it("returns 0 when the grid has not resolved", () => {
    expect(countGridColumns("")).toBe(0);
    expect(countGridColumns("none")).toBe(0);
  });
});

describe("shouldVirtualize", () => {
  it("keeps the batch reveal at the threshold and windows above it", () => {
    expect(shouldVirtualize(500, 500)).toBe(false);
    expect(shouldVirtualize(501, 500)).toBe(true);
  });
});

describe("computeGridWindow", () => {
  const base = {
    columns: 4,
    rowHeight: 200,
    rowGap: 20,
    viewportHeight: 800,
    overscanRows: 3,
  };

  it("returns an empty window for an empty list", () => {
    expect(computeGridWindow({ ...base, totalItems: 0, scrollTop: 0 })).toEqual({
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalRows: 0,
      firstRow: 0,
      lastRow: 0,
    });
  });

  it("starts at the top with a bottom spacer only", () => {
    const window = computeGridWindow({ ...base, totalItems: 100, scrollTop: 0 });

    // 25 rows; viewport = 4 visible rows (+1 partial) + 3 overscan.
    expect(window.totalRows).toBe(25);
    expect(window.firstRow).toBe(0);
    expect(window.lastRow).toBe(8);
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(32);
    expect(window.topSpacerHeight).toBe(0);
    expect(window.bottomSpacerHeight).toBe((25 - 8) * (200 + 20) - 20);
  });

  it("centres the window on a deep scroll position and preserves both spacers", () => {
    // Row 10 + a partial row.
    const window = computeGridWindow({ ...base, totalItems: 100, scrollTop: 10 * 220 + 50 });

    expect(window.firstRow).toBe(7);
    expect(window.lastRow).toBe(18);
    expect(window.startIndex).toBe(28);
    expect(window.endIndex).toBe(72);
    expect(window.topSpacerHeight).toBe(7 * 220 - 20);
    expect(window.bottomSpacerHeight).toBe((25 - 18) * 220 - 20);
  });

  it("clamps to the last row and drops the bottom spacer at the end", () => {
    const window = computeGridWindow({ ...base, totalItems: 100, scrollTop: 10_000_000 });

    expect(window.firstRow).toBe(21);
    expect(window.lastRow).toBe(25);
    expect(window.startIndex).toBe(84);
    expect(window.endIndex).toBe(100);
    expect(window.topSpacerHeight).toBe(21 * 220 - 20);
    expect(window.bottomSpacerHeight).toBe(0);
  });

  it("mounts the whole list when a row is a single row", () => {
    const window = computeGridWindow({
      ...base,
      totalItems: 2,
      scrollTop: 4_000,
      overscanRows: 0,
    });

    expect(window.totalRows).toBe(1);
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(2);
    expect(window.topSpacerHeight).toBe(0);
    expect(window.bottomSpacerHeight).toBe(0);
  });

  it("mounts everything before layout has measured the tile height", () => {
    const window = computeGridWindow({
      ...base,
      rowHeight: 0,
      rowGap: 0,
      totalItems: 600,
      scrollTop: 1_000,
    });

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(600);
  });

  it("clamps a zero column count to a single column", () => {
    const window = computeGridWindow({
      ...base,
      columns: 0,
      totalItems: 6,
      scrollTop: 0,
    });

    expect(window.totalRows).toBe(6);
    expect(window.startIndex).toBe(0);
  });
});
