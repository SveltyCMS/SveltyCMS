/**
 * @file tests/unit/hooks/compression-negotiate.test.ts
 * @description Size-aware Accept-Encoding negotiation, expansion guard, and the
 * FIX 7/8 event-loop safety contract for zstd compression.
 *
 * Features tested:
 * - Tiny payloads prefer gzip even when the client advertises zstd
 * - Small payloads prefer brotli over zstd
 * - Medium / unknown size still prefer zstd
 * - compressSync returns null when the result would be larger than the input
 * - compressZstd uses the native worker-pool API, yielding a decodable frame
 * - compressZstd never calls the sync compressor above SYNC_MAX_SIZE
 * - the sync fallback stays size-gated when the async API is unavailable
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addVaryHeader,
  compressAsync,
  compressSync,
  compressZstd,
  getCmsZstdDictionary,
  hasAsyncZstd,
  hasNativeCompression,
  isCompressibleContentType,
  negotiateEncoding,
  setCompressionHeaders,
  SYNC_MAX_SIZE,
} from "@src/hooks/handle-compression";

/** Minimal native-zstd surface of `node:zlib` (avoids @types/node zstd lag). */
type ZstdSurface = {
  zstdCompress?: (
    buffer: Buffer,
    options: { dict?: Buffer },
    callback: (error: Error | null, result?: Buffer) => void,
  ) => void;
  zstdCompressSync?: (buffer: Buffer, options?: unknown) => Buffer;
  zstdDecompressSync?: (buffer: Buffer, options?: unknown) => Buffer;
};

/** Counters shared with the module mock (hoisted above the imports). */
const zstdControl = vi.hoisted(() => ({
  asyncEnabled: true,
  asyncCalls: 0,
  syncCalls: 0,
}));

// Wrap node:zlib: the sync compressor must be observable (it blocks the event
// loop, so "not called above SYNC_MAX_SIZE" is the regression under test), and
// the async API can be hidden to simulate a sync-only runtime.
vi.mock("node:zlib", async (importOriginal) => {
  const actual = (await importOriginal()) as unknown as ZstdSurface & Record<string, unknown>;
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = (actual as Record<string, unknown>)[key];
  }

  const sync = actual.zstdCompressSync;
  if (typeof sync === "function") {
    mocked.zstdCompressSync = (...args: Parameters<typeof sync>) => {
      zstdControl.syncCalls += 1;
      return sync(...args);
    };
  }

  const asyncCompress = actual.zstdCompress;
  if (typeof asyncCompress === "function") {
    const wrapped = (...args: Parameters<typeof asyncCompress>) => {
      zstdControl.asyncCalls += 1;
      return asyncCompress(...args);
    };
    // Getter: a single test can simulate a runtime without the worker-pool API.
    Object.defineProperty(mocked, "zstdCompress", {
      configurable: true,
      enumerable: true,
      get: () => (zstdControl.asyncEnabled ? wrapped : undefined),
    });
  }

  return mocked as unknown as typeof import("node:zlib");
});

async function waitForNativeCompression(): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if (hasNativeCompression()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return hasNativeCompression();
}

const ALL = "gzip, deflate, br, zstd";

describe("negotiateEncoding — size-aware", () => {
  it("picks gzip for known-tiny payloads even when zstd is advertised", () => {
    expect(negotiateEncoding(ALL, true, { zstdAvailable: true, contentLength: 1500 })).toBe("gzip");
  });

  it("picks brotli for known-small payloads (4–32 KiB), not zstd", () => {
    expect(negotiateEncoding(ALL, true, { zstdAvailable: true, contentLength: 8 * 1024 })).toBe(
      "br",
    );
  });

  it("picks zstd for medium+ payloads when the client and runtime support it", () => {
    expect(negotiateEncoding(ALL, true, { zstdAvailable: true, contentLength: 64 * 1024 })).toBe(
      "zstd",
    );
  });

  it("picks zstd for unknown size (streaming) when available", () => {
    expect(negotiateEncoding(ALL, true, { zstdAvailable: true, contentLength: 0 })).toBe("zstd");
  });

  it("falls back to gzip when zlib/brotli/zstd are unavailable", () => {
    expect(
      negotiateEncoding("gzip, deflate", false, {
        zstdAvailable: false,
        contentLength: 64 * 1024,
      }),
    ).toBe("gzip");
  });

  it("is case-insensitive on Accept-Encoding", () => {
    expect(negotiateEncoding("GZIP, BR", true, { zstdAvailable: false, contentLength: 1500 })).toBe(
      "gzip",
    );
  });
});

