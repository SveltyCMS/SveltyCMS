/**
 * @file scripts/benchmark-matrix/types.ts
 * @description Core TypeScript definitions for the benchmark matrix tool.
 */

/** Configuration for a single database instance used in benchmarks */
export interface DatabaseConfig {
  type: string;
  port: number;
  host: string;
  user: string;
  password: string;
  useRedis?: boolean;
  /** Optional custom label (e.g. "SQLITE+REDIS") */
  label?: string;
}

/** Capability flags for database-agnostic benchmark filtering */
export type DatabaseCapability =
  | "transactions"
  | "joins"
  | "secondaryIndexes"
  | "aggregations"
  | "fullTextSearch"
  | "networked"
  | "embedded";

/** Metadata about a database engine's capabilities and limits */
export interface DatabaseCapabilities {
  concurrency: number;
  capabilities: DatabaseCapability[];
  transactional: boolean;
  networked: boolean;
}

/** Result of a complete database audit run */
export interface BenchmarkResult {
  db: string;
  version?: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "RUNNING";
  coldStartMs?: number;
  scriptPath?: string;
  metrics?: Record<string, unknown>;
  buildTimeMs?: number;
  hostInfo?: HostInfo;
  error?: string;
  /** New: What this test specifically proves */
  proves?: string;
  /** New: Path to the test file */
  file?: string;
  /** Whether this result comes from history.sqlite instead of current run */
  isHistorical?: boolean;
  /** Timing per individual benchmark script */
  scriptTimings?: Record<string, number>;
  /** List of performance budget violations for this DB */
  budgetViolations?: string[];
  /** Extra metadata for diagnostics */
  extra?: Record<string, any>;
}

/** Host machine information captured during benchmark */
export interface HostInfo {
  cpu: string;
  cores: number;
  ram: string;
  os: string;
  arch: string;
  runtime: string;
}

/** Benchmark tags for filtering and heatmap analysis */
export type BenchmarkTag =
  | "realtime"
  | "network"
  | "cpu"
  | "memory"
  | "disk"
  | "security"
  | "compliance"
  | "dx";

/** Definition of a single benchmark script */
export interface BenchmarkScript {
  path: string;
  label: string;
  shortLabel: string;
  level: number;
  section: string;
  desc: string;
  intensity: "low" | "medium" | "high";
  estimatedMs: number;
  /** Optional per-script timeout override */
  timeoutMs?: number;
  /** Timestamp of the last successful run */
  lastRun?: string;
  /** Execution strategy: run on all dbs, only SQL dbs, or once as baseline */
  strategy: "all" | "sql" | "once";
  /** Optional performance baseline for anomaly detection */
  expectedDurationMs?: number;
  /** 🚀 NEW: Required DB capabilities (replaces brittle strategy:string matching) */
  requiredCapabilities?: DatabaseCapability[];
  /** 🚀 NEW: Tags for selective execution and heatmap reporting */
  tags?: BenchmarkTag[];
  /** 🚀 NEW: Dependencies on other benchmarks (by shortLabel) */
  dependsOn?: string[];
  /** 🚀 NEW: Metric category for correlation engine grouping */
  metricCategory?: MetricCategory;
  /** 🚀 NEW: Benchmarks this one correlates with (by shortLabel) */
  correlatedWith?: string[];
  /** 🚀 NEW: Benchmarks this one should NOT correlate with */
  antiCorrelatedWith?: string[];
  /** 🚀 NEW: Source files affected by this test (for differential execution) */
  codePaths?: string[];
}

/** Precomputed display row for zero-allocation rendering */
export interface PrecomputedScriptDisplay {
  shortLabel: string;
  label: string;
  path: string;
  level: number;
  intensity: "low" | "medium" | "high";
  estimatedMs: number;
  section: string;
  /** Pre-formatted for terminal output */
  line: string;
}

/** Parsed CLI configuration */
export interface RunConfig {
  parallelMode: "off" | "safe" | "full";
  skipBuild: boolean;
  dbFilter: string[] | null;
  sectionFilter: string[] | null;
  levelFilter: number | null;
  onlyFilter: string[] | null;
  fileFilter: string | null;
  skipRedis: boolean;
  retryCount: number;
  timeoutMs: number;
  warmup: boolean;
  ci: boolean;
  failFast: boolean;
  forceClean: boolean;
  list: boolean;
  /** 🚀 Only run tests affected by recent code changes */
  differential: boolean;
  /** Files changed (populated by --differential) */
  changedFiles: string[];
}

