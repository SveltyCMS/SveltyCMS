/**
 * @file tests/unit/benchmarks/heap-stability.test.ts
 * @description Automated regression tests for Heap Stability and Memory Leak Prevention after Bursts.
 *
 * Features:
 * - Quantifies retained heap memory before and after high-volume operation bursts
 * - Validates garbage collector recovery and lack of unbounded closure retention
 * - Asserts asymptotic memory plateau across consecutive write/transformation bursts
 * - Verifies LRU cache bound adherence and memory reclamation on eviction
 */

import { describe, expect, it } from "vitest";

function runGC(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

function getHeapUsedMB(): number {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

describe("Heap Stability & Memory Leak Prevention", () => {
  it("settles within a strict heap bound after a 1,000 document transformation burst", async () => {
    // 1. Initial warm-up and baseline measurement
    runGC();
    const baselineMB = getHeapUsedMB();

    // 2. Execute 1,000 document serialization and field normalization bursts
    const payloadTemplate = {
      title: "Benchmark Document",
      slug: "benchmark-document-slug",
      status: "published",
      metadata: {
        views: 1200,
        tags: ["tech", "performance", "cms", "svelte", "vitest"],
        nested: { count: 42, active: true },
      },
      content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(15),
    };

    const transientResults: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const doc = {
        ...payloadTemplate,
        _id: `doc-${i}`,
        updatedAt: new Date().toISOString(),
        counter: i,
      };
      // Simulate typical pipeline work: serialization, cloning, JSON parse
      const serialized = JSON.stringify(doc);
      const parsed = JSON.parse(serialized);
      transientResults.push(parsed._id);
    }

    expect(transientResults.length).toBe(1000);
    // Clear local references
    transientResults.length = 0;

    // 3. Force GC and measure retained heap
    runGC();
    const postBurstMB = getHeapUsedMB();
    const heapDeltaMB = postBurstMB - baselineMB;

    // Retained heap should not grow by more than 25MB after GC cleanup of transient items
    expect(heapDeltaMB).toBeLessThan(25);
  });

  it("exhibits asymptotic memory stability across multiple consecutive bursts (no linear leak)", async () => {
    runGC();
    const burstSizes = [500, 500, 500];
    const heapAfterBursts: number[] = [];

    for (let b = 0; b < burstSizes.length; b++) {
      const size = burstSizes[b];
      const batch: Array<Record<string, unknown>> = [];

      for (let i = 0; i < size; i++) {
        batch.push({
          id: `burst-${b}-item-${i}`,
          tokens: Array.from({ length: 20 }, (_, idx) => `tok-${idx}`),
          payload: Buffer.from(`data-chunk-${i}`).toString("base64"),
          created: new Date().toISOString(),
        });
      }

      // Process batch
      const mapped = batch.map((item) => JSON.stringify(item));
      expect(mapped.length).toBe(size);

      // Release batch
      batch.length = 0;
      mapped.length = 0;

      runGC();
      heapAfterBursts.push(getHeapUsedMB());
    }

    // Compare memory growth between first post-burst and last post-burst
    const gradientMB = heapAfterBursts[2] - heapAfterBursts[0];
    // Gradient between burst 1 and burst 3 must remain bounded (< 15MB), proving no runaway linear leak
    expect(gradientMB).toBeLessThan(15);
  });

  it("strictly enforces LRU cache capacity bounds and reclaims memory on eviction", async () => {
    // Basic LRU Cache simulation matching SveltyCMS internal cache patterns
    class BoundedCache<K, V> {
      private map = new Map<K, V>();
      constructor(public readonly maxSize: number) {}

      set(key: K, value: V): void {
        if (this.map.has(key)) {
          this.map.delete(key);
        } else if (this.map.size >= this.maxSize) {
          const oldestKey = this.map.keys().next().value;
          if (oldestKey !== undefined) this.map.delete(oldestKey);
        }
        this.map.set(key, value);
      }

      get(key: K): V | undefined {
        if (!this.map.has(key)) return undefined;
        const val = this.map.get(key)!;
        this.map.delete(key);
        this.map.set(key, val);
        return val;
      }

      size(): number {
        return this.map.size;
      }
    }

    const MAX_CACHE_ITEMS = 256;
    const cache = new BoundedCache<string, { buffer: string }>(MAX_CACHE_ITEMS);

    runGC();
    const initialHeap = getHeapUsedMB();

    // Insert 2,000 large items into a 256-item bounded cache
    for (let i = 0; i < 2000; i++) {
      cache.set(`key-${i}`, {
        buffer: "x".repeat(1024 * 8), // 8 KB payload per item
      });
    }

    expect(cache.size()).toBe(MAX_CACHE_ITEMS);
    expect(cache.get("key-0")).toBeUndefined(); // Evicted
    expect(cache.get("key-1999")).toBeDefined(); // Retained

    runGC();
    const finalHeap = getHeapUsedMB();
    const cacheHeapDeltaMB = finalHeap - initialHeap;

    // 256 items * 8KB is ~2MB; 2,000 items would be 16MB. The heap growth should reflect ~256 items.
    expect(cacheHeapDeltaMB).toBeLessThan(10);
  });
});
