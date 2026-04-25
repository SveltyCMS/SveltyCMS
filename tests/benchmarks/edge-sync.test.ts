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
  private sharedStorage: Map<string, string> = new Map();
  private sharedTags: Map<string, Set<string>> = new Map();

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
    if (!this.subscribers.has(channel)) this.subscribers.set(channel, new Set());
    this.subscribers.get(channel)!.add(callback);
  }

  createClient(id: string) {
    return {
      id,
      isOpen: true,
      connect: async () => {},
      quit: async () => {},
      publish: async (chan: string, msg: string) => this.publish(chan, msg),
      subscribe: async (chan: string, cb: (msg: string) => void) => this.subscribe(chan, cb),
      get: async (key: string) => this.sharedStorage.get(key) || null,
      set: async (key: string, val: string) => {
        this.sharedStorage.set(key, val);
      },
      del: async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) this.sharedStorage.delete(k);
      },
      sMembers: async (key: string) => Array.from(this.sharedTags.get(key) || []),
      sAdd: async (key: string, val: string) => {
        if (!this.sharedTags.has(key)) this.sharedTags.set(key, new Set());
        this.sharedTags.get(key)!.add(val);
      },
      scan: async (_cursor: string) => ({
        cursor: "0",
        keys: Array.from(this.sharedStorage.keys()),
      }),
      multi: () => {
        const pipeline: any[] = [];
        const multiObj = {
          del: (key: string | string[]) => {
            pipeline.push(() => {
              const keys = Array.isArray(key) ? key : [key];
              for (const k of keys) this.sharedStorage.delete(k);
            });
            return multiObj;
          },
          sAdd: (key: string, val: string) => {
            pipeline.push(() => {
              if (!this.sharedTags.has(key)) this.sharedTags.set(key, new Set());
              this.sharedTags.get(key)!.add(val);
            });
            return multiObj;
          },
          exec: async () => {
            for (const fn of pipeline) fn();
            return [];
          },
        };
        return multiObj;
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

      // 2. Node A triggers invalidation
      await nodeA.clearByTags(TEST_TAGS, TENANT);

      // 3. Polling for propagation with a strict but reasonable timeout
      let allCleared = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        let currentCleared = true;
        for (const node of remoteNodes) {
          if (await node.get(key, TENANT)) {
            currentCleared = false;
            break;
          }
        }
        if (currentCleared) {
          allCleared = true;
          break;
        }
        // Give event loop a breath for the mock bus to fire
        await new Promise((r) => setTimeout(r, 1));
      }

      if (!allCleared) throw new Error("Sync propagation timed out");
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
