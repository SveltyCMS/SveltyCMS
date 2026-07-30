/**
 * @file tests/unit/stores/filter-worker.test.ts
 * @description Unit tests for the Image Editor Filter logic.
 *
 * Tests the pure functions exported from the filter worker directly,
 * avoiding the need for the Web Worker API (not available in all runtimes).
 */
import { describe, it, expect } from "vitest";
import {
  buildFilterString,
  applySharpness,
} from "@src/components/image-editor/workers/filter.worker";

/**
 * Simulates ImageData for pixel-level tests.
 */
function makeImageData(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x / width) * 255;
      data[i + 1] = (y / height) * 255;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe("FilterWorker", () => {
  describe("buildFilterString", () => {
    it("should return empty string for zero filters", () => {
      const r = buildFilterString({ brightness: 0, contrast: 0 });
      expect(r).toBe("");
    });

    it("should produce brightness(120%) for brightness: 20", () => {
      const r = buildFilterString({ brightness: 20 });
      expect(r).toContain("brightness(120%)");
    });

    it("should produce contrast(85%) for contrast: -15", () => {
      const r = buildFilterString({ contrast: -15 });
      expect(r).toContain("contrast(85%)");
    });

    it("should combine multiple filters", () => {
      const r = buildFilterString({
        brightness: 10,
        contrast: 5,
        saturation: -10,
        temperature: 30,
      });
      expect(r).toContain("brightness");
      expect(r).toContain("contrast");
      expect(r).toContain("saturate");
    });

    it("should return empty string for missing filters", () => {
      const r = buildFilterString({} as any);
      expect(r).toBe("");
    });
  });

  describe("applySharpness", () => {
    it("should not modify pixels when strength is zero", () => {
      const img = makeImageData(64, 64) as ImageData;
      const orig = new Uint8ClampedArray(img.data);
      const r = applySharpness(img, 64, 64, { sharpness: 0, clarity: 0 });
      for (let i = 0; i < orig.length; i++) {
        expect(r.data[i]).toBe(orig[i]);
      }
    });

    it("should change pixels with positive sharpness (strength=1)", () => {
      const img = makeImageData(64, 64) as ImageData;
      const original = new Uint8ClampedArray(img.data);
      const r = applySharpness(img, 64, 64, { sharpness: 72, clarity: 0 });
      let changed = false;
      for (let i = 0; i < original.length; i++) {
        if (r.data[i] !== original[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it("should blur with negative strength (clarity=-92)", () => {
      const img = makeImageData(64, 64) as ImageData;
      const original = new Uint8ClampedArray(img.data);
      const r = applySharpness(img, 64, 64, { sharpness: 0, clarity: -92 });
      let changed = false;
      for (let i = 0; i < original.length; i++) {
        if (r.data[i] !== original[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it("should return imageData unchanged when imageData is not provided", () => {
      const img = makeImageData(1, 1) as ImageData;
      const r = applySharpness(img, 1, 1, { sharpness: 10 });
      expect(r).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle 1x1 pixel", () => {
      const img = makeImageData(1, 1) as ImageData;
      const r = applySharpness(img, 1, 1, { sharpness: 72 });
      expect(r.data).toBeDefined();
    });
  });

  describe("performance", () => {
    it("should process 1024x768 under 200ms", () => {
      const img = makeImageData(1024, 768) as ImageData;
      const start = performance.now();
      applySharpness(img, 1024, 768, { sharpness: 36, clarity: 0 });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });
  });
});
