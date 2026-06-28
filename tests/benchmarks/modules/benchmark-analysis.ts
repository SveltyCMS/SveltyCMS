/**
 * @file tests/benchmarks/modules/benchmark-analysis.ts
 * @description Statistical trend analysis, budget enforcement, and root cause classification (Optimized)
 *
 * Pure functions — no I/O. Takes history data, returns structured analysis.
 */
import { loadHistory } from "./benchmark-history";
import { PER_DIMENSION_BUDGETS } from "./benchmark-mdx";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Severity =
  | "stable"
  | "watch"
  | "warning"
  | "regression"
  | "critical";

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

// ─────────────────────────────────────────────────────────────
// Trend Analysis
// ─────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms === 0) return "0ms";
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  return `${ms.toFixed(2)}ms`;
}

export function analyzeTrend(
  result: {
    name: string;
    avgMs: number;
    p95Ms: number;
    rps: number;
  },
  allHistory: { avgMs: number; p95Ms: number; rps: number }[],
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: "cold" | "warm" | "mixed",
): TrendResult {
  const stableKey = `${testId}:${dbType}:${redisEnabled ? "redis" : "plain"}:${phase}`;
  // Only use last 7 runs for trend — old data is stale
  const history = allHistory.slice(-7);
  const historyLen = history.length;

  if (historyLen < 2) {
    return {
      label: `\u26AA established at ${formatMs(result.avgMs)} (1 run)`,
      severity: "stable",
      deltaPct: 0,
      p95DeltaPct: 0,
      rpsDeltaPct: 0,
      sampleSize: 1,
      isBaseline: true,
      stableKey,
    };
  }

  // Build arrays from last 7 runs
  const avgs = history.map((h) => h.avgMs);
  const p95s = history.filter((h) => h.p95Ms > 0).map((h) => h.p95Ms);
  const rpss = history.filter((h) => h.rps > 0).map((h) => h.rps);

  const sortedAvgs = [...avgs].sort((a, b) => a - b);
  const len = sortedAvgs.length;
  const median =
    len % 2 === 0
      ? (sortedAvgs[len / 2 - 1] + sortedAvgs[len / 2]) / 2
      : sortedAvgs[Math.floor(len / 2)];
  // IQR: spread of middle 50% — determines "normal variance"
  const q1 = sortedAvgs[Math.floor(len * 0.25)];
  const q3 = sortedAvgs[Math.floor(len * 0.75)];
  const iqr = q3 - q1;

  const current = result.avgMs;
  const delta = current - median;
  const deltaPct = median > 0 ? (delta / median) * 100 : 0;

  // Smart severity: use both IQR and percentage
  // "Normal variance": within 1.5× IQR of median
  // "Real change": outside that range AND >2% change
  const isSignificant = Math.abs(delta) > iqr * 1.5 && Math.abs(deltaPct) > 2;

  let icon: string;
  let label: string;

  if (!isSignificant || Math.abs(delta) < 0.05 || Math.abs(deltaPct) < 2) {
    // Within normal variance — stable
    icon = "\u26AA";
    const range = iqr > 0 ? ` (±${formatMs(iqr)})` : "";
    label = `${icon} stable at ${formatMs(median)}${range} (${historyLen} runs)`;
  } else if (delta < 0) {
    // Improved (faster)
    icon = "\u{1F7E2}";
    label = `${icon} faster: ${formatMs(median)} \u2192 ${formatMs(current)} (-${Math.abs(deltaPct).toFixed(0)}%) (${historyLen} runs)`;
  } else {
    // Regressed (slower)
    icon = "\u{1F534}";
    label = `${icon} slower: ${formatMs(median)} \u2192 ${formatMs(current)} (+${deltaPct.toFixed(0)}%) (${historyLen} runs)`;
  }

  const bP95 =
    p95s.length > 0 ? p95s.reduce((a, b) => a + b, 0) / p95s.length : 0;
  const bRPS =
    rpss.length > 0 ? rpss.reduce((a, b) => a + b, 0) / rpss.length : 0;

  return {
    label,
    severity: isSignificant ? (delta < 0 ? "improved" : "regressed") : "stable",
    deltaPct,
    p95DeltaPct: bP95 > 0 ? ((result.p95Ms - bP95) / bP95) * 100 : 0,
    rpsDeltaPct: bRPS > 0 ? ((result.rps - bRPS) / bRPS) * 100 : 0,
    sampleSize: historyLen,
    isBaseline: false,
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
    insight =
      "Performance improved — recent optimizations or cache warming likely effective.";
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

export function checkBudgets(
  dbType: string,
  metrics: Record<string, number>,
): string[] {
  const violations: string[] = [];
  const budgets = PER_DIMENSION_BUDGETS[dbType.toLowerCase()];
  if (!budgets) return violations;

  const entries = Object.entries(metrics);
  for (let i = 0; i < entries.length; i++) {
    const [dim, value] = entries[i]!;
    const budget = budgets[dim];
    if (!budget || value <= 0) continue;

    if (value > budget.budget) {
      violations.push(
        `${budget.desc}: ${value.toFixed(2)}ms > ${budget.budget}ms budget`,
      );
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
      components +=
        "`" + codePaths[i] + "`" + (i < codePaths.length - 1 ? " · " : "");
    }
    fullInsight += `  \n**Check**: ${components}`;
  }

  if (result.memoryRssMb && result.memoryRssMb > 0) {
    const memHistory = loadHistory(
      testId + "-mem",
      dbType,
      redisEnabled,
      phase,
      10,
    );
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
