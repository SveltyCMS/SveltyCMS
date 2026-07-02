/**
 * @file tests/benchmarks/concurrency-race.test.ts
 * @description Concurrency & Race Condition Audit (Optimized)
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
  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);

    // Canonical lowercase structural header format
    const headers = {
      "content-type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "x-tenant-id": "global",
    } as const;

    // 1. Check current state by reading the entry
    const checkRes = await fetch(
      `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?bypassCache=true`,
      { method: "GET", headers },
    );

    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData?.data != null) {
        console.log(`   → Concurrency target entry found.`);
      } else {
        console.log(`   → Entry returned null. Purging existing and creating _id=${ENTRY_ID}...`);
        const delRes = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?permanent=true`,
          { method: "DELETE", headers },
        );
        await delRes.text().catch(() => {});

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
      }
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
    if (!resetRes.ok) await resetRes.text().catch(() => {});

    await forceRefreshServer(baseUrl);

    const getRes = await fetch(
      `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?bypassCache=true&_t=${Date.now()}`,
      { method: "GET", headers },
    );
    if (!getRes.ok) throw new Error("Failed to fetch initial state");
    const initialData = await getRes.json();
    const initialCount =
      initialData.data?.count ?? initialData.data?.data?.count ?? initialData.count ?? 0;

    console.log(`   → Initial count: ${initialCount}`);

    const dbType = getDbType().toLowerCase();
    const BATCH = dbType.includes("mongodb") ? 100 : 50;
    const GAP = 0;
    const CONCURRENCY = 100;

    console.log(`   → Blasting 100 concurrent increments (batch ${BATCH}, ${dbType})...`);

    // Pre-allocate static request configuration components
    const targetIncrementUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}/increment`;
    const bodyPayload = JSON.stringify({ field: "count", amount: 1 });

    const responses: Response[] = [];
    const t0 = performance.now();

    // Fix the async promise execution defect using a lazy closure executor graph
    const taskQueue = Array.from(
      { length: CONCURRENCY },
      () => () =>
        fetch(targetIncrementUrl, {
          method: "POST",
          headers,
          body: bodyPayload,
        }),
    );

    if (BATCH < CONCURRENCY) {
      // Execute true sequentialized waves for locking-sensitive adapters (e.g., SQLite)
      for (let i = 0; i < taskQueue.length; i += BATCH) {
        const waveThunks = taskQueue.slice(i, i + BATCH);
        const wavePromises = waveThunks.map((thunk) => thunk());
        const waveRes = await Promise.all(wavePromises);
        responses.push(...waveRes);

        if (i + BATCH < taskQueue.length && GAP > 0) {
          await new Promise((r) => setTimeout(r, GAP));
        }
      }
    } else {
      // Full parallelism via connection pools for enterprise backends
      const allPromises = taskQueue.map((thunk) => thunk());
      const allRes = await Promise.all(allPromises);
      responses.push(...allRes);
    }
    const duration = performance.now() - t0;
    const successCount = responses.filter((r) => r.ok).length;

    // 3. Evaluate returning metrics
    let maxCountFromResponses = 0;
    let loggedFailed = false;

    for (const res of responses) {
      if (res.ok) {
        try {
          const body = await res.json();
          const data = body?.data ?? body;
          const count = data?.count ?? data?.data?.count ?? 0;
          if (count > maxCountFromResponses) {
            maxCountFromResponses = count;
          }
        } catch {
          // Suppress parsing anomalies
        }
      } else if (!loggedFailed) {
        loggedFailed = true;
        try {
          const errBody = await res.text();
          console.error(`   → FAILED RESPONSE STATUS: ${res.status}, BODY: ${errBody}`);
        } catch {
          console.error(`   → FAILED RESPONSE STATUS: ${res.status}`);
        }
      } else {
        // Drain remaining socket loops to preserve pooled descriptors
        await res.arrayBuffer().catch(() => {});
      }
    }

    let finalCount = maxCountFromResponses;
    const finalRes = await fetch(
      `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?bypassCache=true&_t=${Date.now()}`,
      { method: "GET", headers },
    );
    if (finalRes.ok) {
      const finalData = await finalRes.json();
      const dbCount = finalData.data?.count ?? finalData.data?.data?.count ?? finalData.count ?? 0;
      console.log(
        `   → Max count from responses: ${maxCountFromResponses}, DB final count: ${dbCount}`,
      );
      finalCount = Math.max(maxCountFromResponses, dbCount);
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
          p95Ms: duration / CONCURRENCY,
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
