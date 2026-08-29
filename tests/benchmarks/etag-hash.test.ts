/**
 * @file tests/benchmarks/etag-hash.test.ts
 * @description Benchmarks ETag hash performance: XXH3 vs SHA-256 vs MD5 vs SHA-1 (Optimized)
 * @summary Measures raw hash throughput, sub-microsecond latency, and buffer digestion speeds.
 */

import { describe, it, expect, beforeAll } from "vitest";
import "../unit/bun-preload.ts";
import { xxhash3 } from "hash-wasm";
import crypto from "node:crypto";

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

// Pre-encoded Uint8Array buffers for high-speed zero-copy hashing tests
const BUFFER_PAYLOADS = Object.freeze({
  tiny: Buffer.from(PAYLOADS.tiny),
  small: Buffer.from(PAYLOADS.small),
  medium: Buffer.from(PAYLOADS.medium),
  large: Buffer.from(PAYLOADS.large),
});

// Native Bun/Node hashing fast-paths
function bunNativeHash(data: string | Uint8Array): string {
  if (typeof Bun !== "undefined" && typeof (Bun as any).hash === "function") {
    return (Bun as any).hash(data).toString(16);
  }
  return crypto.createHash("md5").update(data).digest("hex").substring(0, 16);
}

function sha256Hash(data: string | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

function md5Hash(data: string | Uint8Array): string {
  return crypto.createHash("md5").update(data).digest("hex").substring(0, 16);
}

function sha1Hash(data: string | Uint8Array): string {
  return crypto.createHash("sha1").update(data).digest("hex").substring(0, 16);
}

function measureSync(fn: () => void, iterations: number, warmup = 500): number {
  for (let w = 0; w < warmup; w++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

async function measureAsync(
  fn: () => Promise<unknown>,
  iterations: number,
  warmup = 100,
): Promise<number> {
  for (let w = 0; w < warmup; w++) await fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  return (performance.now() - start) / iterations;
}

describe("ETag Hash Performance", () => {
  beforeAll(async () => {
    // Prime WASM bytecode and JIT engines
    await xxhash3("prime-warmup-token");
  });

  for (const [name, payload] of Object.entries(PAYLOADS)) {
    const bufferPayload = BUFFER_PAYLOADS[name as keyof typeof BUFFER_PAYLOADS];
    const sizeKB = (payload.length / 1024).toFixed(1);
    const iterations = name === "large" ? 5000 : 50000;

    it(`${name} (${sizeKB} KB) — XXH3 vs MD5 vs SHA-1 vs SHA-256`, async () => {
      // 1. Measure WASM XXH3 (True XXH3 algorithm)
      const xxh3Time = await measureAsync(() => xxhash3(payload), iterations);

      // 2. Measure Native Crypto
      const md5Time = measureSync(() => md5Hash(payload), iterations);
      const sha1Time = measureSync(() => sha1Hash(payload), iterations);
      const sha256Time = measureSync(() => sha256Hash(payload), iterations);

      // 3. Measure Buffer zero-copy digestion (Engine internal optimization)
      const nativeFastTime = measureSync(() => bunNativeHash(bufferPayload), iterations);

      const speedupVsSHA256 = (sha256Time / xxh3Time).toFixed(1);
      const speedupVsMD5 = (md5Time / xxh3Time).toFixed(1);
      const speedupVsSHA1 = (sha1Time / xxh3Time).toFixed(1);

      console.log(
        `\n  ${name.toUpperCase()} (${sizeKB} KB, ${iterations.toLocaleString()} iterations):`,
      );
      console.log(`    XXH3 (WASM):      ${(xxh3Time * 1000).toFixed(3)} µs`);
      console.log(
        `    MD5:              ${(md5Time * 1000).toFixed(3)} µs  (${speedupVsMD5}× vs XXH3)`,
      );
      console.log(
        `    SHA-1:            ${(sha1Time * 1000).toFixed(3)} µs  (${speedupVsSHA1}× vs XXH3)`,
      );
      console.log(
        `    SHA-256:          ${(sha256Time * 1000).toFixed(3)} µs  (${speedupVsSHA256}× vs XXH3)`,
      );
      console.log(`    Native Fast-Hash: ${(nativeFastTime * 1000).toFixed(3)} µs (Zero-Copy)`);

      if (payload.length > 1000) {
        expect(xxh3Time).toBeLessThan(sha256Time);
      } else {
        expect(xxh3Time).toBeLessThan(0.015);
      }
    }, 30_000);
  }
});
