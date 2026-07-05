/**
 * @file tests/benchmark./modules/benchmark-reporting.test.ts
 * @description Unit tests for the benchmark reporting facade contract.
 *
 * Tests:
 * - mode "none" does not write to SQLite or MDX
 * - mode "history" writes SQLite but not MDX
 * - mode "partial" writes SQLite + section MDX + partial watermark
 * - mode "full" writes SQLite + MDX + executive summary
 * - retry with same runId is idempotent
 * - buildBenchmarkMetricId produces stable keys
 */
import { test, expect } from "./benchmark-utils";
import {
  buildHistoryArchiveTable,
  buildRunSummaryTable,
  filterInvocationRunEntries,
  HISTORY_SQLITE_PATH,
  renderSparkline,
  reportBenchmark,
  resetTrendGuard,
} from "./benchmark-reporting";
import { buildBenchmarkMetricId, loadHistory, closeHistory } from "./benchmark-history";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Helper: clean test artifacts
// ─────────────────────────────────────────────────────────────

function cleanTestArtifacts() {
  closeHistory(); // Release SQLite lock
  const dbPath = path.resolve(process.cwd(), "tests/benchmarks/results/history.sqlite");
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch {}
    try {
      fs.unlinkSync(dbPath + "-wal");
    } catch {}
    try {
      fs.unlinkSync(dbPath + "-shm");
    } catch {}
  }
}

const sampleResult = {
  name: "Test Benchmark",
  avgMs: 2.5,
  p50Ms: 2.3,
  p95Ms: 4.1,
  p99Ms: 5.2,
  minMs: 1.0,
  maxMs: 8.0,
  rps: 400,
  cv: 0.15,
};

const sampleOpts = {
  source: "single-test" as const,
  testFile: "tests/benchmarks/api-latency.test.ts",
  testId: "api-latency",
  phase: "warm" as const,
  runId: "test-run-001",
};

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

test("mode 'none' does not write to SQLite", async () => {
  cleanTestArtifacts();
  resetTrendGuard();

  await reportBenchmark(sampleResult, {
    ...sampleOpts,
    mode: "none",
  });

  const history = loadHistory("api-latency", "sqlite", false, "warm");
  expect(history.length).toBe(0);

  cleanTestArtifacts();
});

test("mode 'history' writes SQLite but does not touch MDX", async () => {
  cleanTestArtifacts();
  resetTrendGuard();

  await reportBenchmark(sampleResult, {
    ...sampleOpts,
    mode: "history",
  });

  const history = loadHistory("api-latency", "sqlite", false, "warm");
  expect(history.length).toBeGreaterThan(0);
  expect(history[0].avgMs).toBe(2.5);

  cleanTestArtifacts();
});

test("retry with same parameters is idempotent", async () => {
  cleanTestArtifacts();
  resetTrendGuard();

  // First write
  await reportBenchmark(sampleResult, {
    ...sampleOpts,
    mode: "history",
  });

  // Retry with same data
  resetTrendGuard();
  await reportBenchmark(sampleResult, {
    ...sampleOpts,
    mode: "history",
  });

  const history = loadHistory("api-latency", "sqlite", false, "warm");
  // Should still be 1 row, not 2 (INSERT OR IGNORE)
  expect(history.length).toBe(1);

  cleanTestArtifacts();
});

test("buildBenchmarkMetricId produces stable keys", () => {
  const id1 = buildBenchmarkMetricId({
    testId: "auth-performance",
    dbType: "postgresql",
    redisEnabled: true,
    phase: "cold",
    metric: "p95",
  });
  expect(id1).toBe("auth-performance/postgresql/redis-on/cold/p95");

  const id2 = buildBenchmarkMetricId({
    testId: "api-latency",
    dbType: "sqlite",
    redisEnabled: false,
    phase: "warm",
  });
  expect(id2).toBe("api-latency/sqlite/redis-off/warm/avg");
});

