/**
 * @file tests/benchmark./modules/benchmark-analysis.ts
 * @description Statistical trend analysis, budget enforcement, and root cause classification.
 *
 * Pure functions — no I/O. Takes history data, returns structured analysis.
 */
import { loadHistory, isBaselinePhase, buildHistoryKey } from "./benchmark-history";
import { PER_DIMENSION_BUDGETS } from "./benchmark-mdx";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Severity = "stable" | "watch" | "warning" | "regression" | "critical";

export interface TrendResult {
  /** Severity icon + label: "🔴 avg +18% p95 +22% (12 runs)" */
  label: string;
  /** Numeric severity level */
  severity: Severity;
  /** Average delta percentage */
  deltaPct: number;
  /** P95 delta percentage */
  p95DeltaPct: number;
  /** RPS delta percentage */
  rpsDeltaPct: number;
  /** Number of historical runs used for baseline */
  sampleSize: number;
  /** Whether we're still building a baseline */
  isBaseline: boolean;
  /** Stable history key */
  stableKey: string;
}

export interface RootCauseResult {
  /** Human-readable insight */
  insight: string;
  /** Root cause category */
  rootCause:
    | "normal_variance"
    | "adapter_bottleneck"
    | "cold_start"
    | "gc_pause"
    | "improvement"
    | "throughput_drop"
    | "severe_regression";
  /** Whether this is single-test (lower confidence) */
  isSuspected: boolean;
  /** Confidence label: suspected | confirmed | watch (low samples) */
  confidence: "suspected" | "confirmed" | "watch";
}

export interface AnalysisResult {
  trend: TrendResult;
  rootCause: RootCauseResult;
  codePaths: string[];
  budgetViolations: string[];
}

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const SEVERITY_THRESHOLDS: Array<{
  maxDelta: number;
  severity: Severity;
  icon: string;
}> = [
  { maxDelta: 5, severity: "stable", icon: "\u26AA" },
  { maxDelta: 10, severity: "watch", icon: "\u{1F7E1}" },
  { maxDelta: 20, severity: "warning", icon: "\u{1F7E0}" },
  { maxDelta: Infinity, severity: "regression", icon: "\u{1F534}" },
];

function severityFor(deltaPct: number): { severity: Severity; icon: string } {
  const ad = Math.abs(deltaPct);
  const match = SEVERITY_THRESHOLDS.find((t) => ad < t.maxDelta)!;
  return { severity: match.severity, icon: match.icon };
}

// ─────────────────────────────────────────────────────────────
// Trend Analysis
// ─────────────────────────────────────────────────────────────

/** Compute rolling median from history array. */
function rollingMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Compute percentage change. */
function pctChange(current: number, baseline: number): number {
  return baseline > 0 ? ((current - baseline) / baseline) * 100 : 0;
}

export function analyzeTrend(
  result: {
    name: string;
    avgMs: number;
    p95Ms: number;
    rps: number;
  },
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: "cold" | "warm" | "mixed",
): TrendResult {
  const stableKey = buildHistoryKey(testId, dbType, redisEnabled, phase);
  const history = loadHistory(testId, dbType, redisEnabled, phase);

  // First run: no baseline yet
  if (history.length < 2) {
    return {
      label: " \u26AA \u2014 baseline established (1 run)",
      severity: "stable",
      deltaPct: 0,
      p95DeltaPct: 0,
      rpsDeltaPct: 0,
      sampleSize: 1,
      isBaseline: true,
      stableKey,
    };
  }

  const bAvg = rollingMedian(history.map((h) => h.avgMs));
  const bP95 = rollingMedian(history.filter((h) => h.p95Ms > 0).map((h) => h.p95Ms));
  const bRPS = rollingMedian(history.filter((h) => h.rps > 0).map((h) => h.rps));

  const dAvg = pctChange(result.avgMs, bAvg);
  const dP95 = pctChange(result.p95Ms, bP95);
  const dRPS = pctChange(result.rps, bRPS);

  const { severity, icon } = severityFor(dAvg);

  const parts: string[] = [];
  if (result.avgMs > 0 && bAvg > 0) {
    parts.push("avg " + (dAvg > 0 ? "+" : "") + dAvg.toFixed(0) + "%");
  }
  if (result.p95Ms > 0 && bP95 > 0 && Math.abs(dP95) > 3) {
    parts.push("p95 " + (dP95 > 0 ? "+" : "") + dP95.toFixed(0) + "%");
  }
  if (result.rps > 0 && bRPS > 0 && Math.abs(dRPS) > 5) {
    parts.push("rps " + (dRPS > 0 ? "+" : "") + dRPS.toFixed(0) + "%");
  }

  const label = " " + icon + " " + parts.join(" ") + " (" + history.length + " runs)";

  return {
    label,
    severity,
    deltaPct: dAvg,
    p95DeltaPct: dP95,
    rpsDeltaPct: dRPS,
    sampleSize: history.length,
    isBaseline: isBaselinePhase(testId, dbType, redisEnabled, phase),
    stableKey,
  };
}

// ─────────────────────────────────────────────────────────────
// Root Cause Classification
// ─────────────────────────────────────────────────────────────

