/**
 * @file tests/benchmarks/ale-encryption-performance.test.ts
 * @description ALE (Application-Layer Encryption) Performance Impact Benchmark.
 *
 * Measured directly on the dbAdapter layer (db.crud.insert) using real
 * AES-256-GCM field encryption (@utils/security/field-encryption →
 * encryptDocumentFields) to quantify the overhead of field-at-rest encryption.
 *
 * Metrics per scenario (per run, 3 runs):
 *   - Average / p50 / p95 latency per write (ms)
 *   - Throughput (writes/sec)
 *   - CPU time added (process.cpuUsage delta → effective CPU %)
 *
 * Scenarios:
 *   BASELINE  — plaintext write, no field encryption
 *   ALE       — encrypted write (AES-256-GCM over the `email` field)
 */
import { sql } from "drizzle-orm";
import type { DatabaseId } from "@src/content/types";
import { performance } from "node:perf_hooks";
import { test, describe, expect } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { encryptDocumentFields } from "@utils/security/field-encryption";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { generateUUID } from "@utils/native-utils";
import fs from "node:fs";
import path from "node:path";

const COLLECTION_ID = "ale_bench";
const TEST_TENANT = "global" as DatabaseId;

/** Raw-SQL escape hatch used only to reset the benchmark table (best-effort). */
type RawSqlExecutor = { execute: (query: unknown) => Promise<unknown> };
const WRITES = 1000;
const RUNS = 3;
const WARMUP = 100;
const ENCRYPTED_FIELDS = ["email"];

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

