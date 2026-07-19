/**
 * @file tests/unit/hooks/compression.test.ts
 * @description Unit tests for handle-compression negotiation, native zstd, and CMS dict.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as zlib from "node:zlib";
import {
  negotiateEncoding,
  compressSync,
  compressZstd,
  hasNativeCompression,
  getCmsZstdDictionary,
  __setCmsZstdDictionaryForTests,
  setCompressionHeaders,
} from "@src/hooks/handle-compression";

const DICT_PATH = join(process.cwd(), "static", "dictionaries", "cms-payloads.dict");
const hasDictFile = existsSync(DICT_PATH);
const hasNativeZstd = typeof (zlib as any).zstdCompressSync === "function";

function cmsyPayload(n = 40): string {
  // Highly repetitive CMS-shaped JSON (benefits from trained dict + zstd)
  const entry = {
    _id: "entry-uuid-example",
    status: "published",
    locale: "en",
    fields: {
      title: "Hello CMS",
      slug: "hello-cms",
      widgets: [{ type: "Input", name: "title", label: "Title" }],
    },
    permissions: { read: ["admin", "editor"], write: ["admin"] },
  };
  return JSON.stringify({ success: true, data: Array.from({ length: n }, () => entry) });
}

describe("negotiateEncoding", () => {
  it("prefers zstd when available and advertised", () => {
    expect(negotiateEncoding("gzip, deflate, br, zstd", true, { zstdAvailable: true })).toBe(
      "zstd",
    );
  });

  it("skips zstd when not available", () => {
    expect(negotiateEncoding("gzip, deflate, br, zstd", true, { zstdAvailable: false })).toBe("br");
  });

  it("falls through gzip → deflate", () => {
    expect(negotiateEncoding("gzip, deflate", false)).toBe("gzip");
    expect(negotiateEncoding("deflate", false)).toBe("deflate");
    expect(negotiateEncoding("identity", true)).toBeNull();
  });
});

describe("compressSync / compressZstd", () => {
  beforeEach(() => {
    // Force dict load from disk if present
    __setCmsZstdDictionaryForTests(undefined);
  });

  afterEach(() => {
    __setCmsZstdDictionaryForTests(undefined);
  });

  it("hasNativeCompression is boolean after module init", async () => {
    // Allow eager init
    await new Promise((r) => setTimeout(r, 50));
    expect(typeof hasNativeCompression()).toBe("boolean");
  });

  it.runIf(hasNativeZstd)("compressSync(zstd) round-trips", () => {
    const raw = Buffer.from(cmsyPayload(5));
    const out = compressSync(raw, "zstd");
    expect(out).toBeTruthy();
    expect(out!.byteLength).toBeLessThan(raw.byteLength);
    const back = (zlib as any).zstdDecompressSync(Buffer.from(out!));
    expect(Buffer.from(back).toString()).toBe(raw.toString());
  });

  it.runIf(hasNativeZstd)("compressZstd returns compressed bytes", async () => {
    const raw = cmsyPayload(10);
    const out = await compressZstd(raw);
    expect(out).toBeTruthy();
    expect(out!.byteLength).toBeGreaterThan(0);
    expect(out!.byteLength).toBeLessThan(Buffer.byteLength(raw));
  });

  it.runIf(hasNativeZstd && hasDictFile)(
    "getCmsZstdDictionary loads static/dictionaries/cms-payloads.dict",
    () => {
      const dict = getCmsZstdDictionary();
      expect(dict).toBeTruthy();
      expect(dict!.byteLength).toBeGreaterThan(1000);
      // Same bytes as file on disk
      const disk = readFileSync(DICT_PATH);
      expect(dict!.equals(disk)).toBe(true);
    },
  );

  it.runIf(hasNativeZstd)("setCompressionHeaders marks cms dictionary when loaded", () => {
    if (hasDictFile) {
      __setCmsZstdDictionaryForTests(readFileSync(DICT_PATH));
    } else {
      __setCmsZstdDictionaryForTests(Buffer.from("SVLT-test-dict"));
    }
    const headers = new Headers();
    setCompressionHeaders(headers, "zstd", 10_000, 2_000);
    expect(headers.get("Content-Encoding")).toBe("zstd");
    expect(headers.get("X-Compression-Algorithm")).toBe("zstd");
    expect(headers.get("X-Compression-Ratio")).toBe("20.0%");
    if (getCmsZstdDictionary()) {
      expect(headers.get("X-Compression-Dictionary")).toBe("cms-payloads");
    }
  });
});
