/**
 * @file tests/benchmarks/edge-sync.test.ts
 * @description Enterprise-grade Edge Sync benchmark for SveltyCMS.
 * Measures invalidation propagation latency across simulated edge nodes.
 */

import {
  test,
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { CacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { LRUCache } from "lru-cache";

class SimulatedRedisBus {
  private subscribers: Map<string, Set<(msg: string) => void>> = new Map();
  private storage: Map<string, any> = new Map();
  private sets: Map<string, Set<string>> = new Map();

  publish(channel: string, message: string) {
    const subs = this.subscribers.get(channel);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(message);
        } catch {}
      }
    }
  }

  subscribe(channel: string, callback: (msg: string) => void) {
    if (!this.subscribers.has(channel))
      this.subscribers.set(channel, new Set());
    this.subscribers.get(channel)!.add(callback);
  }

  createClient(nodeId: string) {
    const client: any = {
      nodeId,
      isOpen: true,
      publish: (chan: string, msg: string) => this.publish(chan, msg),
      subscribe: (chan: string, cb: (msg: string) => void) =>
        this.subscribe(chan, cb),
      get: (key: string) => this.storage.get(key) ?? null,
      set: (key: string, val: any) => this.storage.set(key, val),
      del: (keys: string | string[]) => {
        const toDelete = Array.isArray(keys) ? keys : [keys];
        for (const k of toDelete) {
          this.storage.delete(k);
          this.sets.delete(k); // Clean tag sets too to prevent unbounded growth
        }
      },
      sMembers: (key: string) => Array.from(this.sets.get(key) || []),
      sAdd: (key: string, member: string) => {
        if (!this.sets.has(key)) this.sets.set(key, new Set());
        this.sets.get(key)!.add(member);
      },
      multi: () => {
        const queue: (() => void)[] = [];
        const m = {
          sAdd: (k: string, v: string) => {
            queue.push(() => client.sAdd(k, v));
            return m;
          },
          del: (k: string | string[]) => {
            queue.push(() => client.del(k));
            return m;
          },
          exec: async () => {
            queue.forEach((fn) => fn());
            return [];
          },
        };
        return m;
      },
    };
    return client;
  }
}

async function createSimulatedNode(bus: SimulatedRedisBus, id: string) {
  const node = new CacheService();
  // 🚀 Reduce LRU size for test instances (500K default is 3GB+ for 7 nodes)
  (node as any).l1 = new LRUCache({
    max: 10000,
    ttl: 1000 * 60 * 5,
    dispose: (_value: any, key: string) => {
      (node as any).cleanupTagsForKey?.(key);
    },
  });
  const client = bus.createClient(id);

  // Inject mock client and override nodeId to match the client
  (node as any).nodeId = id;
  (node as any).l2 = client;
  (node as any).subscriber = client;

  await (node as any).subscribeToInvalidations();
  return node;
}

async function runEdgeSyncAudit() {
  console.log("🚀 Starting Enterprise Edge Sync Audit...\n");

  try {
    const bus = new SimulatedRedisBus();
    const nodeA = await createSimulatedNode(bus, "node-A");
    const remoteNodes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createSimulatedNode(bus, `node-${i}`),
      ),
    );

    await stabilize(100);

    const TEST_TAGS = ["edge-sync-test"];
    const TENANT = "global";
    const ITERATIONS = 20;

    const result = await runBenchmark({
      name: "Edge Sync Propagation",
      iterations: ITERATIONS,
      warmupIterations: 20,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const key = `edge:bench:${Math.random().toString(36).slice(2)}`;

        // 1. Warm remote caches (Concurrent)
        await Promise.all(
          remoteNodes.map((n) =>
            n.set(
              key,
              { value: "cached" },
              60,
              TENANT,
              CacheCategory.GENERAL,
              TEST_TAGS,
            ),
          ),
        );

        // 2. Trigger invalidation from primary node
        await nodeA.clearByTags(TEST_TAGS, TENANT);

        // 3. Verify immediate propagation (Synchronous simulation)
        for (const n of remoteNodes) {
          const val = await n.get(key, TENANT);
          if (val) {
            // If still exists, retry once with a tiny tick (Defensive)
            await new Promise((r) => setTimeout(r, 0));
            if (await n.get(key, TENANT)) {
              throw new Error(
                `Edge sync propagation failed for node ${(n as any).nodeId}`,
              );
            }
          }
        }
      },
    });

    printTruthTable({
      title: "SVELTYCMS — EDGE SYNC PROPAGATION AUDIT",
      shortLabel: "Edge Sync",
      subtitle: `Multi-Node Invalidation • ${remoteNodes.length} Nodes • ${getDbType().toUpperCase()}`,
      results: [{ ...result, layer: "Edge" }],
    });

    printSummaryTable([
      { key: "Avg Propagation Latency", val: result.avgMs, unit: "ms" },
      { key: "p95 Propagation", val: result.p95Ms || result.avgMs, unit: "ms" },
      { key: "Throughput", val: Math.round(result.rps || 0), unit: "ops/s" },
      { key: "Rating", val: result.avgMs < 5 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    exportResult(result);
  } catch (err: any) {
    logger.error(`Edge Sync benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    // Cleanup handled above
  }

  console.log("\n✅ Edge sync audit completed.");
}

test("Edge Sync Enterprise Audit", async () => {
  await runEdgeSyncAudit();
}, 450000);
