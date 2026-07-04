/**
 * @file scripts/benchmark-matrix/types.ts
 * @description Central type definitions for the benchmark matrix system.
 *
 * Single source of truth for all benchmark-related types used across
 * scripts/benchmark-matrix/ and tests/benchmarks/modules/.
 */

// ── Configuration ────────────────────────────────────────────────────────────────

export interface DatabaseConfig {
  type: string;
  port: number;
  host: string;
  user: string;
  password: string;
  useRedis?: boolean;
  label?: string;
}

export interface DatabaseCapabilities {
  concurrency: number;
  capabilities: string[];
  transactional: boolean;
  networked: boolean;
}

// ── Benchmark Scripts ─────────────────────────────────────────────────────────────

export interface BenchmarkScript {
  path: string;
  label: string;
  shortLabel: string;
  level: string | number;
  section: string;
  intensity: string;
  estimatedMs: number;
  timeoutMs?: number;
  desc: string;
  strategy: "all" | "sql" | "once";
  tags: string[];
  metricCategory: string;
  requiredCapabilities?: string[];
  correlatedWith?: string[];
  antiCorrelatedWith?: string[];
  codePaths?: string[];
}

// ── Runtime Results ───────────────────────────────────────────────────────────────

/** Environment info captured at benchmark time */
export interface BenchmarkHostInfo {
  runtime?: string;
  os?: string;
  cpu?: string;
  memoryGB?: number;
  bunVersion?: string;
  nodeVersion?: string;
  [key: string]: unknown;
}

export interface BenchmarkResult {
  db: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  coldStartMs?: number;
  metrics?: Record<string, any>;
  budgetViolations?: string[];
  hostInfo?: BenchmarkHostInfo;
  scriptTimings?: Record<string, number>;
  error?: string;
  scriptPath?: string;
}

export interface RunConfig {
  databases?: string[];
  scripts?: string[];
  iterations?: number;
  concurrency?: number;
}

// ── Statistical Analysis ──────────────────────────────────────────────────────────

/** Trend direction classification */
export type TrendDirection = "stable" | "improving" | "degrading" | "critical" | "flapping";

/** Per-metric statistical trend analysis result (Pass 1 of regression detection) */
export interface MetricTrend {
  adapter: string;
  metric: string;
  category: "latency" | "native_memory" | "throughput";
  current: number;
  baseline: number;
  stddev: number;
  slope: number;
  r2: number;
  sampleSize: number;
  direction: TrendDirection;
  confidence: number;
  forecastModel: "linear" | "exponential";
  forecastRunsToBreach: number | null;
  historyValues?: number[];
  runDirections?: number[];
}

/** Detected flapping metric — alternates pass/fail across runs */
export interface FlappingAlert {
  adapter: string;
  metric: string;
  label: string;
  flipCount: number;
  sampleSize: number;
  reason: string;
  severity: "warn";
}

/** Significant performance improvement (negative percentage change) */
export interface ImprovementNote {
  adapter: string;
  metric: string;
  label: string;
  current: number;
  previousAvg: number;
  changePct: number;
  direction: string;
  confidence: number;
}

/** Cross-DB correlation — same metric degrading across multiple adapters */
export interface CrossCuttingRegression {
  metric: string;
  affectedAdapters: string[];
  avgChangePct: number;
  severity: "warn" | "critical";
  reason: string;
}

/** Budget breach forecast based on linear regression slope */
export interface BudgetForecast {
  adapter: string;
  metric: string;
  label: string;
  current: number;
  budget: number;
  slope: number;
  estimatedRunsUntilBreach: number;
  projectedBreachValue: number;
}

// ── Regression Detection Results ──────────────────────────────────────────────────

/** Single regression finding (degradation, improvement, flapping, or budget violation) */
export interface RegressionResult {
  db: string;
  metric: string;
  current: number;
  previousAvg: number;
  changePct: number;
  isRegression: boolean;
  reason: string;
  slope?: number;
  direction?: string;
  confidence?: number;
  rootCause?: string;
  severity?: "info" | "warn" | "critical";
  forecastRuns?: number | null;
  /** True if this metric alternates pass/fail across runs (non-deterministic) */
  isFlapping?: boolean;
  /** True if this is a significant improvement (not a regression) */
  isImprovement?: boolean;
}

/** Consolidated regression report with full cross-DB intelligence */
export interface EnhancedRegressionReport {
  regressions: RegressionResult[];
  improvements: RegressionResult[];
  flappingAlerts: RegressionResult[];
  crossCutting: CrossCuttingRegression[];
  budgetForecasts: BudgetForecast[];
}

/**
 * Return type for detectRegressions().
 * Callers get both the flat regression list (backward compat) and the structured report.
 */
export interface DetectRegressionsResult {
  regressions: RegressionResult[];
  report: EnhancedRegressionReport;
}
