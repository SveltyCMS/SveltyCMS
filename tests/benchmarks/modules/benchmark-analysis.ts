/**
 * @file tests/benchmarks/modules/benchmark-analysis.ts
 * @description Statistical trend analysis, budget enforcement, and root cause classification (Optimized)
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
  label: string;
  severity: Severity;
  deltaPct: number;
  p95DeltaPct: number;
  rpsDeltaPct: number;
  sampleSize: number;
  isBaseline: boolean;
  stableKey: string;
}

export interface RootCauseResult {
  insight: string;
  rootCause:
    | "normal_variance"
    | "adapter_bottleneck"
    | "cold_start"
    | "gc_pause"
    | "improvement"
    | "throughput_drop"
    | "severe_regression";
  isSuspected: boolean;
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

const SEVERITY_THRESHOLDS = Object.freeze([
  { maxDelta: 5, severity: "stable" as Severity, icon: "\u26AA" },
  { maxDelta: 10, severity: "watch" as Severity, icon: "\u{1F7E1}" },
  { maxDelta: 20, severity: "warning" as Severity, icon: "\u{1F7E0}" },
  { maxDelta: Infinity, severity: "regression" as Severity, icon: "\u{1F534}" },
]);

function severityFor(deltaPct: number): { severity: Severity; icon: string } {
  const ad = Math.abs(deltaPct);
  if (deltaPct < -3) {
    return { severity: "stable", icon: "\u{1F7E2}" };
  }

  for (let i = 0; i < SEVERITY_THRESHOLDS.length; i++) {
    const t = SEVERITY_THRESHOLDS[i]!;
    if (ad < t.maxDelta) {
      return { severity: t.severity, icon: t.icon };
    }
  }
  return { severity: "regression", icon: "\u{1F534}" };
}

// ─────────────────────────────────────────────────────────────
// Trend Analysis
// ─────────────────────────────────────────────────────────────

/** Compute in-place rolling median (sorts the array). */
function fastMedian(values: number[]): number {
  const len = values.length;
  if (len === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(len / 2)]!;
}

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
  const historyLen = history.length;

  if (historyLen < 2) {
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

  // Single-pass buffer population — replaces .filter().map() chained allocations
  const avgArray = Array.from({ length: historyLen });
  const p95Array: number[] = [];
  const rpsArray: number[] = [];

  for (let i = 0; i < historyLen; i++) {
    const h = history[i]!;
    avgArray[i] = h.avgMs;
    if (h.p95Ms > 0) p95Array.push(h.p95Ms);
    if (h.rps > 0) rpsArray.push(h.rps);
  }

  const bAvg = fastMedian(avgArray);
  const bP95 = fastMedian(p95Array);
  const bRPS = fastMedian(rpsArray);

  const dAvg = pctChange(result.avgMs, bAvg);
  const dP95 = pctChange(result.p95Ms, bP95);
  const dRPS = pctChange(result.rps, bRPS);

  const { severity, icon } = severityFor(dAvg);
  let labelParts = "";

  if (result.avgMs > 0 && bAvg > 0) {
    labelParts += `avg ${dAvg > 0 ? "+" : ""}${dAvg.toFixed(0)}%`;
  }
  if (result.p95Ms > 0 && bP95 > 0 && Math.abs(dP95) > 3) {
    labelParts += `${labelParts ? " " : ""}p95 ${dP95 > 0 ? "+" : ""}${dP95.toFixed(0)}%`;
  }
  if (result.rps > 0 && bRPS > 0 && Math.abs(dRPS) > 5) {
    labelParts += `${labelParts ? " " : ""}rps ${dRPS > 0 ? "+" : ""}${dRPS.toFixed(0)}%`;
  }

  const completeLabel = ` ${icon} ${labelParts} (${historyLen} runs)`;

  return {
    label: completeLabel,
    severity,
    deltaPct: dAvg,
    p95DeltaPct: dP95,
    rpsDeltaPct: dRPS,
    sampleSize: historyLen,
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
  let insight = "";
  let rootCause: RootCauseResult["rootCause"] = "normal_variance";
  const confidence: RootCauseResult["confidence"] = isSingleTest
    ? "suspected"
    : sampleSize < 5
      ? "watch"
      : "confirmed";

  if (Math.abs(deltaPct) < 5) {
    insight = "Within normal variance — no action needed.";
    rootCause = "normal_variance";
  } else if (deltaPct > 0 && p95DeltaPct > 3) {
    insight =
      "Both avg and p95 degraded — likely adapter or infrastructure bottleneck. Check DB connection pool, indexes, or recent commits.";
    rootCause = "adapter_bottleneck";
  } else if (deltaPct > 0) {
    insight =
      "Avg degraded but p95 stable — possible cold-start effect, GC pause, or warmup variance.";
    rootCause = deltaPct > 10 ? "cold_start" : "gc_pause";
  } else if (deltaPct < -3) {
    insight = "Performance improved — recent optimizations or cache warming likely effective.";
    rootCause = "improvement";
  }

  if (rpsDeltaPct < -10) {
    const rpsLine = `Throughput dropped ${Math.abs(rpsDeltaPct).toFixed(0)}% — check connection pool saturation or lock contention.`;
    insight = insight ? `${insight}  \n${rpsLine}` : rpsLine;
    rootCause = "throughput_drop";
  }

  if (deltaPct > 20) {
    const severeLine = `**Severe degradation** (+${Math.abs(deltaPct).toFixed(0)}%) — review recent commits immediately.`;
    insight = insight ? `${insight}  \n${severeLine}` : severeLine;
    rootCause = "severe_regression";
  }

  return {
    insight,
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

  const entries = Object.entries(metrics);
  for (let i = 0; i < entries.length; i++) {
    const [dim, value] = entries[i]!;
    const budget = budgets[dim];
    if (!budget || value <= 0) continue;

    if (value > budget.budget) {
      violations.push(`${budget.desc}: ${value.toFixed(2)}ms > ${budget.budget}ms budget`);
    }
  }

  return violations;
}

export function getAdaptiveBudget(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: "cold" | "warm" | "mixed",
  fallbackBudget: number,
): number {
  const history = loadHistory(testId, dbType, redisEnabled, phase, 20);
  if (history.length < 8) return fallbackBudget;

  const p95Values: number[] = [];
  for (let i = 0; i < history.length; i++) {
    const v = history[i]!.p95Ms;
    if (v > 0) p95Values.push(v);
  }

  if (p95Values.length < 5) return fallbackBudget;

  p95Values.sort((a, b) => a - b);
  const p95Idx = Math.floor(p95Values.length * 0.95);
  const histP95 = p95Values[Math.min(p95Idx, p95Values.length - 1)]!;

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

  let fullInsight = rootCause.insight;
  if (rootCause.isSuspected && rootCause.rootCause !== "normal_variance") {
    fullInsight +=
      "  \n(suspected — single test run, needs cross-validation with related benchmarks)";
  }

  if (codePaths.length > 0) {
    let components = "";
    for (let i = 0; i < codePaths.length; i++) {
      components += "`" + codePaths[i] + "`" + (i < codePaths.length - 1 ? " · " : "");
    }
    fullInsight += `  \n**Check**: ${components}`;
  }

  if (result.memoryRssMb && result.memoryRssMb > 0) {
    const memHistory = loadHistory(testId + "-mem", dbType, redisEnabled, phase, 10);
    const memLen = memHistory.length;
    if (memLen >= 2) {
      let memSum = 0;
      for (let i = 1; i < memLen; i++) {
        memSum += memHistory[i]!.avgMs;
      }
      const prevMem = memSum / (memLen - 1);
      if (prevMem > 0) {
        const memDelta = ((result.memoryRssMb - prevMem) / prevMem) * 100;
        if (memDelta > 10) {
          fullInsight += `  \n**Memory Pressure**: RSS +${memDelta.toFixed(0)}% (${result.memoryRssMb.toFixed(1)}MB vs ${prevMem.toFixed(1)}MB baseline) — possible native leak. Check sharp, argon2, or recent allocations.`;
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