export function classifyRootCause(
  deltaPct: number,
  p95DeltaPct: number,
  rpsDeltaPct: number,
  isSingleTest: boolean,
  sampleSize: number,
): RootCauseResult {
  const parts: string[] = [];
  let rootCause: RootCauseResult["rootCause"] = "normal_variance";

  // Determine confidence
  let confidence: RootCauseResult["confidence"];
  if (isSingleTest) {
    confidence = "suspected";
  } else if (sampleSize < 5) {
    confidence = "watch";
  } else {
    confidence = "confirmed";
  }

  // Summary
  if (Math.abs(deltaPct) < 5) {
    parts.push("Within normal variance — no action needed.");
    rootCause = "normal_variance";
  } else if (deltaPct > 0 && p95DeltaPct > 3) {
    parts.push(
      "Both avg and p95 degraded — likely adapter or infrastructure bottleneck. Check DB connection pool, indexes, or recent commits.",
    );
    rootCause = "adapter_bottleneck";
  } else if (deltaPct > 0) {
    parts.push(
      "Avg degraded but p95 stable — possible cold-start effect, GC pause, or warmup variance.",
    );
    rootCause = deltaPct > 10 ? "cold_start" : "gc_pause";
  } else if (deltaPct < -3) {
    parts.push("Performance improved — recent optimizations or cache warming likely effective.");
    rootCause = "improvement";
  }

  if (rpsDeltaPct < -10) {
    parts.push(
      "Throughput dropped " +
        Math.abs(rpsDeltaPct).toFixed(0) +
        "% — check connection pool saturation or lock contention.",
    );
    rootCause = "throughput_drop";
  }

  if (deltaPct > 20) {
    parts.push(
      "**Severe degradation** (+" +
        Math.abs(deltaPct).toFixed(0) +
        "%) — review recent commits immediately.",
    );
    rootCause = "severe_regression";
  }

  return {
    insight: parts.join("  \n"),
    rootCause,
    isSuspected: isSingleTest,
    confidence,
  };
}

// ─────────────────────────────────────────────────────────────
// Budget Checking
// ─────────────────────────────────────────────────────────────

export function checkBudgets(dbType: string, metrics: Record<string, number>): string[] {
  const violations: string[] = [];
  const budgets = PER_DIMENSION_BUDGETS[dbType.toLowerCase()];
  if (!budgets) return violations;

  for (const [dim, value] of Object.entries(metrics)) {
    const budget = budgets[dim];
    if (!budget || value <= 0) continue;

    if (value > budget.budget) {
      violations.push(`${budget.desc}: ${value.toFixed(2)}ms > ${budget.budget}ms budget`);
    }
  }

  return violations;
}

/**
 * Compute an adaptive budget based on historical p95.
 * After 8+ runs, uses 1.2× historical p95 as the new budget.
 * Falls back to hardcoded PER_DIMENSION_BUDGETS for small samples.
 */
export function getAdaptiveBudget(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: "cold" | "warm" | "mixed",
  fallbackBudget: number,
): number {
  const history = loadHistory(testId, dbType, redisEnabled, phase, 20);
  if (history.length < 8) return fallbackBudget;

  const p95Values = history.map((h) => h.p95Ms).filter((v) => v > 0);
  if (p95Values.length < 5) return fallbackBudget;

  // Use 1.2× historical p95 as adaptive budget
  const sorted = [...p95Values].sort((a, b) => a - b);
  const p95Idx = Math.floor(sorted.length * 0.95);
  const histP95 = sorted[Math.min(p95Idx, sorted.length - 1)];
  return Math.max(histP95 * 1.2, fallbackBudget * 0.5);
}

// ─────────────────────────────────────────────────────────────
// Full Analysis Pipeline
// ─────────────────────────────────────────────────────────────

export function runAnalysis(
  result: {
    name: string;
    avgMs: number;
    p95Ms: number;
    rps: number;
    memoryRssMb?: number;
  },
  testId: string,
  _testFile: string,
  dbType: string,
  redisEnabled: boolean,
  phase: "cold" | "warm" | "mixed",
  isSingleTest: boolean,
  codePaths: string[],
): AnalysisResult {
  const trend = analyzeTrend(result, testId, dbType, redisEnabled, phase);
  const rootCause = classifyRootCause(
    trend.deltaPct,
    trend.p95DeltaPct,
    trend.rpsDeltaPct,
    isSingleTest,
    trend.sampleSize,
  );

  // Enhance insight with code paths + suspicion marker
  let fullInsight = rootCause.insight;
  if (rootCause.isSuspected && rootCause.rootCause !== "normal_variance") {
    fullInsight +=
      "  \n(suspected — single test run, needs cross-validation with related benchmarks)";
  }
  if (codePaths.length > 0) {
    fullInsight += "  \n**Check**: " + codePaths.map((p) => "`" + p + "`").join(" · ");
  }

  // ── Memory trend tracking ──
  if (result.memoryRssMb && result.memoryRssMb > 0) {
    const memHistory = loadHistory(testId + "-mem", dbType, redisEnabled, phase, 10);
    if (memHistory.length >= 2) {
      const prevMem =
        memHistory.slice(1).reduce((a, h) => a + h.avgMs, 0) / Math.max(1, memHistory.length - 1);
      if (prevMem > 0) {
        const memDelta = ((result.memoryRssMb - prevMem) / prevMem) * 100;
        if (memDelta > 10) {
          fullInsight += `  \n**Memory Pressure**: RSS +${memDelta.toFixed(0)}% (${result.memoryRssMb.toFixed(1)}MB vs ${prevMem.toFixed(1)}MB baseline) — possible native leak. Check sharp, better-sqlite3, or recent allocations.`;
        }
      }
    }
  }

  const budgetViolations = checkBudgets(dbType, {
    [`${phase}_avg`]: result.avgMs,
    [`${phase}_p95`]: result.p95Ms,
  });

  return {
    trend,
    rootCause: { ...rootCause, insight: fullInsight },
    codePaths,
    budgetViolations,
  };
}
