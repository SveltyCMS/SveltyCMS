/**
 * @file tests/unit/utils/use-floating-arrow.test.ts
 * @description Arrow-anchor contract for `useFloating` (tooltip/popover callout).
 *
 * The diamond must sit on the edge FACING the reference and aim at its centre.
 * A short body next to a tall trigger (icon button + `right-end` placement)
 * used to clamp the arrow into a corner; these cases pin the geometry with
 * synthetic rects, so no browser layout engine is needed.
 */

import { describe, expect, it } from "vitest";
import { computeArrowGeometry } from "@utils/use-floating.svelte";

const ARROW = 14;

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** The sidebar toggle: a 40×40 icon button at (100, 100). */
const button = rect(100, 100, 40, 40);

describe("floating arrow geometry", () => {
  it("anchors on the edge facing the reference", () => {
    const rightFloat = rect(148, 106, 120, 28);
    expect(
      computeArrowGeometry(button, rightFloat, "right", rightFloat.left, rightFloat.top, ARROW),
    ).toEqual({ arrowX: 0, arrowY: 14, staticSide: "left" });

    const leftFloat = rect(0, 106, 120, 28);
    const left = computeArrowGeometry(
      button,
      leftFloat,
      "left",
      leftFloat.left,
      leftFloat.top,
      ARROW,
    );
    expect(left.arrowX).toBe(120);
    expect(left.arrowY).toBe(14);
    expect(left.staticSide).toBe("right");
  });

  it("centres on the reference for top and bottom placements", () => {
    const below = rect(60, 148, 120, 28);
    const bottom = computeArrowGeometry(button, below, "bottom", below.left, below.top, ARROW);
    expect(bottom.arrowX).toBe(60); // 100 + 40/2 - 60
    expect(bottom.arrowY).toBe(0);
    expect(bottom.staticSide).toBe("top");

    const above = rect(60, 64, 120, 28);
    const top = computeArrowGeometry(button, above, "top", above.left, above.top, ARROW);
    expect(top.arrowX).toBe(60);
    expect(top.arrowY).toBe(28);
    expect(top.staticSide).toBe("bottom");
  });

  it("keeps a short tooltip's arrow near the middle instead of a corner", () => {
    // `right-end`: the tooltip's bottom aligns with the button's bottom, so the
    // reference centre is only 8px below the tooltip top (28px tall body).
    const float = rect(148, 112, 120, 28);
    const arrow = computeArrowGeometry(button, float, "right-end", float.left, float.top, ARROW);
    expect(arrow.arrowX).toBe(0);
    expect(arrow.arrowY).toBeGreaterThanOrEqual(7);
    expect(arrow.arrowY).toBeLessThanOrEqual(14);
  });

  it("pins to the centre when the body is smaller than the arrow margins", () => {
    const tiny = rect(148, 112, 120, 10);
    const arrow = computeArrowGeometry(
      rect(100, 100, 40, 200),
      tiny,
      "right",
      tiny.left,
      tiny.top,
      ARROW,
    );
    expect(arrow.arrowY).toBe(5);
  });
});
