/**
 * @file tests/unit/benchmarks/ci-regression-gate.test.ts
 * @description Unit tests for the CI performance gate policy.
 *
 * The gate turns benchmark latency into a merge signal: absolute budgets always
 * fail, relative drift warns on `next` and fails on `main`. These tests pin the
 * threshold behaviour without touching the filesystem.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  budgetFor,
  evaluateBenchmarkGate,
  evaluateSamples,
  renderGateMarkdown,
  resolvePolicy,
  type GateBaseline,
  type GateResult,
  type GateSample,
} from "../../../scripts/benchmark-matrix/ci-regression-gate";

const LABEL = "REST list p95";
const REST_TEST_FILE = "tests/benchmarks/rest-api-performance.test.ts";
const REST_LIST_METRIC = "Collection Find (List Limit 20)";

function sample(value: number, budget = 5): GateSample {
  return { label: LABEL, value, budget };
}

describe("CI performance gate", () => {
  it("builds a baseline without failing on the first run", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(1)], {});

    expect(result.status).toBe("pass");
    expect(result.passed).toBe(true);
    expect(result.baselineRuns).toBe(0);
    expect(result.metrics[0]?.baseline).toBeNull();
    expect(result.metrics[0]?.changePct).toBeNull();
  });

  it("warns on moderate drift under the warn policy", () => {
    const result = evaluateSamples("sqlite", "warn", [sample(1.4)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("warn");
    expect(result.passed).toBe(true);
    expect(result.metrics[0]?.changePct).toBeCloseTo(40, 5);
    expect(result.metrics[0]?.severity).toBe("warn");
  });

  it("warns but waits for confirmation on the first severe drift", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(3)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("warn");
    expect(result.passed).toBe(true);
    expect(result.metrics[0]?.severe).toBe(true);
    expect(result.metrics[0]?.streak).toBe(1);
    expect(result.metrics[0]?.reason).toContain("pending confirmation (1/2)");
  });

  it("fails severe drift on the fail policy once confirmed", () => {
    const result = evaluateSamples(
      "sqlite",
      "fail",
      [sample(3)],
      { [LABEL]: [1, 1] },
      { [LABEL]: 1 },
    );

    expect(result.status).toBe("fail");
    expect(result.passed).toBe(false);
    expect(result.failures).toBe(1);
    expect(result.metrics[0]?.streak).toBe(2);
    expect(result.metrics[0]?.reason).toContain("confirmed 2 runs");
  });

  it("downgrades a confirmed severe drift to a warning under the warn policy", () => {
    const result = evaluateSamples(
      "sqlite",
      "warn",
      [sample(3)],
      { [LABEL]: [1, 1] },
      { [LABEL]: 1 },
    );

    expect(result.status).toBe("warn");
    expect(result.passed).toBe(true);
    expect(result.failures).toBe(0);
    expect(result.metrics[0]?.streak).toBe(2);
  });

  it("clears the streak when the metric recovers", () => {
    const result = evaluateSamples(
      "sqlite",
      "fail",
      [sample(1)],
      { [LABEL]: [1, 1] },
      { [LABEL]: 1 },
    );

    expect(result.status).toBe("pass");
    expect(result.metrics[0]?.severe).toBe(false);
    expect(result.metrics[0]?.streak).toBe(0);
  });

  it("always fails an absolute budget breach", () => {
    const result = evaluateSamples("sqlite", "warn", [sample(6, 5)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("fail");
    expect(result.passed).toBe(false);
    expect(result.metrics[0]?.budgetExceeded).toBe(true);
    expect(result.metrics[0]?.reason).toContain("budget exceeded");
  });

  it("ignores improvements and sub-threshold noise", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(0.9)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("pass");
    expect(result.metrics[0]?.severity).toBe("ok");
  });

  it("requires enough baseline samples before judging drift", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(3)], { [LABEL]: [1] });

    expect(result.status).toBe("pass");
    expect(result.metrics[0]?.baseline).toBeNull();
    expect(result.baselineRuns).toBe(1);
    expect(result.baselineTarget).toBe(2);
  });

  it("resolves adapter budget overrides", () => {
    expect(budgetFor("sqlite", "dbRaw")).toBe(80);
    expect(budgetFor("postgresql", "dbRaw")).toBe(30);
    expect(budgetFor("sqlite", "collections")).toBe(5);
    // Networked adapters pay a round-trip on every REST request.
    expect(budgetFor("mongodb", "collections")).toBe(8);
    expect(budgetFor("postgresql", "collections")).toBe(8);
    expect(budgetFor("mariadb", "collections")).toBe(8);
  });

  it("ignores sub-1.5ms absolute jitter on sub-millisecond baselines", () => {
    // 0.436ms → 1.566ms (+1.13ms, +259%) is normal shared-runner scheduling jitter,
    // well below the 25ms security budget and below the 1.5ms FAIL_MIN_DELTA_MS floor.
    const result = evaluateSamples(
      "postgresql",
      "fail",
      [{ label: "Hooks/security p95", value: 1.566, budget: 25 }],
      { "Hooks/security p95": [0.436, 0.436] },
      { "Hooks/security p95": 1 },
    );

    expect(result.metrics[0]?.severe).toBe(false);
    expect(result.metrics[0]?.severity).toBe("warn");
    expect(result.passed).toBe(true);
  });

  it("resolves gate policy to fail on main/merge_group and warn on next/PRs", () => {
    const prevRef = process.env.GITHUB_REF;
    const prevEvent = process.env.GITHUB_EVENT_NAME;
    try {
      expect(resolvePolicy("fail")).toBe("fail");
      expect(resolvePolicy("warn")).toBe("warn");

      process.env.GITHUB_REF = "refs/heads/next";
      process.env.GITHUB_EVENT_NAME = "push";
      expect(resolvePolicy(undefined)).toBe("warn");

      process.env.GITHUB_REF = "refs/heads/main";
      process.env.GITHUB_EVENT_NAME = "push";
      expect(resolvePolicy(undefined)).toBe("fail");

      process.env.GITHUB_REF = "refs/heads/gh-readonly-queue/next/pr-1";
      process.env.GITHUB_EVENT_NAME = "merge_group";
      expect(resolvePolicy(undefined)).toBe("fail");
    } finally {
      if (prevRef === undefined) delete process.env.GITHUB_REF;
      else process.env.GITHUB_REF = prevRef;
      if (prevEvent === undefined) delete process.env.GITHUB_EVENT_NAME;
      else process.env.GITHUB_EVENT_NAME = prevEvent;
    }
  });
});

/**
 * End-to-end gate runs against a temp results directory. This is the sequence a
 * fresh CI runner performs: run 1 writes the baseline, run 2 compares against it
 * (the cache restored in between is just that file copied onto the runner).
 */
