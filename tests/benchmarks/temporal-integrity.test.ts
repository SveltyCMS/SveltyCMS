/**
 * @file tests/benchmarks/temporal-integrity.test.ts
 * @description Temporal Integrity & UTC Normalization Audit (Optimized)
 * @summary Validates deterministic UTC normalization of ISO date strings across timezone offsets for consistent persistence.
 *
 * ### Features:
 * - Multi-timezone date persistence verification (UTC, EST, JST)
 * - ISO 8601 date string normalization to UTC (Z) suffix
 * - Cache-bypassed read-back validation for temporal integrity
 */

import {
  test,
  expect,
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
  process.stderr.write("🚀 Starting Enterprise Temporal Integrity Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    // Cache static immutable parameters outside the hot loop tracks
    const baseHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "x-tenant-id": "global",
    };

    const patchHeaders = {
      "Content-Type": "application/json",
      ...baseHeaders,
    };

    await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}?limit=10&bypassCache=true`, {
      headers: baseHeaders,
    });

    console.log("   → Testing persistence of ISO Dates from various timezone offsets...");

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

    // Pre-serialize payload configurations to minimize inline engine processing noise
    const pregeneratedPayloads = testDates.map((td) => JSON.stringify({ publishDate: td.input }));

    let failures = 0;
    const t0 = performance.now();

    for (let i = 0; i < testDates.length; i++) {
      const td = testDates[i]!;
      const bodyPayload = pregeneratedPayloads[i]!;

      const res = await fetch(
        `${baseUrl}/api/collections/${COLLECTION_ID}/bench-shared-001?bypassCache=true`,
        {
          method: "PATCH",
          headers: patchHeaders,
          body: bodyPayload,
        },
      );

      if (!res.ok) {
        console.warn(`   [WARN] Patch failed for ${td.name}: ${res.status}`);
        failures++;
        continue;
      }

      const patchData = await res.json().catch(() => ({}));
      const patchEntry = patchData?.data ?? patchData;
      let returnedDate: string | undefined =
        patchEntry?.publishDate ?? patchEntry?.data?.publishDate;

      // Fallback query if data structure is missing from immediate PATCH return payload
      if (!returnedDate) {
        const getRes = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}/bench-shared-001?bypassCache=true`,
          { headers: baseHeaders },
        );

        const data = await getRes.json().catch(() => ({}));
        const entry = data?.data ?? data;
        returnedDate = entry?.publishDate ?? entry?.data?.publishDate;
      }

      if (!returnedDate) {
        console.warn(
          `   [WARN] publishDate not found in response for ${td.name}. The field may not be indexed correctly.`,
        );
        failures++;
        continue;
      }

      const normalizedReturned = new Date(returnedDate).toISOString();
      const normalizedExpected = new Date(td.expected).toISOString();

      // Wrapped assertion trace inside clean validation traps to protect test runner stability
      if (normalizedReturned !== normalizedExpected) {
        console.error(
          `   [FAIL] Temporal divergence on ${td.name}: Expected ${normalizedExpected}, got ${normalizedReturned}`,
        );
        failures++;
      }
    }

    // Explicitly check condition bounds outside loop step assignments
    expect(failures).toBe(0);

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
