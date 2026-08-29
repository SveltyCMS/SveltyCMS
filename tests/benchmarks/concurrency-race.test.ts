/**
 * @file tests/benchmarks/concurrency-race.test.ts
 * @description Concurrency & Race Condition Audit (Optimized)
 * @summary Simulates high-concurrency writes to a single document to prove atomic consistency.
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "BenchmarkStable";
const ENTRY_ID = "20000000-0000-4000-8000-000000000001";
const CONCURRENCY = 100;

let stopServer: (() => Promise<void>) | null = null;

async function runConcurrencyAudit() {
  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);

    const headers: HeadersInit = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    const targetUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}`;
    const collectionUrl = `${baseUrl}/api/collections/${COLLECTION_ID}`;

    // ── 1. DETERMINISTIC SETUP & INITIAL STATE RESET ──────────────────────────
    const checkRes = await fetch(`${targetUrl}?bypassCache=true`, { headers });

    if (checkRes.status === 404) {
      await checkRes.arrayBuffer().catch(() => {});
      const createRes = await fetch(collectionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ _id: ENTRY_ID, count: 0, title: "Concurrency Target" }),
      });
      if (!createRes.ok) {
        throw new Error(`Failed to create target entry: ${await createRes.text()}`);
      }
      await createRes.arrayBuffer().catch(() => {});
    } else if (checkRes.ok) {
      await checkRes.arrayBuffer().catch(() => {});
      // Reset counter to 0 explicitly
      const resetRes = await fetch(targetUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ count: 0 }),
      });
      if (!resetRes.ok) throw new Error(`Failed to reset count: ${await resetRes.text()}`);
      await resetRes.arrayBuffer().catch(() => {});
    } else {
      await checkRes.arrayBuffer().catch(() => {});
      throw new Error(`Unexpected status checking entry state: ${checkRes.status}`);
    }

    await forceRefreshServer(baseUrl);

    // Verify baseline count
    const getRes = await fetch(`${targetUrl}?bypassCache=true&_t=${Date.now()}`, { headers });
    if (!getRes.ok) throw new Error("Failed to fetch initial state");
    const initialData = (await getRes.json()) as any;
    const initialCount =
      initialData.data?.count ?? initialData.data?.data?.count ?? initialData.count ?? 0;

    console.log(`   → Baseline verified. Initial count: ${initialCount}`);

    const dbType = getDbType().toLowerCase();
    const POOL_CONCURRENCY = dbType.includes("mongodb") ? 100 : dbType.includes("sqlite") ? 50 : 25;

    console.log(
      `   → Firing ${CONCURRENCY} concurrent increments (concurrency pool=${POOL_CONCURRENCY}, ${dbType})...`,
    );

    // ── 2. CONCURRENT TRANSACTION PIPELINE ───────────────────────────────────
    const incrementUrl = `${targetUrl}/increment`;
    const bodyPayload = JSON.stringify({ field: "count", amount: 1 });

    const latencies: number[] = Array.from<number>({ length: CONCURRENCY });
    const responseCounts: number[] = [];
    let jobCursor = 0;
    let successCount = 0;

    const executeIncrement = async (idx: number): Promise<void> => {
      const start = performance.now();
      try {
        const res = await fetch(incrementUrl, {
          method: "POST",
          headers,
          body: bodyPayload,
        });

        latencies[idx] = performance.now() - start;

        if (res.ok) {
          const body = (await res.json()) as any;
          const data = body?.data ?? body;
          const count = data?.count ?? data?.data?.count;
          if (typeof count === "number") {
            responseCounts.push(count);
          }
          successCount++;
        } else {
          await res.arrayBuffer().catch(() => {});
        }
      } catch {
        latencies[idx] = -1;
      }
    };

    const t0 = performance.now();

    // Sliding window execution to avoid pool lockups while keeping pressure saturated
    const workers = Array.from({ length: Math.min(POOL_CONCURRENCY, CONCURRENCY) }, async () => {
      while (true) {
        const idx = jobCursor++;
        if (idx >= CONCURRENCY) break;
        await executeIncrement(idx);
      }
    });

    await Promise.all(workers);
    const duration = performance.now() - t0;

    // ── 3. ATOMIC CONSISTENCY VALIDATION ─────────────────────────────────────
    const maxReturnedCount = responseCounts.length > 0 ? Math.max(...responseCounts) : 0;

    const finalRes = await fetch(`${targetUrl}?bypassCache=true&_t=${Date.now()}`, { headers });
    if (!finalRes.ok) throw new Error("Failed to fetch final state");
    const finalData = (await finalRes.json()) as any;
    const dbFinalCount =
      finalData.data?.count ?? finalData.data?.data?.count ?? finalData.count ?? 0;

    console.log(
      `   → Max count in response payloads: ${maxReturnedCount}, Final count in DB: ${dbFinalCount}`,
    );

    const isConsistent = dbFinalCount === initialCount + successCount;
    const isPerfect = dbFinalCount === initialCount + CONCURRENCY;
    const lockUpDetected = !isPerfect || (successCount < CONCURRENCY && duration > 5000);

    const validLatencies = latencies.filter((l) => l >= 0).sort((a, b) => a - b);
    const avgMs = validLatencies.length
      ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length
      : 0;
    const p95Ms = validLatencies.length
      ? validLatencies[Math.floor(validLatencies.length * 0.95)]
      : 0;
    const rps = (CONCURRENCY / duration) * 1000;

    printTruthTable({
      title: "SVELTYCMS — CONCURRENCY AUDIT",
      shortLabel: "Concurrency",
      subtitle: `${CONCURRENCY} Concurrent Writes • ${dbType.toUpperCase()}`,
      results: [
        {
          name: "Concurrent PATCH Bomb",
          avgMs,
          p95Ms,
          rps,
          layer: isConsistent ? "✅ Atomicity Intact" : "❌ Lost Updates",
        },
      ],
    });

    printSummaryTable([
      { key: "Total Duration", val: duration.toFixed(1), unit: "ms" },
      { key: "Successful Writes", val: `${successCount}/${CONCURRENCY}`, unit: "" },
      { key: "Atomic Delta Expected", val: `+${CONCURRENCY}`, unit: "" },
      { key: "Actual Delta", val: `+${dbFinalCount - initialCount}`, unit: "" },
      { key: "Latency (Avg / P95)", val: `${avgMs.toFixed(1)} / ${p95Ms.toFixed(1)}`, unit: "ms" },
      { key: "Lockup / Lost Updates", val: lockUpDetected ? "DETECTED" : "NONE", unit: "" },
    ]);

    if (lockUpDetected) {
      throw new Error(
        `Concurrency Audit Failed: Expected final count ${initialCount + CONCURRENCY}, got ${dbFinalCount}. Lost ${
          CONCURRENCY - successCount
        } updates.`,
      );
    }
  } catch (err: any) {
    logger.error(`Concurrency audit failed: ${err.message}`);
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
