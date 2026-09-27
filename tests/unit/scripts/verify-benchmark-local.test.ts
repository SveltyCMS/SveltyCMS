/**
 * @file tests/unit/scripts/verify-benchmark-local.test.ts
 * @description Unit tests for the local benchmark pre-flight: the DB-safety rules and
 * the P95/P99 tail-stability report.
 *
 * The report's contract, pinned here because it was twice wrong in the same way
 * (a verdict that looked measured but was not):
 *
 * 1. **Graded on recorded percentiles only.** The report used to reconstruct
 *    `p50`/`p99` from `avg`/`p95`/`cv` when the JSON lacked them and then classify on
 *    those estimates. A row without a recorded distribution now reports
 *    `UNMEASURED` with the reason — never an estimated band.
 * 2. **Discovered by content, not filename.** It used to read ten hardcoded
 *    filenames from an older metric-naming scheme (`findById__Sequential_.json`),
 *    which the harness stopped writing: every row silently graded a month-old file.
 *    Rows are selected by `testFile` and only the newest `runId` is graded.
 * 3. **A proportion needs a sample.** Fewer than 100 iterations makes the "99th
 *    percentile" the maximum, so such a row carries no verdict.
 * 4. **The ratio column is empty ⟺ no verdict.** A displayed ratio can never be read
 *    as a percentile claim the row does not satisfy.
 * 5. **Aggregate rows are excluded, not failed.** A p50 of 0 ms is not a latency
 *    distribution (the seed burst reports one total for a batch); it is listed as
 *    excluded instead of counting as "unmeasured", which would make `--strict`
 *    unpassable by construction.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { isConfigSourceSafeForTesting, isUnsafeLiveDeveloperDbName } from "@utils/test-db-safety";
import { getBenchmarkDbName } from "@utils/test-db-credentials";
import {
  generateLatencyVarianceReportFromDir,
  latencyVariancePasses,
  printLatencyVarianceReport,
  type LatencyVarianceSummary,
} from "../../../scripts/verify-benchmark-local";

// ── Fixtures ────────────────────────────────────────────────────────────────

const REPLICA = "competitive-workload-replica";
const scratchDirs: string[] = [];

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

/** A recorded workload row, shaped like the harness's `exportResult()` output. */
function recordedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    testFile: REPLICA,
    runId: "run-new",
    metric: "findById (Warm Sequential)",
    timestamp: "2026-09-27T19:36:00.000Z",
    avgMs: 1,
    p50Ms: 0.5,
    p95Ms: 1,
    p99Ms: 1,
    iterations: 500,
    cv: 10,
    rps: 1000,
    ...overrides,
  };
}

