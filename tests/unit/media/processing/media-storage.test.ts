/**
 * @file tests/unit/media/processing/media-storage.test.ts
 * @description Unit tests for `saveResized()` in media-storage.server.ts.
 *
 * Covers the invariants the function owns (media pipeline plan §3 #3):
 * - Never upscale: a ladder step wider than the decoded source is dropped.
 * - One output per step: JPEG is the default derivative format, `webp`/`avif` are
 *   opt-ins, an unrecognised value falls back to JPEG.
 * - One write per path: in `original` mode the primary output and WebP sidecar share a
 *   path when the primary is itself WebP, and that pair is written once.
 *
 * Plus the size ladder contract, the `original`-mode WebP sidecar keys, the alpha
 * fallback and the recorded width/height fallbacks. `sharp` and the storage adapter are
 * mocked (engine + I/O).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** sharp stub — the engine boundary. */
const sharpState = vi.hoisted(() => ({
  meta: { width: 1920, height: 1080, format: "jpeg", hasAlpha: false } as {
    width?: number;
    height?: number;
    format: string;
    hasAlpha?: boolean;
  },
  /** Widths handed to `resize()`, i.e. the ladder steps actually encoded. */
  resizes: [] as number[],
}));

/** Storage stub — the I/O boundary. */
const storage = vi.hoisted(() => ({ uploads: [] as string[] }));

vi.mock("sharp", () => {
  const instance: Record<string, unknown> = {
    metadata: () => Promise.resolve(sharpState.meta),
    resize: (w: number) => {
      sharpState.resizes.push(w);
      return instance;
    },
    // Mirrors sharp's `resolveWithObject` shape, minus width/height: the code
    // under test must fall back to the requested ladder step.
    toBuffer: (opts?: { resolveWithObject?: boolean }) =>
      Promise.resolve(
        opts?.resolveWithObject
          ? { data: Buffer.from("mock-buffer"), info: { size: 42 } }
          : Buffer.from("mock-buffer"),
      ),
    webp: () => instance,
    jpeg: () => instance,
    avif: () => instance,
  };
  instance.clone = () => instance;
  const factory = () => instance;
  return { default: factory };
});

vi.mock("@src/utils/media/storage-adapters", () => ({
  getStorageAdapter: () => ({
    upload: async (_data: unknown, relPath: string) => {
      storage.uploads.push(relPath);
      return `/files/${relPath}`;
    },
    exists: async () => false,
    download: async () => Buffer.alloc(0),
    remove: async () => {},
    getUrl: (relPath: string) => `/files/${relPath}`,
  }),
  getConfig: () => ({}),
}));

/** Settings boundary — controls the output-format override per test. */
const settings = vi.hoisted(() => ({
  format: undefined as { format?: string; quality?: number } | undefined,
}));

vi.mock("@src/services/core/settings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/services/core/settings-service")>();
  return {
    ...actual,
    getPublicSettingSync: (key: string) =>
      key === "MEDIA_OUTPUT_FORMAT_QUALITY" ? settings.format : undefined,
  };
});

const { SIZES, saveResized } = await import("@src/utils/media/media-storage.server");

const BUFFER = Buffer.from("source-bytes");

/** Ladder steps that fit inside a source of `width` (0/undefined = unreadable source). */
const expectedKeys = (width: number | undefined, withSidecar = false) =>
  Object.entries(SIZES)
    .filter(([, w]) => w > 0 && (!width || w <= width))
    .flatMap(([key]) => (withSidecar ? [key, `${key}_webp`] : [key]))
    .sort();

beforeEach(() => {
  sharpState.meta = { width: 1920, height: 1080, format: "jpeg", hasAlpha: false };
  sharpState.resizes.length = 0;
  storage.uploads.length = 0;
  settings.format = undefined;
});