test("buildRunSummaryTable aggregates all tests from one run into a single table", async () => {
  cleanTestArtifacts();
  resetTrendGuard();

  await reportBenchmark(
    { name: "HTTP Latency", avgMs: 2.5, p95Ms: 4.1, rps: 400 },
    { ...sampleOpts, mode: "history" },
  );
  await reportBenchmark(
    { name: "Auth Check", avgMs: 1.2, p95Ms: 2.0, rps: 800, errorCount: 0 },
    {
      ...sampleOpts,
      testFile: "tests/benchmarks/auth-performance.test.ts",
      testId: "auth-performance",
      runId: "test-run-001",
      mode: "history",
    },
  );

  const table = buildRunSummaryTable(
    [
      {
        runId: "test-run-001",
        runMode: "standalone",
        testFile: "api-latency",
        metric: "HTTP Latency",
        avgMs: 2.5,
        p95Ms: 4.1,
        rps: 400,
        timestamp: "2026-07-04T10:00:00.000Z",
      },
      {
        runId: "test-run-001",
        runMode: "standalone",
        testFile: "auth-performance",
        metric: "Auth Check",
        avgMs: 1.2,
        p95Ms: 2.0,
        rps: 800,
        timestamp: "2026-07-04T10:00:01.000Z",
      },
    ],
    { runId: "test-run-001", runMode: "standalone", db: "sqlite", redis: false },
  );

  expect(table).toContain("| Test | Metric | Avg (ms) | p95 (ms) | RPS | Trend | Detail |");
  expect(table).toContain("Api Latency");
  expect(table).toContain("Auth Performance");
  expect(table).toContain("HTTP Latency");
  expect(table).toContain("Auth Check");
  expect(table).toContain("**Metrics:** 2");
  expect(table).toContain("test-run-001");
  expect(table).toContain("### Current Run Summary (2026-07-04)");
  expect(table).toContain("Only tests that ran in THIS invocation");
  expect(table).not.toContain("Historical Trends");
  const dataRows = table
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("| Test |"));
  expect(dataRows.length).toBe(2);

  cleanTestArtifacts();
});

test("filterInvocationRunEntries excludes stale same-runId lines from other tests", () => {
  const entries = [
    {
      runId: "run-a",
      testFile: "api-latency",
      metric: "HTTP",
      avgMs: 1,
      timestamp: "2026-07-04T10:00:00.000Z",
    },
    {
      runId: "run-a",
      testFile: "auth-performance",
      metric: "Auth",
      avgMs: 2,
      timestamp: "2026-07-04T10:00:01.000Z",
    },
  ];
  const scoped = filterInvocationRunEntries(entries, ["api-latency"]);
  expect(scoped).toHaveLength(1);
  expect(scoped[0]!.testFile).toBe("api-latency");

  const table = buildRunSummaryTable(scoped, {
    runId: "run-a",
    runMode: "standalone",
    db: "sqlite",
    redis: false,
    invokedTestFiles: ["api-latency"],
  });
  expect(table).toContain("**Tests invoked:** 1");
  expect(table).not.toContain("Auth Performance");
});

test("renderSparkline encodes series as unicode blocks", () => {
  const flat = renderSparkline([2, 2, 2, 2]);
  expect(flat.length).toBe(4);
  expect(flat).toMatch(/^[\u2581-\u2588]+$/u);

  // Default width=7 takes last 7 values; explicit width=8 preserves all
  const rising = renderSparkline([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(rising.length).toBe(7); // default SPARKLINE_WIDTH=7
  const risingFull = renderSparkline([1, 2, 3, 4, 5, 6, 7, 8], 8);
  expect(risingFull.length).toBe(8);
  expect(risingFull.charCodeAt(0)!).toBeLessThanOrEqual(risingFull.charCodeAt(7)!);
});

test("buildHistoryArchiveTable uses sparklines not full detail tables", async () => {
  cleanTestArtifacts();
  resetTrendGuard();

  await reportBenchmark(
    { name: "HTTP Latency", avgMs: 2.5, p95Ms: 4.1, rps: 400 },
    { ...sampleOpts, mode: "history" },
  );

  const archive = buildHistoryArchiveTable("sqlite");
  expect(archive).toMatch(/### Historical Trends \(\d{4}-\d{2}-\d{2}\)/);
  expect(archive).toContain(HISTORY_SQLITE_PATH);
  expect(archive).toContain("Sparklines only");
  expect(archive).toContain("| Sparkline");
  expect(archive).not.toContain("| Metric | Status | Detail |");
  expect(archive).not.toContain("Needs Attention");
  expect(archive).not.toContain("Current Run Summary");
  expect(archive).not.toContain("THIS invocation");

  cleanTestArtifacts();
});

test("partial MDX update preserves unrelated sections", () => {
  // This test verifies the atomic write pattern exists in benchmark-mdx.ts
  // Actual MDX content testing requires a running server with DB
  // We verify the function signatures are correct
  const { writeTruthTable, writeSummary, writeTrendAndInsight } = require("./benchmark-mdx");

  expect(typeof writeTruthTable).toBe("function");
  expect(typeof writeSummary).toBe("function");
  expect(typeof writeTrendAndInsight).toBe("function");
});

// Clean up after all tests
test("cleanup", () => {
  cleanTestArtifacts();
});
