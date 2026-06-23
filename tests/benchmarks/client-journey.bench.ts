/**
 * @file tests/benchmarks/client-journey.test.ts
 * @description Full Client Journey Simulation Benchmark
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

// 🚀 SHIM: Accurately detect direct script execution vs test runner
// bun test automatically sets NODE_ENV to 'test' and BUN_TEST to '1'
const isManual = !process.env.BUN_TEST && process.env.NODE_ENV !== "test";

let stopServer: (() => Promise<void>) | undefined;
let apiBaseUrl: string;
const ERROR_LOG = "journey_errors.log";

export async function runClientJourneyAudit() {
  // pre-existing unused var removed for TS strict mode
  await stabilize();

  console.log("\n🚀 Starting World Life Data: Client Journey Simulation...\n");

  const ITERATIONS = 100;
  const RUNS = 1;
  const allResults: any[] = [];

  const headers = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "Content-Type": "application/json",
  };

  // 1. Full Client Journey Simulation
  console.log("    → Simulating Full User Journey (Auth > List > View > Save)...");
  const journeyRes = await runBenchmark({
    name: "Full Journey @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 25,
    runs: RUNS,
    concurrency: 1,
    silent: true,
    onIteration: async (i: number) => {
      const traceId = `journey-${Math.random().toString(36).substring(2, 11)}`;
      const journeyHeaders = { ...headers, "x-request-id": traceId };

      try {
        // Step 1: Health / Auth Check
        const hRes = await fetch(`${apiBaseUrl}/api/system/health`, {
          headers: journeyHeaders,
        });
        if (!hRes.ok) throw new Error(`Health check failed: ${hRes.status}`);
        await hRes.json();

        // ⏱️ Think time (Simulate reading dashboard)
        //await waitThinkTime(50, 150);

        // Step 2: List Collections
        const lRes = await fetch(`${apiBaseUrl}/api/content/collections`, {
          headers: journeyHeaders,
        });
        if (!lRes.ok) throw new Error(`List collections failed: ${lRes.status}`);
        await lRes.json();

        // Step 3: View Entry (Complex Query)
        const vRes = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          { headers: journeyHeaders },
        );
        if (!vRes.ok) throw new Error(`View entry failed: ${vRes.status}`);
        await vRes.json();

        // ⏱️ Think time (Simulate editorial review/edit)
        //await waitThinkTime(100, 300);

        const patchHeaders = {
          ...journeyHeaders,
          "x-request-id": `${traceId}-update`,
        };

        // 🚀 REALISM: Use complex, variable payloads
        const payload = generateRealisticEntry(i, i % 5 === 0 ? "heavy" : "medium");

        if (!payload) {
          throw new Error(`[Iteration ${i}] Critical: generateRealisticEntry returned undefined`);
        }

        const bodyString = JSON.stringify(payload);
        if (bodyString === "undefined" || !bodyString) {
          throw new Error(`[Iteration ${i}] Critical: JSON.stringify(payload) is ${bodyString}`);
        }

        const sRes = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            method: "PATCH",
            headers: patchHeaders,
            body: bodyString,
          },
        );

        if (!sRes.ok) {
          const errText = await sRes.text();
          fs.appendFileSync(
            ERROR_LOG,
            `[Iteration ${i}] Error: Save update failed: ${sRes.status} - ${errText}\n`,
          );
          throw new Error(`Save update failed: ${sRes.status} - ${errText}`);
        }
        await sRes.json();
      } catch (err: any) {
        fs.appendFileSync(ERROR_LOG, `[Iteration ${i}] ${err.stack || err}\n`);
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
      // 1. Manual Setup Hook Execution
      const { stop, baseUrl } = await setupBenchmarkServer();
      stopServer = stop;
      apiBaseUrl = baseUrl;

      const { getDb, ensureFullInitialization } = await import("@src/databases/db");
      await ensureFullInitialization();
      const db = getDb();
      if (!db) throw new Error("DB Initialization Failed");

      try {
        await db.crud.deleteMany(
          STABLE_COLLECTION,
          {},
          { permanent: true, bypassTenantCheck: true },
        );
      } catch {
        // Table might not exist yet, ignore
      }
      await ensureStableTestData(db);

      // 2. Direct Core Task Execution
      await runClientJourneyAudit();
    } catch (error) {
      console.error("Critical error during standalone runner execution:", error);
    } finally {
      // 3. Manual Teardown Hook Execution
      if (stopServer) {
        console.log("Shutting down automated benchmark server instance...");
        await stopServer();
      }

      // Add this line to force the script to close immediately
      // instead of waiting for database connections to time out.
      process.exit(0);
    }
  })();
} else {
  // Executed ONLY when running via `bun test`
  beforeAll(async () => {
    const { stop, baseUrl } = await setupBenchmarkServer();
    stopServer = stop;
    apiBaseUrl = baseUrl;

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("DB Initialization Failed");
    try {
      await db.crud.deleteMany(STABLE_COLLECTION, {}, { permanent: true, bypassTenantCheck: true });
    } catch {
      /* ignore */
    }
    await ensureStableTestData(db);
  }, 120000);

  afterAll(async () => {
    if (stopServer) await stopServer();
  });

  test("Client Journey World Life Suite", async () => {
    await runClientJourneyAudit();
  }, 450000);
}
