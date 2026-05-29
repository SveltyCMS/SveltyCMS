/**
 * @file scripts/benchmark-matrix/utils.ts
 * @description Pure utility functions for the benchmark matrix tool.
 */

import { statSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { log } from "./logger";
import { PERFORMANCE_BUDGET } from "./config";
import type { NumericMetric } from "./types";

// ─────────────────────────────────────────────────────────────
// Build & File System Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Deep check if a rebuild is needed by comparing mtime of all files in src/
 * against the build/ directory.
 */
export function requiresRebuild(): boolean {
  const buildPath = path.join(process.cwd(), "build");
  const serverEntry = path.join(buildPath, "index.js");

  // 🛡️ CRITICAL: If build folder or server entry is missing, we MUST rebuild
  if (!existsSync(buildPath) || !existsSync(serverEntry)) return true;

  // 🛡️ CRITICAL: If the current build contains stripped database stubs, we MUST rebuild to compile all adapters for the benchmark matrix
  function checkStubs(dir: string): boolean {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (checkStubs(fullPath)) return true;
        } else if (entry.name.includes("db-stub")) {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }
  if (checkStubs(buildPath)) {
    log.info(
      "Stripped build detected in build/ folder. Forcing full rebuild with all adapters...",
    );
    return true;
  }

  const buildTime = statSync(serverEntry).mtimeMs;
  const srcPath = path.join(process.cwd(), "src");

  function scan(dir: string): boolean {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (scan(fullPath)) return true;
        } else {
          if (statSync(fullPath).mtimeMs > buildTime) return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  return scan(srcPath);
}

// ─────────────────────────────────────────────────────────────
// Environment Health Checks
// ─────────────────────────────────────────────────────────────

/**
 * Checks if a Docker container for a specific service is running and responsive.
 */
export function checkServiceHealth(type: string): {
  healthy: boolean;
  error?: string;
} {
  // 🚀 CI RESILIENCE: In GitHub Actions/CI, services are managed by the runner's infrastructure.
  // We assume health as the workflow already performs a 'wait-on' check.
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    return { healthy: true };
  }

  try {
    switch (type) {
      case "mariadb":
      case "mysql":
        execSync(
          "docker exec mariadb mariadb-admin ping -h 127.0.0.1 -u root --password=mariadb",
          {
            stdio: "ignore",
          },
        );
        return { healthy: true };
      case "postgresql":
      case "postgres":
        execSync("docker exec postgres pg_isready -U postgres", {
          stdio: "ignore",
        });
        return { healthy: true };
      case "mongodb":
      case "mongo":
        execSync(
          "docker exec mongo mongosh --eval \"db.adminCommand('ping')\" --quiet",
          {
            stdio: "ignore",
          },
        );
        return { healthy: true };
      case "redis":
        execSync("docker exec redis redis-cli ping", { stdio: "ignore" });
        return { healthy: true };
      default:
        return { healthy: true }; // Assume unknown/local services are managed externally
    }
  } catch {
    return {
      healthy: false,
      error: `Service ${type} is not responding. Ensure Docker container '${type}' or equivalent is running.`,
    };
  }
}

/**
 * Validates the entire environment for a specific database configuration.
 */
export function validateEnvironment(
  dbType: string,
  useRedis: boolean,
): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check main DB
  if (dbType !== "sqlite") {
    const dbHealth = checkServiceHealth(dbType);
    if (!dbHealth.healthy) errors.push(dbHealth.error!);
  }

  // Check Redis if enabled
  if (useRedis) {
    const redisHealth = checkServiceHealth("redis");
    if (!redisHealth.healthy) errors.push(redisHealth.error!);
  }

  return { success: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────
// Metrics Extraction
// ─────────────────────────────────────────────────────────────

/**
 * Normalizes a key by replacing non-alphanumeric chars with underscores.
 */
function normalizeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

/**
 * Attempts to find a result in the metrics object by normalizing the key.
 */
function findResult(m: Record<string, unknown>, target: string): unknown {
  const normTarget = normalizeKey(target);
  for (const key of Object.keys(m)) {
    if (normalizeKey(key) === normTarget) return m[key];
  }
  return undefined;
}

/**
 * Extracts standardized metrics from benchmark output files.
 * Supports both legacy flat fields and new structured `numeric-metric` format.
 */
export function extractMetrics(
  metrics: Record<string, unknown> = {},
  _dbType: string,
) {
  const m = metrics ?? {};

  const getMetric = (pattern: string | RegExp, fallback = 0): number => {
    const slugify = (s: string) =>
      s.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const slugPattern = typeof pattern === "string" ? slugify(pattern) : null;

    // 1. Search structured numeric-metric entries (preferred)
    for (const key of Object.keys(m)) {
      const entry = m[key];
      const cleanKey = key.replace(/_metric$/, "").replace(/-metric$/, "");

      const isMatch =
        (slugPattern && slugify(cleanKey).includes(slugPattern)) ||
        (typeof pattern === "string" &&
          cleanKey.toLowerCase().includes(pattern.toLowerCase()));

      if (isNumericMetric(entry)) {
        if (isMatch) return entry.value;
        if (matchesPattern(entry.name, pattern)) {
          return entry.value;
        }
      }

      // 🚀 HARDENING: If the key matches and entry is a plain object with metric fields,
      // extract directly (handles exportResult JSON files like Sorted_List_*.json)
      if (
        isMatch &&
        typeof entry === "object" &&
        entry !== null &&
        !isNumericMetric(entry)
      ) {
        const directVal =
          (entry as any).p95Ms ?? (entry as any).avgMs ?? (entry as any).value;
        if (typeof directVal === "number") return directVal;
      }

      // Check nested objects (some results are wrapped, like matrix_metrics or individual benchmark JSONs)
      if (typeof entry === "object" && entry !== null) {
        for (const subKey of Object.keys(entry)) {
          const subEntry = (entry as Record<string, unknown>)[subKey];

          // Case 1: subEntry is a numeric metric
          if (isNumericMetric(subEntry)) {
            if (slugPattern && slugify(subEntry.name).includes(slugPattern)) {
              return subEntry.value;
            }
            if (matchesPattern(subEntry.name, pattern)) {
              return subEntry.value;
            }
          }

          // Case 2: subKey itself matches the pattern (for matrix_metrics.json structure)
          const subMatch =
            (slugPattern && slugify(subKey).includes(slugPattern)) ||
            (typeof pattern === "string" &&
              subKey.toLowerCase().includes(pattern.toLowerCase()));

          if (subMatch) {
            if (typeof subEntry === "number") return subEntry;
            if (typeof subEntry === "object" && subEntry !== null) {
              const val =
                (subEntry as any).value ??
                (subEntry as any).avgMs ??
                (subEntry as any).p95Ms;
              if (typeof val === "number") return val;
            }
          }
        }
      }
    }

    // 2. Fallback to legacy key matching
    const legacyKey = Object.keys(m).find((k) => {
      if (slugPattern && slugify(k).includes(slugPattern)) return true;
      return matchesPattern(k, pattern);
    });

    if (!legacyKey) return fallback;

    const entry = m[legacyKey];
    if (typeof entry === "number") return entry;

    return (
      (entry as any)?.value ??
      (entry as any)?.p95Ms ??
      (entry as any)?.avgMs ??
      (entry as any)?.rps ??
      fallback
    );
  };

  return {
    collections:
      getMetric("truth-rest-p95") ||
      getMetric("truth.latency.http.p95") ||
      getMetric("truth.http.p95") ||
      getMetric("api.latency.avg") ||
      getMetric("api.latency.http") ||
      getMetric("rest.collections.p95") ||
      getMetric("REST p95") ||
      getMetric("REST (Collections)") ||
      (findResult(m, "truth-rest") as any)?.p95Ms ||
      (findResult(m, "truth-latency") as any)?.p95Ms ||
      (findResult(m, "api-latency") as any)?.p95Ms ||
      (findResult(m, "HTTP End-to-End") as any)?.p95Ms ||
      0,
    restAvg:
      getMetric("rest.collections.avg") ||
      getMetric("REST Avg") ||
      getMetric("truth.http.avg") ||
      (findResult(m, "rest-api-performance") as any)?.avgMs ||
      (findResult(m, "rest-collections") as any)?.avgMs ||
      (findResult(m, "HTTP End-to-End") as any)?.avgMs ||
      0,
    restRps:
      getMetric("rest.collections.rps") ||
      getMetric("REST RPS") ||
      (findResult(m, "rest-api-performance") as any)?.rps ||
      (findResult(m, "HTTP End-to-End") as any)?.rps ||
      0,
    dbRaw:
      getMetric("adapter.read.avg") ||
      getMetric("DB Raw p95") ||
      getMetric("db-raw-p95") ||
      (findResult(m, "database-performance") as any)?.p95Ms ||
      (findResult(m, "DB Baseline") as any)?.p95Ms ||
      (findResult(m, "FIND ONE") as any)?.p95Ms ||
      0,
    hooks:
      getMetric("middleware.hooks.avg") ||
      (findResult(m, "hooks-performance") as any)?.avgMs ||
      (findResult(m, "Auth+Security") as any)?.avgMs ||
      (findResult(m, "Full Security + Auth Pipeline") as any)?.avgMs ||
      (findResult(m, "Turbo Pipeline") as any)?.avgMs ||
      getMetric("middleware.hooks.p95") ||
      getMetric("Hooks p95") ||
      getMetric("middleware-hooks-p95") ||
      (findResult(m, "Full Security + Auth Pipeline") as any)?.p95Ms ||
      0,
    graphqlAvg:
      getMetric("api.graphql.avg") ||
      getMetric("graphql.query.avg") ||
      getMetric("GQL Stress") ||
      getMetric("graphql-stress") ||
      getMetric("GraphQL API Performance") ||
      (findResult(m, "graphql-api-performance") as any)?.avgMs ||
      (findResult(m, "graphql-stress") as any)?.avgMs ||
      (findResult(m, "GQL Stress: TINY") as any)?.avgMs ||
      0,
    gqlRps:
      getMetric("api.graphql.rps") ||
      getMetric("graphql.query.rps") ||
      (findResult(m, "graphql-api-performance") as any)?.rps ||
      0,
    authAvg:
      getMetric("auth.middleware.avg") ||
      getMetric("Auth Avg") ||
      (findResult(m, "auth-performance") as any)?.avgMs ||
      0,
    authRps:
      getMetric("auth.max_rps") ||
      getMetric("Auth RPS") ||
      (findResult(m, "auth-performance") as any)?.rps ||
      0,
    relationalAvg:
      getMetric("logic.relational.avg") ||
      getMetric("Relational p95") ||
      getMetric("relational-performance") ||
      (findResult(m, "relational-performance") as any)?.avgMs ||
      (findResult(m, "relational-performance") as any)?.p95Ms ||
      (findResult(m, "Deep Relational Query") as any)?.p95Ms ||
      (findResult(m, "Deep Relational Query") as any)?.avgMs ||
      0,
    widgetAvg:
      getMetric("logic.widget.avg") ||
      getMetric("Widget Avg") ||
      (findResult(m, "widget-performance") as any)?.avgMs ||
      0,
    mediaAvg:
      getMetric("media.processing.avg") ||
      getMetric("Media Avg") ||
      (findResult(m, "media-performance") as any)?.avgMs ||
      0,
    scanAvg:
      getMetric("internals.scan.avg") ||
      getMetric("Scan Avg") ||
      (findResult(m, "content-scan") as any)?.avgMs ||
      0,
    memGrowth:
      getMetric("internals.memory.rss_delta") ||
      getMetric("Memory RSS Delta") ||
      (findResult(m, "Memory Stability") as any)?.rssDelta ||
      (findResult(m, "memory-stability") as any)?.rssDelta ||
      0,
    securityMs:
      getMetric("security.waf.avg") ||
      getMetric("Security WAF Avg") ||
      (findResult(m, "security-audit") as any)?.avgMs ||
      0,
    openapiHit:
      getMetric("api.openapi.warm.p95") ||
      getMetric("OpenAPI Warm Hit") ||
      (findResult(m, "openapi-performance") as any)?.avgMs ||
      0,
    buildDuration:
      getMetric("dx.build.duration") ||
      getMetric("Build Duration") ||
      (findResult(m, "Production Build") as any)?.avgMs ||
      (findResult(m, "dx-build") as any)?.durationMs ||
      0,
    bundleSize:
      getMetric("dx.bundle.size.total") || getMetric("Bundle Size") || 0,
    txCommit:
      getMetric("adapter.transaction.commit.avg") ||
      getMetric("TX Commit Avg") ||
      (findResult(m, "transaction-acid") as any)?.avgMs ||
      (findResult(m, "TX Commit") as any)?.avgMs ||
      0,
    systemCpu:
      getMetric("cpu-audit") ||
      getMetric("CPU Load") ||
      (findResult(m, "cpu-audit") as any)?.loadPct ||
      0,
    realtimeLatency:
      getMetric("realtime.broadcast.avg") ||
      getMetric("Realtime Latency") ||
      (findResult(m, "realtime-performance") as any)?.avgMs ||
      0,
    tenancyAvg:
      getMetric("scale.tenancy.avg") ||
      getMetric("Tenancy p95") ||
      getMetric("multi-tenant-performance") ||
      (findResult(m, "multi-tenant-performance") as any)?.avgMs ||
      (findResult(m, "Multi-Tenant Context Switching") as any)?.p95Ms ||
      (findResult(m, "Multi-Tenant Context Switching") as any)?.avgMs ||
      0,
    mixedAvg:
      getMetric("scale.mixed.avg") ||
      getMetric("Mixed Workload Avg") ||
      getMetric("Mixed Workload") ||
      (findResult(m, "mixed-workload") as any)?.avgMs ||
      (findResult(m, "Mixed Workload") as any)?.p95Ms ||
      (findResult(m, "Mixed Workload") as any)?.avgMs ||
      0,
    telemetryAvg:
      getMetric("internals.telemetry.avg") ||
      getMetric("Telemetry p95") ||
      getMetric("telemetry-performance") ||
      (findResult(m, "telemetry-performance") as any)?.avgMs ||
      (findResult(m, "Happy") as any)?.p95Ms ||
      (findResult(m, "Happy") as any)?.avgMs ||
      (findResult(m, "Telemetry (Happy Path)") as any)?.p95Ms ||
      (findResult(m, "Telemetry (Happy Path)") as any)?.avgMs ||
      0,
    indexPressure:
      getMetric("index.pressure.p95") ||
      getMetric("Million-Row Index") ||
      getMetric("Sorted List") ||
      (findResult(m, "index-pressure") as any)?.p95Ms ||
      (findResult(m, "Sorted List (100k rows)") as any)?.p95Ms ||
      (findResult(m, "Sorted List (25k rows)") as any)?.p95Ms ||
      0,
  };
}

// Type guard for structured metrics
function isNumericMetric(value: unknown): value is NumericMetric {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any)._type === "numeric-metric" &&
    typeof (value as any).name === "string" &&
    typeof (value as any).value === "number"
  );
}

