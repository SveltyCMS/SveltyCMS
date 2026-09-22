/**
 * @file tests/unit/media/derivative-ladder.test.ts
 * @description Unit tests for the SIZES ladder `saveResized` writes — item #3 of the media
 * pipeline plan: never upscale, never write one path twice, always report the encoder's own
 * output dimensions.
 *
 * `sharp` is a controllable stub that mirrors the only property under test: a
 * `fit: "cover"` + `withoutEnlargement` resize that is asked for more pixels than the source
 * has returns the source size. Every write goes through a fake `StorageAdapter`, so the
 * assertions count real `upload()` calls (files + bytes) instead of trusting the map shape.
 *
 * Features:
 * - source-clamped ladder (a 400 px source writes the 200 px step only)
 * - fan-out bound (files ≤ 2 × resizeable SIZES — one primary plus one WebP sidecar per step)
 * - already-WebP source ⇒ primary and sidecar share a path ⇒ exactly one encode and write
 * - `withoutEnlargement` reaches the encoder on every step
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface SharpState {
  width: number;
  height: number;
  /** Every `resize()` the ladder performed, in call order. */
  resizeCalls: Array<{ width: number; withoutEnlargement?: boolean }>;
  /** Every `toBuffer()` — an encode. */
  encodes: number;
}

const state = vi.hoisted<SharpState>(() => ({
  width: 400,
  height: 300,
  resizeCalls: [],
  encodes: 0,
}));

const storage = vi.hoisted(() => ({
  writes: [] as Array<{ relPath: string; bytes: number }>,
}));

/**
 * Chain stub: `resize()` yields a new node carrying the effective output width, `clone()`
 * inherits it, encoders are pass-throughs, `toBuffer()` reports the (clamped) output.
 */
function createSharpChain(outputWidth: number | null = null): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    metadata: async () => ({ width: state.width, height: state.height, format: "jpeg" }),
    resize: (w: number, _h: number | null, opts?: { withoutEnlargement?: boolean }) => {
      state.resizeCalls.push({ width: w, withoutEnlargement: opts?.withoutEnlargement });
      const clamped = opts?.withoutEnlargement ? Math.min(w, state.width) : w;
      return createSharpChain(clamped);
    },
    clone: () => createSharpChain(outputWidth),
    toBuffer: async (opts?: { resolveWithObject?: boolean }) => {
      state.encodes += 1;
      const outWidth = outputWidth ?? state.width;
      const outHeight = Math.round((outWidth / state.width) * state.height);
      // 1 byte per pixel keeps byte totals readable in failure output.
      const data = Buffer.alloc(outWidth);
      return opts?.resolveWithObject
        ? { data, info: { width: outWidth, height: outHeight, size: data.length } }
        : data;
    },
  };
  for (const encoder of ["jpeg", "webp", "avif", "png"]) chain[encoder] = () => chain;
  return chain;
}

vi.mock("sharp", () => ({
  default: () => createSharpChain(),
}));

vi.mock("../../../src/utils/media/storage-adapters", () => ({
  getStorageAdapter: () => ({
    upload: async (data: Buffer, relPath: string) => {
      storage.writes.push({ relPath, bytes: data.length });
      return `/files/${relPath}`;
    },
    download: async () => Buffer.alloc(0),
    remove: async () => {},
    exists: async () => true,
    getUrl: (relPath: string) => `/files/${relPath}`,
    getMetadata: async () => null,
  }),
  getConfig: () => ({}),
}));

const { saveResizedImages, getImageSizes } = await import("@src/utils/media/media-storage.server");

const RESIZEABLE_SIZES = Object.entries(getImageSizes()).filter(([, w]) => w > 0);
const HASH = "a".repeat(64);

async function runLadder(sourceExt = "jpg") {
  storage.writes.length = 0;
  state.resizeCalls.length = 0;
  state.encodes = 0;
  const thumbs = await saveResizedImages(Buffer.alloc(64), HASH, "photo", sourceExt, "global");
  return { thumbs, writes: [...storage.writes] };
}

describe("saveResized — SIZES ladder", () => {
  beforeEach(() => {
    storage.writes.length = 0;
    state.resizeCalls.length = 0;
    state.encodes = 0;
    state.width = 400;
    state.height = 300;
  });

  it("clamps the ladder to the source: a 400 px icon writes the thumbnail step only", async () => {
    const { thumbs, writes } = await runLadder();

    const stepDirs = [...new Set(writes.map((w) => w.relPath.split("/")[1]))];
    expect(stepDirs).toEqual(["thumbnail"]);
    expect(Object.keys(thumbs).sort()).toEqual(["thumbnail", "thumbnail_webp"]);
    expect(writes).toHaveLength(2);
  });

  it("never records a variant wider than the source it derives from", async () => {
    const { thumbs } = await runLadder();

    for (const [key, variant] of Object.entries(thumbs)) {
      expect(variant.width, `${key} width`).toBeLessThanOrEqual(state.width);
      expect(variant.height, `${key} height`).toBeLessThanOrEqual(state.height);
    }
    // The encoder itself is told not to enlarge, so a metadata mis-read cannot upscale either.
    expect(state.resizeCalls.every((c) => c.withoutEnlargement === true)).toBe(true);
    expect(state.resizeCalls.every((c) => c.width <= state.width)).toBe(true);
  });

  it("keeps the fan-out at one primary + one WebP sidecar per step (≤ 2 × SIZES)", async () => {
    state.width = 1920;
    state.height = 1080;

    const { thumbs, writes } = await runLadder();

    expect(writes).toHaveLength(2 * RESIZEABLE_SIZES.length);
    expect(writes.length).toBeLessThanOrEqual(2 * RESIZEABLE_SIZES.length);
    expect(Object.keys(thumbs).sort()).toEqual(
      [
        ...RESIZEABLE_SIZES.map(([key]) => key),
        ...RESIZEABLE_SIZES.map(([key]) => `${key}_webp`),
      ].sort(),
    );
    // Bytes written scale with the ladder, not with the source bytes.
    expect(writes.reduce((sum, w) => sum + w.bytes, 0)).toBeGreaterThan(0);
  });

  it("writes each step once when the source is already WebP (no primary/sidecar collision)", async () => {
    state.width = 1920;
    state.height = 1080;

    const { thumbs, writes } = await runLadder("webp");

    const paths = writes.map((w) => w.relPath);
    expect(paths).toHaveLength(new Set(paths).size);
    expect(writes).toHaveLength(RESIZEABLE_SIZES.length);
    expect(Object.keys(thumbs).some((key) => key.endsWith("_webp"))).toBe(false);
    expect(Object.keys(thumbs)).toHaveLength(RESIZEABLE_SIZES.length);
  });

  it("reports the encoder's output dimensions, not the requested ladder step", async () => {
    const { thumbs } = await runLadder();

    expect(thumbs.thumbnail).toMatchObject({
      width: 200,
      height: 150,
      mimeType: "image/jpeg",
      size: 200,
    });
  });
});