interface ScenarioResult {
  scenarios: "baseline" | "ale";
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  writesPerSec: number;
  cpuMs: number;
  cpuPercent: number;
  totalMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function fmtDuration(ms: number) {
  return `${ms.toFixed(3)} ms`;
}

describe("ALE — dbAdapter field-encryption performance impact", () => {
  test("measure ALE overhead vs plaintext on db.crud.insert (3 runs x 1000 writes)", async () => {
    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    if (typeof db.crud?.insert !== "function") throw new Error("crud.insert missing");
    // Narrowed alias: TS does not carry `db`'s non-null narrowing into the nested
    // closures below (measureScenario / warm-up loop).
    const adapter = db;

    // ── Prepare collection ────────────────────────────────────────────────
    if (db.collection?.createModel) {
      const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
      try {
        await (db as unknown as RawSqlExecutor).execute(
          sql.raw(`DROP TABLE IF EXISTS ${q}collection_${COLLECTION_ID}${q}`),
        );
      } catch {}
      await db.collection
        .createModel({
          _id: COLLECTION_ID,
          name: COLLECTION_ID,
          fields: [
            { db_fieldName: "title", widget: { Name: "Input" }, required: true },
            { db_fieldName: "email", widget: { Name: "Input" }, encrypt: true },
            { db_fieldName: "tenantId", widget: { Name: "Input" } },
          ],
        })
        .catch(() => {});
    }
    try {
      await db.crud.deleteMany(
        COLLECTION_ID,
        {},
        withSystemScope("benchmark", { permanent: true }),
      );
    } catch {}
    await db.crud
      .deleteMany(COLLECTION_ID, {}, withSystemScope("benchmark", { permanent: true }))
      .catch(() => {});

    const opts = { bypassCache: true, tenantId: TEST_TENANT };

    async function makeDoc(i: number) {
      return {
        _id: generateUUID() as any,
        title: `ALE entry ${i}`,
        email: `user${i}@example.com`,
        tenantId: TEST_TENANT,
      };
    }

    // ── Measure one scenario ──────────────────────────────────────────────
    // ── Scenario statistics (per arm) ──────────────────────────────────────
    function buildScenarioResult(
      scenario: "baseline" | "ale",
      times: number[],
      totalMs: number,
      cpuMs: number,
    ): ScenarioResult {
      const sorted = [...times].sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return {
        scenarios: scenario,
        avgMs: avg,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
        writesPerSec: (WRITES / totalMs) * 1000,
        cpuMs,
        cpuPercent: Math.max(0, Math.min(100, (cpuMs / Math.max(totalMs, 1)) * 100)),
        totalMs,
      };
    }

    // ── Measure one run — PAIRED, interleaved arms ─────────────────────────
    // The plaintext and encrypted writes alternate within the SAME loop so host
    // drift (GC pauses, scheduler/thermal, page cache) lands on both arms
    // equally instead of on whichever block happened to run second. Per-run
    // deltas are then combined with a median, which residual noise cannot flip
    // to the wrong sign — the old block-sequential mean did, and read −1.8 %.
    async function measurePair(): Promise<{ baseline: ScenarioResult; ale: ScenarioResult }> {
      // Warm up BOTH arms before any timed work (JIT + prepared statements).
      for (let i = 0; i < WARMUP; i++) {
        const plain: any = await makeDoc(i);
        await adapter.crud.insert(COLLECTION_ID, plain, opts);
        const encrypted: any = await makeDoc(i);
        await encryptDocumentFields(encrypted, ENCRYPTED_FIELDS, {
          collectionId: COLLECTION_ID,
          tenantId: TEST_TENANT,
        });
        await adapter.crud.insert(COLLECTION_ID, encrypted, opts);
      }

      const baselineTimes: number[] = [];
      const aleTimes: number[] = [];
      const cpuBefore = process.cpuUsage();
      const clockStart = performance.now();
      for (let i = 0; i < WRITES; i++) {
        const plain: any = await makeDoc(i);
        const plainStart = performance.now();
        await adapter.crud.insert(COLLECTION_ID, plain, opts);
        baselineTimes.push(performance.now() - plainStart);

        const encrypted: any = await makeDoc(i);
        const aleStart = performance.now();
        await encryptDocumentFields(encrypted, ENCRYPTED_FIELDS, {
          collectionId: COLLECTION_ID,
          tenantId: TEST_TENANT,
        });
        await adapter.crud.insert(COLLECTION_ID, encrypted, opts);
        aleTimes.push(performance.now() - aleStart);
      }
      const clockEnd = performance.now();
      const cpuAfter = process.cpuUsage();
      const totalMs = clockEnd - clockStart;
      const cpuMs = (cpuAfter.user - cpuBefore.user + cpuAfter.system - cpuBefore.system) / 1000;
      return {
        baseline: buildScenarioResult("baseline", baselineTimes, totalMs, cpuMs),
        ale: buildScenarioResult("ale", aleTimes, totalMs, cpuMs),
      };
    }

    const runResults: { run: number; baseline: ScenarioResult; ale: ScenarioResult }[] = [];

    for (let run = 1; run <= RUNS; run++) {
      console.log(`\n=== Run ${run}/${RUNS} ===`);
      const { baseline, ale } = await measurePair();
      runResults.push({ run, baseline, ale });
      console.log(
        `  baseline avg ${fmtDuration(baseline.avgMs)} · ${Math.round(baseline.writesPerSec)} w/s · cpu ${baseline.cpuPercent.toFixed(1)}%`,
      );
      console.log(
        `  ale      avg ${fmtDuration(ale.avgMs)} · ${Math.round(ale.writesPerSec)} w/s · cpu ${ale.cpuPercent.toFixed(1)}%`,
      );
    }

    // ── Aggregate and persist ──────────────────────────────────────────────
    // Median across runs for every per-run statistic; the overhead is derived
    // from PAIRED per-run deltas so it reflects the effect, not block drift.
    const medianOf = (values: number[]) => {
      const s = [...values].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
    };
    const medianOfKey = (key: keyof ScenarioResult, arr: ScenarioResult[]) =>
      medianOf(arr.map((r) => r[key] as number));

    const baselines = runResults.map((r) => r.baseline);
    const ales = runResults.map((r) => r.ale);

    const baselineAgg = {
      avgMs: medianOfKey("avgMs", baselines),
      p50Ms: medianOfKey("p50Ms", baselines),
      p95Ms: medianOfKey("p95Ms", baselines),
      minMs: medianOfKey("minMs", baselines),
      maxMs: medianOfKey("maxMs", baselines),
      writesPerSec: medianOfKey("writesPerSec", baselines),
      cpuPercent: medianOfKey("cpuPercent", baselines),
    };
    const aleAgg = {
      avgMs: medianOfKey("avgMs", ales),
      p50Ms: medianOfKey("p50Ms", ales),
      p95Ms: medianOfKey("p95Ms", ales),
      minMs: medianOfKey("minMs", ales),
      maxMs: medianOfKey("maxMs", ales),
      writesPerSec: medianOfKey("writesPerSec", ales),
      cpuPercent: medianOfKey("cpuPercent", ales),
    };

    const perRunLatencyDeltaMs = runResults.map((r) => r.ale.avgMs - r.baseline.avgMs);
    const perRunLatencyPercent = runResults.map(
      (r) => ((r.ale.avgMs - r.baseline.avgMs) / Math.max(r.baseline.avgMs, 0.0001)) * 100,
    );
    const perRunThroughputDelta = runResults.map(
      (r) => r.ale.writesPerSec - r.baseline.writesPerSec,
    );
    const perRunThroughputPercent = runResults.map(
      (r) =>
        ((r.ale.writesPerSec - r.baseline.writesPerSec) /
          Math.max(r.baseline.writesPerSec, 0.0001)) *
        100,
    );
    const overheadAgg = {
      avgLatencyDeltaMs: medianOf(perRunLatencyDeltaMs),
      avgLatencyPercent: medianOf(perRunLatencyPercent),
      throughputDropWritesSec: medianOf(perRunThroughputDelta),
      throughputDropPercent: medianOf(perRunThroughputPercent),
      cpuDeltaPercent: aleAgg.cpuPercent - baselineAgg.cpuPercent,
    };

    const report = {
      project: "SveltyCMS",
      benchmark: "ALE (Application-Layer Encryption) field-at-rest performance impact",
      layer: "dbAdapter (db.crud.insert) + AES-256-GCM field encryption",
      measuredAt: new Date().toISOString(),
      runs: RUNS,
      writesPerRun: WRITES,
      warmup: WARMUP,
      fields: ENCRYPTED_FIELDS,
      dbType: db.type,
      aggregate: { baseline: baselineAgg, ale: aleAgg, overhead: overheadAgg },
      runDetails: runResults,
    };

    const reportPath = path.resolve("tests/benchmarks/results/ale-encryption-performance.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log("\n[Ale-Bench] report written:", reportPath);
    console.log("[Ale-Bench] overhead:", JSON.stringify(report.aggregate.overhead, null, 2));

    expect(runResults.length).toBe(RUNS);
    expect(report.aggregate.overhead.avgLatencyPercent).toBeGreaterThan(0);
  }, 900_000);
});
