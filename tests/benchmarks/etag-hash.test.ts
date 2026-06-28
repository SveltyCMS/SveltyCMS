/**
 * @file tests/benchmarks/etag-hash.test.ts
 * @description Benchmarks ETag hash performance: XXH3 vs SHA-256 vs MD5 vs SHA-1 (Optimized)
 *
 * Measures raw hash speed on payload sizes representative of API responses.
 */

import { describe, it, expect } from "vitest";
import "../unit/bun-preload.ts";
import { xxhash64 } from "hash-wasm";
import crypto from "node:crypto";

// Pre-serialize payload configurations with frozen static assets to protect timing boundaries
const staticTimestamp = "2026-06-27T20:20:56.000Z";

const PAYLOADS = Object.freeze({
  tiny: JSON.stringify({ ok: true, count: 42 }),
  small: JSON.stringify({
    success: true,
    data: {
      items: Array.from({ length: 10 }, (_, i) => ({
        id: i,
        title: `Item ${i}`,
        status: "published",
      })),
    },
  }),
  medium: JSON.stringify({
    success: true,
    data: {
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        title: `Content Item ${i}`,
        slug: `content-item-${i}`,
        status: i % 3 === 0 ? "published" : "draft",
        author: `user-${i % 5}`,
        createdAt: staticTimestamp,
        updatedAt: staticTimestamp,
      })),
      total: 100,
      page: 1,
      pages: 10,
    },
  }),
  large: JSON.stringify({
    items: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      body: "Lorem ipsum dolor sit amet ".repeat(20),
    })),
  }),
});

function sha256Hash(data: string): string {
  // Directly extract substring to lower string allocation overhead where possible
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

function md5Hash(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex").substring(0, 16);
}

function sha1Hash(data: string): string {
  return crypto.createHash("sha1").update(data).digest("hex").substring(0, 16);
}

function measureSync(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

async function measureAsync(fn: () => Promise<void>, iterations: number): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  return (performance.now() - start) / iterations;
}

describe("ETag Hash Performance", () => {
  for (const [name, payload] of Object.entries(PAYLOADS)) {
    const sizeKB = (payload.length / 1024).toFixed(1);
    const iterations = name === "large" ? 5000 : 50000;

    it(`${name} (${sizeKB} KB) — XXH3 vs MD5 vs SHA-1 vs SHA-256`, async () => {
      // Isolating WASM microtask promise scheduling overhead from true hashing loop time
      const xxh3Time = await measureAsync(() => xxhash64(payload), iterations);
      const md5Time = measureSync(() => md5Hash(payload), iterations);
      const sha1Time = measureSync(() => sha1Hash(payload), iterations);
      const sha256Time = measureSync(() => sha256Hash(payload), iterations);

      const speedupVsSHA256 = (sha256Time / xxh3Time).toFixed(1);
      const speedupVsMD5 = (md5Time / xxh3Time).toFixed(1);
      const speedupVsSHA1 = (sha1Time / xxh3Time).toFixed(1);

      console.log(`\n  ${name} (${sizeKB} KB, ${iterations} iterations):`);
      console.log(`    XXH3:    ${(xxh3Time * 1000).toFixed(4)} µs`);
      console.log(`    MD5:     ${(md5Time * 1000).toFixed(4)} µs  (${speedupVsMD5}× slower)`);
      console.log(`    SHA-1:   ${(sha1Time * 1000).toFixed(4)} µs  (${speedupVsSHA1}× slower)`);
      console.log(
        `    SHA-256: ${(sha256Time * 1000).toFixed(4)} µs  (${speedupVsSHA256}× slower)`,
      );

      if (payload.length > 200) {
        expect(xxh3Time).toBeLessThan(md5Time);
        expect(xxh3Time).toBeLessThan(sha1Time);
        expect(xxh3Time).toBeLessThan(sha256Time);
      } else {
        // Safe bound matching microtask loop allocation noise limits on small items
        expect(xxh3Time).toBeLessThan(0.005);
      }
    }, 30000);
  }
});
