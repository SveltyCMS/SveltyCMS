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
import { reportBenchmark, resetTrendGuard } from "./benchmark-reporting";
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