function matchesPattern(value: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(value);
}

// ─────────────────────────────────────────────────────────────
// Budget Checking
// ─────────────────────────────────────────────────────────────

export function checkBudget(
  m: ReturnType<typeof extractMetrics>,
  coldStartMs: number,
): string[] {
  const violations: string[] = [];

  const check = (key: string, value: number) => {
    const limit = (PERFORMANCE_BUDGET as any)[key];
    if (limit !== undefined && value > 0 && value > limit) {
      violations.push(`${key}: ${value.toFixed(1)} > budget ${limit}`);
    }
  };

  check("coldStartMs", coldStartMs);
  check("collections", m.collections);
  check("graphqlAvg", m.graphqlAvg);
  check("dbRaw", m.dbRaw);
  check("hooks", m.hooks);
  check("memGrowth", m.memGrowth);
  check("securityMs", m.securityMs);
  check("openapiHit", m.openapiHit);
  check("indexPressure", m.indexPressure);

  return violations;
}

// ─────────────────────────────────────────────────────────────
// Trend Analysis (Statistical Engine — upgraded from simple avg)
// ─────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for the old getTrendDetails. Uses linear regression
 * when enough history exists (MIN_RUNS_FOR_TREND=7), falls back to weighted
 * average during baseline-building. Upgrades all 6 reporting.ts call sites
 * automatically with zero changes to reporting.ts.
 */
