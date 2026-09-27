/**
 * @file tests/benchmarks/memory-counters.test.ts
 * @description Fast, matrix-eligible memory instrument.
 *
 * Samples the server's own five V8 counters (`rss`, `heapTotal`, `heapUsed`, `external`,
 * `arrayBuffers`, returned by `/api/system/health?verbose=true`) plus the two derived
 * numbers the RSS audit needs:
 * - `commitment` = heapTotal − heapUsed — the `--max-semi-space-size` budget actually
 *   parked (the number that decides RPS-per-GB-RAM in vendor harnesses);
 * - `native` = rss − heapTotal — libvips/libuv/worker isolates outside the V8 heap.
 *
 * Why this file exists: the long `memory-stability` soak is deliberately excluded from the
 * matrix (`SKIP_IN_MATRIX`, "runs for minutes"), so matrix runs recorded **no** memory row
 * at all — the semi-space change could not be trended. This test is seconds-long, so it
 * runs with every matrix pass and lands the counters in the ledger.
 *
 * @summary Seconds-long memory-counter sample (rss/heapTotal/heapUsed/external/arrayBuffers).
 */

import "../unit/bun-preload.ts";
import {
  test,
  runBenchmark,
  exportMetric,
  exportResult,
  setupBenchmarkServer,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";

/** The subset of the health payload this probe needs. */
interface HealthMemory {
  memory?: {
    rss?: number;
    heapTotal?: number;
    heapUsed?: number;
    external?: number;
    arrayBuffers?: number;
  };
  data?: { memory?: HealthMemory["memory"] };
}

interface MemoryCounters {
  rssMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

const SAMPLES = 20;
const WARMUP = 5;

test("Memory Counters (fast matrix sample)", async () => {
  const server = await setupBenchmarkServer();
  const baseUrl = server.baseUrl;
  const headers: Record<string, string> = {
    ...benchmarkAuthHeaders(),
    connection: "keep-alive",
  };

  let last: MemoryCounters | null = null;

  try {
    const result = await runBenchmark({
      name: "Memory Counters",
      iterations: SAMPLES,
      warmupIterations: WARMUP,
      runs: 1,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/system/health?verbose=true`, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        const payload = (await res.json()) as HealthMemory;
        const mem = payload.memory || payload.data?.memory || {};
        last = {
          rssMb: (mem.rss || 0) / 1048576,
          heapTotalMb: (mem.heapTotal || 0) / 1048576,
          heapUsedMb: (mem.heapUsed || 0) / 1048576,
          externalMb: (mem.external || 0) / 1048576,
          arrayBuffersMb: (mem.arrayBuffers || 0) / 1048576,
        };
      },
    });

    if (!last) throw new Error("health endpoint returned no memory counters");
    const s = last as MemoryCounters;
    const commitmentMb = s.heapTotalMb - s.heapUsedMb;
    const nativeMb = s.rssMb - s.heapTotalMb;

    exportMetric("memory.rss_mb", Number(s.rssMb.toFixed(1)), "MB");
    exportMetric("memory.heap_total_mb", Number(s.heapTotalMb.toFixed(1)), "MB");
    exportMetric("memory.heap_used_mb", Number(s.heapUsedMb.toFixed(1)), "MB");
    exportMetric("memory.external_mb", Number(s.externalMb.toFixed(1)), "MB");
    exportMetric("memory.array_buffers_mb", Number(s.arrayBuffersMb.toFixed(1)), "MB");
    // Derived: committed-but-unused heap (semi-space budget) vs everything outside V8.
    exportMetric("memory.commitment_mb", Number(commitmentMb.toFixed(1)), "MB");
    exportMetric("memory.native_mb", Number(nativeMb.toFixed(1)), "MB");

    exportResult({
      name: "Memory Counters",
      totalRequests: SAMPLES,
      failedRequests: 0,
      rps: result.rps,
      rssDelta: s.rssMb,
      heapDelta: s.heapUsedMb,
    } as never);

    console.log(
      `   memory: rss=${s.rssMb.toFixed(0)}MB heapTotal=${s.heapTotalMb.toFixed(0)}MB heapUsed=${s.heapUsedMb.toFixed(0)}MB · commitment=${commitmentMb.toFixed(0)}MB native=${nativeMb.toFixed(0)}MB`,
    );
  } finally {
    await server.stop();
  }
});
