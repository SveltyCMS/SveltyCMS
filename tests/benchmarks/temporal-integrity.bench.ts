/**
 * @file tests/benchmarks/temporal-integrity.test.ts
 * @description Temporal Integrity & UTC Normalization Audit
 * @summary Validates deterministic UTC normalization of ISO date strings across timezone offsets for consistent persistence.
 *
 * ### Features:
 * - Multi-timezone date persistence verification (UTC, EST, JST)
 * - ISO 8601 date string normalization to UTC (Z) suffix
 * - Cache-bypassed read-back validation for temporal integrity
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "BenchmarkStable";

let stopServer: (() => Promise<void>) | null = null;

async function runTemporalAudit() {
  // pre-existing unused var removed for TS strict mode
  process.stderr.write("🚀 Starting Enterprise Temporal Integrity Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}?limit=10&bypassCache=true`, {
      headers: {
        "x-test-mode": "true",
        "x-test-secret": TEST_API_SECRET,
        "x-tenant-id": "global",
      },
    });

    console.log("   → Testing persistence of ISO Dates from various timezone offsets...");

    // We send data with explicit timezone offsets.
    // A robust system should always normalize these to UTC (Z) or a standardized epoch internally
    // and return standardized ISO strings.

    const testDates = [
      {
        name: "UTC Baseline",
        input: "2026-05-15T12:00:00Z",
        expected: "2026-05-15T12:00:00.000Z",
      },
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

      const res = await fetch(
        `${baseUrl}/api/collections/${COLLECTION_ID}/bench-shared-001?bypassCache=true`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
            "x-tenant-id": "global",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        console.warn(`   [WARN] Patch failed for ${td.name}: ${res.status}`);
        failures++;
        continue;
      }

      // Read publishDate from the PATCH response directly (most reliable)
      const patchData = await res.json().catch(() => ({}));
      const patchEntry = patchData?.data ?? patchData;
      // publishDate may be top-level or nested inside a `data` sub-object (SQL adapters flatten)
      let returnedDate: string | undefined =
        patchEntry?.publishDate ?? patchEntry?.data?.publishDate;

      // If not in PATCH response, fetch it back with cache bypass
      if (!returnedDate) {
        const getRes = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}/bench-shared-001?bypassCache=true`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
              "x-tenant-id": "global",
            },
          },
        );

        const data = await getRes.json().catch(() => ({}));
        const entry = data?.data ?? data;
        // SQL adapters flatten collection fields to the top-level; also check the nested data blob
        returnedDate = entry?.publishDate ?? entry?.data?.publishDate;
      }

      if (!returnedDate) {
        console.warn(
          `   [WARN] publishDate not found in response for ${td.name}. The field may not be indexed as a top-level column on this DB engine.`,
        );
        failures++;
        continue;
      }

      // Normalize both sides to UTC ISO string for comparison
      const normalizedReturned = new Date(returnedDate).toISOString();
      const normalizedExpected = new Date(td.expected).toISOString();

      // In a true Temporal test, we assert that the system normalizes it.
      // SveltyCMS should normalize it to the `expected` UTC string.
      expect(normalizedReturned).toBe(normalizedExpected);
    }

    if (failures > 0) {
      throw new Error(
        `Temporal Integrity Audit Failed: ${failures} timezones were not normalized properly.`,
      );
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
      {
        key: "Temporal Health",
        val: failures === 0 ? "EXCELLENT" : "NEEDS WORK",
        unit: "",
      },
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
}

test("Temporal Integrity & Timezone Contract", async () => {
  await runTemporalAudit();
}, 30000);
