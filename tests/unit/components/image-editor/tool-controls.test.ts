/**
 * @vitest-environment node
 * @file tests/unit/components/image-editor/tool-controls.test.ts
 * @description Server render of the editor docks: numeric crop, shortcut titles, zoom actions.
 */

import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import CropControls from "@src/components/image-editor/widgets/crop/controls.svelte";
import FineTuneControls from "@src/components/image-editor/widgets/fine-tune/controls.svelte";
import RotateControls from "@src/components/image-editor/widgets/rotate/controls.svelte";
import ZoomControls from "@src/components/image-editor/widgets/zoom/controls.svelte";

const noop = () => {};

describe("image editor tool controls", () => {
  it("shows crop pixel fields only when a crop can be edited", () => {
    const hidden = render(CropControls, {
      props: {
        cropShape: "rectangle",
        onCropShapeChange: noop,
        onAspectRatio: noop,
      },
    });
    expect(hidden.body).toContain("Aspect ratio Free");
    expect(hidden.body).toContain("(F)");
    expect(hidden.body).not.toContain("Crop pixels");

    const shown = render(CropControls, {
      props: {
        cropShape: "rectangle",
        crop: { x: 4, y: 8, width: 120, height: 80 },
        onCropShapeChange: noop,
        onAspectRatio: noop,
        onCropChange: noop,
      },
    });
    expect(shown.body).toContain("Crop pixels");
    expect(shown.body).toContain("16:9");
    expect(shown.body).toContain("(3)");
  });

  it("names fine-tune reset, compare, and auto on the controls", () => {
    const { body } = render(FineTuneControls, {
      props: {
        activeAdjustment: "brightness",
        value: 12,
        onChange: noop,
        onAdjustmentChange: noop,
        onReset: noop,
        onCategoryChange: noop,
        onCompareToggle: noop,
        onAutoAdjust: noop,
      },
    });
    expect(body).toContain("Double-click to reset");
    expect(body).toContain("Reset to 0 (0)");
    expect(body).toContain("Compare (C)");
    expect(body).toContain("Auto adjust (Shift+A)");
  });

  it("names rotate and zoom shortcuts", () => {
    const rotate = render(RotateControls, {
      props: {
        rotationAngle: 0,
        onRotateLeft: noop,
        onRotateRight: noop,
        onRotationChange: noop,
        onFlipHorizontal: noop,
        onFlipVertical: noop,
      },
    });
    expect(rotate.body).toContain("Rotate left 90° (Mod+Left)");
    expect(rotate.body).toContain("Rotate right 90° (Mod+Right)");
    expect(rotate.body).toContain("Reset rotation (0)");
    expect(rotate.body).not.toContain("Toggle grid");

    const zoom = render(ZoomControls, { props: {} });
    expect(zoom.body).toContain("Fit to screen (Mod+0)");
    expect(zoom.body).toContain("Actual size (Mod+1)");
  });
});
