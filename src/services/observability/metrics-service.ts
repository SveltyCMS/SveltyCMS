/**
 * @file src/services/metrics-service.ts
 * @description Unified high-performance metrics service for SveltyCMS
 *
 * Supports per-tenant and global metrics with minimal overhead.
 * Optimized for high-throughput environments.
 */

export interface MetricSnapshot {
  category: string;
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface MetricsReport {
  timestamp: number;
  uptime: number;

  requests: {
    total: number;
    errors: number;
    errorRate: number;
    avgResponseTime: number;
  };

  authentication: {
    validations: number;
    failures: number;
    successRate: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
  };

  api: {
    requests: number;
    errors: number;
    cacheHits: number;
    l1Hits: number;
    l2Hits: number;
    cacheMisses: number;
    cacheHitRate: number;
  };

  performance: {
    slowRequests: number;
    avgHookExecutionTime: number;
    bottlenecks: string[];
  };

  security: {
    rateLimitViolations: number;
    cspViolations: number;
    authFailures: number;
  };
}

// Internal counters (kept private for performance)
class MetricsCounters {
  // Requests
  requests = { total: 0, errors: 0, totalResponseTime: 0 };

  // Authentication
  auth = { validations: 0, failures: 0, cacheHits: 0, cacheMisses: 0 };

  // API
  api = { requests: 0, errors: 0, l1Hits: 0, l2Hits: 0, cacheMisses: 0 };

  // Security
  security = { rateLimitViolations: 0, cspViolations: 0, authFailures: 0 };

  // Performance
  performance = {
    slowRequests: 0,
    totalHookTime: 0,
    hookExecutions: 0,
    bottlenecks: new Map<string, number>(),
  };

  startTime = Date.now();
  lastReset = Date.now();
  lastActivity = Date.now();
}

class MetricsService {
  private globalCounters = new MetricsCounters();
  private tenantCounters = new Map<string, MetricsCounters>();
  private lastReset = Date.now();
  private readonly MAX_BOTTLENECKS = 100;
  private readonly PRUNE_INTERVAL_MS = 300_000; // 5 min
  private readonly IDLE_THRESHOLD_MS = 600_000; // 10 min

  constructor() {
    // Background pruning of stale tenants
    if (typeof setInterval !== "undefined") {
      this._pruneInterval = setInterval(() => this.pruneStaleTenants(), this.PRUNE_INTERVAL_MS);
    }
  }

  private _pruneInterval: ReturnType<typeof setInterval> | null = null;

  public destroy(): void {
    if (this._pruneInterval) {
      clearInterval(this._pruneInterval);
      this._pruneInterval = null;
    }
  }

  private pruneStaleTenants(): void {
    const now = Date.now();
    for (const [id, counters] of this.tenantCounters.entries()) {
      if (now - counters.lastActivity > this.IDLE_THRESHOLD_MS) {
        this.tenantCounters.delete(id);
      }
    }
  }

  private shouldReset(): boolean {
    const now = Date.now();
    if (now - this.lastReset >= 60 * 60 * 1000) {
      this.lastReset = now;
      return true;
    }
    return false;
  }

  private getCounters(tenantId?: string | null): MetricsCounters {
    if (!tenantId || tenantId === "global") {
      this.globalCounters.lastActivity = Date.now();
      return this.globalCounters;
    }

    let counters = this.tenantCounters.get(tenantId);
    if (!counters) {
      // Memory safety: Limit number of tracked tenants to prevent heap exhaustion
      if (this.tenantCounters.size >= 1000) {
        const oldestId = this.tenantCounters.keys().next().value;
        if (oldestId) this.tenantCounters.delete(oldestId);
      }
      counters = new MetricsCounters();
      this.tenantCounters.set(tenantId, counters);
    }
    counters.lastActivity = Date.now();
    return counters;
  }

  // ── Request Metrics ─────────────────────────────────────
  incrementRequests(tenantId?: string | null): void {
    this.getCounters(tenantId).requests.total++;
  }

  incrementErrors(tenantId?: string | null): void {
    this.getCounters(tenantId).requests.errors++;
  }

  recordResponseTime(timeMs: number, tenantId?: string | null): void {
    const c = this.getCounters(tenantId);
    c.requests.totalResponseTime += timeMs;
    if (timeMs > 2000) c.performance.slowRequests++;
  }

  // ── Authentication Metrics ─────────────────────────────
  incrementAuthValidations(tenantId?: string | null): void {
    this.getCounters(tenantId).auth.validations++;
  }

  incrementAuthFailures(tenantId?: string | null): void {
    const c = this.getCounters(tenantId);
    c.auth.failures++;
    c.security.authFailures++;
  }

  recordAuthCacheHit(tenantId?: string | null): void {
    this.getCounters(tenantId).auth.cacheHits++;
  }

  recordAuthCacheMiss(tenantId?: string | null): void {
    this.getCounters(tenantId).auth.cacheMisses++;
  }

  // ── API Metrics ─────────────────────────────────────────
  incrementApiRequests(tenantId?: string | null): void {
    this.getCounters(tenantId).api.requests++;
  }

  incrementApiErrors(tenantId?: string | null): void {
    this.getCounters(tenantId).api.errors++;
  }

  recordApiCacheHit(tenantId?: string | null, layer: "l1" | "l2" = "l2"): void {
    const c = this.getCounters(tenantId);
    if (layer === "l1") c.api.l1Hits++;
    else c.api.l2Hits++;
  }

  recordApiCacheMiss(tenantId?: string | null): void {
    this.getCounters(tenantId).api.cacheMisses++;
  }

  // ── Security Metrics ────────────────────────────────────
  incrementRateLimitViolations(tenantId?: string | null): void {
    this.getCounters(tenantId).security.rateLimitViolations++;
  }

