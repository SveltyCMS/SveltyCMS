/**
 * @file tests/benchmarks/websocket-broadcast.test.ts
 * @description Yjs WebSocket Real-Time Synchronization Benchmark (Optimized)
 * @summary Measures end-to-end Yjs update propagation latency and connection handshake timing.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { WebSocket } from "ws";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

let stopServer: (() => Promise<void>) | null = null;
let wsA: WebSocket | null = null;
let wsB: WebSocket | null = null;

export async function runBroadcastAudit() {
  console.log("🚀 Starting Yjs Collaboration Sync Performance Audit...\n");

  try {
    // 1. Setup Server
    process.env.SKIP_GRAPHQL_WS = "false";
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const wsUrl = baseUrl.replace("http", "ws") + "/ws?docId=benchmark-collab-doc&tenantId=default";

    await ensureStableTestData();
    await stabilize(1000);

    const ITERATIONS = 100;
    const results = [];

    console.log("   → Establishing Client connections...");

    // Spawn two client connections to the Yjs doc
    wsA = new WebSocket(wsUrl);
    wsB = new WebSocket(wsUrl);

    // Wait for both connections to open
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        wsA!.on("open", resolve);
        wsA!.on("error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        wsB!.on("open", resolve);
        wsB!.on("error", reject);
      }),
    ]);

    // Setup Local Yjs documents
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Helper: Wrap Yjs updates to match the server's protocol
    const sendUpdate = (ws: WebSocket, update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); // messageSync = 0
      encoding.writeVarUint(encoder, 1); // messageYjsUpdate = 1
      encoding.writeUint8Array(encoder, update);
      ws.send(encoding.toUint8Array(encoder));
    };

    // Client A sends its updates to the server when they occur
    docA.on("update", (update) => {
      sendUpdate(wsA!, update);
    });

    // Client B listens for incoming server updates and applies them
    wsB.on("message", (raw) => {
      try {
        const data = new Uint8Array(raw as ArrayBuffer);
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);
        if (messageType === 0) {
          // messageSync
          const syncType = decoding.readVarUint(decoder);
          if (syncType === 1 || syncType === 2) {
            // update or syncStep2
            const updateBytes = decoding.readUint8Array(decoder);
            Y.applyUpdate(docB, updateBytes, "server");
          }
        }
      } catch {
        // Suppress parsing anomalies
      }
    });

    console.log("   → Performing end-to-end Yjs sync latency profiling...");

    // Warm-up iteration to stabilize network path
    await new Promise<void>((resolve) => {
      const textB = docB.getText("shared-text");
      const observer = () => {
        textB.unobserve(observer);
        resolve();
      };
      textB.observe(observer);
      docA.getText("shared-text").insert(0, "warmup");
    });

    let messageCounter = 0;

    const syncResult = await runBenchmark({
      name: "Yjs CRDT Update Sync",
      iterations: ITERATIONS,
      warmupIterations: 10,
      runs: 1,
      silent: true,
      onIteration: async () => {
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Yjs Sync Timeout"));
          }, 3000);

          const textB = docB.getText("shared-text");
          const observer = () => {
            clearTimeout(timeout);
            textB.unobserve(observer);
            resolve();
          };
          textB.observe(observer);

          // Trigger change on Client A
          messageCounter++;
          docA.getText("shared-text").insert(0, "msg-" + messageCounter + " ");
        });
      },
    });

    results.push({
      ...syncResult,
      shortLabel: "Yjs Collab",
      layer: "Network (ws)",
    });

    // --- Reporting ---
    printTruthTable({
      title: "SVELTYCMS — YJS COLLABORATION SYNC AUDIT",
      shortLabel: "Collaboration",
      subtitle: "Yjs + ws adapter-node",
      results,
    });

    printSummaryTable([
      { key: "Yjs E2E Update Propagation Latency", val: results[0].avgMs, unit: "ms" },
      {
        key: "Peak Update Velocity",
        val: Math.round(results[0].rps),
        unit: "syncs/s",
      },
    ]);

    exportResult(results[0]);
  } catch (err: any) {
    logger.error("Yjs benchmark failed: " + err.message);
    console.error(err);
    throw err;
  } finally {
    if (wsA) {
      wsA.close();
      wsA = null;
    }
    if (wsB) {
      wsB.close();
      wsB = null;
    }
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Yjs Collaboration Sync Latency Audit", async () => {
  await runBroadcastAudit();
}, 480000);
