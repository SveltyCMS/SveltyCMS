/**
 * @file tests/benchmarks/edge-sync.test.ts
 * @description Enterprise Edge Sync Benchmark
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
  // Reduce LRU size for test instances
  (node as any).l1 = new LRUCache({
    max: 10000,
    ttl: 1000 * 60 * 5,
    dispose: (_value: any, key: string) => {
      (node as any).cleanupTagsForKey?.(key);
    },
  });

  // Inject unique nodeId for the invalidation protocol
  (node as any).nodeId = id;

  console.log(`[${id}] Connecting to Live Redis...`);
  // Initialize real Redis connection
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

  // pre-existing unused var removed for TS strict mode
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

    console.log("Flushing DB...");
    await (nodeA as any).l2?.flushAll();
    await stabilize(100);

    const TEST_TAGS = ["edge-sync-live-test"];
    const TENANT = "global";
    const ITERATIONS = 20;

    const result = await runBenchmark({
      name: "Edge Sync Propagation",
      iterations: ITERATIONS,
      warmupIterations: 5,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const key = `edge:live:bench:${Math.random().toString(36).slice(2)}`;

        // 1. Warm remote caches (Concurrent)
        await Promise.all(
          remoteNodes.map((n) =>
            n.set(key, { value: "cached" }, 60, TENANT, CacheCategory.GENERAL, TEST_TAGS),
          ),
        );

        // 2. Trigger invalidation from primary node
        await nodeA!.clearByTags(TEST_TAGS, TENANT);

        // 3. Verify immediate propagation (Redis Pub/Sub has slight network latency, give it a tiny tick)
        await new Promise((r) => setTimeout(r, 10)); // Give real redis 10ms to propagate pubsub

        for (const n of remoteNodes) {
          // Check L1 cache directly to avoid triggering the L2 Distributed Lock Stampede protection
          const val = n.getSync(key, TENANT);
          if (val !== undefined && val !== null) {
            throw new Error(
              `Edge sync propagation failed for node ${(n as any).nodeId} (cache was not cleared)`,
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
    if (nodeA) await nodeA.cleanup();
    for (const n of remoteNodes) {
      await n.cleanup();
    }
  }
}

test("Edge Sync Enterprise Audit", async () => {
  await runEdgeSyncAudit();
}, 450000);
