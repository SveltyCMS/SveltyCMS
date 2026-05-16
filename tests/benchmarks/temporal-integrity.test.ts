/**
 * @file tests/benchmarks/temporal-integrity.test.ts
 * @description Enterprise Temporal Integrity Audit.
 * Simulates workflow actions across different "time zones" or artificial times
 * to prove that the CMS engine uses deterministic UTC timing for persistence.
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET
} from "./benchmark-utils";
import "../unit/setup.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "BenchmarkStable";

let stopServer: (() => Promise<void>) | null = null;

async function runTemporalAudit() {
  process.stderr.write("🚀 Starting Enterprise Temporal Integrity Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    process.stderr.write("[DEBUG] Calling ensureStableTestData...\n");
    await ensureStableTestData();

    const listRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}?limit=10`, {
      headers: {
        "x-test-mode": "true",
        "x-test-secret": TEST_API_SECRET,
        "x-tenant-id": "global",
      },
    });
    const listData = await listRes.json();
    console.log(`[DEBUG] Initial Collection List (${COLLECTION_ID}):`, JSON.stringify(listData, null, 2));

    console.log("   → Testing persistence of ISO Dates from various timezone offsets...");

    // We send data with explicit timezone offsets.
    // A robust system should always normalize these to UTC (Z) or a standardized epoch internally
    // and return standardized ISO strings.

    const testDates = [
      { name: "UTC Baseline", input: "2026-05-15T12:00:00Z", expected: "2026-05-15T12:00:00.000Z" },
      {
        name: "EST (UTC-5)",
        input: "2026-05-15T07:00:00-05:00",
        expected: "2026-05-15T12:00:00.000Z",
      },
      {
        name: "JST (UTC+9)",
        input: "2026-05-15T21:00:00+09:00",
        expected: "2026-05-15T12:00:00.000Z",
      },
    ];

    let failures = 0;
    const t0 = performance.now();

    for (const td of testDates) {
      const payload = {
        publishDate: td.input,
      };

      const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/bench-shared-001`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
          "x-tenant-id": "global",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.warn(`   [WARN] Patch failed for ${td.name}: ${res.status}`);
        failures++;
        continue;
      }

      // Fetch it back
      const getRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/bench-shared-001`, {
        headers: {
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
          "x-tenant-id": "global",
        },
      });

      const data = await getRes.json();
      const entry = data.data;
      console.log(`[DEBUG] Entry keys for ${td.name}:`, entry ? Object.keys(entry) : "null");
      const returnedDate = entry?.publishDate;

      // In a true Temporal test, we assert that the system normalizes it.
      // SveltyCMS should normalize it to the `expected` UTC string.
      expect(returnedDate).toBe(td.expected);
    }

    if (failures > 0) {
      throw new Error(`Temporal Integrity Audit Failed: ${failures} timezones were not normalized properly.`);
    }

    const duration = performance.now() - t0;

    printTruthTable({
      title: "SVELTYCMS — TEMPORAL INTEGRITY",
      shortLabel: "Temporal",
      subtitle: `Timezone Normalization • ${getDbType().toUpperCase()}`,
      results: [
        {
          name: "Timezone Ingestion",
          avgMs: duration / testDates.length,
          p95Ms: duration / testDates.length,
          rps: (testDates.length / duration) * 1000,
          layer: "Data Integrity",
        },
      ],
    });

    printSummaryTable([
      { key: "Timezones Tested", val: testDates.length, unit: "zones" },
      { key: "Failures", val: failures, unit: "" },
      { key: "Temporal Health", val: failures === 0 ? "EXCELLENT" : "NEEDS WORK", unit: "" },
    ]);
  } catch (err: any) {
    logger.error(`Temporal audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Temporal audit completed.");
}

test("Temporal Integrity & Timezone Contract", async () => {
  await runTemporalAudit();
}, 30000);
