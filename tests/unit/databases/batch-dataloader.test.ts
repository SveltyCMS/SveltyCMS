/**
 * @file tests/unit/databases/batch-dataloader.test.ts
 * @description
 * Unit tests for BatchDataLoader.
 *
 * Verifies microsecond batching of single ID queries into single WHERE _id IN (...) calls,
 * request-scoped deduplication, and ordered value resolution.
 */

import { describe, it, expect, vi } from "vitest";
import { BatchDataLoader } from "@src/databases/core/batch-dataloader";

describe("BatchDataLoader (Relation Batching & N+1 Prevention)", () => {
  it("batches concurrent load calls into a single batch query", async () => {
    const mockBatchFetch = vi.fn().mockImplementation(async (keys: string[]) => {
      const map = new Map<string, { id: string; name: string }>();
      for (const k of keys) {
        map.set(k, { id: k, name: `Item ${k}` });
      }
      return map;
    });

    const loader = new BatchDataLoader<string, { id: string; name: string }>(mockBatchFetch);

    // Concurrent single load requests in the same microtask tick
    const p1 = loader.load("id-1");
    const p2 = loader.load("id-2");
    const p3 = loader.load("id-1"); // Duplicate ID check

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    // Should call batchFetch EXACTLY ONCE with unique keys
    expect(mockBatchFetch).toHaveBeenCalledTimes(1);
    expect(mockBatchFetch).toHaveBeenCalledWith(["id-1", "id-2"]);

    expect(res1).toEqual({ id: "id-1", name: "Item id-1" });
    expect(res2).toEqual({ id: "id-2", name: "Item id-2" });
    expect(res3).toEqual({ id: "id-1", name: "Item id-1" });
  });

  it("loads multiple IDs in parallel with loadMany", async () => {
    const mockBatchFetch = vi.fn().mockImplementation(async (keys: number[]) => {
      const map = new Map<number, string>();
      for (const k of keys) {
        map.set(k, `Value-${k}`);
      }
      return map;
    });

    const loader = new BatchDataLoader<number, string>(mockBatchFetch);
    const results = await loader.loadMany([10, 20, 30]);

    expect(mockBatchFetch).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["Value-10", "Value-20", "Value-30"]);
  });
});