/** Outcome of running a single benchmark script (with retries) */
export interface ScriptOutcome {
  passed: boolean;
  attempts: number;
  elapsedMs: number;
  error?: string;
}

/** Structured numeric metric exported by individual benchmarks */
export interface NumericMetric {
  _type: "numeric-metric";
  name: string;
  value: number;
  unit?: string;
  timestamp?: string;
  /** Optional extra context (e.g. breakdown per hook) */
  breakdown?: Array<{
    hook: string;
    avgMs: number;
    p95Ms: number;
    rps?: number;
  }>;
  [key: string]: unknown;
}

/** Union type for all possible metric shapes */
export type BenchmarkMetric = Record<string, unknown> | NumericMetric;

// ─────────────────────────────────────────────────────────────
// Trend Intelligence Types (Smart Per-Adapter Analysis)
// ─────────────────────────────────────────────────────────────

/** Direction of a metric trend over historical runs */
export type TrendDirection = "improving" | "stable" | "degrading" | "critical";

/** Model used for forecasting (linear for latency, exponential for memory) */
export type ForecastModel = "linear" | "exponential";

/** What kind of alert is this */
export type AlertKind =
  | "regression" // metric statistically degraded
  | "harness_fail" // benchmark harness itself failed
  | "zero_result" // metric returned 0 when it shouldn't (harness problem)
  | "budget_exceeded" // metric exceeded hard budget
  | "spike" // single-run outlier, not a sustained regression
  | "warming"; // baseline still building after reset

/** Severity levels for alerts */
export type AlertSeverity = "info" | "warn" | "critical";

/** Category for grouping metrics in correlation analysis */
export type MetricCategory =
  | "latency"
  | "throughput"
  | "js_memory" // V8 heap (GC-managed)
  | "native_memory" // RSS, external (sharp, better-sqlite3)
  | "startup"
  | "scale";

/** Root cause classification for a regression */
export type RegressionRootCause =
  | "adapter" // DB raw slowed, downstream affected
  | "middleware" // Hooks slowed, REST affected, DB raw OK
  | "scale" // Only appears under high load (index pressure, mixed)
  | "native" // RSS growing, JS heap stable → native allocator leak
  | "environment_cpu" // All latency metrics shifted, memory stable
  | "environment_memory" // RSS and heap shifted, latency stable
  | "unknown";

/** Per-adapter, per-metric trend snapshot with statistical detail */
export interface MetricTrend {
  adapter: string;
  metric: string;
  category: MetricCategory;
  current: number;
  baseline: number; // weighted historical average
  stddev: number; // historical variance
  slope: number; // linear regression slope (ms per run)
  r2: number; // regression fit quality
  sampleSize: number; // number of historical runs used
  direction: TrendDirection;
  confidence: number; // 0-1 how confident in the trend
  forecastModel: ForecastModel; // which model to use for forecasting
  forecastRunsToBreach: number | null; // runs until budget exceeded
}

/** Correlation rule for root cause detection */
export interface CorrelationRule {
  name: RegressionRootCause;
  primaryMetric: string;
  correlatedMetrics: string[];
  antiCorrelatedMetrics: string[]; // must NOT be affected for this root cause
}

/** A smart alert with context, correlation evidence, and recommendation */
export interface SmartAlert {
  kind: AlertKind;
  severity: AlertSeverity;
  adapter: string;
  metrics: string[];
  rootCause: RegressionRootCause;
  correlationEvidence: string;
  recommendation: string;
  confidence: number;
  timestamp: string;
}

/** Per-adapter performance budget overrides (learned or set) */
export interface AdapterBudget {
  coldStartMs?: number;
  collections?: number;
  graphqlAvg?: number;
  dbRaw?: number;
  hooks?: number;
  memGrowth?: number;
  securityMs?: number;
  openapiHit?: number;
  indexPressure?: number;
  buildDuration?: number;
}
