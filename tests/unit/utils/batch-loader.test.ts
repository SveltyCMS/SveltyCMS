/**
 * @file tests/unit/utils/batch-loader.test.ts
 * @description Unit tests for the lean BatchLoader (src/utils/server/batch-loader.ts)
 * — queue-pooled dispatch, intra-batch key dedupe and TTL cache semantics.
 *
 * Features:
 * - microtask batching with index-aligned results
 * - intra-batch key dedupe (DataLoader semantics)
 * - shared Error instances for batchFn failures and length mismatches
 * - TTL expiry and request-scoped (no-TTL) caching
 * - prime / clear / clearAll cache semantics
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { BatchLoader } from "@utils/server/batch-loader";

afterEach(() => {
  vi.useRealTimers();
});

describe("BatchLoader", () => {
  it("schedules the batch on a microtask, not synchronously", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    const p = loader.load("a");
    expect(fn).not.toHaveBeenCalled();

    await expect(p).resolves.toBe("v:a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("batches multiple keys into one call with index-aligned results", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    const results = await Promise.all([loader.load("a"), loader.load("b"), loader.load("c")]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(results).toEqual(["v:a", "v:b", "v:c"]);
  });

  it("dedupes duplicate keys within one batch (batchFn sees the key once)", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    const [r1, r2] = await Promise.all([loader.load("a"), loader.load("a")]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(["a"]);
    expect(r1).toBe("v:a");
    expect(r2).toBe("v:a");
  });

  it("dedupes queue-level duplicates after clear() within the same tick", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    const p1 = loader.load("a");
    loader.clear("a");
    const p2 = loader.load("a");

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(["a"]);
    expect(r1).toBe("v:a");
    expect(r2).toBe("v:a");
  });

  it("dispatches immediately once maxBatchSize is reached", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn, { maxBatchSize: 1 });

    const p = loader.load("a");
    expect(fn).toHaveBeenCalledTimes(1); // flushed synchronously — the pushing load reached maxBatchSize

    await expect(p).resolves.toBe("v:a");
  });

  it("rejects all callers with the same Error instance when the batchFn throws", async () => {
    const boom = new Error("db down");
    const fn = vi.fn(async () => {
      throw boom;
    });
    const loader = new BatchLoader(fn);

    const p1 = loader.load("a");
    const p2 = loader.load("b");

    const e1 = await p1.catch((e) => e);
    const e2 = await p2.catch((e) => e);

    expect(e1).toBe(boom);
    expect(e2).toBe(boom);
  });

  it("rejects with the same Error instance and exact message on length mismatch", async () => {
    const fn = vi.fn(async () => ["only-one"]);
    const loader = new BatchLoader(fn);

    const p1 = loader.load("a");
    const p2 = loader.load("b");

    const e1 = await p1.catch((e) => e);
    const e2 = await p2.catch((e) => e);

    expect(e1).toBeInstanceOf(Error);
    expect(e1).toBe(e2);
    expect((e1 as Error).message).toBe(
      "BatchLoader: batchFn must return an array of the same length as the keys array. Expected 2, got 1.",
    );
  });

  it("rejects each caller with its own per-key Error result", async () => {
    const errA = new Error("key-a failed");
    const fn = vi.fn(async () => [errA, "v:b"]);
    const loader = new BatchLoader(fn);

    const p1 = loader.load("a");
    const p2 = loader.load("b");

    await expect(p1).rejects.toBe(errA);
    await expect(p2).resolves.toBe("v:b");
  });

  it("caches results and skips the batchFn on repeat loads", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    await Promise.all([loader.load("a"), loader.load("b")]);
    await Promise.all([loader.load("a"), loader.load("b")]); // both cached

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("request-scoped entries (default TTL 0) never expire", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    await loader.load("a");
    vi.advanceTimersByTime(600_000); // 10 minutes later
    await expect(loader.load("a")).resolves.toBe("v:a");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refetches after cacheTtlMs elapses", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn, { cacheTtlMs: 100 });

    await loader.load("a");
    vi.advanceTimersByTime(50);
    await loader.load("a"); // still fresh
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60); // 110ms total — expired
    await loader.load("a");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("prime seeds the cache without calling the batchFn and never overwrites", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    loader.prime("a", "va");
    await expect(loader.load("a")).resolves.toBe("va");
    expect(fn).not.toHaveBeenCalled();

    loader.prime("a", "vb"); // existing entry — no-op
    await expect(loader.load("a")).resolves.toBe("va");
    expect(fn).not.toHaveBeenCalled();
  });

  it("clear removes one key, clearAll empties the whole cache", async () => {
    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    await Promise.all([loader.load("a"), loader.load("b")]);
    expect(fn).toHaveBeenCalledTimes(1);

    loader.clear("a");
    await Promise.all([loader.load("a"), loader.load("b")]); // "a" refetched, "b" still cached
    expect(fn).toHaveBeenCalledTimes(2);

    loader.clearAll();
    // Both keys re-fetched in one batch.
    await Promise.all([loader.load("a"), loader.load("b")]);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
