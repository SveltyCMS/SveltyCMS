/**
 * @file tests/benchmarks/websocket-broadcast.test.ts
 * @description Yjs WebSocket Real-Time Synchronization Benchmark (Optimized)
 * @summary Measures WebSocket handshake latency, bidirectional Yjs CRDT update propagation, and synchronization throughput.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  benchmarkAuthHeaders,
  getDbType,
  getMemorySnapshot,
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

// SyncStep1/2 readiness flags — set when a peer completes the initial server
// sync handshake (a SyncStep2 reply is emitted for the server's SyncStep1).
let syncReadyA = false;
let syncReadyB = false;
let resolveSyncReady: (() => void) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

/** Send a Yjs update using correct y-protocols framing (type=0 Sync, subtype=2 Update). */
function sendYjsUpdate(ws: WebSocket, update: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  ws.send(encoding.toUint8Array(encoder));
}

/** Handle an inbound WS frame: apply sync to local doc and reply if needed. */
function handleIncomingSync(ws: WebSocket, doc: Y.Doc, raw: ArrayBuffer | Buffer, peer: "A" | "B") {
  try {
    const data = new Uint8Array(raw as ArrayBuffer);
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== messageSync) return;

    const replyEncoder = encoding.createEncoder();
    encoding.writeVarUint(replyEncoder, messageSync);
    const syncType = syncProtocol.readSyncMessage(decoder, replyEncoder, doc, "remote");

    if ((encoding as any).length(replyEncoder) > 1 && ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(replyEncoder));
    }

    // Handshake complete only after the server's SyncStep1 was processed (the
    // client replied with SyncStep2). Later Update frames must NOT flip the flag.
    if (syncType === syncProtocol.messageYjsSyncStep1) {
      const peerReady = peer === "A" ? syncReadyA : syncReadyB;
      if (!peerReady) {
        if (peer === "A") syncReadyA = true;
        else syncReadyB = true;
        if (syncReadyA && syncReadyB && resolveSyncReady) {
          resolveSyncReady();
          resolveSyncReady = null;
        }
      }
    }
  } catch {
    // Suppress transient decode noise during sync handshake
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.then((v) => {
      clearTimeout(timer);
      return v;
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export async function runBroadcastAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Yjs Collaboration Sync Performance Audit (${dbType})...\n`);

  // Reset handshake state — a second run (retry) must re-arm the flags.
  syncReadyA = false;
  syncReadyB = false;
  resolveSyncReady = null;

  try {
    process.env.SKIP_GRAPHQL_WS = "false";
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws?docId=benchmark-collab-${Date.now()}&tenantId=default`;

    await ensureStableTestData();
    await stabilize(500);

    const wsHeaders = {
      ...benchmarkAuthHeaders(),
      connection: "Upgrade",
      upgrade: "websocket",
    };

    const results: any[] = [];

    // ── 1. WEBSOCKET UPGRADE & INITIAL SYNC HANDSHAKE TIMING ─────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 1. Measuring Dual-Client WebSocket Handshake & SyncStep Setup...");
    const handshakeT0 = performance.now();

    wsA = new WebSocket(wsUrl, { headers: wsHeaders });
    wsB = new WebSocket(wsUrl, { headers: wsHeaders });

    // Register frame handlers BEFORE awaiting open: the server streams its
    // SyncStep1 immediately after upgrade, and a late `message` listener would
    // miss frames (or resolve the handshake promise on a stale frame).
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    wsA.on("message", (raw) => handleIncomingSync(wsA!, docA, raw as Buffer, "A"));
    wsB.on("message", (raw) => handleIncomingSync(wsB!, docB, raw as Buffer, "B"));

    docA.on("update", (update, origin) => {
      if (origin === "remote") return;
      sendYjsUpdate(wsA!, update);
    });

    await withTimeout(
      Promise.all([
        new Promise<void>((resolve, reject) => {
          wsA!.once("open", () => resolve());
          wsA!.once("error", reject);
        }),
        new Promise<void>((resolve, reject) => {
          wsB!.once("open", () => resolve());
          wsB!.once("error", reject);
        }),
      ]),
      10_000,
      "WebSocket open handshake",
    );

    // Wait for the initial SyncStep1/2 exchange to complete on both peers.
    await withTimeout(
      new Promise<void>((resolve) => {
        resolveSyncReady = resolve;
        // Check whether both flags were already set by a fast in-flight frame.
        if (syncReadyA && syncReadyB) resolve();
      }),
      10_000,
      "Yjs SyncStep1/2 handshake",
    );

    const handshakeLatencyMs = performance.now() - handshakeT0;
    results.push({
      name: "WS Handshake + SyncStep",
      shortLabel: "Handshake",
      layer: "Network (WS)",
      avgMs: Number(handshakeLatencyMs.toFixed(2)),
    });

    await stabilize(250);

    // ── 2. WARM-UP ───────────────────────────────────────────────────────────
    const textA = docA.getText("shared-text");
    const textB = docB.getText("shared-text");

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const observer = () => {
          textB.unobserve(observer);
          resolve();
        };
        textB.observe(observer);
        try {
          textA.insert(0, "warmup-token ");
        } catch (err) {
          textB.unobserve(observer);
          reject(err);
        }
      }),
      8000,
      "Yjs warmup sync",
    );

    // ── 3. E2E CRDT UPDATE PROPAGATION LATENCY ──────────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 2. Measuring Bidirectional CRDT Update Propagation Latency...");
    let messageCounter = 0;
    const memBefore = getMemorySnapshot();

    const syncResult = await runBenchmark({
      name: "Yjs CRDT Propagation",
      iterations: 200,
      warmupIterations: 20,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentTag = `m_${++messageCounter}:`;
        // Tag-validated observer with a SELF-CLEANING timeout: resolves only on
        // the actual frame payload and ALWAYS unregisters — on match, on insert
        // error, and on timeout — so no dangling listener survives a failed
        // iteration (previous builds leaked observers into docB, which then
        // resolved phantom iterations on later ticks).
        return new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const observer = (event: Y.YTextEvent) => {
            const insertedText = event.changes.delta.map((d) => d.insert).join("");
            if (insertedText.includes(currentTag)) {
              textB.unobserve(observer);
              if (timer) clearTimeout(timer);
              resolve();
            }
          };
          textB.observe(observer);
          timer = setTimeout(() => {
            textB.unobserve(observer);
            reject(new Error("Yjs Sync Frame Timeout"));
          }, 4000);
          try {
            textA.insert(0, `${currentTag}payload `);
          } catch (err) {
            textB.unobserve(observer);
            if (timer) clearTimeout(timer);
            reject(err);
          }
        });
      },
    });

    const memAfter = getMemorySnapshot();
    const rssDelta = Number((memAfter.rss - memBefore.rss).toFixed(1));

    results.push({
      ...syncResult,
      rssDelta,
      shortLabel: "CRDT Sync",
      layer: "Network (WS)",
    });

    // ── 4. REPORTING & TELEMETRY ────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — YJS COLLABORATION SYNC AUDIT",
      shortLabel: "Collaboration",
      subtitle: `Yjs CRDT Wire Framing • Peer-to-Peer Relay • ${dbType}`,
      results,
    });

    const isSyncOptimal = syncResult.avgMs < 8.0;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        {
          key: "Dual Handshake + SyncStep Latency",
          val: handshakeLatencyMs.toFixed(2),
          unit: "ms",
        },
        { key: "E2E CRDT Update Propagation (Avg)", val: syncResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "E2E CRDT Update Propagation (p95)",
          val: (syncResult.p95Ms || syncResult.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Update Velocity", val: Math.round(syncResult.rps || 0), unit: "syncs/s" },
        { key: "Memory RSS Δ", val: rssDelta.toFixed(1), unit: "MB" },
        {
          key: "Collaboration SLA",
          val: isSyncOptimal ? "ELITE (<8ms)" : syncResult.avgMs < 20 ? "GOOD" : "SLOW",
          unit: "",
        },
      ],
      "Yjs Collaboration Summary",
    );

    exportMetric("websocket.handshake_ms", handshakeLatencyMs, "ms");
    exportMetric("websocket.sync.avg_ms", syncResult.avgMs, "ms");
    exportMetric("websocket.sync.p95_ms", syncResult.p95Ms || syncResult.avgMs, "ms");
    exportMetric("websocket.sync.velocity_rps", Math.round(syncResult.rps || 0), "syncs/s");

    exportResult(syncResult);
  } catch (err: any) {
    logger.error(`Yjs benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    resolveSyncReady = null;
    if (wsA) {
      wsA.removeAllListeners();
      wsA.close();
      wsA = null;
    }
    if (wsB) {
      wsB.removeAllListeners();
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
}, 60_000);