describe("compressSync — expansion guard", () => {
  it("returns null for incompressible input that would grow", async () => {
    const ready = await waitForNativeCompression();
    if (!ready) return; // Edge-like runner without node:zlib — negotiation tests still cover policy
    // High-entropy 2 KiB does not gzip below its original size at typical levels.
    const random = Buffer.alloc(2048);
    for (let i = 0; i < random.length; i++) random[i] = (i * 47 + 13) % 251;
    const compressed = compressSync(random, "gzip", random.byteLength);
    if (compressed) {
      expect(compressed.byteLength).toBeLessThan(random.byteLength);
    } else {
      expect(compressed).toBeNull();
    }
  });

  it("compresses repetitive CMS JSON below the original size", async () => {
    const ready = await waitForNativeCompression();
    if (!ready) return;
    const json = Buffer.from(
      JSON.stringify({
        items: Array.from({ length: 80 }, (_, i) => ({
          id: `entry-${i}`,
          status: "published",
          collection: "posts",
        })),
      }),
    );
    const compressed = compressSync(json, "gzip", json.byteLength);
    expect(compressed).not.toBeNull();
    expect(compressed!.byteLength).toBeLessThan(json.byteLength);
  });
});

describe("compressZstd — event-loop safety (FIX 7/8)", () => {
  afterEach(() => {
    zstdControl.asyncEnabled = true;
    zstdControl.asyncCalls = 0;
    zstdControl.syncCalls = 0;
  });

  it("compresses a normal body through the worker-pool API into a decodable frame", async () => {
    const ready = await waitForNativeCompression();
    if (!ready) return;
    const zlib = (await import("node:zlib")) as unknown as ZstdSurface;
    if (!zlib.zstdDecompressSync || typeof zlib.zstdCompressSync !== "function") return;

    const json = JSON.stringify({
      items: Array.from({ length: 120 }, (_, i) => ({
        id: `entry-${i}`,
        status: "published",
        collection: "posts",
      })),
    });
    const compressed = await compressZstd(json);
    expect(compressed).not.toBeNull();
    expect(compressed!.byteLength).toBeLessThan(Buffer.byteLength(json, "utf8"));
    expect(zlib.zstdDecompressSync(Buffer.from(compressed!)).toString("utf8")).toBe(json);
    // Async API preferred when available; the blocking sync compressor untouched.
    if (hasAsyncZstd()) {
      expect(zstdControl.asyncCalls).toBeGreaterThan(0);
    }
    expect(zstdControl.syncCalls).toBe(0);
  });

  it("never calls the sync compressor for a body above SYNC_MAX_SIZE", async () => {
    const ready = await waitForNativeCompression();
    if (!ready) return;
    const big = JSON.stringify({ data: "x".repeat(SYNC_MAX_SIZE + 4096) });
    const bigBytes = Buffer.byteLength(big, "utf8");
    expect(bigBytes).toBeGreaterThan(SYNC_MAX_SIZE);

    const compressed = await compressZstd(big, bigBytes);
    // The request thread must never rip an over-cap body synchronously.
    expect(zstdControl.syncCalls).toBe(0);

    if (hasAsyncZstd()) {
      // Worker-pool path still serves >cap bodies — the turbo-get zstd cache
      // fill is preserved without adding an event-loop stall.
      expect(compressed).not.toBeNull();
      expect(compressed!.byteLength).toBeLessThan(bigBytes);
    } else {
      // Sync-only runtime: refuse above the cap rather than block the loop.
      expect(compressed).toBeNull();
    }
  });

  it("keeps the sync fallback size-gated when the async API is unavailable", async () => {
    const ready = await waitForNativeCompression();
    if (!ready) return;
    const zlib = (await import("node:zlib")) as unknown as ZstdSurface;
    if (!zlib.zstdDecompressSync || typeof zlib.zstdCompressSync !== "function") return;

    zstdControl.asyncEnabled = false;
    try {
      expect(hasAsyncZstd()).toBe(false);

      const big = JSON.stringify({ data: "x".repeat(SYNC_MAX_SIZE + 4096) });
      expect(await compressZstd(big, Buffer.byteLength(big, "utf8"))).toBeNull();
      expect(zstdControl.syncCalls).toBe(0);

      // Below the cap the sync fallback still compresses (no behaviour change
      // for legal traffic) and yields a decodable frame.
      const small = JSON.stringify({ items: Array.from({ length: 40 }, (_, i) => `entry-${i}`) });
      const compressed = await compressZstd(small);
      expect(zstdControl.syncCalls).toBeGreaterThan(0);
      expect(compressed).not.toBeNull();
      expect(zlib.zstdDecompressSync(Buffer.from(compressed!)).toString("utf8")).toBe(small);
    } finally {
      zstdControl.asyncEnabled = true;
    }
  });
});