export async function getTrendDetails(
  db: any,
  dbKey: string,
  currentVal: number,
  column: string,
): Promise<{
  icon: string;
  pct: string;
  isRegression: boolean;
  previousAvg: number;
}> {
  if (!currentVal)
    return { icon: "⚪", pct: "—", isRegression: false, previousAvg: 0 };

  try {
    const rows = db
      .query(
        `SELECT ${column} FROM runs
         WHERE db_key = ? AND status = 'SUCCESS' AND ${column} > 0
         ORDER BY timestamp DESC LIMIT 20`,
      )
      .all(dbKey) as { [k: string]: number }[];

    const values = rows.map((r) => r[column]).reverse(); // oldest first for regression

    if (values.length < MIN_RUNS_FOR_TREND) {
      // Baseline-building: fall back to weighted average
      const avg = values.length > 0 ? weightedAverage(values) : 0;
      if (!avg)
        return { icon: "⚪", pct: "—", isRegression: false, previousAvg: 0 };
      const pct = ((currentVal - avg) / avg) * 100;
      return {
        icon: "⚪",
        pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
        isRegression: false,
        previousAvg: avg,
      };
    }

    // Full statistical analysis with enough history
    const { slope } = linearRegression(
      values.map((v, i) => [i, v] as [number, number]),
    );
    const baseline = weightedAverage(values);
    const sd = stddev(values);
    const { direction } = classifyTrend(
      slope,
      sd,
      getBudgetForColumn(column),
      currentVal,
      values.length,
    );

    const pct = ((currentVal - baseline) / baseline) * 100;
    const isRegression = direction === "degrading" || direction === "critical";
    const icon =
      direction === "improving"
        ? "🟢"
        : direction === "degrading" || direction === "critical"
          ? "🔴"
          : "⚪";

    return {
      icon,
      pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      isRegression,
      previousAvg: baseline,
    };
  } catch {
    return { icon: "⚪", pct: "—", isRegression: false, previousAvg: 0 };
  }
}

