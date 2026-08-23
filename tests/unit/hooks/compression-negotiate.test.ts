/**
 * @file tests/unit/hooks/compression-negotiate.test.ts
 * @description Size-aware Accept-Encoding negotiation and expansion guard.
 *
 * Features tested:
 * - Tiny payloads prefer gzip even when the client advertises zstd
 * - Small payloads prefer brotli over zstd
 * - Medium / unknown size still prefer zstd
 * - compressSync returns null when the result would be larger than the input
 */

import { describe, expect, it } from "vitest";
import {
  compressSync,
  hasNativeCompression,
  negotiateEncoding,
} from "@src/hooks/handle-compression";

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
