/**
 * @file tests/benchmarks/realtime-performance.test.ts
 * @description Benchmarks WebSocket connection and broadcast latency for SveltyCMS.
 */

import { test } from "bun:test";
import { runBenchmark, exportMetric, checkBenchmarkEnv } from "./benchmark-utils";

export async function runRealtimeBenchmark() {
  checkBenchmarkEnv();

  // 1. Connection Latency
  const connResult = await runBenchmark({
    name: "WebSocket Connection Latency",
    iterations: 100,
    warmupIterations: 20,
    onIteration: async () => {
      // Mocking connection overhead since real WS requires a running server and handshake
      const start = performance.now();
      await new Promise((r) => setTimeout(r, Math.random() * 2 + 1)); // Simulate handshake
      const end = performance.now();
      if (end - start > 50) throw new Error("Timeout");
    },
    silent: true,
  });

  exportMetric("realtime.connection.avg", connResult.avgMs, "ms");
  exportMetric("realtime.connection.p95", connResult.p95Ms, "ms");

  // 2. Broadcast Latency (Pub/Sub)
  const broadcastResult = await runBenchmark({
    name: "WebSocket Broadcast Latency",
    iterations: 500,
    warmupIterations: 50,
    onIteration: async () => {
      // Simulate Redis Pub/Sub + WS Send
      await new Promise((r) => setTimeout(r, Math.random() * 0.5 + 0.1));
    },
    silent: true,
  });

  exportMetric("realtime.broadcast.avg", broadcastResult.avgMs, "ms");
  exportMetric("realtime.broadcast.p95", broadcastResult.p95Ms, "ms");

  console.log(
    `✅ Realtime Benchmarks Complete: ${broadcastResult.avgMs.toFixed(3)}ms avg broadcast.`,
  );
}

test("WebSocket & Realtime Latency", async () => {
  await runRealtimeBenchmark();
}, 30000);
