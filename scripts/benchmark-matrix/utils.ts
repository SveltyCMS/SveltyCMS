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
export function checkServiceHealth(type: string): { healthy: boolean; error?: string } {
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
          { stdio: "ignore" },
        );
        return { healthy: true };
      case "postgresql":
      case "postgres":
        execSync("docker exec postgres pg_isready -U postgres", { stdio: "ignore" });
        return { healthy: true };
      case "mongodb":
      case "mongo":
        execSync("docker exec mongo mongosh --eval \"db.adminCommand('ping')\" --quiet", {
          stdio: "ignore",
        });
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
export function extractMetrics(metrics: Record<string, unknown> = {}, _dbType: string) {
  const m = metrics ?? {};

  const getMetric = (pattern: string | RegExp, fallback = 0): number => {
    const slugify = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const slugPattern = typeof pattern === "string" ? slugify(pattern) : null;

    // 1. Search structured numeric-metric entries (preferred)
    for (const key of Object.keys(m)) {
      const entry = m[key];
      const cleanKey = key.replace(/_metric$/, "").replace(/-metric$/, "");

      const isMatch =
        (slugPattern && slugify(cleanKey).includes(slugPattern)) ||
        (typeof pattern === "string" && cleanKey.toLowerCase().includes(pattern.toLowerCase()));

      if (isNumericMetric(entry)) {
        if (isMatch) return entry.value;
        if (matchesPattern(entry.name, pattern)) {
          return entry.value;
        }
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
            (typeof pattern === "string" && subKey.toLowerCase().includes(pattern.toLowerCase()));

          if (subMatch) {
            if (typeof subEntry === "number") return subEntry;
            if (typeof subEntry === "object" && subEntry !== null) {
              const val =
                (subEntry as any).value ?? (subEntry as any).avgMs ?? (subEntry as any).p95Ms;
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
      (findResult(m, "truth-rest") as any)?.p95Ms ||
      (findResult(m, "truth-latency") as any)?.p95Ms ||
      0,
    restAvg:
      getMetric("rest.collections.avg") ||
      getMetric("REST Avg") ||
      (findResult(m, "rest-api-performance") as any)?.avgMs ||
      (findResult(m, "rest-collections") as any)?.avgMs ||
      0,
    restRps:
      getMetric("rest.collections.rps") ||
      getMetric("REST RPS") ||
      (findResult(m, "rest-api-performance") as any)?.rps ||
      0,
    dbRaw:
      getMetric("adapter.read.avg") ||
      getMetric("DB Raw p95") ||
      (findResult(m, "database-performance") as any)?.p95Ms ||
      (findResult(m, "DB Baseline") as any)?.p95Ms ||
      0,
    hooks:
      getMetric("middleware.hooks.p95") ||
      getMetric("Hooks p95") ||
      (findResult(m, "hooks-performance") as any)?.avgMs ||
      (findResult(m, "Auth+Security") as any)?.avgMs ||
      (findResult(m, "Turbo") as any)?.avgMs ||
      (findResult(m, "Full Security + Auth Pipeline") as any)?.avgMs ||
      (findResult(m, "Turbo Pipeline") as any)?.avgMs ||
      0,
    graphqlAvg:
      getMetric("api.graphql.avg") ||
      getMetric("graphql.query.avg") ||
      getMetric("GQL Stress") ||
      getMetric("graphql-stress") ||
      (findResult(m, "graphql-api-performance") as any)?.avgMs ||
      (findResult(m, "graphql-stress") as any)?.avgMs ||
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
      (findResult(m, "relational-performance") as any)?.avgMs ||
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
    bundleSize: getMetric("dx.bundle.size.total") || getMetric("Bundle Size") || 0,
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
      (findResult(m, "multi-tenant-performance") as any)?.avgMs ||
      (findResult(m, "Multi-Tenant Context Switching") as any)?.p95Ms ||
      (findResult(m, "Multi-Tenant Context Switching") as any)?.avgMs ||
      0,
    mixedAvg:
      getMetric("scale.mixed.avg") ||
      getMetric("Mixed Workload Avg") ||
      (findResult(m, "mixed-workload") as any)?.avgMs ||
      0,
    telemetryAvg:
      getMetric("internals.telemetry.avg") ||
      getMetric("Telemetry p95") ||
      (findResult(m, "telemetry-performance") as any)?.avgMs ||
      (findResult(m, "Happy") as any)?.p95Ms ||
      (findResult(m, "Happy") as any)?.avgMs ||
      (findResult(m, "Telemetry (Happy Path)") as any)?.p95Ms ||
      (findResult(m, "Telemetry (Happy Path)") as any)?.avgMs ||
      0,
    indexPressure:
      getMetric("index.pressure.p95") ||
      getMetric("Million-Row Index") ||
      (findResult(m, "index-pressure") as any)?.p95Ms ||
      (findResult(m, "Sorted List (100k rows)") as any)?.p95Ms ||
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

export function checkBudget(m: ReturnType<typeof extractMetrics>, coldStartMs: number): string[] {
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

  return violations;
}

// ─────────────────────────────────────────────────────────────
// Trend Analysis (from SQLite history)
// ─────────────────────────────────────────────────────────────

export async function getTrendDetails(
  db: any,
  dbKey: string,
  currentVal: number,
  column: string,
): Promise<{ icon: string; pct: string; isRegression: boolean; previousAvg: number }> {
  if (!currentVal) return { icon: "⚪", pct: "—", isRegression: false, previousAvg: 0 };

  try {
    // 🚀 SURGICAL FIX: Exclude the current run (the latest one) from the average
    // to get a true delta against history.
    const row = db
      .query(
        `
        SELECT AVG(${column}) as avg_val
        FROM (
          SELECT ${column} FROM runs
          WHERE db_key = ? AND status = 'SUCCESS' AND ${column} > 0
          ORDER BY timestamp DESC LIMIT 10 OFFSET 1
        )
      `,
      )
      .get(dbKey) as { avg_val: number | null };

    if (!row?.avg_val) return { icon: "⚪", pct: "—", isRegression: false, previousAvg: 0 };

    const pct = ((currentVal - row.avg_val) / row.avg_val) * 100;
    const isRegression = pct > 15; // Relaxed regression threshold for dev environments
    const icon = pct < -5 ? "🟢" : pct > 10 ? "🔴" : "⚪";

    return {
      icon,
      pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      isRegression,
      previousAvg: row.avg_val,
    };
  } catch {
    return { icon: "⚪", pct: "—", isRegression: false, previousAvg: 0 };
  }
}

// ─────────────────────────────────────────────────────────────
// Port Management
// ─────────────────────────────────────────────────────────────

export async function waitForPortFree(port: number, timeoutMs = 8000): Promise<void> {
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

  log.warn(`Port ${port} did not become free within ${timeoutMs}ms — proceeding anyway.`);
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
];

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /[\u001b\u009b]\[[0-9;]*[JKmsu]/g;

export function isNoisyLine(line: string): boolean {
  const clean = line.replace(ANSI_STRIP, "");
  const isQuiet = process.env.QUIET === "true";

  if (isQuiet && (clean.includes("[INFO ]") || clean.includes("[DEBUG]"))) {
    return true;
  }

  return (
    /→\s+[0-9]{3}/.test(clean) ||
    /(GET|POST|PUT|DELETE|PATCH) \/.* [0-9]{3}/i.test(clean) ||
    NOISY_SERVER_PATTERNS.some((p) => p.test(clean))
  );
}
