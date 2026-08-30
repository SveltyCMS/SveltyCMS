/**
 * @file tests/benchmarks/temporal-integrity.test.ts
 * @description Temporal Integrity & UTC Normalization Audit (Optimized)
 * @summary Validates strict backend UTC normalization (ISO 8601 with trailing 'Z') across global timezone offsets, fractional timezones, and midnight transitions.
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
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "BenchmarkStable";
const TARGET_DOC_ID = "20000000-0000-4000-8000-000000000001";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

interface TemporalTestCase {
  name: string;
  input: string;
  expectedStrictUtc: string;
  description: string;
}

const TEMPORAL_TEST_MATRIX: TemporalTestCase[] = [
  {
    name: "UTC Baseline",
    input: "2026-05-15T12:00:00Z",
    expectedStrictUtc: "2026-05-15T12:00:00.000Z",
    description: "Standard canonical UTC string with zero offset",
  },
  {
    name: "EST (UTC-5)",
    input: "2026-05-15T07:00:00-05:00",
    expectedStrictUtc: "2026-05-15T12:00:00.000Z",
    description: "Western hemisphere negative integer offset",
  },
  {
    name: "JST (UTC+9)",
    input: "2026-05-15T21:00:00+09:00",
    expectedStrictUtc: "2026-05-15T12:00:00.000Z",
    description: "Eastern hemisphere positive integer offset",
  },
  {
    name: "IST (UTC+5:30)",
    input: "2026-05-15T17:30:00+05:30",
    expectedStrictUtc: "2026-05-15T12:00:00.000Z",
    description: "Fractional half-hour offset normalization",
  },
  {
    name: "NPT (UTC+5:45)",
    input: "2026-05-15T17:45:00+05:45",
    expectedStrictUtc: "2026-05-15T12:00:00.000Z",
    description: "Fractional 45-minute offset normalization",
  },
  {
    name: "Midnight Rollover (UTC-8)",
    input: "2026-05-14T16:00:00-08:00",
    expectedStrictUtc: "2026-05-15T00:00:00.000Z",
    description: "Day-boundary crossing into next calendar day",
  },
];

async function runTemporalAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Temporal Integrity Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    // 🛡️ SCHEMA PROVISIONING: BenchmarkStable must declare publishDate in its
    // physical collection schema — otherwise the PATCH pipeline silently strips
    // the property and the read-back returns the previous testcase value (a
    // false "contract violation" caused by a missing field, not a date bug).
    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();

    if (db) {
      // 🛡️ FULL SCHEMA: keep `publishDate` (DateTime) declared for the PATCH
      // normalization contract, but preserve the other physical fields too — a
      // reduced schema here would drop `count`/`slug`/etc. from the shared DB
      // registry and break later matrix tests (same isolation bug class as
      // local-api-throughput's old BenchmarkStable re-provision).
      await db.collection
        .createModel({
          _id: COLLECTION_ID,
          name: COLLECTION_ID,
          fields: [
            { db_fieldName: "_id", label: "ID", widget: { Name: "Input" }, type: "string" },
            { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
            { db_fieldName: "slug", label: "Slug", widget: { Name: "Input" }, type: "string" },
            {
              db_fieldName: "content",
              label: "Content",
              widget: { Name: "RichText" },
              type: "string",
            },
            { db_fieldName: "count", label: "Count", widget: { Name: "Input" }, type: "number" },
            {
              db_fieldName: "publishDate",
              label: "Publish Date",
              widget: { Name: "DateTime" },
              type: "string",
            },
          ],
        } as any)
        .catch(() => {});
    }

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    const patchHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...baseHeaders,
    };

    const itemUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${TARGET_DOC_ID}`;
    // 🚨 CACHE-BUSTED READ-BACK: `?bypassCache=true` is NOT a cache bypass on
    // the turbo response-cache (it keys on the full query string, so the same
    // URL returns the STALE pre-PATCH hit). A unique per-read query parameter
    // forces a fresh dispatch every time — otherwise the test would read the
    // previous testcase's date and report a phantom contract violation.
    let readSeq = 0;

    // ── 1. EXACT STRING VERBATIM NORMALIZATION VERIFICATION ─────────────────
    console.log("   → 1. Verifying Strict UTC Normalization Contract across Timezones...");
    let contractFailures = 0;
    const failureDetails: string[] = [];

    for (const testCase of TEMPORAL_TEST_MATRIX) {
      const res = await fetch(itemUrl, {
        method: "PATCH",
        headers: patchHeaders,
        body: JSON.stringify({ publishDate: testCase.input }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        contractFailures++;
        failureDetails.push(`${testCase.name}: HTTP ${res.status}`);
        continue;
      }

      // Read back with a UNIQUE cache-buster to verify physical storage layout
      const readRes = await fetch(`${itemUrl}?cb=${++readSeq}`, {
        method: "GET",
        headers: baseHeaders,
        signal: AbortSignal.timeout(10_000),
      });

      const readData = (await readRes.json()) as any;
      const entry = readData?.data ?? readData;
      const rawStoredDate: string | undefined = entry?.publishDate ?? entry?.data?.publishDate;

      if (!rawStoredDate) {
        contractFailures++;
        failureDetails.push(`${testCase.name}: Field 'publishDate' was not persisted`);
        continue;
      }

      // 🎯 EXACT VERBATIM STRING COMPARISON — the client must NOT re-parse the
      // value with `new Date(...).toISOString()` (that would mask backend
      // normalization bugs like unnormalized local offsets or epoch timestamps).
      // The backend contract is a strict ISO-8601 UTC string with .000 precision.
      if (rawStoredDate !== testCase.expectedStrictUtc) {
        contractFailures++;
        failureDetails.push(
          `${testCase.name}: Expected literal "${testCase.expectedStrictUtc}", but got "${rawStoredDate}"`,
        );
      }
    }

    if (contractFailures > 0) {
      console.error("❌ Temporal Contract Violations Detected:\n", failureDetails.join("\n"));
    }

    // ── 2. TEMPORAL INGESTION THROUGHPUT BENCHMARK ──────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 2. Benchmarking Timezone Parsing & Normalization Throughput...");
    const precomputedBodies = TEMPORAL_TEST_MATRIX.map((tc) =>
      JSON.stringify({ publishDate: tc.input }),
    );
    const precomputedUrls = TEMPORAL_TEST_MATRIX.map((_tc) => `${itemUrl}?cb=${readSeq++}`);
    let matrixCursor = 0;

    const benchmarkResult = await runBenchmark({
      name: "Temporal Ingestion & Normalization",
      iterations: 300,
      warmupIterations: 30,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const payload = precomputedBodies[matrixCursor % precomputedBodies.length]!;
        const url = precomputedUrls[matrixCursor % precomputedUrls.length]!;
        matrixCursor++;

        const res = await fetch(url, {
          method: "PATCH",
          headers: patchHeaders,
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Temporal ingestion HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    // ── 3. REPORTING & TELEMETRY ────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — TEMPORAL INTEGRITY AUDIT",
      shortLabel: "Temporal",
      subtitle: `Timezone Normalization (${TEMPORAL_TEST_MATRIX.length} Offsets) • ${dbType}`,
      results: [{ ...benchmarkResult, layer: "Data Contract", shortLabel: "UTC Ingestion" }],
    });

    const isContractCompliant = contractFailures === 0;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Timezone Offsets Tested", val: TEMPORAL_TEST_MATRIX.length, unit: "zones" },
        { key: "Fractional Timezones Tested", val: "IST (+5:30), NPT (+5:45)", unit: "" },
        { key: "Contract Violations", val: contractFailures, unit: "" },
        {
          key: "Normalization Ingestion Latency",
          val: benchmarkResult.avgMs.toFixed(2),
          unit: "ms",
        },
        {
          key: "Normalization Ingestion p95",
          val: (benchmarkResult.p95Ms || benchmarkResult.avgMs).toFixed(2),
          unit: "ms",
        },
        {
          key: "Ingestion Throughput",
          val: Math.round(benchmarkResult.rps || 0),
          unit: "writes/s",
        },
        {
          key: "Temporal Contract Health",
          val: isContractCompliant ? "VERIFIED (Strict UTC .000Z)" : "FAILED (Divergence)",
          unit: "",
        },
      ],
      "Temporal Integrity Summary",
    );

    exportMetric("temporal.normalization_latency_ms", benchmarkResult.avgMs, "ms");
    exportMetric(
      "temporal.normalization_p95_ms",
      benchmarkResult.p95Ms || benchmarkResult.avgMs,
      "ms",
    );
    exportMetric("temporal.contract_failures", contractFailures, "");
    exportMetric("temporal.throughput_rps", Math.round(benchmarkResult.rps || 0), "writes/s");

    exportResult(benchmarkResult);

    expect(contractFailures).toBe(0);
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
}, 60_000);
