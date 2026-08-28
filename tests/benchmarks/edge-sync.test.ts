/**
 * @file tests/benchmarks/edge-sync.test.ts
 * @description Enterprise Edge Sync Benchmark (Optimized)
 * @summary Measures cache invalidation propagation latency across real edge nodes via live Redis Pub/Sub.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
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

const TEST_TAGS = Object.freeze(["edge-sync-live-test"]);
const TENANT = "global";
const ITERATIONS = 25;
const REMOTE_NODE_COUNT = 6;
const PROPAGATION_TIMEOUT_MS = 250;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function createLiveNode(id: string): Promise<CacheService> {
  const node = new CacheService();

  (node as any).l1 = new LRUCache({
    max: 10000,
    ttl: 1000 * 60 * 5,
    dispose: (_value: any, key: string) => {
      (node as any).cleanupTagsForKey?.(key);
    },
  });

  (node as any).nodeId = id;

  await node.initializeL2({
    USE_REDIS: true,
    REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
    REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  });

  return node;
}

/**
 * Polls remote nodes with micro-sleeps until all nodes reflect the cache eviction.
 */
async function waitForConvergence(
  nodes: CacheService[],
  key: string,
  timeoutMs = PROPAGATION_TIMEOUT_MS,
): Promise<number> {
  const start = performance.now();

  while (performance.now() - start < timeoutMs) {
    let allEvicted = true;
    for (let i = 0; i < nodes.length; i++) {
      const val = nodes[i].getSync(key, TENANT);
      if (val !== undefined && val !== null) {
        allEvicted = false;
        break;
      }
    }

    if (allEvicted) {
      return performance.now() - start;
    }

    // Yield execution tick to allow Redis pub/sub network events to process
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error(`Edge sync convergence timed out after ${timeoutMs}ms across cluster.`);
}

async function runEdgeSyncAudit() {
  const useRedis = process.env.USE_REDIS === "true";
  if (!useRedis) {
    console.log("⏭️ Redis not enabled — edge sync test requires Redis. Skipping.");
    return;
  }

  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Edge Sync Audit (Live Redis • ${dbType})...\n`);

  let coordinatorNode: CacheService | null = null;
  let remoteNodes: CacheService[] = [];

  try {
    console.log("   → Initializing coordinator node...");
    coordinatorNode = await createLiveNode("node-coordinator");

    console.log(`   → Connecting ${REMOTE_NODE_COUNT} edge worker nodes to Redis...`);
    remoteNodes = await Promise.all(
      Array.from({ length: REMOTE_NODE_COUNT }, (_, i) => createLiveNode(`node-edge-${i}`)),
    );

    console.log("   → Flushing distributed L2 cache layer...");
    await (coordinatorNode as any).l2?.flushAll();
    await stabilize(200);

    const cachePayload = Object.freeze({ value: "cached-edge-state" });
    let globalKeySeq = 0;

    // ── EDGE SYNC INVALIDATION BENCHMARK ────────────────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log(
      `   → Measuring Pub/Sub Invalidation Propagation across ${REMOTE_NODE_COUNT} nodes...`,
    );

    const result = await runBenchmark({
      name: "Edge Sync Propagation",
      iterations: ITERATIONS,
      warmupIterations: 5,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Monotonic key generation ensures isolation across warmups and runs
        const key = `edge:bench:key:${globalKeySeq++}`;

        // 1. Pre-warm remote L1/L2 caches
        await Promise.all(
          remoteNodes.map((node) =>
            node.set(
              key,
              cachePayload,
              60,
              TENANT,
              CacheCategory.GENERAL,
              TEST_TAGS as unknown as string[],
            ),
          ),
        );

        // 2. Publish invalidation message from primary coordinator
        await coordinatorNode!.clearByTags(TEST_TAGS as unknown as string[], TENANT);

        // 3. Measure convergence latency across all cluster nodes
        await waitForConvergence(remoteNodes, key);
      },
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — EDGE SYNC PROPAGATION AUDIT",
      shortLabel: "Edge Sync",
      subtitle: `Live Redis Pub/Sub • ${REMOTE_NODE_COUNT} Nodes • ${dbType}`,
      results: [{ ...result, layer: "Edge (PubSub)" }],
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Remote Cluster Nodes", val: REMOTE_NODE_COUNT, unit: "nodes" },
        { key: "Avg Propagation Latency", val: result.avgMs.toFixed(2), unit: "ms" },
        {
          key: "p95 Propagation Latency",
          val: (result.p95Ms || result.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Pub/Sub Throughput", val: Math.round(result.rps || 0), unit: "sync/s" },
        {
          key: "Memory RSS Δ",
          val: (result.rssDelta ?? 0).toFixed(2),
          unit: "MB",
        },
        {
          key: "Sync SLA Compliance",
          val: result.avgMs < 15 ? "ELITE (<15ms)" : result.avgMs < 50 ? "GOOD" : "SLOW",
          unit: "",
        },
      ],
      "Edge Sync Summary",
    );

    exportMetric("edge_sync.propagation.avg_ms", result.avgMs, "ms");
    exportMetric("edge_sync.propagation.p95_ms", result.p95Ms || result.avgMs, "ms");
    exportMetric("edge_sync.throughput", Math.round(result.rps || 0), "sync/s");

    exportResult(result);
  } catch (err: any) {
    logger.error(`Edge Sync benchmark failed: ${err.message}`);
    throw err;
  } finally {
    if (coordinatorNode) {
      await coordinatorNode.cleanup().catch(() => {});
    }
    for (let i = 0; i < remoteNodes.length; i++) {
      if (remoteNodes[i]) {
        await remoteNodes[i].cleanup().catch(() => {});
      }
    }
    console.log("\n✅ Edge Sync workspace cleaned up.");
  }
}

test("Edge Sync Enterprise Audit", async () => {
  await runEdgeSyncAudit();
}, 450_000);
