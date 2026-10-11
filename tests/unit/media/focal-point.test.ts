/**
 * @file tests/unit/media/focal-point.test.ts
 * @description Focal point percentages stay on a 0–100 scale.
 */

import { describe, expect, it } from "vitest";
import { normalizeFocalPercent } from "@utils/media/focal-point";

describe("normalizeFocalPercent", () => {
  it("defaults a missing point to the center", () => {
    expect(normalizeFocalPercent(null)).toEqual({ x: 50, y: 50 });
    expect(normalizeFocalPercent(undefined)).toEqual({ x: 50, y: 50 });
  });

  it("keeps integer percentages", () => {
    expect(normalizeFocalPercent({ x: 35, y: 70 })).toEqual({ x: 35, y: 70 });
    expect(normalizeFocalPercent({ x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });

  it("scales a 0–1 fraction up to a percentage", () => {
    expect(normalizeFocalPercent({ x: 0.5, y: 0.25 })).toEqual({ x: 50, y: 25 });
  });

  it("clamps out of range values", () => {
    expect(normalizeFocalPercent({ x: -10, y: 140 })).toEqual({ x: 0, y: 100 });
  });

  it("falls back to the center for non-finite values", () => {
    expect(normalizeFocalPercent({ x: NaN, y: 50 })).toEqual({ x: 50, y: 50 });
    expect(normalizeFocalPercent({ x: Infinity, y: 0 })).toEqual({ x: 50, y: 50 });
  });

  it("scales both axes when either axis is a fraction, then clamps", () => {
    expect(normalizeFocalPercent({ x: 0.5, y: 2 })).toEqual({ x: 50, y: 100 });
  });

  it("keeps integer 0 and 1 on the percent scale", () => {
    expect(normalizeFocalPercent({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
  });

  it("rounds a fractional percentage", () => {
    expect(normalizeFocalPercent({ x: 33.6, y: 66.4 })).toEqual({ x: 34, y: 66 });
  });
});
