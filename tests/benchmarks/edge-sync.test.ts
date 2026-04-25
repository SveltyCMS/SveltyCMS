/**
 * @file tests/benchmarks/edge-sync.test.ts
 * @description Enterprise-grade Edge Sync benchmark for SveltyCMS.
 * Measures invalidation propagation latency between multiple simulated nodes.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
} from "./benchmark-utils";
import { CacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

/**
 * High-fidelity Redis Bus simulator for in-process multi-node testing.
 */
class RedisBus {
  private subscribers: Map<string, Set<(msg: string) => void>> = new Map();

  publish(channel: string, message: string) {
    const subs = this.subscribers.get(channel);
    if (subs) {
      // Simulate real-world network micro-latency (jitter)
      const jitter = Math.random() * 0.2; // 0-200us
      setTimeout(() => {
        for (const cb of subs) cb(message);
      }, jitter);
    }
  }

  subscribe(channel: string, callback: (msg: string) => void) {
    if (!this.subscribers.has(channel)) this.subscribers.set(channel, new Set());
    this.subscribers.get(channel)!.add(callback);
  }

  createClient(id: string) {
    const storage = new Map<string, string>();
    return {
      id,
      isOpen: true,
      connect: async () => {},
      quit: async () => {},
      publish: async (chan: string, msg: string) => this.publish(chan, msg),
      subscribe: async (chan: string, cb: (msg: string) => void) => this.subscribe(chan, cb),
      get: async (key: string) => storage.get(key) || null,
      set: async (key: string, val: string) => {
        storage.set(key, val);
      },
      del: async (key: string) => {
        storage.delete(key);
      },
      sMembers: async () => [],
      sAdd: async () => {},
      scan: async (_cursor: string) => ({ cursor: "0", keys: Array.from(storage.keys()) }),
      multi: () => {
        const pipeline: any[] = [];
        return {
          del: (key: string) => {
            pipeline.push(() => storage.delete(key));
            return this;
          },
          exec: async () => {
            for (const fn of pipeline) fn();
            return [];
          },
          length: 0,
        };
      },
    };
  }
}

async function createSimulatedNode(bus: RedisBus, id: string) {
  const node = new CacheService();
  (node as any).nodeId = id;
  const client = bus.createClient(id);
  (node as any).l2 = client;
  (node as any).subscriber = client;
  await (node as any).subscribeToInvalidations();
  return node;
}

async function runEdgeSyncAudit() {
  console.log("🚀 Starting Enterprise Edge Sync Audit...\n");

  const bus = new RedisBus();
  const nodeA = await createSimulatedNode(bus, "node-A");
  const remoteNodes = await Promise.all(
    Array.from({ length: 5 }).map((_, i) => createSimulatedNode(bus, `node-remote-${i}`)),
  );

  const TEST_TAGS = ["sync-tag"];
  const TENANT = "global";

  await stabilize();
  const ITERATIONS = 1000;

  console.log(`   → Measuring P2P invalidation across ${remoteNodes.length} remote nodes...`);
  const p2pResult = await runBenchmark({
    name: "Edge Invalidation (P2P)",
    iterations: ITERATIONS,
    warmupIterations: 100,
    runs: 3,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      // 1. Populate remote nodes L1
      const key = `bench:sync:${Math.random()}`;
      for (const node of remoteNodes) {
        await node.set(key, { data: "cached" }, 60, TENANT, CacheCategory.GENERAL, TEST_TAGS);
      }

      const t0 = performance.now();
      let propagationDone = false;

      // 2. Node A triggers invalidation
      await nodeA.clearByTags(TEST_TAGS, TENANT);

      // 3. Busy-wait for ALL remote nodes to clear
      while (performance.now() - t0 < 50) {
        let allCleared = true;
        for (const node of remoteNodes) {
          const check = await node.get(key, TENANT);
          if (check) {
            allCleared = false;
            break;
          }
        }
        if (allCleared) {
          propagationDone = true;
          break;
        }
        await new Promise((r) => setImmediate(r));
      }

      if (!propagationDone) throw new Error("Sync propagation timed out (>50ms)");
    },
  });

  printTruthTable({
    title: "SVELTYCMS  —  EDGE SYNC PROPAGATION AUDIT",
    subtitle: `Cross-Node Invalidation • 5 Simulated Edge Nodes • Redis-Bus Jitter`,
    results: [{ ...p2pResult, layer: "Edge Bus", overheadPct: 0 }],
  });

  printSummaryTable([
    { key: "Avg Propagation Latency", val: p2pResult.avgMs, unit: "ms" },
    { key: "p95 Propagation Latency", val: p2pResult.p95Ms, unit: "ms" },
    { key: "Sync Throughput", val: Math.round(p2pResult.rps), unit: "ops/s" },
    { key: "Scalability Rating", val: p2pResult.avgMs < 2 ? "EXCELLENT" : "GOOD", unit: "" },
  ]);

  exportResult(p2pResult);
  console.log("\n✅ Edge sync audit completed.");
}

test("Edge Sync Enterprise Audit", async () => {
  await runEdgeSyncAudit();
}, 300000);
