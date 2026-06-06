/**
 * @file tests/unit/stores/filter-worker.test.ts
 * @description Unit tests for the Image Editor Filter Web Worker.
 *
 * Uses Bun's built-in Worker support. The worker path is resolved relative
 * to the project root since Bun modules resolve from the test directory.
 */
import { describe, it, expect } from "vitest";

// Worker-based tests only run in Bun's native runner (Worker not available in jsdom)
const describeIfWorker = typeof Worker !== "undefined" ? describe : describe.skip;

/**
 * Simulates ImageData for cross-thread message passing.
 * Bun's test runner doesn't expose the ImageData constructor,
 * so we pass plain { data, width, height } objects that the worker
 * can still process (it reads .data, .width, .height).
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

function postToWorker(worker: Worker, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Worker timeout")), 5000);
    worker.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(t);
      reject(new Error(e.message));
    };
    worker.postMessage(data);
  });
}

// Absolute path from project root
const WORKER_PATH = new URL(
  "src/components/image-editor/workers/filter.worker.ts",
  import.meta.url,
).href.replace("/tests/unit/stores/", "/");

describeIfWorker("FilterWorker", () => {
  describeIfWorker("buildFilterString", () => {
    it("should return empty string for zero filters", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, {
        type: "buildFilterString",
        filters: { brightness: 0, contrast: 0 },
      });
      w.terminate();
      expect(r.type).toBe("filterString");
      expect(r.data).toBe("");
    });

    it("should produce brightness(120%) for brightness: 20", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, {
        type: "buildFilterString",
        filters: { brightness: 20 },
      });
      w.terminate();
      expect(r.data).toContain("brightness(120%)");
    });

    it("should produce contrast(85%) for contrast: -15", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, {
        type: "buildFilterString",
        filters: { contrast: -15 },
      });
      w.terminate();
      expect(r.data).toContain("contrast(85%)");
    });

    it("should combine multiple filters", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, {
        type: "buildFilterString",
        filters: {
          brightness: 10,
          contrast: 5,
          saturation: -10,
          temperature: 30,
        },
      });
      w.terminate();
      expect(r.data).toContain("brightness");
      expect(r.data).toContain("contrast");
      expect(r.data).toContain("saturate");
    });

    it("should return error for missing filters", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, { type: "buildFilterString" });
      w.terminate();
      expect(r.type).toBe("error");
    });
  });

  describeIfWorker("applySharpness", () => {
    it("should not modify pixels when strength is zero", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const img = makeImageData(64, 64);
      const orig = new Uint8ClampedArray(img.data);
      const r = await postToWorker(w, {
        type: "applySharpness",
        imageData: img,
        width: 64,
        height: 64,
        filters: { sharpness: 0, clarity: 0 },
      });
      w.terminate();
      expect(r.type).toBe("sharpnessApplied");
      for (let i = 0; i < orig.length; i++) {
        expect(r.data.data[i]).toBe(orig[i]);
      }
    });

    it("should change pixels with positive sharpness (strength=1)", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const img = makeImageData(64, 64);
      const r = await postToWorker(w, {
        type: "applySharpness",
        imageData: img,
        width: 64,
        height: 64,
        filters: { sharpness: 72, clarity: 0 },
      });
      w.terminate();
      expect(r.type).toBe("sharpnessApplied");
      let changed = false;
      for (let i = 0; i < img.data.length; i++) {
        if (r.data.data[i] !== img.data[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it("should blur with negative strength (clarity=-92)", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const img = makeImageData(64, 64);
      const r = await postToWorker(w, {
        type: "applySharpness",
        imageData: img,
        width: 64,
        height: 64,
        filters: { sharpness: 0, clarity: -92 },
      });
      w.terminate();
      expect(r.type).toBe("sharpnessApplied");
      let changed = false;
      for (let i = 0; i < img.data.length; i++) {
        if (r.data.data[i] !== img.data[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it("should return error for missing imageData", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, {
        type: "applySharpness",
        width: 64,
        height: 64,
        filters: { sharpness: 10 },
      });
      w.terminate();
      expect(r.type).toBe("error");
    });
  });

  describeIfWorker("edge cases", () => {
    it("should handle 1x1 pixel", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, {
        type: "applySharpness",
        imageData: makeImageData(1, 1),
        width: 1,
        height: 1,
        filters: { sharpness: 72 },
      });
      w.terminate();
      expect(r.type).toBe("sharpnessApplied");
    });

    it("should error on unknown message type", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const r = await postToWorker(w, { type: "unknownOp" as any });
      w.terminate();
      expect(r.type).toBe("error");
    });
  });

  describeIfWorker("performance", () => {
    it("should process 1024x768 under 200ms", async () => {
      const w = new Worker(WORKER_PATH, { type: "module" });
      const img = makeImageData(1024, 768);
      const start = performance.now();
      const r = await postToWorker(w, {
        type: "applySharpness",
        imageData: img,
        width: 1024,
        height: 768,
        filters: { sharpness: 36, clarity: 0 },
      });
      const elapsed = performance.now() - start;
      w.terminate();
      expect(r.type).toBe("sharpnessApplied");
      expect(elapsed).toBeLessThan(200);
    });
  });
});
