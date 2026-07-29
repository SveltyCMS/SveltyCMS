/**
 * @file tests/benchmarks/websocket-broadcast.test.ts
 * @description Yjs WebSocket Real-Time Synchronization Benchmark (Optimized)
 * @summary Measures end-to-end Yjs update propagation latency and connection handshake timing.
 *
 * Protocol: outer varUint messageSync (0) + y-protocols sync body
 * (messageYjsUpdate = 2, writeVarUint8Array). Matches `yjs-sync-server.ts`.
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
import * as syncProtocol from "y-protocols/sync";

let stopServer: (() => Promise<void>) | null = null;
let wsA: WebSocket | null = null;
let wsB: WebSocket | null = null;

const messageSync = 0;

/** Send a Yjs update using the correct y-protocols framing (type=2 + varuint8array). */
function sendYjsUpdate(ws: WebSocket, update: Uint8Array) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  ws.send(encoding.toUint8Array(encoder));
}

/**
 * Handle an inbound WS frame: apply sync to local doc and reply if needed
 * (SyncStep1 → SyncStep2 handshake).
 */
function handleIncomingSync(ws: WebSocket, doc: Y.Doc, raw: ArrayBuffer | Buffer) {
  try {
    const data = new Uint8Array(raw as ArrayBuffer);
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== messageSync) return;

    const replyEncoder = encoding.createEncoder();
    encoding.writeVarUint(replyEncoder, messageSync);
    syncProtocol.readSyncMessage(decoder, replyEncoder, doc, "remote");
    // length > 1 means sync payload was appended after outer type
    if (encoding.length(replyEncoder) > 1) {
      ws.send(encoding.toUint8Array(replyEncoder));
    }
  } catch {
    // Suppress transient decode noise during handshake
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function runBroadcastAudit() {
  console.log("🚀 Starting Yjs Collaboration Sync Performance Audit...\n");

  try {
    process.env.SKIP_GRAPHQL_WS = "false";
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const wsUrl =
      baseUrl.replace("http", "ws") + `/ws?docId=benchmark-collab-${Date.now()}&tenantId=default`;

    await ensureStableTestData();
    await stabilize(500);

    const ITERATIONS = 100;
    const results = [];

    console.log("   → Establishing Client connections...");

    wsA = new WebSocket(wsUrl);
    wsB = new WebSocket(wsUrl);

    await withTimeout(
      Promise.all([
        new Promise<void>((resolve, reject) => {
          wsA!.on("open", resolve);
          wsA!.on("error", reject);
        }),
        new Promise<void>((resolve, reject) => {
          wsB!.on("open", resolve);
          wsB!.on("error", reject);
        }),
      ]),
      10_000,
      "WebSocket open",
    );

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Both peers must complete the SyncStep1/2 handshake with the server
    wsA.on("message", (raw) => handleIncomingSync(wsA!, docA, raw as Buffer));
    wsB.on("message", (raw) => handleIncomingSync(wsB!, docB, raw as Buffer));

    // Local updates from A → wire → server → B
    docA.on("update", (update, origin) => {
      if (origin === "remote") return;
      sendYjsUpdate(wsA!, update);
    });

    // Give handshake a moment after open (server sends SyncStep1 immediately)
    await stabilize(200);

    console.log("   → Performing end-to-end Yjs sync latency profiling...");

    // Warm-up with hard timeout (never hang the suite for 480s)
    await withTimeout(
      new Promise<void>((resolve) => {
        const textB = docB.getText("shared-text");
        const observer = () => {
          textB.unobserve(observer);
          resolve();
        };
        textB.observe(observer);
        docA.getText("shared-text").insert(0, "warmup");
      }),
      8_000,
      "Yjs warmup sync",
    );

    let messageCounter = 0;

    const syncResult = await runBenchmark({
      name: "Yjs CRDT Update Sync",
      iterations: ITERATIONS,
      warmupIterations: 10,
      runs: 1,
      silent: true,
      onIteration: async () => {
        return withTimeout(
          new Promise<void>((resolve) => {
            const textB = docB.getText("shared-text");
            const observer = () => {
              textB.unobserve(observer);
              resolve();
            };
            textB.observe(observer);
            messageCounter++;
            docA.getText("shared-text").insert(0, "msg-" + messageCounter + " ");
          }),
          3_000,
          "Yjs Sync Timeout",
        );
      },
    });

    results.push({
      ...syncResult,
      shortLabel: "Yjs Collab",
      layer: "Network (ws)",
    });

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

// Cap at 60s — warmup/open timeouts fail fast; no more 480s hangs
test("Yjs Collaboration Sync Latency Audit", async () => {
  await runBroadcastAudit();
}, 60_000);