describe("CI performance gate (filesystem)", () => {
  let resultsDir: string;

  afterEach(() => {
    if (resultsDir) rmSync(resultsDir, { recursive: true, force: true });
  });

  function freshDir(): string {
    resultsDir = mkdtempSync(join(tmpdir(), "gate-"));
    return resultsDir;
  }

  function historyLine(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      db: "sqlite",
      testFile: REST_TEST_FILE,
      metric: REST_LIST_METRIC,
      p95Ms: 2,
      timestamp: "2026-10-20T10:00:00.000Z",
      status: "SUCCESS",
      runMode: "standalone",
      serverMode: "production",
      ...overrides,
    });
  }

  function writeHistory(dir: string, lines: readonly string[]): void {
    writeFileSync(join(dir, "history.jsonl"), `${lines.join("\n")}\n`);
  }

  function baseline(dir: string): GateBaseline {
    return JSON.parse(readFileSync(join(dir, "gate-baseline-sqlite.json"), "utf8")) as GateBaseline;
  }

  it("starts comparing once two prior samples exist", () => {
    const dir = freshDir();
    const run = (p95Ms: number, at: string, sinceIso: string): GateResult => {
      // Each invocation rewrites history; on CI the cache supplies the baseline.
      writeHistory(dir, [historyLine({ p95Ms, timestamp: at })]);
      return evaluateBenchmarkGate({ db: "sqlite", sinceIso, policy: "fail", resultsDir: dir });
    };

    const first = run(2, "2026-10-20T10:00:00.000Z", "2026-10-20T09:59:00.000Z");

    expect(first.metrics.map((m) => m.label)).toEqual([LABEL]);
    expect(first.baselineRuns).toBe(0);
    expect(first.metrics[0]?.changePct).toBeNull();
    expect(baseline(dir).series[LABEL]).toEqual([2]);

    // Second run: one prior sample, so drift is still not judged.
    const second = run(3, "2026-10-20T11:00:00.000Z", "2026-10-20T10:30:00.000Z");

    expect(second.baselineRuns).toBe(1);
    expect(second.metrics[0]?.baseline).toBeNull();
    expect(second.metrics[0]?.changePct).toBeNull();
    expect(renderGateMarkdown(second)).toContain("building (1/2 samples)");
    expect(baseline(dir).series[LABEL]).toEqual([2, 3]);

    // Third run: two prior samples are enough to judge.
    const third = run(4, "2026-10-20T12:00:00.000Z", "2026-10-20T11:30:00.000Z");

    expect(third.baselineRuns).toBe(2);
    expect(third.metrics[0]?.current).toBe(4);
    expect(third.metrics[0]?.baseline).toBe(2.5);
    expect(third.metrics[0]?.changePct).toBeCloseTo(60, 5);
    expect(third.status).toBe("warn");
    expect(third.passed).toBe(true);
    expect(baseline(dir).series[LABEL]).toEqual([2, 3, 4]);
  });

  it("keeps one row per metric when history and matrix exports overlap", () => {
    const dir = freshDir();
    writeHistory(dir, [historyLine()]);
    // `exportMetric()` writes into `<results>/<db>/`; the metricKey fallback must
    // not add a second row for a label the history source already produced.
    mkdirSync(join(dir, "sqlite"), { recursive: true });
    writeFileSync(
      join(dir, "sqlite", "matrix_metrics.json"),
      JSON.stringify({
        "rest.list.p95_ms": { _type: "numeric-metric", value: 9.9 },
      }),
    );

    const result = evaluateBenchmarkGate({
      db: "sqlite",
      sinceIso: "2026-10-20T09:59:00.000Z",
      policy: "fail",
      resultsDir: dir,
    });

    const labels = result.metrics.map((m) => m.label);
    expect(labels).toEqual([LABEL]);
    expect(new Set(labels).size).toBe(labels.length);
    // History wins over the export fallback, so the value is 2ms, not 9.9ms.
    expect(result.metrics[0]?.current).toBe(2);
  });

  it("freezes the baseline until a severe drift is confirmed", () => {
    const dir = freshDir();
    const stored: GateBaseline = {
      version: 1,
      db: "sqlite",
      mode: { runMode: "standalone", serverMode: "production" },
      updatedAt: "2026-10-19T10:00:00.000Z",
      series: { [LABEL]: [1, 1] },
    };
    writeFileSync(join(dir, "gate-baseline-sqlite.json"), JSON.stringify(stored));

    const run = (at: string, sinceIso: string): GateResult => {
      writeHistory(dir, [historyLine({ p95Ms: 3, timestamp: at })]);
      return evaluateBenchmarkGate({ db: "sqlite", sinceIso, policy: "fail", resultsDir: dir });
    };

    const first = run("2026-10-20T10:00:00.000Z", "2026-10-20T09:59:00.000Z");

    expect(first.status).toBe("warn");
    expect(first.passed).toBe(true);
    expect(first.metrics[0]?.streak).toBe(1);
    // A single noisy sample must not re-baseline the metric.
    expect(baseline(dir).series[LABEL]).toEqual([1, 1]);
    expect(baseline(dir).severeStreak?.[LABEL]).toBe(1);

    const second = run("2026-10-20T11:00:00.000Z", "2026-10-20T10:30:00.000Z");

    expect(second.status).toBe("fail");
    expect(second.passed).toBe(false);
    expect(second.metrics[0]?.streak).toBe(2);
    expect(baseline(dir).series[LABEL]).toEqual([1, 1, 3]);
  });

  it("discards a baseline recorded in a different execution mode", () => {
    const dir = freshDir();
    const stored: GateBaseline = {
      version: 1,
      db: "sqlite",
      mode: { runMode: "matrix", serverMode: "development" },
      updatedAt: "2026-10-19T10:00:00.000Z",
      series: { [LABEL]: [1, 1] },
    };
    writeFileSync(join(dir, "gate-baseline-sqlite.json"), JSON.stringify(stored));
    writeHistory(dir, [historyLine({ p95Ms: 4 })]);

    const result = evaluateBenchmarkGate({
      db: "sqlite",
      sinceIso: "2026-10-20T09:59:00.000Z",
      policy: "fail",
      resultsDir: dir,
    });

    expect(result.metrics[0]?.baseline).toBeNull();
    expect(result.metrics[0]?.changePct).toBeNull();
    expect(result.status).toBe("pass");
    expect(baseline(dir).series[LABEL]).toEqual([4]);
  });
});
