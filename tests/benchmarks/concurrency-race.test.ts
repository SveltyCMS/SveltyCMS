/**
 * @file tests/benchmarks/concurrency-race.test.ts
 * @description Enterprise Concurrency & Race Condition Audit.
 * Simulates high-concurrency writes to a single document to prove atomic consistency (Lost Update protection).
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "BenchmarkStable";
const ENTRY_ID = "bench-shared-001";

let stopServer: (() => Promise<void>) | null = null;

async function runConcurrencyAudit() {
  console.log("🚀 Starting Enterprise Concurrency & Race Condition Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);

    // 1. Get Initial State
    const getRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}`, {
      headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
    });
    if (!getRes.ok) throw new Error("Failed to fetch initial state");
    const initialData = await getRes.json();
    const initialCount = initialData.count || 0;

    console.log(`   → Initial count: ${initialCount}`);
    console.log("   → Blasting 100 concurrent increments...");

    // 2. Blast 100 concurrent atomic increments
    const CONCURRENCY = 100;
    const t0 = performance.now();

    const promises = Array.from({ length: CONCURRENCY }).map(async () => {
      const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}/increment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
        },
        body: JSON.stringify({ field: "count", amount: 1 }),
      });
      return res.ok;
    });

    const results = await Promise.all(promises);
    const duration = performance.now() - t0;
    const successCount = results.filter(Boolean).length;

    // 3. Verify Final State (Retry-backed to ensure atomic commit flush)
    let finalCount = 0;
    for (let i = 0; i < 3; i++) {
      const finalRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}`, {
        headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
      });
      const finalData = await finalRes.json();
      finalCount = finalData.count;
      if (finalCount === initialCount + CONCURRENCY) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`   → Final count: ${finalCount}`);

    const isPerfect = finalCount === initialCount + CONCURRENCY;
    const lockUpDetected = !isPerfect || (successCount < CONCURRENCY && duration > 5000);

    printTruthTable({
      title: "SVELTYCMS — CONCURRENCY AUDIT",
      shortLabel: "Concurrency",
      subtitle: `100 Concurrent Writes • ${getDbType().toUpperCase()}`,
      results: [
        {
          name: "Concurrent PATCH Bomb",
          avgMs: duration / CONCURRENCY,
          p95Ms: duration / CONCURRENCY, // Simplified for this specific test
          rps: (CONCURRENCY / duration) * 1000,
          layer: "Database Locks",
        },
      ],
    });

    printSummaryTable([
      { key: "Total Duration", val: duration, unit: "ms" },
      { key: "Successful Writes", val: successCount, unit: `/${CONCURRENCY}` },
      { key: "Database Lockup", val: lockUpDetected ? "DETECTED" : "NONE", unit: "" },
      { key: "Concurrency Health", val: lockUpDetected ? "FAILED" : "EXCELLENT", unit: "" },
    ]);

    if (lockUpDetected) {
      throw new Error("Concurrency Audit Failed: Database lockup or severe error rate detected.");
    }
  } catch (err: any) {
    logger.error(`Concurrency audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Concurrency audit completed.");
}

test("Concurrent Transaction Stress Test", async () => {
  await runConcurrencyAudit();
}, 60000);
