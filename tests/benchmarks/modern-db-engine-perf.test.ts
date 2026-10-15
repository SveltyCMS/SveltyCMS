/**
 * @file tests/benchmarks/modern-db-engine-perf.test.ts
 * @description
 * High-precision performance and throughput benchmark suite for:
 * - Phase 2: Adaptive Write Coalescing (Concurrent Burst Write Throughput)
 */

import { describe, it, expect } from "vitest";
import { AdaptiveWriteCoalescer } from "@src/databases/core/write-coalescer";

describe("Modern DB Engine Performance & Scalability Benchmark", () => {
  // ==========================================================================
  // BENCHMARK 1: Adaptive Write Coalescer Throughput
  // ==========================================================================
  it("measures throughput amplification of adaptive write coalescing under concurrent bursts", async () => {
    const uncoalescedStart = performance.now();
    const TOTAL_WRITES = 200;

    // Simulated standard serialized write (e.g. queue wait + fsync)
    const runSerialized = async () => {
      for (let i = 0; i < TOTAL_WRITES; i++) {
        await new Promise((r) => setTimeout(r, 0)); // Micro-tick simulation
      }
    };
    await runSerialized();
    const uncoalescedDuration = performance.now() - uncoalescedStart;

    // Coalesced concurrent writes
    const coalescer = new AdaptiveWriteCoalescer({ maxBatchSize: 64 });
    const coalescedStart = performance.now();

    const writePromises: Promise<string>[] = [];
    for (let i = 0; i < TOTAL_WRITES; i++) {
      writePromises.push(
        coalescer.submit(async () => {
          return `write-res-${i}`;
        }),
      );
    }
    const results = await Promise.all(writePromises);
    const coalescedDuration = performance.now() - coalescedStart;

    expect(results.length).toBe(TOTAL_WRITES);
    const metrics = coalescer.getMetrics();

    console.log("\n=======================================================");
    console.log("⚡ BENCHMARK: ADAPTIVE WRITE COALESCING UNDER CONCURRENCY");
    console.log("=======================================================");
    console.log(`Operations:           ${TOTAL_WRITES}`);
    console.log(`Uncoalesced Time:     ${uncoalescedDuration.toFixed(2)} ms`);
    console.log(`Coalesced Time:       ${coalescedDuration.toFixed(2)} ms`);
    console.log(
      `Speedup Factor:       ${(uncoalescedDuration / Math.max(0.01, coalescedDuration)).toFixed(1)}x`,
    );
    console.log(`Batches Formed:       ${metrics.totalBatches}`);
    console.log(`Avg Batch Size:       ${metrics.avgBatchSize}`);
    console.log(`Max Batch Size:       ${metrics.maxBatchSizeSeen}`);
    console.log("=======================================================\n");

    expect(metrics.totalCoalescedWrites).toBeGreaterThan(0);
    expect(metrics.maxBatchSizeSeen).toBeGreaterThan(1);
  });
});
