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

/** Result of a complete database audit run */
export interface BenchmarkResult {
  db: string;
  version?: string;
  status: "SUCCESS" | "FAILED";
  coldStartMs?: number;
  metrics?: Record<string, unknown>;
  buildTimeMs?: number;
  hostInfo?: HostInfo;
  error?: string;
  /** Whether this result comes from history.sqlite instead of current run */
  isHistorical?: boolean;
  /** Timing per individual benchmark script */
  scriptTimings?: Record<string, number>;
  /** List of performance budget violations for this DB */
  budgetViolations?: string[];
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
  list: boolean;
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
