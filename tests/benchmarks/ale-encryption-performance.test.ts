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
import { performance } from "node:perf_hooks";
import { test, describe, expect } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { encryptDocumentFields } from "@utils/security/field-encryption";
import fs from "node:fs";
import path from "node:path";

const COLLECTION_ID = "ale_bench";
const TEST_TENANT = "global";
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

    // ── Prepare collection ────────────────────────────────────────────────
    if (db.collection?.createModel) {
      const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS ${q}collection_${COLLECTION_ID}${q}`));
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
      await db.crud.deleteMany(COLLECTION_ID, {}, { bypassTenantCheck: true, permanent: true });
    } catch {}
    await db.crud.deleteMany(COLLECTION_ID, {}, { bypassTenantCheck: true, permanent: true }).catch(() => {});

    const opts = { bypassCache: true, tenantId: TEST_TENANT };

    async function makeDoc(i: number) {
      return {
        _id: crypto.randomUUID() as any,
        title: `ALE entry ${i}`,
        email: `user${i}@example.com`,
        tenantId: TEST_TENANT,
      };
    }

    // ── Measure one scenario ──────────────────────────────────────────────
    async function measureScenario(scenario: "baseline" | "ale"): Promise<ScenarioResult> {
      const times: number[] = [];
      // warmup
      for (let i = 0; i < WARMUP; i++) {
        const doc: any = await makeDoc(i);
        if (scenario === "ale") {
          await encryptDocumentFields(doc, ENCRYPTED_FIELDS, {
            collectionId: COLLECTION_ID,
            tenantId: TEST_TENANT,
          });
        }
        await db.crud.insert(COLLECTION_ID, doc, opts);
      }
      const cpuBefore = process.cpuUsage();
      const clockStart = performance.now();
      for (let i = 0; i < WRITES; i++) {
        const doc: any = await makeDoc(i);
        const t0 = performance.now();
        if (scenario === "ale") {
          await encryptDocumentFields(doc, ENCRYPTED_FIELDS, {
            collectionId: COLLECTION_ID,
            tenantId: TEST_TENANT,
          });
        }
        await db.crud.insert(COLLECTION_ID, doc, opts);
        times.push(performance.now() - t0);
      }
      const clockEnd = performance.now();
      const cpuAfter = process.cpuUsage();
      const totalMs = clockEnd - clockStart;
      const cpuMs = (cpuAfter.user - cpuBefore.user + cpuAfter.system - cpuBefore.system) / 1000;
      const sorted = [...times].sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const writesPerSec = (WRITES / totalMs) * 1000;
      return {
        scenarios: scenario,
        avgMs: avg,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
        writesPerSec,
        cpuMs,
        cpuPercent: Math.max(0, Math.min(100, (cpuMs / Math.max(totalMs, 1)) * 100)),
        totalMs,
      };
    }

    const runResults: { run: number; baseline: ScenarioResult; ale: ScenarioResult }[] = [];

    for (let run = 1; run <= RUNS; run++) {
      console.log(`\n=== Run ${run}/${RUNS} ===`);
      const baseline = await measureScenario("baseline");
      const ale = await measureScenario("ale");
      runResults.push({ run, baseline, ale });
      console.log(
        `  baseline avg ${fmtDuration(baseline.avgMs)} · ${Math.round(baseline.writesPerSec)} w/s · cpu ${baseline.cpuPercent.toFixed(1)}%`,
      );
      console.log(
        `  ale      avg ${fmtDuration(ale.avgMs)} · ${Math.round(ale.writesPerSec)} w/s · cpu ${ale.cpuPercent.toFixed(1)}%`,
      );
    }

    // ── Aggregate and persist ──────────────────────────────────────────────
    const avgOf = (key: keyof ScenarioResult, arr: ScenarioResult[]) =>
      arr.reduce((a, r) => a + (r[key] as number), 0) / arr.length;

    const baselines = runResults.map((r) => r.baseline);
    const ales = runResults.map((r) => r.ale);

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
      aggregate: {
        baseline: {
          avgMs: avgOf("avgMs", baselines),
          p50Ms: avgOf("p50Ms", baselines),
          p95Ms: avgOf("p95Ms", baselines),
          minMs: avgOf("minMs", baselines),
          maxMs: avgOf("maxMs", baselines),
          writesPerSec: avgOf("writesPerSec", baselines),
          cpuPercent: avgOf("cpuPercent", baselines),
        },
        ale: {
          avgMs: avgOf("avgMs", ales),
          p50Ms: avgOf("p50Ms", ales),
          p95Ms: avgOf("p95Ms", ales),
          minMs: avgOf("minMs", ales),
          maxMs: avgOf("maxMs", ales),
          writesPerSec: avgOf("writesPerSec", ales),
          cpuPercent: avgOf("cpuPercent", ales),
        },
      },
      runs: runResults,
    };

    const base = report.aggregate.baseline;
    const enc = report.aggregate.ale;
    report.aggregate.overhead = {
      avgLatencyDeltaMs: enc.avgMs - base.avgMs,
      avgLatencyPercent: ((enc.avgMs - base.avgMs) / Math.max(base.avgMs, 0.0001)) * 100,
      throughputDropWritesSec: enc.writesPerSec - base.writesPerSec,
      throughputDropPercent: ((enc.writesPerSec - base.writesPerSec) / Math.max(base.writesPerSec, 0.0001)) * 100,
      cpuDeltaPercent: enc.cpuPercent - base.cpuPercent,
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
