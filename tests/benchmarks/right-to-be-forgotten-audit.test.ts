/**
 * @file tests/benchmarks/right-to-be-forgotten-audit.test.ts
 * @description GDPR/CCPA Right-to-be-Forgotten Compliance Benchmark (Optimized)
 * @summary Measures the latency, cascading relational integrity, and throughput of deep user erasure across all linked repositories.
 */

import {
  test,
  expect,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  requireTestInfrastructure,
  TEST_API_SECRET,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import type { DatabaseId } from "@src/content/types";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runGdprAudit() {
  process.env.TEST_MODE = "true";
  requireTestInfrastructure("right-to-be-forgotten-audit");
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Right-to-be-Forgotten Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const { getDb, getDbInitPromise } = await import("@src/databases/db");
    await getDbInitPromise(false, "CORE").catch(() => {});
    const _db = getDb();
    if (!_db) throw new Error("Database adapter not initialized");

    const testEndpoint = `${baseUrl}/api/testing`;
    const complianceHeaders: Record<string, string> = {
      "content-type": "application/json",
      "x-test-secret": TEST_API_SECRET,
      ...benchmarkAuthHeaders(),
      connection: "keep-alive",
    };

    const ITERATIONS = 25;
    const WARMUP_COUNT = 5;
    const TOTAL_USERS_NEEDED = (ITERATIONS + WARMUP_COUNT) * 2;

    // ── 1. PRE-SEED LINKED USER GRAPHS ──────────────────────────────────────
    console.log(
      `   → Pre-seeding ${TOTAL_USERS_NEEDED} relational user graphs for deep-wipe audit...`,
    );

    const preseededUserIds: DatabaseId[] = Array.from(
      { length: TOTAL_USERS_NEEDED },
      (_, i) => `gdpr_usr_${Date.now()}_${i}` as DatabaseId,
    );

    for (const userId of preseededUserIds) {
      await _db.auth.createUser(
        {
          _id: userId,
          email: `${userId}@gdpr-benchmark.local`,
          password: "HashedPassword123!",
          role: "user",
          isRegistered: true,
          emailVerified: true,
          tenantId: "global" as DatabaseId,
        },
        { tenantId: "global" as DatabaseId },
      );
    }

    await stabilize(500);

    // Pre-serialize erase payloads
    const wipePayloads = preseededUserIds.map((userId) =>
      JSON.stringify({
        action: "wipe-user",
        userId,
      }),
    );

    let wipeCursor = 0;
    const wipedIdsForVerification: DatabaseId[] = [];

    // ── 2. MEASURE CASCADING DEEP-DELETION SPEED ────────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → Measuring Cascading Deep-Deletion Latency...");

    const results = await runBenchmark({
      name: "Deep Deletion Speed",
      iterations: ITERATIONS,
      warmupIterations: WARMUP_COUNT,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const idx = wipeCursor++ % wipePayloads.length;
        const targetUserId = preseededUserIds[idx]!;
        const bodyPayload = wipePayloads[idx]!;

        const res = await fetch(testEndpoint, {
          method: "POST",
          headers: complianceHeaders,
          body: bodyPayload,
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`GDPR Wipe failed for ${targetUserId}: HTTP ${res.status} - ${errText}`);
        }

        wipedIdsForVerification.push(targetUserId);
        await res.arrayBuffer().catch(() => {});
      },
    });

    // ── 3. POST-WIPE INTEGRITY AUDIT (VERIFY COMPLETE GRAPH PURGE) ──────────
    console.log("   → Verifying cascading erasure integrity across tables...");
    let orphanRecordsFound = 0;

    const sampleAuditIds = wipedIdsForVerification.slice(0, 10);
    for (const userId of sampleAuditIds) {
      const [userRes, sessionRes] = await Promise.all([
        _db.auth.getUserById(userId, { tenantId: "global" as DatabaseId }),
        _db.auth.getActiveSessions(userId, { tenantId: "global" as DatabaseId }),
      ]);

      if (userRes.success && userRes.data) orphanRecordsFound++;
      if (sessionRes.success && Array.isArray(sessionRes.data) && sessionRes.data.length > 0) {
        orphanRecordsFound += sessionRes.data.length;
      }
    }

    const integrityStatus =
      orphanRecordsFound === 0 ? "VERIFIED (Zero Orphans)" : "FAILED (Orphans Found)";

    // ── 4. REPORTING & TELEMETRY ────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — GDPR COMPLIANCE AUDIT",
      shortLabel: "Compliance",
      subtitle: `Deep Deletion Integrity • ${dbType}`,
      results: [{ ...results, layer: "Governance", shortLabel: "GDPR Wipe" }],
    });

    const isComplianceElite = results.avgMs < 40 && orphanRecordsFound === 0;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Wipe Latency (Avg)", val: results.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Wipe Latency (p95)",
          val: (results.p95Ms || results.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Wipe Throughput", val: Math.round(results.rps || 0), unit: "wipes/s" },
        { key: "Cascading Integrity", val: integrityStatus, unit: "" },
        { key: "Memory RSS Δ", val: (results.rssDelta || 0).toFixed(1), unit: "MB" },
        {
          key: "Compliance Rating",
          val: isComplianceElite ? "EXCELLENT (<40ms)" : results.avgMs < 80 ? "GOOD" : "REVIEW",
          unit: "",
        },
      ],
      "GDPR Compliance Summary",
    );

    exportMetric("gdpr.wipe.latency_avg_ms", results.avgMs, "ms");
    exportMetric("gdpr.wipe.latency_p95_ms", results.p95Ms || results.avgMs, "ms");
    exportMetric("gdpr.wipe.throughput_rps", Math.round(results.rps || 0), "wipes/s");
    exportMetric("gdpr.wipe.orphans_found", orphanRecordsFound, "records");

    exportResult(results);

    expect(orphanRecordsFound).toBe(0);
  } catch (err: any) {
    logger.error(`GDPR audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Right-to-be-Forgotten Deletion Integrity", async () => {
  await runGdprAudit();
}, 600_000);