/** Map history column names to budget keys for classifyTrend */
function getBudgetForColumn(column: string): number {
  const map: Record<string, number> = {
    cold_start_ms: PERFORMANCE_BUDGET.coldStartMs,
    collections_p95: PERFORMANCE_BUDGET.collections,
    graphql_avg: PERFORMANCE_BUDGET.graphqlAvg,
    middleware_hooks_p95: PERFORMANCE_BUDGET.hooks,
    index_pressure_p95: PERFORMANCE_BUDGET.indexPressure,
    adapter_read_avg: PERFORMANCE_BUDGET.dbRaw,
    mem_growth: PERFORMANCE_BUDGET.memGrowth,
    mixed_workload_aggregate: PERFORMANCE_BUDGET.indexPressure,
  };
  return map[column] ?? 100;
}

/**
 * Load raw historical values for a metric (used by regression-detector).
 * Returns oldest-first array for regression analysis.
 */
export function loadMetricHistory(
  db: any,
  dbKey: string,
  column: string,
  limit = 20,
): number[] {
  try {
    const rows = db
      .query(
        `SELECT ${column} FROM runs
         WHERE db_key = ? AND status = 'SUCCESS' AND ${column} > 0
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(dbKey, limit) as { [k: string]: number }[];
    return rows.map((r) => r[column]).reverse();
  } catch {
    return [];
  }
}

// Port Management
// ─────────────────────────────────────────────────────────────

export async function waitForPortFree(
  port: number,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      return; // port is free
    }
  }

  log.warn(
    `Port ${port} did not become free within ${timeoutMs}ms — proceeding anyway.`,
  );
}

export async function freePort(port: number): Promise<void> {
  log.info(`Ensuring port ${port} and 3001 are free...`);

  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port},3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`lsof -ti:${port},3001 | xargs kill -9 2>/dev/null || true`, {
        stdio: "ignore",
      });
    }

    await waitForPortFree(port, 6000);
  } catch {
    // best-effort
  }
}

// ─────────────────────────────────────────────────────────────
// Log Filtering
// ─────────────────────────────────────────────────────────────

const NOISY_SERVER_PATTERNS: RegExp[] = [
  /AppError \[.*\]: User not found/i,
  /GET_ACTIVE_THEME_FAILED/i,
  /UNIQUE constraint failed/i,
  /Method listSchemas not yet implemented/i,
  /CREATE_ROLE_FAILED/i,
  /AutomationService/i,
  /Config exists but NO USERS found/i,
  /ENOENT.*config\/private\.ts/i,
  /No changes made to private\.ts/i,
  /Failed to read keys from private\.ts/i,
  /Using DEFAULT_THEME fallback/i,
  /ModifyRequest completed in/i,
  /Role ".*" creation returned failure/i,
  /setupCheck/i,
  /DEBUG:/i,
  /Initial MariaDB connection check failed/i,
  /Initial PostgreSQL connection check failed/i,
  /MariaDB adapter error/i,
  /force rollback/i,
  /\[Turbo\] TEST BYPASS/i,
  /\[Turbo\].*method=/i,
  /\[DEBUG\] config-state\.ts/i,
  /\[DB Init\] Resolved adapter type/i,
  /\[Boot\]/i,
  /\[TestingHandler\]/i,
  /BenchmarkStable/i,
  /Plugin '.*' is already registered/i,
  /Plugin .* is already registered/i,
];

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /[\u001b\u009b]\[[0-9;]*[JKmsu]/g;

export function isNoisyLine(line: string): boolean {
  const clean = line.replace(ANSI_STRIP, "");
  const isQuiet = process.env.QUIET === "true";

  if (
    isQuiet &&
    (clean.includes("[INFO]") ||
      clean.includes("[INFO ]") ||
      clean.includes("[DEBUG]") ||
      clean.includes("ℹ️") ||
      clean.includes("🐛") ||
      clean.includes("Migration") ||
      clean.includes("Connected ->") ||
      clean.includes("Adapter Connected") ||
      clean.includes("System state changed") ||
      clean.includes("bootAll") ||
      clean.includes("Initializing service") ||
      clean.includes("Initialized:") ||
      clean.includes("Service database initialized"))
  ) {
    return true;
  }

  return (
    /→\s+[0-9]{3}/.test(clean) ||
    /(GET|POST|PUT|DELETE|PATCH) \/.* [0-9]{3}/i.test(clean) ||
    NOISY_SERVER_PATTERNS.some((p) => p.test(clean))
  );
}

// =============================================================
// Statistical Engine — Smart Per-Adapter Trend Intelligence
// =============================================================

/**
 * Minimum runs needed before statistical analysis is reliable.
 * MIN_RUNS_FOR_TREND=7: Linear regression slope becomes meaningful (~95% CI).
 * MIN_RUNS_FOR_FORECAST=12: Forecast extrapolation is reliable enough.
 *   We use 12 rather than 5 because linear extrapolation on 5 points
 *   produces slopes with enormous error bars, making forecasts junk.
 * MIN_RUNS_FOR_CORRELATION=8: Pearson r needs at least 8 points for
 *   statistical significance at p<0.05.
 */
export const MIN_RUNS_FOR_TREND = 7;
export const MIN_RUNS_FOR_FORECAST = 12;
export const MIN_RUNS_FOR_CORRELATION = 8;

/**
 * Weight decay for moving averages. Linear [1,2,3,...] is safer for
 * noisy CI environments than exponential [1,2,4,8,...] which over-reacts
 * to a single bad run.
 */
export let TREND_WEIGHT_DECAY: "linear" | "exponential" = "linear";

/** Fraction of values trimmed from each end before computing baseline/slope */
export const OUTLIER_TRIM_FRACTION = 0.1;

/**
 * Simple linear regression: y = slope * x + intercept.
 * Returns slope, intercept, and R² (0=no fit, 1=perfect).
 */
export function linearRegression(points: [number, number][]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.[1] ?? 0, r2: 0 };
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let ssRes = 0,
    ssTot = 0;
  const yMean = sumY / n;
  for (const [x, y] of points) {
    const predicted = slope * x + intercept;
    ssRes += (y - predicted) ** 2;
    ssTot += (y - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/** Weighted moving average. Recent values have higher weight. */
export function weightedAverage(
  values: number[],
  decay?: "linear" | "exponential",
): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const d = decay ?? TREND_WEIGHT_DECAY;
  const weights = values.map((_, i) => (d === "exponential" ? 2 ** i : i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / total;
}

/** Population standard deviation */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length,
  );
}

/** Pearson correlation coefficient (-1 to 1) between two metric series */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < MIN_RUNS_FOR_CORRELATION) return 0;
  const aMean = a.reduce((s, v) => s + v, 0) / n;
  const bMean = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0,
    aVar = 0,
    bVar = 0;
  for (let i = 0; i < n; i++) {
    const ad = a[i] - aMean,
      bd = b[i] - bMean;
    cov += ad * bd;
    aVar += ad ** 2;
    bVar += bd ** 2;
  }
  const denom = Math.sqrt(aVar * bVar);
  return denom === 0 ? 0 : cov / denom;
}

/** Remove top/bottom outliers, return trimmed array and bounds */
export function trimOutliers(
  values: number[],
  fraction = OUTLIER_TRIM_FRACTION,
): { trimmed: number[]; lo: number; hi: number } {
  if (values.length < 5) return { trimmed: [...values], lo: 0, hi: 0 };
  const s = [...values].sort((a, b) => a - b);
  const c = Math.floor(s.length * fraction);
  return {
    trimmed: s.slice(c, s.length - c),
    lo: s[c],
    hi: s[s.length - 1 - c],
  };
}

/**
 * Classify trend direction with confidence, guarding against small samples.
 * Effect size = |slope| / (stddev / sqrt(n)). Effect > 2 + budget > 80% = critical.
 */
export function classifyTrend(
  slope: number,
  stddev: number,
  budget: number,
  current: number,
  sampleSize: number,
): { direction: string; confidence: number } {
  if (sampleSize < MIN_RUNS_FOR_TREND)
    return { direction: "stable", confidence: 0 };
  const se = stddev / Math.sqrt(sampleSize);
  const effectSize = se > 0 ? Math.abs(slope) / se : 0;
  const confidence = Math.min(0.95, effectSize / 3);
  if (effectSize < 1.0) return { direction: "stable", confidence };
  const pct = budget > 0 ? (current / budget) * 100 : 0;
  if (slope > 0 && pct > 80) return { direction: "critical", confidence };
  if (slope > 0 && effectSize > 2)
    return { direction: "degrading", confidence };
  if (slope < 0 && effectSize > 1.5)
    return { direction: "improving", confidence };
  return { direction: "stable", confidence };
}

/**
 * Forecast runs until budget breach.
 * Uses linear model for latency, exponential for memory (with 0.8x safety factor).
 * Memory growth is sub-linear early, then accelerates once fragmentation exceeds
 * a threshold — exponential model with safety multiplier is more conservative.
 */
export function forecastBreach(
  current: number,
  slope: number,
  budget: number,
  sampleSize: number,
  model: "linear" | "exponential" = "linear",
): number | null {
  if (sampleSize < MIN_RUNS_FOR_FORECAST) return null;
  if (slope <= 0 || budget <= 0 || current >= budget) return null;
  if (model === "exponential") {
    const effective = budget * 0.8; // 0.8x safety for accelerating fragmentation
    if (current >= effective) return 1;
    const rate = slope / Math.max(current, 1);
    if (rate <= 0) return null;
    return Math.ceil(Math.log(effective / current) / Math.log(1 + rate));
  }
  return Math.ceil((budget - current) / slope);
}

/**
 * Match observed degrading trends against correlation rules to classify root cause.
 * Rules are injected as parameter (not imported) for testability and configuration.
 * If rules array is empty, returns "unknown".
 */
export function classifyRootCause(
  degradingMetrics: Set<string>,
  rules: {
    name: string;
    primaryMetric: string;
    correlatedMetrics: string[];
    antiCorrelatedMetrics: string[];
  }[],
): string {
  if (degradingMetrics.size === 0) return "unknown";
  if (rules.length === 0) return "unknown";
  let best = "unknown",
    bestScore = 0;
  for (const r of rules) {
    if (!degradingMetrics.has(r.primaryMetric)) continue;
    let score = 1;
    for (const m of r.correlatedMetrics) if (degradingMetrics.has(m)) score++;
    for (const m of r.antiCorrelatedMetrics)
      if (degradingMetrics.has(m)) score -= 2;
    if (score > bestScore) {
      bestScore = score;
      best = r.name;
    }
  }
  return best;
}

/**
 * Check if a baseline reset occurred recently for the given adapter.
 * If within grace period (MIN_RUNS_FOR_TREND runs), the system is "warming up"
 * and should not fire alerts — baselines are still being established.
 */
export function isWarmingUp(db: any, adapter: string): boolean {
  try {
    const runsSinceReset = db
      .query(
        "SELECT COUNT(*) as cnt FROM runs WHERE db_key = ? AND timestamp > COALESCE((SELECT MAX(timestamp) FROM reset_events WHERE adapter = ?), '1970-01-01')",
      )
      .get(adapter, adapter) as { cnt: number } | null;
    return (runsSinceReset?.cnt ?? 99) < MIN_RUNS_FOR_TREND;
  } catch {
    return false; // If we can't check, don't suppress alerts
  }
}
