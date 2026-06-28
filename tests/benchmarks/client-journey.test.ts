/**
 * @file tests/benchmarks/client-journey.test.ts
 * @description Full Client Journey Simulation Benchmark (Optimized)
 * @summary Measures cumulative latency of a realistic editorial user workflow: Auth → List → View → Edit → Save.
 *
 * ### Features:
 * - Multi-step user workflow simulation (health check, list, view, edit, save)
 * - Realistic payload generation with variable content complexity
 * - Request tracing via x-request-id for journey-level observability
 * - Error logging to journey_errors.log for failure analysis
 */

import { beforeAll, afterAll, test } from "bun:test";
import fs from "node:fs";
import "../unit/bun-preload.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
  TEST_API_SECRET,
  generateRealisticEntry,
} from "./modules/benchmark-utils";

const isManual = !process.env.BUN_TEST && process.env.NODE_ENV !== "test";

let stopServer: (() => Promise<void>) | undefined;
let apiBaseUrl: string;
const ERROR_LOG = "journey_errors.log";

export async function runClientJourneyAudit() {
  await stabilize();

  console.log("\n🚀 Starting World Life Data: Client Journey Simulation...\n");

  const ITERATIONS = 100;
  const RUNS = 1;
  const allResults: any[] = [];

  // Pre-allocate static headers using standard lowercase layout mapping
  const baseHeaders = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "content-type": "application/json",
  };

  // Pre-generate request IDs and pre-serialize structural text payloads out of hot path
  const journeyTraceIds = Array.from(
    { length: ITERATIONS },
    (_, i) => `journey-id-${i}-${1774728000000 + i}`,
  );

  // Oversized payload pool + monotonic counter prevents warmup/run index aliasing
  const TOTAL_PAYLOADS = ITERATIONS + 50;
  let payloadCounter = 0;
  const serializedPayloads = Array.from({ length: TOTAL_PAYLOADS }, () => {
    const idx = payloadCounter++;
    const rawPayload = generateRealisticEntry(idx, idx % 5 === 0 ? "heavy" : "medium");
    if (!rawPayload)
      throw new Error(`[Setup] generateRealisticEntry returned undefined at index ${idx}`);
    return JSON.stringify(rawPayload);
  });
  payloadCounter = 0;

  console.log("    → Simulating Full User Journey (Auth > List > View > Save)...");
  const journeyRes = await runBenchmark({
    name: "Full Journey @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 25,
    runs: RUNS,
    concurrency: 1, // Maintained at sequential profile for absolute transactional multi-step logic checks
    silent: true,
    onIteration: async (i: number) => {
      const traceId = journeyTraceIds[i] ?? `journey-fallback-${i}`;

      // Zero-allocation frame composition mapping
      const journeyHeaders = { ...baseHeaders, "x-request-id": traceId };
      const patchHeaders = {
        ...baseHeaders,
        "x-request-id": `${traceId}-update`,
      };
      const bodyString = serializedPayloads[payloadCounter++ % serializedPayloads.length]!;

      try {
        // Step 1: Health / Auth Check
        const hRes = await fetch(`${apiBaseUrl}/api/system/health`, {
          method: "GET",
          headers: journeyHeaders,
        });
        if (!hRes.ok) throw new Error(`Health check failed: ${hRes.status}`);
        await hRes.arrayBuffer();

        // Step 2: List Collections
        const lRes = await fetch(`${apiBaseUrl}/api/content/collections`, {
          method: "GET",
          headers: journeyHeaders,
        });
        if (!lRes.ok) throw new Error(`List collections failed: ${lRes.status}`);
        await lRes.arrayBuffer();

        // Step 3: View Entry (Complex Query)
        const vRes = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          { method: "GET", headers: journeyHeaders },
        );
        if (!vRes.ok) throw new Error(`View entry failed: ${vRes.status}`);
        await vRes.arrayBuffer();

        // Step 4: Create Entry (POST — measures audit + insert pipeline)
        const sRes = await fetch(`${apiBaseUrl}/api/collections/${STABLE_COLLECTION}`, {
          method: "POST",
          headers: patchHeaders,
          body: bodyString,
        });

        if (!sRes.ok) {
          const errText = await sRes.text().catch(() => "unreadable stream");
          throw new Error(`Save update failed: ${sRes.status} - ${errText}`);
        }
        await sRes.arrayBuffer();
      } catch (err: any) {
        // Log locally for offline trace diagnosis
        fs.appendFileSync(ERROR_LOG, `[Iteration ${i}] ${err.stack || err}\n`);
        // Rethrow ensuring the statistical engine registers the error rate and skews outliers correctly
        throw err;
      }
    },
  });

  if ((journeyRes.errorRate || 0) > 0) {
    throw new Error(`Benchmark failed with errors. Check journey_errors.log for details.`);
  }

  allResults.push({ ...journeyRes, shortLabel: "Journey" });

  printTruthTable({
    title: "SVELTYCMS  —  WORLD LIFE DATA",
    subtitle: "Multi-Step Client Journey Latency • End-to-End Simulation",
    results: allResults,
  });

  printSummaryTable([
    { key: "Total Journey Latency (Avg)", val: journeyRes.avgMs, unit: "ms" },
    { key: "Total Journey Latency (p95)", val: journeyRes.p95Ms, unit: "ms" },
    {
      key: "Cumulative Throughput",
      val: Math.round(journeyRes.rps),
      unit: "journey/s",
    },
    {
      key: "Error Rate",
      val: (journeyRes.errorRate! * 100).toFixed(2),
      unit: "%",
    },
  ]);

  for (const r of allResults) exportResult(r);
  exportMetric("workflow.journey.avg", journeyRes.avgMs, "ms");
  exportMetric("workflow.journey.p95", journeyRes.p95Ms, "ms");
}