/** Writes result JSONs (or raw strings) into a fresh scratch results directory. */
function resultsDir(files: Record<string, Record<string, unknown> | string>): string {
  const dir = mkdtempSync(join(tmpdir(), "svelty-variance-"));
  scratchDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

/** Days-age of an ISO timestamp, matching the report's own definition. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function summaryOf(overrides: Partial<LatencyVarianceSummary> = {}): LatencyVarianceSummary {
  return {
    db: "sqlite",
    totalWorkloads: 0,
    excellentCount: 0,
    acceptableCount: 0,
    watchCount: 0,
    highVarianceCount: 0,
    unmeasuredCount: 0,
    maxTailRatio: 0,
    worstWorkload: "none",
    oldestSampleDays: null,
    runId: null,
    sampledAt: null,
    excludedRows: [],
    ...overrides,
  };
}

// ── DB-safety rules ─────────────────────────────────────────────────────────

describe("verify-benchmark-local safety rules", () => {
  it("flags benchmark_shared as unsafe in live private.ts context", () => {
    const dbName = getBenchmarkDbName("sqlite");
    expect(dbName).toBe("benchmark_shared");
    expect(isUnsafeLiveDeveloperDbName(dbName)).toBe(true);
    expect(isConfigSourceSafeForTesting(`DB_NAME: '${dbName}'`).safe).toBe(true);
  });

  it("allows isolated test config names in private.test.ts", () => {
    expect(isConfigSourceSafeForTesting("DB_NAME: 'sveltycms_test'").safe).toBe(true);
  });

  it("rejects sveltycms_test in live developer config", () => {
    expect(isUnsafeLiveDeveloperDbName("sveltycms_test")).toBe(true);
  });
});

// ── The report ──────────────────────────────────────────────────────────────

describe("variance report — grades the recorded percentiles", () => {
  it("grades on the absolute tail excess, and reports it", () => {
    // p99 − p50 = 1.4 ms → ACCEPTABLE (the ratio 1.7× alone would have said EXCELLENT;
    // the absolute excess is what a caller feels, and it is the graded quantity).
    const dir = resultsDir({
      "findById__Warm_Sequential_.json": recordedRow({ p50Ms: 2, p99Ms: 3.4 }),
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("ACCEPTABLE");
    expect(items[0]!.tailRatio).toBe(1.7);
    expect(items[0]!.tailExcessMs).toBe(1.4);
    expect(items[0]!.samples).toBe(500);
    expect(items[0]!.runsUsed).toBe(1);
  });

  it.each([
    [1.5, "EXCELLENT"],
    [2.5, "ACCEPTABLE"],
    [4.0, "WATCH"],
    [6.0, "HIGH_VARIANCE"],
  ])("maps a recorded p99 of %s ms (p50 = 1 ms) onto %s", (p99, expected) => {
    const dir = resultsDir({
      "create__Warm_Concurrent_8c_.json": recordedRow({
        metric: "create (Warm 8c)",
        p50Ms: 1,
        p99Ms: p99,
      }),
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items[0]!.status).toBe(expected);
    expect(items[0]!.tailRatio).toBe(p99);
  });

  it("never reconstructs p50/p99 from avg/p95/cv (the estimator regression)", () => {
    // The exact August row whose fabricated percentiles produced a 🔴 verdict:
    // avg 0.762 / p95 1.912 / cv 52.68 → the old formulas yielded p50 0.73, p99 3.68.
    const dir = resultsDir({
      "findById__Sequential_.json": {
        testFile: REPLICA,
        runId: "run-old",
        metric: "findById (Sequential)",
        timestamp: daysAgo(30),
        avgMs: 0.762,
        p95Ms: 1.912,
        cv: 52.68,
        rps: 1302.6,
      },
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("UNMEASURED");
    expect(items[0]!.note).toMatch(/no recorded p50\/p99/);
    expect(items[0]!.p50Ms).toBeNull();
    expect(items[0]!.p99Ms).toBeNull();
    expect(items[0]!.tailRatio).toBeNull();
    expect(items[0]!.p50Ms).not.toBeCloseTo(0.73, 2);
    expect(items[0]!.p99Ms).not.toBeCloseTo(3.68, 2);
  });

  it("refuses to grade fewer than 100 samples, where p99 is the maximum", () => {
    const dir = resultsDir({
      "a.json": recordedRow({ metric: "under-sampled", iterations: 40, p50Ms: 1, p99Ms: 2 }),
      "b.json": recordedRow({ metric: "at-threshold", iterations: 100, p50Ms: 1, p99Ms: 2 }),
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");
    const byName = new Map(items.map((item) => [item.workload, item]));

    expect(byName.get("under-sampled")!.status).toBe("UNMEASURED");
    expect(byName.get("under-sampled")!.note).toMatch(/needs ≥100 samples/);
    expect(byName.get("under-sampled")!.tailRatio).toBeNull();
    // 100 samples is enough, and p99 − p50 = 1 ms is exactly the EXCELLENT bound.
    expect(byName.get("at-threshold")!.status).toBe("EXCELLENT");
    expect(byName.get("at-threshold")!.tailRatio).toBe(2);
  });

  it("grades the ensemble median of the last runs, not one run's maximum", () => {
    // The same metric across three recorded runs: p99 = 2, 3 and 9 ms. A single run
    // would grade the 9 ms outlier; the ensemble grades the median (3 ms → excess 2 ms
    // → ACCEPTABLE) and reports how many runs backed it.
    const runs = [2, 3, 9].map((p99, index) => ({
      runId: `run-${index}`,
      sampledAt: new Date(Date.now() - (3 - index) * 60_000).toISOString(),
      rows: [
        {
          metric: "update (Warm Concurrent 8c)",
          avgMs: 1,
          p50Ms: 1,
          p95Ms: 1.5,
          p99Ms: p99,
          samples: 500,
          cvPct: 20,
          slowRatePer1000: 0,
        },
      ],
    }));
    const dir = resultsDir({
      "variance-history.json": JSON.stringify({ runs: runs.slice(0, 2) }),
      "a.json": recordedRow({
        runId: "run-2",
        metric: "update (Warm Concurrent 8c)",
        p50Ms: 1,
        p99Ms: 9,
        timestamp: new Date().toISOString(),
      }),
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items[0]!.runsUsed).toBe(3);
    expect(items[0]!.p99Ms).toBe(3);
    expect(items[0]!.tailExcessMs).toBe(2);
    expect(items[0]!.status).toBe("ACCEPTABLE");
  });

  it("grades a metric the same way whether or not an older run is on disk", () => {
    const dir = resultsDir({ "a.json": recordedRow({ p50Ms: 1, p99Ms: 1.5 }) });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items[0]!.status).toBe("EXCELLENT");
    expect(items[0]!.runsUsed).toBe(1);
  });
});

describe("variance report — discovery and run selection", () => {
  it("discovers rows by testFile, not by filename", () => {
    const dir = resultsDir({
      // Same metric name as the fossil, but a different producer: must be ignored.
      "findById__Warm_Sequential_.json": recordedRow({ testFile: "cache-hit-ratio" }),
      "totally-unrelated-name.json": recordedRow({ metric: "listPlain (Warm Sequential)" }),
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items.map((item) => item.workload)).toEqual(["listPlain (Warm Sequential)"]);
  });

  it("grades only the newest run, so superseded metric names cannot resurface", () => {
    const dir = resultsDir({
      "old-a.json": recordedRow({
        runId: "run-old",
        metric: "findById (Sequential)",
        timestamp: daysAgo(30),
        p50Ms: 1,
        p99Ms: 9,
      }),
      "new-a.json": recordedRow({
        runId: "run-new",
        metric: "findById (Warm Sequential)",
        timestamp: daysAgo(0.1),
      }),
    });

    const { items, summary } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items.map((item) => item.workload)).toEqual(["findById (Warm Sequential)"]);
    expect(summary.runId).toBe("run-new");
    expect(summary.totalWorkloads).toBe(1);
  });

  it("skips corrupt JSON and non-result artifacts without throwing", () => {
    const dir = resultsDir({
      "matrix_metrics.json": "{ not json",
      "soak.log": "irrelevant",
      "valid.json": recordedRow(),
    });

    const { items } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items).toHaveLength(1);
  });

  it("reports the age of the graded run", () => {
    const dir = resultsDir({ "a.json": recordedRow({ timestamp: daysAgo(30) }) });

    const { items, summary } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items[0]!.ageDays).toBeCloseTo(30, 0);
    expect(summary.oldestSampleDays).toBeCloseTo(30, 0);
  });

  it("returns an empty report for a directory with no replica rows", () => {
    const dir = resultsDir({ "a.json": recordedRow({ testFile: "relational-performance" }) });

    const { items, summary } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items).toEqual([]);
    expect(summary.totalWorkloads).toBe(0);
    expect(summary.runId).toBeNull();
  });
});

describe("variance report — counts, exclusions and the strict gate", () => {
  it("counts every band in the summary", () => {
    const dir = resultsDir({
      "1.json": recordedRow({ metric: "excellent", p50Ms: 1, p99Ms: 1.5 }),
      "2.json": recordedRow({ metric: "acceptable", p50Ms: 1, p99Ms: 2.5 }),
      "3.json": recordedRow({ metric: "watch", p50Ms: 1, p99Ms: 4 }),
      "4.json": recordedRow({ metric: "alert", p50Ms: 1, p99Ms: 6 }),
      "5.json": recordedRow({ metric: "unmeasured", p50Ms: undefined, p99Ms: undefined }),
    });

    const { summary } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(summary.totalWorkloads).toBe(5);
    expect(summary.excellentCount).toBe(1);
    expect(summary.acceptableCount).toBe(1);
    expect(summary.watchCount).toBe(1);
    expect(summary.highVarianceCount).toBe(1);
    expect(summary.unmeasuredCount).toBe(1);
    expect(summary.maxTailRatio).toBe(6);
    expect(summary.worstWorkload).toBe("alert");
  });

  it("excludes aggregate rows (p50 = 0) instead of failing them as unmeasured", () => {
    const dir = resultsDir({
      "seed.json": recordedRow({ metric: "Seed Burst (500 docs, HTTP)", p50Ms: 0, p99Ms: 0 }),
      "read.json": recordedRow({ metric: "findById (Warm Sequential)" }),
    });

    const { items, summary } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(items.map((item) => item.workload)).toEqual(["findById (Warm Sequential)"]);
    expect(summary.excludedRows).toEqual([
      "Seed Burst (500 docs, HTTP) — p50 is 0 ms (aggregate row, not a per-request distribution)",
    ]);
    expect(summary.unmeasuredCount).toBe(0);
  });

  it("does not count an ungraded row's ratio towards the peak", () => {
    const dir = resultsDir({
      "graded.json": recordedRow({ metric: "graded", p50Ms: 1, p99Ms: 1.5 }),
      "short.json": recordedRow({ metric: "short", iterations: 20, p50Ms: 1, p99Ms: 9 }),
    });

    const { summary } = generateLatencyVarianceReportFromDir(dir, "sqlite");

    expect(summary.maxTailRatio).toBe(1.5);
    expect(summary.worstWorkload).toBe("graded");
  });

  it("fails --strict on a 🔴 tail or an unmeasured row, and passes on 🟢/🔵/🟡", () => {
    expect(latencyVariancePasses(summaryOf({ excellentCount: 3, watchCount: 2 }))).toBe(true);
    expect(latencyVariancePasses(summaryOf({ highVarianceCount: 1 }))).toBe(false);
    expect(latencyVariancePasses(summaryOf({ unmeasuredCount: 1 }))).toBe(false);
    // Exclusions are structural — they never fail the gate.
    expect(latencyVariancePasses(summaryOf({ excludedRows: ["Seed Burst — p50 is 0 ms"] }))).toBe(
      true,
    );
  });
});

describe("variance report — the printed table", () => {
  const logged: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    logged.length = 0;
  });

  /** Renders the report for a fixture directory and returns its lines. */
  function render(dir: string): string[] {
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.join(" "));
    });
    printLatencyVarianceReport("sqlite", dir);
    return logged;
  }

  it("prints real percentiles, the sample count and both tail measures", () => {
    const dir = resultsDir({
      "a.json": recordedRow({
        metric: "mixed (Warm Sequential)",
        p50Ms: 2,
        p99Ms: 12,
        iterations: 400,
      }),
    });

    const lines = render(dir);
    const metricLine = lines.find((line) => line.startsWith("mixed (Warm Sequential)"))!;

    expect(lines.join("\n")).toContain("P99-P50");
    expect(metricLine).toContain("400");
    expect(metricLine).toContain("12ms");
    expect(metricLine).toContain("+10ms");
    expect(metricLine).toContain("6x");
    expect(metricLine).toContain("🔴 JITTER ALERT");
  });

  it("never prints NaN — the footer counts must interpolate as numbers", () => {
    const dir = resultsDir({
      "1.json": recordedRow({ metric: "excellent", p50Ms: 1, p99Ms: 1.5 }),
      "2.json": recordedRow({ metric: "alert", p50Ms: 1, p99Ms: 6 }),
    });

    const lines = render(dir);
    const footer = lines.find((line) => line.includes("Total:"))!;

    expect(lines.join("\n")).not.toContain("NaN");
    expect(footer).toContain("🟢 1");
    expect(footer).toContain("🔴 1");
    expect(footer).toContain("⚪ 0 unmeasured");
    expect(footer).toContain("Peak Tail Ratio: 6x");
  });

  it("names the graded run and shows the reasons for every ungraded row", () => {
    const dir = resultsDir({
      "a.json": recordedRow({ metric: "graded", p50Ms: 1, p99Ms: 1.5 }),
      "b.json": recordedRow({ metric: "no percentiles", p50Ms: undefined, p99Ms: undefined }),
      "c.json": recordedRow({ metric: "Seed Burst (500 docs, HTTP)", p50Ms: 0, p99Ms: 0 }),
    });

    const lines = render(dir);
    const output = lines.join("\n");

    expect(output).toContain("run run-new");
    // The excluded aggregate row is listed separately — it is not a workload verdict.
    expect(output).toContain("2 workloads");
    expect(output).toContain("no recorded p50/p99");
    expect(output).toContain("⏭ excluded — Seed Burst (500 docs, HTTP)");
  });

  it("returns the strict verdict, so a 🔴 run cannot pass unnoticed", () => {
    const redDir = resultsDir({ "a.json": recordedRow({ p50Ms: 1, p99Ms: 6 }) });
    const greenDir = resultsDir({ "a.json": recordedRow({ p50Ms: 1, p99Ms: 1.5 }) });

    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(printLatencyVarianceReport("sqlite", redDir)).toBe(false);
    expect(printLatencyVarianceReport("sqlite", greenDir)).toBe(true);
  });
});
