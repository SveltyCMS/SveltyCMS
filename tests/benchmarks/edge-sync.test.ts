/**
 * @file tests/benchmarks/edge-sync.test.ts
 * @description Enterprise Edge Sync Benchmark (Optimized)
 * @summary Measures cache invalidation propagation latency across real edge nodes via live Redis
 *
 * ### Features:
 * - Multi-node invalidation propagation timing
 * - Redis pub/sub channel throughput
 * - Cross-node cache coherence verification
 */

import {
  test,
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { CacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { LRUCache } from "lru-cache";

async function createLiveNode(id: string) {
  const node = new CacheService();

  (node as any).l1 = new LRUCache({
    max: 10000,
    ttl: 1000 * 60 * 5,
    dispose: (_value: any, key: string) => {
      (node as any).cleanupTagsForKey?.(key);
    },
  });

  (node as any).nodeId = id;

  console.log(`[${id}] Connecting to Live Redis...`);
  await node.initializeL2({
    USE_REDIS: true,
    REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
    REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  });
  console.log(`[${id}] Redis Connected Successfully!`);

  return node;
}

async function runEdgeSyncAudit() {
  const useRedis = process.env.USE_REDIS === "true";
  if (!useRedis) {
    console.log("⏭️ Redis not enabled — edge sync test requires Redis. Skipping.");
    return;
  }

  console.log("🚀 Starting Enterprise Edge Sync Audit (Live Redis)...\n");

  let nodeA: CacheService | null = null;
  let remoteNodes: CacheService[] = [];

  try {
    console.log("Creating node-A...");
    nodeA = await createLiveNode("node-A");
    console.log("Creating 6 remote nodes...");
    remoteNodes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createLiveNode(`node-${i}`)),
    );

    console.log("Flushing L2 Distributed Store...");
    await (nodeA as any).l2?.flushAll();
    await stabilize(100);

    // Freeze loop metadata parameters to reduce memory tracking signatures
    const TEST_TAGS = Object.freeze(["edge-sync-live-test"]);
    const TENANT = "global";
    const ITERATIONS = 20;

    // Pre-allocate explicit cache keyspace arrays to protect the hot paths from continuous string processing
    const cachedKeyPool = Array.from(
      { length: ITERATIONS },
      (_, i) => `edge:live:bench:${1774728000000 + i}`,
    );
    const cachePayload = Object.freeze({ value: "cached" });

    const result = await runBenchmark({
      name: "Edge Sync Propagation",
      iterations: ITERATIONS,
      warmupIterations: 5,
      runs: 2,
      concurrency: 1, // Must be sequential to verify step-by-step propagation speeds accurately
      trimOutliers: "iqr",
      silent: true,
      onIteration: async (i: number) => {
        const key = cachedKeyPool[i] ?? `edge:live:bench:fallback-${i}`;

        // 1. Warm remote caches (Concurrent batch operations)
        const warmPromises = remoteNodes.map((node) =>
          node.set(
            key,
            cachePayload,
            60,
            TENANT,
            CacheCategory.GENERAL,
            TEST_TAGS as unknown as string[],
          ),
        );
        await Promise.all(warmPromises);

        // 2. Trigger invalidation from primary coordinator node
        await nodeA!.clearByTags(TEST_TAGS as unknown as string[], TENANT);

        // 3. Allow real Redis event loop layers 10ms to flush Pub/Sub sockets natively
        await new Promise((r) => setTimeout(r, 10));

        // 4. Validate cluster consistency layers
        for (let j = 0; j < remoteNodes.length; j++) {
          const targetNode = remoteNodes[j]!;
          const val = targetNode.getSync(key, TENANT);

          if (val !== undefined && val !== null) {
            throw new Error(
              `Edge sync propagation failed for node ${(targetNode as any).nodeId} (cache was not cleared)`,
            );
          }
        }
      },
    });

    printTruthTable({
      title: "SVELTYCMS — EDGE SYNC PROPAGATION AUDIT",
      shortLabel: "Edge Sync",
      subtitle: `Live Redis PubSub • ${remoteNodes.length} Nodes • ${getDbType().toUpperCase()}`,
      results: [{ ...result, layer: "Edge" }],
    });

    printSummaryTable([
      { key: "Avg Propagation Latency", val: result.avgMs, unit: "ms" },
      { key: "p95 Propagation", val: result.p95Ms || result.avgMs, unit: "ms" },
      { key: "Throughput", val: Math.round(result.rps || 0), unit: "ops/s" },
      {
        key: "Rating",
        val: result.avgMs < 50 ? "EXCELLENT" : "GOOD",
        unit: "",
      },
    ]);

    exportResult(result);
  } catch (err: any) {
    logger.error(`Edge Sync benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    // Isolated teardown graph guards against process leaks if an intermediate socket connection fails
    if (nodeA) {
      await nodeA.cleanup().catch(() => {});
    }
    for (let i = 0; i < remoteNodes.length; i++) {
      const node = remoteNodes[i];
      if (node) {
        await node.cleanup().catch(() => {});
      }
    }
    console.log("\n✅ Edge Sync workspace cleaned up.");
  }
}

test("Edge Sync Enterprise Audit", async () => {
  await runEdgeSyncAudit();
}, 450000);
