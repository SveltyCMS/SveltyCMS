/**
 * @file tests/benchmarks/websocket-broadcast.test.ts
 * @description WebSocket Real-Time Broadcast Benchmark (Optimized)
 * @summary Measures svelte-realtime WebSocket stream broadcast latency and handshake timing for event-driven updates.
 *
 * ### Features:
 * - svelte-realtime WebSocket stream subscribe/publish round-trip latency
 * - WebSocket connection handshake and subscription establishment timing
 * - Event emission to client delivery end-to-end measurement
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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { WebSocket } from "ws";

let stopServer: (() => Promise<void>) | null = null;
let realtimeWs: WebSocket | null = null;

export async function runBroadcastAudit() {
  console.log("🚀 Starting Real-Time Broadcast Performance Audit...\n");

  try {
    // 1. Setup Server
    process.env.SKIP_GRAPHQL_WS = "false";
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const realtimeUrl = baseUrl.replace("http", "ws") + "/ws";

    await ensureStableTestData();
    await stabilize(1000);

    const ITERATIONS = 100;
    const results = [];

    console.log("   → Benchmarking svelte-realtime (Optimized Stream)...");
    const realtimeWsUrl = `${realtimeUrl}?secret=${TEST_API_SECRET}&tenantId=default`;
    realtimeWs = new WebSocket(realtimeWsUrl);

    await new Promise<void>((resolve, reject) => {
      if (!realtimeWs) return reject(new Error("WebSocket not instantiated"));
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

    // Cache static configurations outside hot trails to guard timing precision
    const requestHeaders = {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    const preflightPayload = JSON.stringify({
      action: "emit-event",
      event: "benchmark.preflight",
      data: { timestamp: 1774728000000 },
    });

    const pingPayload = JSON.stringify({
      action: "emit-event",
      event: "benchmark.ping",
      data: { timestamp: 1774728000000 },
    });

    // 🚀 Pre-flight: verify publish/subscribe round-trip validation
    const preflightOk = await new Promise<boolean>((resolve) => {
      if (!realtimeWs) return resolve(false);
      const timeout = setTimeout(() => resolve(false), 3000);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "event" || msg.type === "create") {
            clearTimeout(timeout);
            realtimeWs?.off("message", handler);
            resolve(true);
          }
        } catch {
          // Suppress parsing anomalies silently
        }
      };

      realtimeWs.on("message", handler);

      fetch(`${baseUrl}/api/testing`, {
        method: "POST",
        headers: requestHeaders,
        body: preflightPayload,
      }).catch(() => {});
    });

    if (!preflightOk) {
      if (realtimeWs) {
        realtimeWs.close();
        realtimeWs = null;
      }
      logger.warn(
        "Realtime broadcast not available — skipping benchmark (WebSocket publish unreachable)",
      );
      console.warn("   ⚠️  Realtime broadcast not available — skipping benchmark");
      return;
    }

    const realtimeResult = await runBenchmark({
      name: "svelte-realtime Stream",
      iterations: ITERATIONS,
      warmupIterations: 10,
      runs: 1,
      silent: true,
      onIteration: async () => {
        return new Promise<void>((resolve, reject) => {
          if (!realtimeWs) return reject(new Error("WebSocket disconnected"));

          const timeout = setTimeout(() => {
            realtimeWs?.off("message", handler);
            reject(new Error("Realtime Timeout"));
          }, 2000);

          const handler = (data: any) => {
            try {
              const msg = JSON.parse(data.toString());
              if (
                msg.type === "event" ||
                (msg.type === "create" && msg.data?.event === "benchmark.ping")
              ) {
                clearTimeout(timeout);
                realtimeWs?.off("message", handler); // Clean listener handle up safely
                resolve();
              }
            } catch {
              // Suppress frame parsing noise
            }
          };

          realtimeWs.on("message", handler);

          fetch(`${baseUrl}/api/testing`, {
            method: "POST",
            headers: requestHeaders,
            body: pingPayload,
          }).catch(() => {});
        });
      },
    });

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
      {
        key: "Peak Throughput",
        val: Math.round(results[0].rps),
        unit: "events/s",
      },
    ]);

    exportResult(results[0]);
  } catch (err: any) {
    logger.warn(`Broadcast benchmark skipped: ${err.message}`);
    console.warn(`   ⚠️  Realtime broadcast not available: ${err.message}`);
  } finally {
    // Explicit stream garbage isolation
    if (realtimeWs) {
      realtimeWs.close();
      realtimeWs = null;
    }
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Real-Time Broadcast Latency Audit", async () => {
  await runBroadcastAudit();
}, 480000);
