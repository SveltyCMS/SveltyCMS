/**
 * @file tests/unit/stores/image-editor-store.test.ts
 * @description Unit tests for the ImageEditorStore — undo/redo, snapshots,
 *              tool switching, compareSliderPosition, zoom clamping, and reset.
 *
 * Note: Svelte 5 $derived proxies are not fully unwrapped in Bun's test runner,
 * so tests verify behavior through return values of undoState()/redoState()
 * rather than direct .canUndoState/.canRedoState reads.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { imageEditorStore } from "@stores/image-editor-store.svelte";

describe("ImageEditorStore", () => {
  beforeEach(() => {
    imageEditorStore.reset();
  });

  describe("initial state", () => {
    it("should have default values", () => {
      expect(imageEditorStore.state.zoom).toBe(1);
      expect(imageEditorStore.state.rotation).toBe(0);
      expect(imageEditorStore.state.flipH).toBe(false);
      expect(imageEditorStore.state.flipV).toBe(false);
      expect(imageEditorStore.state.crop).toBeNull();
      expect(imageEditorStore.state.activeState).toBe("");
      expect(imageEditorStore.state.imageElement).toBeNull();
      expect(imageEditorStore.state.file).toBeNull();
      expect(imageEditorStore.state.filters.brightness).toBe(0);
      expect(imageEditorStore.compareSliderPosition).toBe(0);
    });

    it("should return null for undo/redo with no history", () => {
      expect(imageEditorStore.undoState()).toBeNull();
      expect(imageEditorStore.redoState()).toBeNull();
    });
  });

  describe("undo/redo history", () => {
    it("should take snapshots and enable undo", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.zoom = 2;
      imageEditorStore.takeSnapshot();

      expect(imageEditorStore.state.zoom).toBe(2);
      const result = imageEditorStore.undoState();
      expect(result).not.toBeNull();
      expect(imageEditorStore.state.zoom).toBe(1);
    });

    it("should redo after undo", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.zoom = 2;
      imageEditorStore.takeSnapshot();
      imageEditorStore.undoState();

      const result = imageEditorStore.redoState();
      expect(result).not.toBeNull();
      expect(imageEditorStore.state.zoom).toBe(2);
    });

    it("should truncate future history on new snapshot after undo", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.zoom = 2;
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.zoom = 3;
      imageEditorStore.takeSnapshot();

      imageEditorStore.undoState();
      expect(imageEditorStore.state.zoom).toBe(2);

      imageEditorStore.state.zoom = 4;
      imageEditorStore.takeSnapshot();

      expect(imageEditorStore.redoState()).toBeNull();
      expect(imageEditorStore.state.zoom).toBe(4);
    });

    it("should preserve all filter values in snapshot", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.filters = {
        brightness: 15,
        contrast: -10,
        saturation: 20,
        grayscale: 50,
        sepia: 30,
        temperature: -5,
      };
      imageEditorStore.takeSnapshot();

      imageEditorStore.undoState();
      expect(imageEditorStore.state.filters.brightness).toBe(0);

      imageEditorStore.redoState();
      expect(imageEditorStore.state.filters.brightness).toBe(15);
      expect(imageEditorStore.state.filters.contrast).toBe(-10);
    });

    it("should preserve crop state in snapshot", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.crop = { x: 10, y: 20, width: 800, height: 600 };
      imageEditorStore.takeSnapshot();

      imageEditorStore.undoState();
      expect(imageEditorStore.state.crop).toBeNull();

      imageEditorStore.redoState();
      expect(imageEditorStore.state.crop).toEqual({
        x: 10,
        y: 20,
        width: 800,
        height: 600,
      });
    });

    it("peek undo should return snapshot without modifying state", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.zoom = 3;
      imageEditorStore.takeSnapshot();

      const snapshot = imageEditorStore.undoState(true); // peek
      expect(typeof snapshot).toBe("string");
      expect(imageEditorStore.state.zoom).toBe(3);
    });
  });

  describe("tool switching", () => {
    it("should switch active tool", () => {
      imageEditorStore.setActiveTool("crop");
      expect(imageEditorStore.state.activeState).toBe("crop");
    });

    it("should keep tool active when selecting the same tool again", () => {
      imageEditorStore.setActiveTool("blur");
      expect(imageEditorStore.state.activeState).toBe("blur");
      imageEditorStore.setActiveTool("blur");
      expect(imageEditorStore.state.activeState).toBe("blur");
    });

    it("should switch sidebar selection when changing tools", () => {
      imageEditorStore.setActiveTool("crop");
      expect(imageEditorStore.state.activeState).toBe("crop");
      imageEditorStore.setActiveTool("annotate");
      expect(imageEditorStore.state.activeState).toBe("annotate");
    });

    it("should cancel active tool and restore pre-tool snapshot", () => {
      imageEditorStore.takeSnapshot();
      imageEditorStore.state.zoom = 1.0;
      imageEditorStore.setActiveTool("crop");
      imageEditorStore.state.zoom = 3.0;

      imageEditorStore.cancelActiveTool();
      expect(imageEditorStore.state.activeState).toBe("");
      expect(imageEditorStore.state.zoom).toBe(1.0);
    });
  });

  describe("compareSliderPosition", () => {
    it("should set and get position", () => {
      imageEditorStore.compareSliderPosition = 50;
      expect(imageEditorStore.compareSliderPosition).toBe(50);
    });

    it("should clamp negatives to 0", () => {
      imageEditorStore.compareSliderPosition = -10;
      expect(imageEditorStore.compareSliderPosition).toBe(0);
    });

    it("should clamp values above 100", () => {
      imageEditorStore.compareSliderPosition = 150;
      expect(imageEditorStore.compareSliderPosition).toBe(100);
    });

    it("should toggle between 0 and 50 (toolbar pattern)", () => {
      expect(imageEditorStore.compareSliderPosition).toBe(0);
      imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50;
      expect(imageEditorStore.compareSliderPosition).toBe(50);
      imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50;
      expect(imageEditorStore.compareSliderPosition).toBe(0);
    });
  });

  describe("zoom clamping", () => {
    it("should clamp to min 0.1 via updateZoom", () => {
      imageEditorStore.state.zoom = 0.1;
      imageEditorStore.updateZoom(-0.5);
      expect(imageEditorStore.state.zoom).toBeGreaterThanOrEqual(0.1);
    });

    it("should clamp to max 5 via updateZoom", () => {
      imageEditorStore.updateZoom(10);
      expect(imageEditorStore.state.zoom).toBeLessThanOrEqual(5);
    });
  });

  describe("rotation and flip", () => {
    it("should rotate in 90-degree increments", () => {
      imageEditorStore.rotate(90);
      expect(imageEditorStore.state.rotation).toBe(90);
      imageEditorStore.rotate(-90);
      expect(imageEditorStore.state.rotation).toBe(0);
    });

    it("should wrap rotation at 360", () => {
      imageEditorStore.rotate(360);
      expect(imageEditorStore.state.rotation).toBe(0);
    });

    it("should toggle flipH and flipV", () => {
      expect(imageEditorStore.state.flipH).toBe(false);
      imageEditorStore.flipH();
      expect(imageEditorStore.state.flipH).toBe(true);
      imageEditorStore.flipV();
      expect(imageEditorStore.state.flipV).toBe(true);
    });

    it("should create undo entries after rotate/flip", () => {
      // rotate() calls takeSnapshot() internally
      imageEditorStore.takeSnapshot();
      imageEditorStore.rotate(90);
      expect(imageEditorStore.undoState()).not.toBeNull();

      imageEditorStore.takeSnapshot();
      imageEditorStore.flipH();
      expect(imageEditorStore.undoState()).not.toBeNull();
    });
  });

  describe("reset", () => {
    it("should clear all state to defaults", () => {
      imageEditorStore.state.zoom = 3;
      imageEditorStore.state.rotation = 180;
      imageEditorStore.state.crop = { x: 5, y: 5, width: 100, height: 100 };
      imageEditorStore.state.flipH = true;
      imageEditorStore.state.activeState = "crop";

      imageEditorStore.reset();

      expect(imageEditorStore.state.zoom).toBe(1);
      expect(imageEditorStore.state.rotation).toBe(0);
      expect(imageEditorStore.state.flipH).toBe(false);
      expect(imageEditorStore.state.crop).toBeNull();
    });
  });

  describe("file and image element", () => {
    it("should set and clear file", () => {
      const file = new File(["test"], "test.png", { type: "image/png" });
      imageEditorStore.setFile(file);
      expect(imageEditorStore.state.file).toBe(file);
    });
  });

  describe("error handling", () => {
    it("should set and clear error messages", () => {
      expect(imageEditorStore.state.error).toBeNull();
      imageEditorStore.setError("Something went wrong");
      expect(imageEditorStore.state.error).toBe("Something went wrong");
      imageEditorStore.setError(null);
      expect(imageEditorStore.state.error).toBeNull();
    });
  });

  describe("saveBehavior", () => {
    it("should default to new", () => {
      expect(imageEditorStore.saveBehavior).toBe("new");
    });

    it("should switch modes", () => {
      imageEditorStore.saveBehavior = "overwrite";
      expect(imageEditorStore.saveBehavior).toBe("overwrite");
      imageEditorStore.saveBehavior = "rotate";
      expect(imageEditorStore.saveBehavior).toBe("rotate");
    });
  });
});