  incrementCSPViolations(tenantId?: string | null): void {
    this.getCounters(tenantId).security.cspViolations++;
  }

  incrementSecurityViolations(tenantId?: string | null): void {
    this.getCounters(tenantId).security.cspViolations++;
  }

  // ── Performance Metrics ─────────────────────────────────
  recordHookExecutionTime(hookName: string, timeMs: number, tenantId?: string | null): void {
    const c = this.getCounters(tenantId);
    c.performance.totalHookTime += timeMs;
    c.performance.hookExecutions++;

    if (timeMs > 100) {
      if (
        c.performance.bottlenecks.size < this.MAX_BOTTLENECKS ||
        c.performance.bottlenecks.has(hookName)
      ) {
        const count = c.performance.bottlenecks.get(hookName) || 0;
        c.performance.bottlenecks.set(hookName, count + 1);
      }
    }
  }

  recordMetric(name: string, value: number, tenantId?: string | null): void {
    const c = this.getCounters(tenantId);

    switch (name) {
      case "sdk:init":
        c.api.requests += value;
        break;
      case "sdk:transaction:duration":
        c.performance.totalHookTime += value;
        c.performance.hookExecutions++;
        break;
      case "sdk:transaction:error":
        c.api.errors += value;
        break;
    }
  }

  // ── Reporting ───────────────────────────────────────────
  getReport(tenantId?: string | null): MetricsReport {
    if (this.shouldReset()) {
      this.reset();
    }
    const c = this.getCounters(tenantId);
    const now = Date.now();
    const uptime = now - c.startTime;

    const safeRate = (num: number, den: number): number => (den > 0 ? (num / den) * 100 : 0);

    const avgResponseTime =
      c.requests.total > 0 ? c.requests.totalResponseTime / c.requests.total : 0;

    const avgHookTime =
      c.performance.hookExecutions > 0
        ? c.performance.totalHookTime / c.performance.hookExecutions
        : 0;

    const bottlenecks = Array.from(c.performance.bottlenecks.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    return {
      timestamp: now,
      uptime,
      requests: {
        total: c.requests.total,
        errors: c.requests.errors,
        errorRate: safeRate(c.requests.errors, c.requests.total),
        avgResponseTime,
      },
      authentication: {
        validations: c.auth.validations,
        failures: c.auth.failures,
        successRate: safeRate(c.auth.validations - c.auth.failures, c.auth.validations),
        cacheHits: c.auth.cacheHits,
        cacheMisses: c.auth.cacheMisses,
        cacheHitRate: safeRate(c.auth.cacheHits, c.auth.cacheHits + c.auth.cacheMisses),
      },
      api: {
        requests: c.api.requests,
        errors: c.api.errors,
        cacheHits: c.api.l1Hits + c.api.l2Hits,
        l1Hits: c.api.l1Hits,
        l2Hits: c.api.l2Hits,
        cacheMisses: c.api.cacheMisses,
        cacheHitRate: safeRate(
          c.api.l1Hits + c.api.l2Hits,
          c.api.l1Hits + c.api.l2Hits + c.api.cacheMisses,
        ),
      },
      performance: {
        slowRequests: c.performance.slowRequests,
        avgHookExecutionTime: avgHookTime,
        bottlenecks,
      },
      security: {
        rateLimitViolations: c.security.rateLimitViolations,
        cspViolations: c.security.cspViolations,
        authFailures: c.security.authFailures,
      },
    };
  }

  async getSystemMetrics(): Promise<MetricsReport> {
    return this.getReport();
  }

  /** Reset all counters (global + tenants) */
  reset(): void {
    this.globalCounters = new MetricsCounters();
    this.tenantCounters.clear();
    this.lastReset = Date.now();
  }

  /** Export metrics in Prometheus-compatible format */
  exportPrometheus(): string {
    if (this.shouldReset()) {
      this.reset();
    }
    const global = this.globalCounters;
    const report = this.getReport();

    return (
      [
        `# HELP svelty_requests_total Total requests`,
        `# TYPE svelty_requests_total counter`,
        `svelty_requests_total ${global.requests.total}`,

        `# HELP svelty_requests_errors_total Total request errors`,
        `# TYPE svelty_requests_errors_total counter`,
        `svelty_requests_errors_total ${global.requests.errors}`,

        `# HELP svelty_auth_cache_hit_rate Authentication cache hit rate`,
        `# TYPE svelty_auth_cache_hit_rate gauge`,
        `svelty_auth_cache_hit_rate ${report.authentication.cacheHitRate / 100}`,

        `# HELP svelty_api_cache_hit_rate API cache hit rate`,
        `# TYPE svelty_api_cache_hit_rate gauge`,
        `svelty_api_cache_hit_rate ${report.api.cacheHitRate / 100}`,

        `# HELP svelty_security_violations_total Security violations`,
        `# TYPE svelty_security_violations_total counter`,
        `svelty_security_violations_total{type="rate_limit"} ${report.security.rateLimitViolations}`,
        `# TYPE svelty_security_violations_total counter`,
        `svelty_security_violations_total{type="csp"} ${report.security.cspViolations}`,
      ].join("\n") + "\n"
    );
  }
}

// ── Singleton Export ─────────────────────────────────────
let instance: MetricsService | null = null;

export const metricsService = (() => {
  if (!instance) {
    instance = new MetricsService();
  }
  return instance;
})();

export const cleanupMetrics = () => {
  if (instance) {
    instance.destroy();
  }
};

// Graceful shutdown (safe in Bun, Node, and test environments)
if (typeof process !== "undefined" && typeof process.on === "function") {
  const cleanup = () => cleanupMetrics();
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
}
