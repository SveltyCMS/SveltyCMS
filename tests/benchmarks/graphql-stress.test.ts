/**
 * @file tests/benchmarks/graphql-stress.test.ts
 * @description Adaptive GraphQL Stress & Capacity Test (Optimized)
 * @summary Discovers maximum sustainable GraphQL throughput by ramping concurrency
 * with per-request timeouts, socket drainage, and adaptive backoff.
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
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const QUERIES = [
  { name: "Health", query: `query { contentSystemHealth { state version } }` },
  { name: "Collections", query: `query { allCollectionStats { _id name } }` },
  {
    name: "Entries",
    query: `query { BenchmarkStable(pagination: { limit: 10 }) { _id title } }`,
  },
];

const ADAPTIVE_STEPS = [
  { concurrency: 5, iterations: 200, label: "5c Warmup" },
  { concurrency: 10, iterations: 400, label: "10c Light" },
  { concurrency: 20, iterations: 600, label: "20c Moderate" },
  { concurrency: 40, iterations: 800, label: "40c Heavy" },
  { concurrency: 60, iterations: 1000, label: "60c Stress" },
  { concurrency: 80, iterations: 1200, label: "80c Extreme" },
  { concurrency: 100, iterations: 1500, label: "100c Max" },
];

const MAX_CONSECUTIVE_RESETS = 3;
const RESET_BACKOFF_MS = 2000;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runStressAudit() {
  console.log("🚀 Starting Adaptive GraphQL Capacity Discovery...\n");

  let stopServer: (() => Promise<void>) | null = null;

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    const targetUrl = `${baseUrl}/api/graphql`;

    // Pre-serialize payload strings outside timed loop
    const serializedPayloads = QUERIES.map((q) => JSON.stringify({ query: q.query }));
    const payloadCount = serializedPayloads.length;

    const results: any[] = [];
    let maxSustainableConcurrency = 0;
    let maxSustainableRps = 0;
    let consecutiveResets = 0;

    for (let s = 0; s < ADAPTIVE_STEPS.length; s++) {
      const step = ADAPTIVE_STEPS[s]!;

      if (consecutiveResets >= MAX_CONSECUTIVE_RESETS) {
        console.log(
          `    ⚠️ Server connection limit reached at ${maxSustainableConcurrency}c / ${Math.round(
            maxSustainableRps,
          )} req/s. Stopping ramp.`,
        );
        break;
      }

      // Isolate each concurrency step with GC and stabilization
      forceGarbageCollection();
      await stabilize(150);

      console.log(
        `    → Testing ${step.label} (${step.iterations} reqs @ ${step.concurrency}c)...`,
      );

      try {
        let cursor = 0;
        const result = await runBenchmark({
          name: `GQL: ${step.label}`,
          iterations: step.iterations,
          warmupIterations: Math.floor(step.iterations * 0.1),
          runs: 1,
          concurrency: step.concurrency,
          trimOutliers: "iqr",
          measureMemory: true,
          silent: true,
          abortOnErrors: false,
          onIteration: async () => {
            const payload = serializedPayloads[cursor++ % payloadCount]!;

            // Fresh per-request timeout signal prevents global timeout leakage
            const res = await fetch(targetUrl, {
              method: "POST",
              headers: requestHeaders,
              body: payload,
              signal: AbortSignal.timeout(10000),
            });

            // Drain socket buffer immediately to return connection to keep-alive pool
            await res.arrayBuffer().catch(() => {});

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
        });

        const errorRate = result.errorRate || 0;

        if (result.rps > 0 && errorRate <= 0.05) {
          maxSustainableConcurrency = step.concurrency;
          maxSustainableRps = Math.max(maxSustainableRps, result.rps);
        }

        results.push({
          ...result,
          shortLabel: step.label,
          layer: "Stress",
        });

        if (errorRate > 0.1) {
          consecutiveResets++;
          console.log(
            `    ⚠️ Elevated error rate (${(errorRate * 100).toFixed(1)}%) at ${
              step.concurrency
            }c — server approaching ceiling.`,
          );
          await stabilize(RESET_BACKOFF_MS);
        } else {
          consecutiveResets = 0;
        }
      } catch (err: any) {
        const errMsg = err.message || "";
        if (
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("aborted") ||
          errMsg.includes("consecutive errors") ||
          errMsg.includes("reliability")
        ) {
          consecutiveResets++;
          console.log(`    ⚠️ Server connection limit hit at ${step.concurrency}c: ${errMsg}`);
          await stabilize(RESET_BACKOFF_MS);
        } else {
          console.error(`    ❌ Unexpected error at ${step.label}: ${errMsg}`);
        }
      }
    }

    if (results.length === 0) {
      console.log("    ⚠️ No stress data collected — server unavailable.");
      return;
    }

    const dbType = getDbType().toUpperCase();

    printTruthTable({
      title: "SVELTYCMS — GRAPHQL CAPACITY DISCOVERY",
      shortLabel: "GQL Stress",
      subtitle: `Adaptive Concurrency Ramp • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Max Sustainable Concurrency", val: maxSustainableConcurrency, unit: "connections" },
        { key: "Max Sustainable Throughput", val: Math.round(maxSustainableRps), unit: "req/s" },
        {
          key: "Capacity Rating",
          val:
            maxSustainableConcurrency >= 80
              ? "ENTERPRISE (≥80c)"
              : maxSustainableConcurrency >= 40
                ? "GOOD (≥40c)"
                : "MODERATE (<40c)",
          unit: "",
        },
      ],
      "GraphQL Capacity Summary",
    );

    for (const r of results) exportResult(r);
  } catch (err: any) {
    console.error("GraphQL stress test failed:", err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("GraphQL Stress Capacity Discovery", async () => {
  await runStressAudit();
}, 900_000);
