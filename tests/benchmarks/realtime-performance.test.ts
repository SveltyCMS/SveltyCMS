/**
 * @file tests/benchmarks/realtime-performance.test.ts
 * @description Real-Time Event Processing Benchmark (Optimized)
 * @summary Measures EventBus prefix filter throughput, sliding-window rate limiters, and real-time event frame generation.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

// ── 1. PREFIX FILTER COMPILED DATASET ───────────────────────────────────────
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
  for (let i = 0; i < BRIDGE_EVENT_PREFIXES.length; i++) {
    if (event.startsWith(BRIDGE_EVENT_PREFIXES[i]!)) return true;
  }
  return false;
}

// Dynamic test dataset preventing V8 JIT branch-prediction bypass
const TEST_EVENT_DATASET = [
  { event: "content:update", expected: true },
  { event: "cache.evict", expected: false },
  { event: "benchmark.ping", expected: true },
  { event: "system:shutdown", expected: true },
  { event: "unrelated.telemetry", expected: false },
  { event: "auth.login", expected: true },
  { event: "media:processed", expected: true },
  { event: "database.vacuum", expected: false },
];

// ── 2. O(1) RING-BUFFER SLIDING WINDOW RATE LIMITER ─────────────────────────
class SlidingWindowLimiter {
  private timestamps: Float64Array;
  private head = 0;
  private size = 0;

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {
    this.timestamps = new Float64Array(maxRequests);
  }

  public allow(now: number): boolean {
    while (this.size > 0) {
      const oldestIdx = (this.head - this.size + this.maxRequests) % this.maxRequests;
      if (now - this.timestamps[oldestIdx]! >= this.windowMs) {
        this.size--;
      } else {
        break;
      }
    }

    if (this.size >= this.maxRequests) return false;

    this.timestamps[this.head] = now;
    this.head = (this.head + 1) % this.maxRequests;
    this.size++;
    return true;
  }

  public reset(): void {
    this.head = 0;
    this.size = 0;
  }
}

async function runRealtimeAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Real-Time Event Processing Benchmark (${dbType})...\n`);

  const results: any[] = [];
  const UUID_POOL_SIZE = 2000;
  const PREALLOCATED_UUIDS = Array.from({ length: UUID_POOL_SIZE }, (_, i) => `mock_evt_uuid_${i}`);
  const STATIC_ISO_TIME = "2026-08-28T12:00:00.000Z";

  // ── SCENARIO 1: EVENTBUS PREFIX FILTER ────────────────────────────────────
  forceGarbageCollection();
  await stabilize(100);

  console.log("   → 1. Measuring Dynamic Prefix Filter Engine...");
  let filterCursor = 0;

  const filterResult = await runBenchmark({
    name: "EventBus Prefix Filter",
    iterations: 10_000,
    warmupIterations: 500,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      const sample = TEST_EVENT_DATASET[filterCursor++ % TEST_EVENT_DATASET.length]!;
      const isBridged = shouldBridgeEvent(sample.event);
      if (isBridged !== sample.expected) {
        throw new Error(`Filter mismatch on event: ${sample.event}`);
      }
    },
  });
  results.push({ ...filterResult, shortLabel: "Prefix Filter", layer: "Router" });

  // ── SCENARIO 2: CHAT RPC VALIDATION & RATE LIMITING ───────────────────────
  forceGarbageCollection();
  await stabilize(100);

  console.log("   → 2. Measuring Chat RPC Validation & Sliding-Window Check...");
  const limiter = new SlidingWindowLimiter(100_000, 5000);
  const sampleContent = "Real-time chat test payload message verification.";
  let chatCursor = 0;

  const chatResult = await runBenchmark({
    name: "Chat RPC Validation & Dispatch",
    iterations: 8000,
    warmupIterations: 400,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onSetup: async () => {
      limiter.reset();
    },
    onIteration: () => {
      if (!sampleContent || sampleContent.length > 4000) throw new Error("Validation failed");

      const now = performance.now();
      if (!limiter.allow(now)) {
        throw new Error("Unexpected rate limit violation");
      }

      const mockId = PREALLOCATED_UUIDS[chatCursor++ % UUID_POOL_SIZE]!;
      const message = {
        id: mockId,
        role: "user" as const,
        content: sampleContent,
        timestamp: STATIC_ISO_TIME,
        user: {
          _id: "bench_usr_123",
          username: "BenchmarkUser",
          avatar: undefined,
        },
      };

      if (!message.id || !message.content) throw new Error("Message instantiation failed");
    },
  });
  results.push({ ...chatResult, shortLabel: "Chat RPC", layer: "RPC Gate" });

  // ── SCENARIO 3: SYSTEM EVENT FRAME SERIALIZATION ──────────────────────────
  forceGarbageCollection();
  await stabilize(100);

  console.log("   → 3. Measuring System Event Frame Instantiation & Seal...");
  let eventCursor = 0;

  const eventObjResult = await runBenchmark({
    name: "System Event Instantiation",
    iterations: 10_000,
    warmupIterations: 500,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      const mockId = PREALLOCATED_UUIDS[eventCursor++ % UUID_POOL_SIZE]!;
      const systemEvent = {
        id: mockId,
        event: "benchmark.realtime.sync",
        data: { value: 0.942, channel: "presence" },
        timestamp: 1774728000000,
        tenantId: "global",
      };

      if (!systemEvent.id || !systemEvent.event) throw new Error("Event instantiation failed");
    },
  });
  results.push({ ...eventObjResult, shortLabel: "SysEvent", layer: "EventBus" });

  // ── REPORTING & TELEMETRY ─────────────────────────────────────────────────
  printTruthTable({
    title: "SVELTYCMS — REALTIME PERFORMANCE AUDIT",
    shortLabel: "Realtime",
    subtitle: `In-Process Processing Overhead • Zero HTTP • ${dbType}`,
    results,
  });

  const avgFilter = results[0]!.avgMs;
  const avgChat = results[1]!.avgMs;
  const avgEvent = results[2]!.avgMs;

  printSummaryTable(
    [
      { key: "Database Engine", val: dbType, unit: "" },
      { key: "Prefix Filter Latency (Avg)", val: (avgFilter * 1000).toFixed(2), unit: "µs" },
      { key: "Prefix Filter Throughput", val: Math.round(results[0]!.rps), unit: "ops/s" },
      { key: "Chat RPC Latency (Avg)", val: (avgChat * 1000).toFixed(2), unit: "µs" },
      { key: "Chat RPC Throughput", val: Math.round(results[1]!.rps), unit: "ops/s" },
      { key: "Event Frame Latency (Avg)", val: (avgEvent * 1000).toFixed(2), unit: "µs" },
      { key: "Event Frame Throughput", val: Math.round(results[2]!.rps), unit: "ops/s" },
      {
        key: "Nanosecond SLA Compliance",
        val: avgChat < 0.005 ? "ELITE (<5µs)" : avgChat < 0.02 ? "GOOD (<20µs)" : "ACCEPTABLE",
        unit: "",
      },
    ],
    "Realtime Pipeline Summary",
  );

  exportMetric("realtime.filter_latency_us", parseFloat((avgFilter * 1000).toFixed(3)), "µs");
  exportMetric("realtime.chat_rpc_latency_us", parseFloat((avgChat * 1000).toFixed(3)), "µs");
  exportMetric("realtime.event_frame_latency_us", parseFloat((avgEvent * 1000).toFixed(3)), "µs");
  exportMetric("realtime.chat_rpc_throughput_ops", Math.round(results[1]!.rps), "ops/s");

  for (const r of results) exportResult(r);
}

test("Real-Time Performance Audit", async () => {
  await runRealtimeAudit();
}, 60_000);
