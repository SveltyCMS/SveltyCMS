/**
 * @file tests/benchmarks/realtime-performance.test.ts
 * @description Real-Time Event Processing Benchmark
 * @summary Measures EventBus prefix filter function and Chat RPC handler overhead for svelte-realtime WebSocket events.
 *
 * ### Features:
 * - EventBus prefix filter micro-benchmark (bridged vs filtered events)
 * - Chat RPC handler validation, rate-limit check, and message creation overhead
 * - In-process latency measurement for real-time event pipeline
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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

/**
 * 🚀 Real-Time Performance Audit
 */
async function runRealtimeAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log("🚀 Starting Real-Time Performance Audit...\n");

  try {
    // 1. Setup Server
    process.env.SKIP_GRAPHQL_WS = "false";
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(500);

    const results: any[] = [];

    // ──────────────────────────────────────────────
    // SCENARIO 1: EventBus Prefix Filter (pure function)
    //   (Measures our new BRIDGE_EVENT_PREFIXES filter —
    //    should be near-zero: ~0.001ms per check)
    // ──────────────────────────────────────────────
    console.log("   → Measuring prefix filter function...");
    const BRIDGE_EVENT_PREFIXES = [
      "content.",
      "content:",
      "collection.",
      "collection:",
      "media.",
      "media:",
      "user.",
      "user:",
      "auth.",
      "auth:",
      "system.",
      "system:",
      "benchmark.",
      "benchmark:",
    ];
    function shouldBridgeEvent(event: string): boolean {
      return BRIDGE_EVENT_PREFIXES.some((prefix) => event.startsWith(prefix));
    }

    const filterResult = await runBenchmark({
      name: "Prefix Filter (bridged)",
      iterations: 1000,
      warmupIterations: 100,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        // Matched event (should bridge)
        if (!shouldBridgeEvent("content:update")) {
          throw new Error("Expected content:update to bridge");
        }
        // Non-matched event (should be filtered)
        if (shouldBridgeEvent("cache.evict")) {
          throw new Error("Expected cache.evict to be filtered");
        }
        // Benchmark event (should bridge)
        if (!shouldBridgeEvent("benchmark.ping")) {
          throw new Error("Expected benchmark.ping to bridge");
        }
      },
    });
    results.push({
      ...filterResult,
      shortLabel: "Prefix Filter",
      layer: "In-Process",
    });

    // ──────────────────────────────────────────────
    // SCENARIO 2: Chat RPC Handler Validation
    //   (Measures validation + rate limit check + message creation)
    // ──────────────────────────────────────────────
    console.log("   → Measuring Chat RPC handler overhead...");

    const chatResult = await runBenchmark({
      name: "Chat RPC (validation)",
      iterations: 300,
      warmupIterations: 30,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        // Simulate the message creation logic from chat.ts sendMessage
        const content = "Hello, this is a test message for benchmarking!";

        // Validation checks
        if (!content?.trim()) throw new Error("Empty content");
        if (content.length > 4000) throw new Error("Content too long");

        // Rate limit check (simulating the in-memory Map lookup)
        const userId = "benchmark-user";
        const now = Date.now();
        const RATE_LIMIT_WINDOW_MS = 5_000;
        const RATE_LIMIT_MAX_MSGS = 5;
        const userTimestamps: number[] = [];
        const recentMessages = userTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        if (recentMessages.length >= RATE_LIMIT_MAX_MSGS) {
          throw new Error("Rate limited");
        }
        recentMessages.push(now);

        // Message creation
        const message = {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: content.trim(),
          timestamp: new Date().toISOString(),
          user: {
            _id: userId,
            username: "BenchmarkUser",
            avatar: undefined as string | undefined,
          },
        };

        // Verify message shape
        if (!message.id || !message.content) {
          throw new Error("Message creation failed");
        }
      },
    });
    results.push({
      ...chatResult,
      shortLabel: "Chat RPC",
      layer: "In-Process",
    });

    // ──────────────────────────────────────────────
    // SCENARIO 3: System Event Object Creation
    //   (Measures system event object allocation + topic generation)
    // ──────────────────────────────────────────────
    console.log("   → Measuring system event object creation...");

    const eventObjResult = await runBenchmark({
      name: "System Event Creation",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const tenantId = "default";

        const systemEvent = {
          id: crypto.randomUUID(),
          event: "benchmark.realtime",
          data: { value: Math.random() },
          timestamp: Date.now(),
          tenantId,
        };

        // Verify
        if (!systemEvent.id || !systemEvent.event) {
          throw new Error("Event creation failed");
        }
      },
    });
    results.push({
      ...eventObjResult,
      shortLabel: "SysEvent",
      layer: "In-Process",
    });

    // ──────────────────────────────────────────────
    // Reporting
    // ──────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — REALTIME PERFORMANCE AUDIT",
      shortLabel: "Realtime",
      subtitle: `Internal Overhead • ${getDbType().toUpperCase()}`,
      results,
    });

    const avgFilter = results[0].avgMs;
    const avgChat = results[1].avgMs;
    const avgEvent = results[2].avgMs;

    printSummaryTable([
      {
        key: "Prefix Filter (3 checks)",
        val: avgFilter,
        unit: "ms",
      },
      {
        key: "Chat RPC Validation",
        val: avgChat,
        unit: "ms",
      },
      {
        key: "System Event Creation",
        val: avgEvent,
        unit: "ms",
      },
      {
        key: "Rating (Overall)",
        val: avgChat < 0.1 ? "EXCELLENT" : avgChat < 0.5 ? "GOOD" : "REVIEW",
        unit: "",
      },
    ]);

    exportResult(results[0]);
  } catch (err: any) {
    logger.error(`Realtime benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Real-Time Performance Audit", async () => {
  await runRealtimeAudit();
}, 480000);
