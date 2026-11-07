/**
 * @file tests/unit/components/column-window.test.ts
 * @description
 * Pure tests for the Smart Table horizontal body-cell window.
 *
 * Covers the contract the entry list relies on: the window includes overscan,
 * excludes far-off columns while scrolling, clamps at both edges, stays
 * inactive when windowing cannot help (narrow table, no viewport, no layout
 * measurement), and reports skipped widths that preserve the table's total
 * width.
 */

import { describe, expect, it } from "vitest";
import { computeColumnWindow } from "@components/ui/smart-table/column-window";

interface MeasuredColumns {
  offsets: number[];
  widths: number[];
}

function measured(count: number, width = 100): MeasuredColumns {
  return {
    offsets: Array.from({ length: count }, (_, index) => index * width),
    widths: Array.from({ length: count }, () => width),
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe("computeColumnWindow", () => {
  it("includes the trailing overscan at scrollLeft 0", () => {
    const { offsets, widths } = measured(40);

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 350,
      scrollLeft: 0,
    });

    expect(window.active).toBe(true);
    expect(window.start).toBe(0);
    // Columns 0-3 intersect the 350px viewport; +2 overscan on the trailing edge.
    expect(window.end).toBe(6);
    expect(window.leadingCount).toBe(0);
    expect(window.trailingCount).toBe(34);
    expect(window.leadingWidth).toBe(0);
  });

  it("drops far-off columns in the middle of a wide table", () => {
    const { offsets, widths } = measured(40);

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 300,
      scrollLeft: 1500,
    });

    expect(window.active).toBe(true);
    // Column 15 is the first one past scrollLeft=1500; start backs off by overscan.
    expect(window.start).toBe(13);
    expect(window.end).toBe(20);
    expect(window.start).toBeGreaterThan(0);
    expect(window.end).toBeLessThan(widths.length);
    expect(window.leadingCount).toBe(13);
    expect(window.trailingCount).toBe(20);
  });

  it("clamps the window at the end of the content", () => {
    const { offsets, widths } = measured(40);

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 300,
      scrollLeft: 4200,
    });

    expect(window.active).toBe(true);
    expect(window.start).toBe(37);
    expect(window.end).toBe(40);
    expect(window.trailingCount).toBe(0);
    expect(window.trailingWidth).toBe(0);
    expect(window.end).toBeLessThanOrEqual(widths.length);
  });

  it("stays inactive below the minimum column count", () => {
    const { offsets, widths } = measured(15);

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 300,
      scrollLeft: 0,
    });

    expect(window.active).toBe(false);
    expect(window.start).toBe(0);
    expect(window.end).toBe(15);
    expect(window.leadingCount).toBe(0);
    expect(window.trailingCount).toBe(0);
  });

  it("activates at exactly the minimum column count", () => {
    const { offsets, widths } = measured(16);

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 250,
      scrollLeft: 0,
    });

    expect(window.active).toBe(true);
    expect(window.end).toBeLessThan(widths.length);
  });

  it("stays inactive without a known viewport", () => {
    const { offsets, widths } = measured(20);

    for (const viewportWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const window = computeColumnWindow({
        offsets,
        widths,
        viewportWidth,
        scrollLeft: 0,
      });

      expect(window.active, `viewportWidth=${viewportWidth}`).toBe(false);
      expect(window.end).toBe(widths.length);
    }
  });

  it("stays inactive when the header widths were not measured", () => {
    const { offsets } = measured(20);
    const widths = Array.from({ length: 20 }, () => 0);

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 300,
      scrollLeft: 0,
    });

    expect(window.active).toBe(false);
    expect(window.start).toBe(0);
    expect(window.end).toBe(20);
  });

  it("sums the skipped leading and trailing column widths", () => {
    const widths = Array.from({ length: 30 }, (_, index) => 40 + index * 3);
    const offsets: number[] = [];
    let left = 0;
    for (const width of widths) {
      offsets.push(left);
      left += width;
    }

    const window = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 400,
      scrollLeft: 1200,
      overscan: 1,
    });

    expect(window.active).toBe(true);
    expect(window.start).toBeGreaterThan(0);
    expect(window.end).toBeLessThan(widths.length);
    expect(window.leadingWidth).toBe(sum(widths.slice(0, window.start)));
    expect(window.trailingWidth).toBe(sum(widths.slice(window.end)));
    expect(window.leadingWidth + window.trailingWidth).toBeLessThan(sum(widths));
  });

  it("honours a custom overscan and minimum column count", () => {
    const { offsets, widths } = measured(6);

    const custom = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 250,
      scrollLeft: 0,
      overscan: 0,
      minColumns: 4,
    });

    expect(custom.active).toBe(true);
    expect(custom.start).toBe(0);
    expect(custom.end).toBe(3);
    expect(custom.trailingWidth).toBe(300);

    const narrow = computeColumnWindow({
      offsets,
      widths,
      viewportWidth: 250,
      scrollLeft: 0,
      overscan: 0,
      minColumns: 7,
    });

    expect(narrow.active).toBe(false);
    expect(narrow.end).toBe(6);
  });

  it("stays inactive when offsets and widths disagree", () => {
    const { offsets, widths } = measured(20);

    const window = computeColumnWindow({
      offsets: offsets.slice(0, 10),
      widths,
      viewportWidth: 300,
      scrollLeft: 0,
    });

    expect(window.active).toBe(false);
    expect(window.end).toBe(20);
  });
});