// --- Lifecycle & Runner Distribution ---

if (isManual) {
  console.log("Manual script execution configuration loaded.");

  (async () => {
    try {
      const { stop, baseUrl } = await setupBenchmarkServer();
      stopServer = stop;
      apiBaseUrl = baseUrl;

      const { getDb, ensureFullInitialization } = await import("@src/databases/db");
      await ensureFullInitialization();
      const db = getDb();
      if (!db) throw new Error("DB Initialization Failed");

      await ensureStableTestData(db);

      await runClientJourneyAudit();
    } catch (error) {
      console.error("Critical error during standalone runner execution:", error);
    } finally {
      if (stopServer) {
        console.log("Shutting down automated benchmark server instance...");
        await stopServer().catch(() => {});
      }
      process.exit(0);
    }
  })();
} else {
  beforeAll(async () => {
    const { stop, baseUrl } = await setupBenchmarkServer();
    stopServer = stop;
    apiBaseUrl = baseUrl;

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("DB Initialization Failed");
    await ensureStableTestData(db);

    // Ensure bench-shared-001 exists for the journey PATCH step
    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    const checkRes = await fetch(
      `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}?bypassCache=true`,
      {
        headers: {
          "x-test-mode": "true",
          "x-test-secret": secret,
          "x-tenant-id": "global",
        },
      },
    );
    if (!checkRes.ok) {
      // Entry missing — create it
      await fetch(`${apiBaseUrl}/api/collections/${STABLE_COLLECTION}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": secret,
          "x-tenant-id": "global",
        },
        body: JSON.stringify({
          _id: STABLE_ENTRY_ID,
          title: "Stable Entry",
          count: 0,
        }),
      }).catch(() => {});
    }
  }, 120000);

  afterAll(async () => {
    if (stopServer) await stopServer().catch(() => {});
  });

  test("Client Journey World Life Suite", async () => {
    await runClientJourneyAudit();
  }, 450000);
}