describe("isCompressibleContentType — content-type allowlist", () => {
  it("rejects null and empty content types", () => {
    expect(isCompressibleContentType(null)).toBe(false);
    expect(isCompressibleContentType("")).toBe(false);
  });

  it("accepts the text/* family", () => {
    expect(isCompressibleContentType("text/html")).toBe(true);
    expect(isCompressibleContentType("text/plain; charset=utf-8")).toBe(true);
  });

  it("accepts json in any position or casing", () => {
    expect(isCompressibleContentType("application/json")).toBe(true);
    expect(isCompressibleContentType("application/json; charset=utf-8")).toBe(true);
    expect(isCompressibleContentType("application/vnd.api+json")).toBe(true);
    expect(isCompressibleContentType("APPLICATION/JSON")).toBe(true);
  });

  it("accepts xml, javascript and svg", () => {
    expect(isCompressibleContentType("application/xml")).toBe(true);
    expect(isCompressibleContentType("application/javascript")).toBe(true);
    expect(isCompressibleContentType("text/javascript")).toBe(true);
    expect(isCompressibleContentType("image/svg+xml")).toBe(true);
  });

  it("always excludes SSE regardless of the text/ prefix", () => {
    expect(isCompressibleContentType("text/event-stream")).toBe(false);
    expect(isCompressibleContentType("text/event-stream; charset=utf-8")).toBe(false);
  });

  it("rejects binary and other non-compressible types", () => {
    expect(isCompressibleContentType("application/octet-stream")).toBe(false);
    expect(isCompressibleContentType("image/png")).toBe(false);
    expect(isCompressibleContentType("font/woff2")).toBe(false);
  });
});

describe("negotiateEncoding — selection matrix", () => {
  it("prefers deflate for tiny payloads when gzip is absent", () => {
    expect(
      negotiateEncoding("deflate, br", true, { zstdAvailable: false, contentLength: 1500 }),
    ).toBe("deflate");
  });

  it("falls back to brotli for tiny payloads when gzip/deflate are absent", () => {
    expect(negotiateEncoding("br, zstd", true, { zstdAvailable: true, contentLength: 1500 })).toBe(
      "br",
    );
  });

  it("falls back to zstd for tiny payloads when it is the only match", () => {
    expect(negotiateEncoding("zstd", true, { zstdAvailable: true, contentLength: 1500 })).toBe(
      "zstd",
    );
  });

  it("returns null for tiny payloads with no supported encoding", () => {
    expect(negotiateEncoding("gzip", true, { zstdAvailable: false, contentLength: 0 })).toBe(
      "gzip",
    );
    expect(negotiateEncoding("identity", true, { zstdAvailable: false, contentLength: 1500 })).toBe(
      null,
    );
  });

  it("prefers gzip for small payloads when brotli is unavailable", () => {
    expect(
      negotiateEncoding("gzip, deflate, zstd", true, {
        zstdAvailable: true,
        contentLength: 8 * 1024,
      }),
    ).toBe("gzip");
  });

  it("prefers deflate for small payloads when gzip and brotli are unavailable", () => {
    expect(
      negotiateEncoding("deflate, zstd", true, { zstdAvailable: true, contentLength: 8 * 1024 }),
    ).toBe("deflate");
  });

  it("prefers zstd for small payloads when nothing else matches", () => {
    expect(negotiateEncoding("zstd", true, { zstdAvailable: true, contentLength: 8 * 1024 })).toBe(
      "zstd",
    );
  });

  it("returns null for small payloads with no supported encoding", () => {
    expect(
      negotiateEncoding("identity", true, { zstdAvailable: false, contentLength: 8 * 1024 }),
    ).toBe(null);
  });

  it("prefers brotli over gzip for medium payloads when zstd is unavailable", () => {
    expect(
      negotiateEncoding("br, gzip, deflate", true, {
        zstdAvailable: false,
        contentLength: 64 * 1024,
      }),
    ).toBe("br");
  });

  it("prefers gzip for medium payloads when brotli and zstd are unavailable", () => {
    expect(
      negotiateEncoding("gzip, deflate", true, { zstdAvailable: false, contentLength: 64 * 1024 }),
    ).toBe("gzip");
  });

  it("prefers deflate for medium payloads when it is the only match", () => {
    expect(
      negotiateEncoding("deflate", true, { zstdAvailable: false, contentLength: 64 * 1024 }),
    ).toBe("deflate");
  });

  it("returns null (identity) for an unsupported Accept-Encoding header", () => {
    expect(
      negotiateEncoding("identity", true, { zstdAvailable: false, contentLength: 64 * 1024 }),
    ).toBe(null);
    expect(negotiateEncoding("", true, { zstdAvailable: false, contentLength: 0 })).toBe(null);
  });

  it("does not select brotli when native zlib is unavailable", () => {
    expect(negotiateEncoding("br", false, { zstdAvailable: false, contentLength: 64 * 1024 })).toBe(
      null,
    );
  });
});

