/**
 * @file tests/benchmarks/websocket-broadcast.test.ts
 * @description Real-time broadcast latency benchmark for SveltyCMS.
 * Evaluates the new svelte-realtime implementation.
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
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { WebSocket } from "ws";

let stopServer: (() => Promise<void>) | null = null;

/**
 * 🚀 Real-Time Broadcast Audit
 */
export async function runBroadcastAudit() {
  console.log("🚀 Starting Real-Time Broadcast Performance Audit...\n");

  try {
    // 1. Setup Server
    process.env.SKIP_GRAPHQL_WS = "false";
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    // svelte-realtime dev mode often uses /ws or /_realtime
    const realtimeUrl = baseUrl.replace("http", "ws") + "/ws";

    await ensureStableTestData();
    await stabilize(1000);

    const ITERATIONS = 100;
    const results = [];

    // --- SCENARIO: svelte-realtime (New Optimized Implementation) ---
    console.log("   → Benchmarking svelte-realtime (Optimized Stream)...");
    const realtimeWsUrl = `${realtimeUrl}?secret=${TEST_API_SECRET}&tenantId=default`;
    const realtimeWs = new WebSocket(realtimeWsUrl);

    await new Promise<void>((resolve, reject) => {
      realtimeWs.on("open", resolve);
      realtimeWs.on("error", (err) => {
        console.error("Realtime WS Error:", err);
        reject(err);
      });
      setTimeout(() => reject(new Error("Realtime Handshake timeout")), 15000);
    });

    // Subscribe to system_events stream
    realtimeWs.send(
      JSON.stringify({
        type: "subscribe",
        topic: "system_events:default",
      }),
    );

    const realtimeResult = await runBenchmark({
      name: "svelte-realtime Stream",
      iterations: ITERATIONS,
      warmupIterations: 10,
      runs: 1,
      silent: true,
      onIteration: async () => {
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Realtime Timeout")), 2000);
          const handler = (data: any) => {
            const msg = JSON.parse(data.toString());
            // svelte-realtime message format
            if (msg.type === "event" && msg.data?.event === "benchmark.ping") {
              realtimeWs.removeListener("message", handler);
              clearTimeout(timeout);
              resolve();
            }
          };
          realtimeWs.on("message", handler);

          fetch(`${baseUrl}/api/testing`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
            body: JSON.stringify({
              action: "emit-event",
              event: "benchmark.ping",
              data: { timestamp: Date.now() },
            }),
          }).catch(() => {});
        });
      },
    });

    realtimeWs.close();
    results.push({
      ...realtimeResult,
      shortLabel: "Realtime",
      layer: "Network (uWS)",
    });

    // --- Reporting ---
    printTruthTable({
      title: "SVELTYCMS — REAL-TIME BROADCAST AUDIT",
      shortLabel: "Broadcast",
      subtitle: `Svelte-Realtime • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Svelte-Realtime Avg Latency", val: results[0].avgMs, unit: "ms" },
      { key: "Peak Throughput", val: Math.round(results[0].rps), unit: "events/s" },
    ]);

    exportResult(results[0]);
  } catch (err: any) {
    logger.error(`Broadcast benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Broadcast performance audit completed.");
}

test("Real-Time Broadcast Latency Audit", async () => {
  await runBroadcastAudit();
}, 480000);
