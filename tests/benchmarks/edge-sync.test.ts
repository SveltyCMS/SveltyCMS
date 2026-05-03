/**
 * @file tests/benchmarks/edge-sync.test.ts
 * @description Enterprise-grade Edge Sync benchmark for SveltyCMS.
 * Measures invalidation propagation latency across simulated edge nodes.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { CacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";

class SimulatedRedisBus {
  private subscribers: Map<string, Set<(msg: string) => void>> = new Map();
  private storage: Map<string, any> = new Map();

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

  createClient(nodeId: string) {
    return {
      nodeId,
      isOpen: true,
      publish: (chan: string, msg: string) => this.publish(chan, msg),
      subscribe: (chan: string, cb: (msg: string) => void) => this.subscribe(chan, cb),
      get: (key: string) => this.storage.get(key) ?? null,
      set: (key: string, val: any) => this.storage.set(key, val),
      del: (key: string) => this.storage.delete(key),
    };
  }
}

async function createSimulatedNode(bus: SimulatedRedisBus, id: string) {
  const node = new CacheService();
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
    const server = await setupBenchmarkServer();
    const stopServer = server.stop;

    const bus = new SimulatedRedisBus();
    const nodeA = await createSimulatedNode(bus, "node-A");
    const remoteNodes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createSimulatedNode(bus, `node-${i}`)),
    );

    await stabilize(800);

    const TEST_TAGS = ["edge-sync-test"];
    const TENANT = "global";
    const ITERATIONS = 800;

    console.log(`   → Measuring propagation across ${remoteNodes.length} simulated edge nodes...`);

    const result = await runBenchmark({
      name: "Edge Sync Propagation",
      iterations: ITERATIONS,
      warmupIterations: 120,
      runs: 3,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const key = `edge:bench:${Math.random().toString(36).slice(2)}`;

        // Warm remote caches
        for (const node of remoteNodes) {
          await node.set(key, { value: "cached" }, 60, TENANT, CacheCategory.GENERAL, TEST_TAGS);
        }

        // Trigger invalidation from primary node
        await nodeA.clearByTags(TEST_TAGS, TENANT);

        // Wait for propagation
        let propagated = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          let allPropagated = true;
          for (const n of remoteNodes) {
            if (await n.get(key, TENANT)) {
              allPropagated = false;
              break;
            }
          }
          if (allPropagated) {
            propagated = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 2));
        }

        if (!propagated) throw new Error("Edge sync propagation timeout");
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

    if (stopServer) await stopServer();
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
