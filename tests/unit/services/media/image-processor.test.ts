/**
 * @file tests/unit/services/media/image-processor.test.ts
 * @description Unit tests for Sharp upload-time variant generation (mocked Sharp + storage).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveVariantMock = vi.fn();
const loggerWarn = vi.fn();
const loggerDebug = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();

function createSharpChain(meta: { width: number; height: number } = { width: 2000, height: 1000 }) {
  const chain: any = {
    metadata: vi.fn().mockResolvedValue(meta),
    rotate: vi.fn(),
    resize: vi.fn(),
    webp: vi.fn(),
    jpeg: vi.fn(),
    avif: vi.fn(),
    png: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue({
      data: Buffer.from("variant-bytes"),
      info: { size: 1234 },
    }),
  };
  // All pipeline methods return the chain for fluent API
  for (const key of ["rotate", "resize", "webp", "jpeg", "avif", "png"] as const) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

let sharpChain = createSharpChain();
const sharpFactory = vi.fn(() => sharpChain);

vi.mock("sharp", () => ({
  default: sharpFactory,
}));

vi.mock("@src/services/media/image-variant-storage", () => ({
  saveVariant: (...args: unknown[]) => saveVariantMock(...args),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    warn: (...a: unknown[]) => loggerWarn(...a),
    debug: (...a: unknown[]) => loggerDebug(...a),
    error: (...a: unknown[]) => loggerError(...a),
    info: (...a: unknown[]) => loggerInfo(...a),
  },
}));

import {
  DEFAULT_PRESETS,
  processImage,
  processImageWithPresets,
} from "@src/services/media/image-processor";

describe("DEFAULT_PRESETS", () => {
  it("defines thumbnail, card, default, and hero with webp+jpeg", () => {
    for (const name of ["thumbnail", "card", "default", "hero"] as const) {
      expect(DEFAULT_PRESETS[name]).toBeDefined();
      expect(DEFAULT_PRESETS[name].widths.length).toBeGreaterThan(0);
      expect(DEFAULT_PRESETS[name].formats).toEqual(expect.arrayContaining(["webp", "jpeg"]));
      expect(DEFAULT_PRESETS[name].quality).toBeGreaterThan(0);
    }
  });

  it("orders widths ascending within each preset", () => {
    for (const preset of Object.values(DEFAULT_PRESETS)) {
      const sorted = [...preset.widths].sort((a, b) => a - b);
      expect(preset.widths).toEqual(sorted);
    }
  });
});

describe("processImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpChain = createSharpChain({ width: 2000, height: 1000 });
    sharpFactory.mockImplementation(() => sharpChain);
    saveVariantMock.mockImplementation(
      async (
        _buf: Buffer,
        hash: string,
        preset: string,
        width: number,
        format: string,
        tenantId?: string | null,
      ) => {
        const t = tenantId && tenantId !== "global" ? tenantId : "global";
        return `${t}/${hash}/variants/${preset}-${width}.${format}`;
      },
    );
  });

  it("returns [] and warns on empty buffer", async () => {
    const out = await processImage(Buffer.alloc(0), "hash1");
    expect(out).toEqual([]);
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining("Empty buffer"));
    expect(saveVariantMock).not.toHaveBeenCalled();
  });

  it("returns [] when dimensions cannot be determined", async () => {
    sharpChain = createSharpChain({ width: 0, height: 0 });
    sharpFactory.mockImplementation(() => sharpChain);
    const out = await processImage(Buffer.from("x"), "hash1");
    expect(out).toEqual([]);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("Unable to determine image dimensions"),
    );
  });

  it("skips widths larger than or equal to original (no upscaling)", async () => {
    // original 800px → only widths < 800
    sharpChain = createSharpChain({ width: 800, height: 600 });
    sharpFactory.mockImplementation(() => sharpChain);

    const out = await processImage(Buffer.from("img"), "h", {
      widths: [320, 640, 960, 1280],
      formats: ["webp"],
      quality: 80,
      stripMetadata: true,
    });

    // 320 and 640 only × 1 format
    expect(out).toHaveLength(2);
    expect(out.map((v) => v.width).sort((a, b) => a - b)).toEqual([320, 640]);
    expect(saveVariantMock).toHaveBeenCalledTimes(2);
  });

  it("returns [] when no widths are smaller than original", async () => {
    sharpChain = createSharpChain({ width: 100, height: 100 });
    sharpFactory.mockImplementation(() => sharpChain);
    const out = await processImage(Buffer.from("img"), "h", {
      widths: [320, 640],
      formats: ["webp"],
      quality: 80,
    });
    expect(out).toEqual([]);
    expect(loggerDebug).toHaveBeenCalledWith(expect.stringContaining("No variant widths"));
  });

  it("generates format × width matrix and records size/path", async () => {
    const out = await processImage(Buffer.from("img"), "hash99", {
      widths: [320],
      formats: ["webp", "jpeg"],
      quality: 82,
    });
    expect(out).toHaveLength(2);
    for (const v of out) {
      expect(v.width).toBe(320);
      expect(v.size).toBe(1234);
      expect(v.path).toContain("hash99/variants/");
      expect(v.quality).toBe(82);
    }
    expect(out.map((v) => v.format).sort()).toEqual(["jpeg", "webp"]);
  });
});

describe("processImageWithPresets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpChain = createSharpChain({ width: 4000, height: 2000 });
    sharpFactory.mockImplementation(() => sharpChain);
    saveVariantMock.mockImplementation(
      async (
        _buf: Buffer,
        hash: string,
        preset: string,
        width: number,
        format: string,
        tenantId?: string | null,
      ) => {
        const t = tenantId && tenantId !== "global" ? tenantId : "global";
        return `${t}/${hash}/variants/${preset}-${width}.${format}`;
      },
    );
  });

  it("skips unknown presets with a warning", async () => {
    const out = await processImageWithPresets(Buffer.from("img"), "h", [
      "not-a-real-preset",
      "thumbnail",
    ]);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown preset "not-a-real-preset"'),
    );
    // thumbnail only: 2 widths × 2 formats = 4
    expect(out.length).toBe(4);
    expect(out.every((v) => v.preset === "thumbnail")).toBe(true);
  });

  it("tags variants with the requested preset name", async () => {
    const out = await processImageWithPresets(Buffer.from("img"), "h", ["card"]);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((v) => v.preset === "card")).toBe(true);
  });
});