describe("addVaryHeader — case-insensitive merge", () => {
  it("sets Vary when absent", () => {
    const headers = new Headers();
    addVaryHeader(headers, "Accept-Encoding");
    expect(headers.get("Vary")).toBe("Accept-Encoding");
  });

  it("appends a new token preserving existing upstream values", () => {
    const headers = new Headers({ Vary: "Origin" });
    addVaryHeader(headers, "Accept-Encoding");
    expect(headers.get("Vary")).toBe("Origin, Accept-Encoding");
  });

  it("does not duplicate an existing token", () => {
    const headers = new Headers({ Vary: "Origin, Accept-Encoding" });
    addVaryHeader(headers, "Accept-Encoding");
    expect(headers.get("Vary")).toBe("Origin, Accept-Encoding");
  });

  it("deduplicates case-insensitively", () => {
    const headers = new Headers({ Vary: "origin, accept-encoding" });
    addVaryHeader(headers, "Accept-Encoding");
    expect(headers.get("Vary")).toBe("origin, accept-encoding");
  });

  it("keeps the caller casing when a differently-cased token is appended", () => {
    const headers = new Headers({ Vary: "Origin" });
    addVaryHeader(headers, "accept-encoding");
    expect(headers.get("Vary")).toBe("Origin, accept-encoding");
  });
});

describe("setCompressionHeaders — observability contract", () => {
  it("sets the full header set with a computed ratio", () => {
    const headers = new Headers();
    setCompressionHeaders(headers, "gzip", 1000, 250);
    expect(headers.get("Content-Encoding")).toBe("gzip");
    expect(headers.get("X-Original-Size")).toBe("1000");
    expect(headers.get("X-Compressed-Size")).toBe("250");
    expect(headers.get("X-Compression-Ratio")).toBe("25.0%");
    expect(headers.get("X-Compression-Algorithm")).toBe("gzip");
    expect(headers.get("Vary")).toBe("Accept-Encoding");
    expect(headers.has("X-Compression-Dictionary")).toBe(false);
  });

  it("omits size/ratio headers when the original size is unknown", () => {
    const headers = new Headers();
    setCompressionHeaders(headers, "gzip", 0, 0);
    expect(headers.get("Content-Encoding")).toBe("gzip");
    expect(headers.has("X-Original-Size")).toBe(false);
    expect(headers.has("X-Compressed-Size")).toBe(false);
    expect(headers.has("X-Compression-Ratio")).toBe(false);
  });

  it("reports the original size but skips the ratio when compression expanded", () => {
    const headers = new Headers();
    setCompressionHeaders(headers, "gzip", 1000, 0);
    expect(headers.get("X-Original-Size")).toBe("1000");
    expect(headers.has("X-Compressed-Size")).toBe(false);
    expect(headers.has("X-Compression-Ratio")).toBe(false);
  });

  it("reports the compressed size but no ratio when the original size is zero", () => {
    const headers = new Headers();
    setCompressionHeaders(headers, "gzip", 0, 250);
    expect(headers.get("X-Compressed-Size")).toBe("250");
    expect(headers.has("X-Compression-Ratio")).toBe(false);
    expect(headers.has("X-Original-Size")).toBe(false);
  });

  it("adds no zstd dictionary header when the CMS dictionary is absent", () => {
    const headers = new Headers();
    setCompressionHeaders(headers, "zstd", 1000, 250);
    expect(headers.get("Content-Encoding")).toBe("zstd");
    expect(headers.has("X-Compression-Dictionary")).toBe(false);
  });
});

describe("getCmsZstdDictionary — graceful absence", () => {
  it("returns null or a Buffer without throwing when no dictionary is shipped", () => {
    const dict = getCmsZstdDictionary();
    expect(dict === null || Buffer.isBuffer(dict)).toBe(true);
  });
});

describe("compressAsync — off-thread gzip/deflate/brotli", () => {
  it.each(["gzip", "deflate", "br"] as const)(
    "compresses repetitive JSON with %s asynchronously",
    async (algorithm) => {
      const ready = await waitForNativeCompression();
      if (!ready) return;
      const json = Buffer.from(
        JSON.stringify({ items: Array.from({ length: 80 }, (_, i) => `entry-${i}`) }),
      );
      const compressed = await compressAsync(json, algorithm, json.byteLength);
      expect(compressed).not.toBeNull();
      expect(compressed!.byteLength).toBeLessThan(json.byteLength);
    },
  );
});