describe("saveResized — variant ladder", () => {
  it("defaults to JPEG: one file per ladder step, no WebP sidecar", async () => {
    const out = await saveResized(BUFFER, "abc123", "photo", "jpg", "global");

    expect(Object.keys(out).sort()).toEqual(expectedKeys(1920));
    expect(Object.keys(out).some((key) => key.endsWith("_webp"))).toBe(false);
    // Exactly one upload per step — the default format is the whole derivative set.
    expect(storage.uploads).toHaveLength(Object.keys(out).length);
    expect(out.thumbnail).toEqual({
      url: "/files/global/thumbnail/photo-abc123.jpg",
      width: 200,
      height: 113, // round((200 / 1920) * 1080) — the encoder reported no height
      size: 42,
      mimeType: "image/jpeg",
    });
    expect(out.lg.height).toBe(675); // round((1200 / 1920) * 1080)
  });

  it("emits every configured size plus a WebP sidecar in `original` mode", async () => {
    settings.format = { format: "original", quality: 80 };

    const out = await saveResized(BUFFER, "abc123", "photo", "jpg", "global");

    expect(Object.keys(out).sort()).toEqual(expectedKeys(1920, true));
    // One upload per primary + one per sidecar.
    expect(storage.uploads).toHaveLength(Object.keys(out).length);

    expect(out.thumbnail).toEqual({
      url: "/files/global/thumbnail/photo-abc123.jpg",
      width: 200,
      height: 113,
      size: 42,
      mimeType: "image/jpeg",
    });
    expect(out.thumbnail_webp).toEqual({
      url: "/files/global/thumbnail/photo-abc123.webp",
      width: 200,
      height: 113,
      size: 42,
      mimeType: "image/webp",
    });
  });

  it("keeps WebP for a source with alpha — a JPEG primary would flatten it", async () => {
    sharpState.meta = { width: 1920, height: 1080, format: "png", hasAlpha: true };

    const out = await saveResized(BUFFER, "abc123", "logo", "png", "global");

    expect(out.thumbnail.url).toBe("/files/global/thumbnail/logo-abc123.webp");
    expect(out.thumbnail.mimeType).toBe("image/webp");
    // The configured format was JPEG, so no WebP sidecar is added on top.
    expect(Object.keys(out).some((key) => key.endsWith("_webp"))).toBe(false);
  });

  it("never upscales: drops ladder steps wider than the decoded source", async () => {
    sharpState.meta = { width: 700, height: 500, format: "jpeg" };

    const out = await saveResized(BUFFER, "abc123", "photo", "jpg", "global");

    expect(Object.keys(out).sort()).toEqual(expectedKeys(700));
    // The clamp happens before any encode, not just before the write.
    expect(sharpState.resizes.sort((a, b) => a - b)).toEqual([200, 600]);
    expect(sharpState.resizes).not.toContain(900);
    expect(sharpState.resizes).not.toContain(1200);
  });

  it("keeps the full ladder when the source width is unreadable and falls back to the step width for height", async () => {
    sharpState.meta = { width: undefined, height: undefined, format: "jpeg" };

    const out = await saveResized(BUFFER, "abc123", "photo", "jpg", "global");

    expect(Object.keys(out).sort()).toEqual(expectedKeys(undefined));
    // No source height → height mirrors the requested width instead of a ratio.
    expect(out.thumbnail.height).toBe(200);
    expect(out.lg.height).toBe(1200);
  });
});

describe("saveResized — format resolution", () => {
  it("writes once when the source extension is already WebP (original mode)", async () => {
    settings.format = { format: "original", quality: 80 };

    const out = await saveResized(BUFFER, "abc123", "photo", "webp", "global");

    const primaryKeys = Object.entries(SIZES)
      .filter(([, w]) => w > 0)
      .map(([key]) => key)
      .sort();
    expect(Object.keys(out).sort()).toEqual(primaryKeys);
    expect(Object.keys(out).some((key) => key.endsWith("_webp"))).toBe(false);

    // No path is written twice.
    expect(new Set(storage.uploads).size).toBe(storage.uploads.length);
    expect(out.thumbnail.url).toBe("/files/global/thumbnail/photo-abc123.webp");
  });

  it.each([
    ["jpeg (unset)", undefined, "jpg", "image/jpeg", false],
    ["jpeg", { format: "jpeg", quality: 85 }, "jpg", "image/jpeg", false],
    ["jpg (alias of jpeg)", { format: "jpg", quality: 90 }, "jpg", "image/jpeg", false],
    ["avif", { format: "avif", quality: 50 }, "avif", "image/avif", false],
    ["webp", { format: "webp", quality: 80 }, "webp", "image/webp", false],
    ["original", { format: "original", quality: 80 }, "jpg", "image/jpeg", true],
    ["unrecognised (fail-safe)", { format: "heic", quality: 80 }, "jpg", "image/jpeg", false],
  ])(
    "MEDIA_OUTPUT_FORMAT_QUALITY=%s rewrites the primary extension and MIME type",
    async (_label, formatConfig, expectedExt, expectedMime, expectsSidecar) => {
      settings.format = formatConfig;

      const out = await saveResized(BUFFER, "abc123", "photo", "jpg", "global");

      expect(out.thumbnail.url).toBe(`/files/global/thumbnail/photo-abc123.${expectedExt}`);
      expect(out.thumbnail.mimeType).toBe(expectedMime);

      // Only `original` mode pairs a step with a WebP sidecar.
      if (expectsSidecar) {
        expect(out.thumbnail_webp?.mimeType).toBe("image/webp");
      } else {
        expect(out.thumbnail_webp).toBeUndefined();
      }
    },
  );
});

describe("SIZES — configuration contract", () => {
  it("is a frozen object with an 'original' sentinel of 0", () => {
    expect(Object.isFrozen(SIZES)).toBe(true);
    expect(SIZES.original).toBe(0);
  });

  it("keeps a 200px thumbnail and positive, kebab-cased resizeable steps", () => {
    expect(SIZES.thumbnail).toBe(200);

    const resizeable = Object.entries(SIZES).filter(([, w]) => w > 0);
    expect(resizeable.length).toBeGreaterThanOrEqual(1);
    for (const [key, w] of resizeable) {
      expect(w).toBeGreaterThan(0);
      expect(key).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
