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
  if (!existsSync(buildPath)) return true;

  const buildTime = statSync(buildPath).mtimeMs;
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
// Metrics Extraction
// ─────────────────────────────────────────────────────────────

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
      getMetric("Collection List") ||
      getMetric("Entry Retrieval") ||
      getMetric("Dispatcher: findById") ||
      getMetric("REST (Average)") ||
      getMetric("rest-collections-p95") ||
      0,
    restAvg:
      getMetric("rest.collections.avg") ||
      getMetric("REST Avg") ||
      getMetric("truth.sdk.avg") ||
      getMetric("api.latency.sdk") ||
      getMetric("Dispatcher: findById") ||
      getMetric("REST (Average)") ||
      getMetric("rest-collections-avg") ||
      0,
    restRps:
      getMetric("rest.collections.rps") ||
      getMetric("REST RPS") ||
      getMetric("rest-api-performance") ||
      getMetric("rest-collections-rps") ||
      0,
    dbRaw:
      getMetric("adapter.read.avg") ||
      getMetric("DB Raw p95") ||
      getMetric("Adapter:") ||
      getMetric("adapter-read-avg") ||
      0,
    hooks:
      getMetric("middleware.hooks.p95") ||
      getMetric("Hooks p95") ||
      getMetric("hooks-performance") ||
      getMetric("middleware-hooks-p95") ||
      0,
    graphqlAvg:
      getMetric("api.graphql.avg") ||
      getMetric("graphql.query.avg") ||
      getMetric("GQL Avg") ||
      getMetric("GQL: Basic Collection") ||
      getMetric("GQL_Basic_Collection") ||
      getMetric("GraphQL (Average)") ||
      getMetric("graphql-average") ||
      0,
    gqlRps:
      getMetric("api.graphql.rps") ||
      getMetric("graphql.query.rps") ||
      getMetric("GQL RPS") ||
      getMetric("GQL: Basic Collection") ||
      getMetric("GQL_Basic_Collection") ||
      getMetric("graphql-api-performance") ||
      getMetric("graphql-query-rps") ||
      0,
    authAvg:
      getMetric("auth.middleware.avg") ||
      getMetric("Auth Avg") ||
      getMetric("auth.verification.avg") ||
      getMetric("Auth (Average)") ||
      getMetric("auth-middleware-avg") ||
      0,
    authRps:
      getMetric("auth.max_rps") ||
      getMetric("Auth RPS") ||
      getMetric("auth.verification.rps") ||
      getMetric("auth-performance") ||
      getMetric("auth-max-rps") ||
      0,
    relationalAvg:
      getMetric("logic.relational.avg") ||
      getMetric("Relational p95") ||
      getMetric("relational-performance") ||
      getMetric("logic-relational-avg") ||
      0,
    widgetAvg:
      getMetric("logic.widget.avg") ||
      getMetric("Widget Avg") ||
      getMetric("widget-performance") ||
      getMetric("logic-widget-avg") ||
      0,
    mediaAvg:
      getMetric("media.processing.avg") ||
      getMetric("Media Avg") ||
      getMetric("media-performance") ||
      getMetric("media-bulk-avg") ||
      0,
    scanAvg:
      getMetric("internals.scan.avg") ||
      getMetric("Scan Avg") ||
      getMetric("Content Scan") ||
      getMetric("internals-scan-avg") ||
      0,
    memGrowth:
      getMetric("internals.memory.rss_delta") ||
      getMetric("Memory RSS Delta") ||
      (m["memory-stability"] as any)?.rssDelta ||
      getMetric("memory-stability") ||
      0,
    securityMs:
      getMetric("security.waf.avg") ||
      getMetric("Security WAF Avg") ||
      getMetric("security.firewall.p95") ||
      getMetric("security-waf-avg") ||
      0,
    openapiHit:
      getMetric("api.openapi.warm.p95") ||
      getMetric("OpenAPI Warm Hit") ||
      getMetric("openapi.spec.avg") ||
      getMetric("api-openapi-warm-p95") ||
      0,
    buildDuration:
      getMetric("dx.build.duration") ||
      getMetric("Build Duration") ||
      (m["dx-build"] as any)?.durationMs ||
      getMetric("dx-build-duration") ||
      0,
    bundleSize:
      getMetric("dx.bundle.size.total") ||
      getMetric("Bundle Size") ||
      getMetric("dx-bundle-size-total") ||
      0,
    txCommit:
      getMetric("adapter.transaction.commit.avg") ||
      getMetric("TX Commit Avg") ||
      getMetric("adapter-transaction-commit-avg") ||
      0,
    systemCpu:
      getMetric("cpu-audit") || getMetric("CPU Load") || (m["cpu-audit"] as any)?.loadPct || 0,
    realtimeLatency:
      getMetric("realtime.broadcast.avg") ||
      getMetric("Realtime Latency") ||
      getMetric("realtime-performance") ||
      0,
    tenancyAvg:
      getMetric("scale.tenancy.avg") ||
      getMetric("Tenancy p95") ||
      getMetric("multi.tenant.p95") ||
      getMetric("multi-tenant-average") ||
      0,
    mixedAvg:
      getMetric("scale.mixed.avg") ||
      getMetric("Mixed Workload Avg") ||
      getMetric("workload.mixed.avg") ||
      getMetric("mixed-workload-aggregate") ||
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
): Promise<{ icon: string; pct: string; isRegression: boolean }> {
  if (!currentVal) return { icon: "⚪", pct: "—", isRegression: false };

  try {
    const row = db
      .query(
        `
        SELECT AVG(${column}) as avg_val
        FROM (
          SELECT ${column} FROM runs 
          WHERE db_key = ? AND status = 'SUCCESS' AND ${column} > 0 
          ORDER BY timestamp DESC LIMIT 5
        )
      `,
      )
      .get(dbKey) as { avg_val: number | null };

    if (!row?.avg_val) return { icon: "⚪", pct: "—", isRegression: false };

    const pct = ((currentVal - row.avg_val) / row.avg_val) * 100;
    const isRegression = pct > 10;
    const icon = pct < -3 ? "🟢" : pct > 5 ? "🔴" : "⚪";

    return {
      icon,
      pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      isRegression,
    };
  } catch {
    return { icon: "⚪", pct: "—", isRegression: false };
  }
}

// ─────────────────────────────────────────────────────────────
// Port Management
// ─────────────────────────────────────────────────────────────

export async function waitForPortFree(port: number, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
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
];

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /[\u001b\u009b]\[[0-9;]*[JKmsu]/g;

export function isNoisyLine(line: string): boolean {
  const clean = line.replace(ANSI_STRIP, "");
  return (
    /→\s+[0-9]{3}/.test(clean) ||
    /(GET|POST|PUT|DELETE|PATCH) \/.* [0-9]{3}/i.test(clean) ||
    NOISY_SERVER_PATTERNS.some((p) => p.test(clean))
  );
}
