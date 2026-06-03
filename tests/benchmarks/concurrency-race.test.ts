/**
 * @file tests/benchmarks/concurrency-race.test.ts
 * @description Concurrency & Race Condition Audit
 * @summary Simulates high-concurrency writes to a single document to prove atomic consistency and lost update protection.
 *
 * ### Features:
 * - High-concurrency write collision simulation
 * - Atomic consistency verification
 * - Lost update detection and prevention
 * - Document-level concurrency stress testing
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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "BenchmarkStable";
const ENTRY_ID = "bench-shared-001";

let stopServer: (() => Promise<void>) | null = null;

async function runConcurrencyAudit() {
  // pre-existing unused var removed for TS strict mode
  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);

    // Common headers for all benchmark requests
    const headers = {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "x-tenant-id": "global",
    } as const;

    // 1. Check current state by reading the entry
    const checkRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}`, {
      headers,
    });
    if (checkRes.ok) {
      console.log(`   → Concurrency target entry found.`);
    } else if (checkRes.status === 404) {
      console.log(`   → Entry not found. Creating _id=${ENTRY_ID}...`);
      const createRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          _id: ENTRY_ID,
          count: 0,
          title: "Concurrency Target",
        }),
      });
      if (!createRes.ok)
        throw new Error(`Failed to create target entry: ${await createRes.text()}`);
    } else {
      throw new Error(`Failed to check entry state: ${checkRes.status}`);
    }

    // Reset the count field to 0 via PATCH
    const resetRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ count: 0 }),
    });
    const resetBody = resetRes.ok
      ? "OK"
      : `${resetRes.status} ${await resetRes
          .text()
          .then((t) => t.substring(0, 200))
          .catch(() => "")}`;
    console.log(`   → PATCH reset count=0: ${resetBody}`);

    // 2. Force cache refresh and get initial state
    await forceRefreshServer(baseUrl);

    const getRes = await fetch(
      `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?bypassCache=true`,
      {
        headers,
      },
    );
    if (!getRes.ok) throw new Error("Failed to fetch initial state");
    const initialData = await getRes.json();
    const initialCount = initialData.data?.count ?? initialData.count ?? 0;

    console.log(`   → Initial count: ${initialCount}`);
    console.log("   → Blasting 100 concurrent increments...");

    // 2. Blast 100 concurrent atomic increments
    const CONCURRENCY = 100;
    const t0 = performance.now();

    const promises = Array.from({ length: CONCURRENCY }).map(async () => {
      const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}/increment`, {
        method: "POST",
        headers,
        body: JSON.stringify({ field: "count", amount: 1 }),
      });
      return res;
    });

    const responses = await Promise.all(promises);
    const duration = performance.now() - t0;
    const successCount = responses.filter((r) => r.ok).length;

    // 3. Find the maximum count returned across all successful increment response bodies
    let maxCountFromResponses = 0;
    for (const res of responses) {
      if (res.ok) {
        try {
          const body = await res.clone().json();
          const data = body?.data ?? body;
          const count = data?.count ?? data?.data?.count ?? 0;
          if (count > maxCountFromResponses) {
            maxCountFromResponses = count;
          }
        } catch {}
      }
    }

    // Also fetch the final state from the database directly, bypassing cache
    let finalCount = maxCountFromResponses;
    const finalRes = await fetch(
      `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?bypassCache=true`,
      {
        headers,
      },
    );
    if (finalRes.ok) {
      const finalData = await finalRes.json();
      const dbCount = finalData.data?.count ?? finalData.count ?? 0;
      console.log(
        `   → Max count from responses: ${maxCountFromResponses}, DB final count: ${dbCount}`,
      );
      finalCount = Math.max(maxCountFromResponses, dbCount);
    }

    // 4. Print results and verify
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
      {
        key: "Database Lockup",
        val: lockUpDetected ? "DETECTED" : "NONE",
        unit: "",
      },
      {
        key: "Concurrency Health",
        val: lockUpDetected ? "FAILED" : "EXCELLENT",
        unit: "",
      },
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
}

test("Concurrent Transaction Stress Test", async () => {
  await runConcurrencyAudit();
}, 60000);
