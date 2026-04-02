/**
 * @file src/services/metrics-service.ts
 * @description Unified high-performance metrics service for SveltyCMS
 *
 * Supports per-tenant and global metrics with minimal overhead.
 * Optimized for high-throughput environments.
 */

import { logger } from "@utils/logger.server";

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
  api = { requests: 0, errors: 0, cacheHits: 0, cacheMisses: 0 };

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
}

class MetricsService {
  private globalCounters = new MetricsCounters();
  private tenantCounters = new Map<string, MetricsCounters>();
  private resetInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Auto-reset every hour to prevent unbounded memory growth in long-running processes
    this.resetInterval = setInterval(() => this.reset(), 60 * 60 * 1000);
  }

  private getCounters(tenantId?: string): MetricsCounters {
    if (!tenantId || tenantId === "global") {
      return this.globalCounters;
    }

    let counters = this.tenantCounters.get(tenantId);
    if (!counters) {
      counters = new MetricsCounters();
      this.tenantCounters.set(tenantId, counters);
    }
    return counters;
  }

  // ── Request Metrics ─────────────────────────────────────
  incrementRequests(tenantId?: string): void {
    this.getCounters(tenantId).requests.total++;
  }

  incrementErrors(tenantId?: string): void {
    this.getCounters(tenantId).requests.errors++;
  }

  recordResponseTime(timeMs: number, tenantId?: string): void {
    const c = this.getCounters(tenantId);
    c.requests.totalResponseTime += timeMs;
    if (timeMs > 2000) c.performance.slowRequests++;
  }

  // ── Authentication Metrics ─────────────────────────────
  incrementAuthValidations(tenantId?: string): void {
    this.getCounters(tenantId).auth.validations++;
  }

  incrementAuthFailures(tenantId?: string): void {
    const c = this.getCounters(tenantId);
    c.auth.failures++;
    c.security.authFailures++;
  }

  recordAuthCacheHit(tenantId?: string): void {
    this.getCounters(tenantId).auth.cacheHits++;
  }

  recordAuthCacheMiss(tenantId?: string): void {
    this.getCounters(tenantId).auth.cacheMisses++;
  }

  // ── API Metrics ─────────────────────────────────────────
  incrementApiRequests(tenantId?: string): void {
    this.getCounters(tenantId).api.requests++;
  }

  incrementApiErrors(tenantId?: string): void {
    this.getCounters(tenantId).api.errors++;
  }

  recordApiCacheHit(tenantId?: string): void {
    this.getCounters(tenantId).api.cacheHits++;
  }

  recordApiCacheMiss(tenantId?: string): void {
    this.getCounters(tenantId).api.cacheMisses++;
  }

  // ── Security Metrics ────────────────────────────────────
  incrementRateLimitViolations(tenantId?: string): void {
    this.getCounters(tenantId).security.rateLimitViolations++;
  }

  incrementCSPViolations(tenantId?: string): void {
    this.getCounters(tenantId).security.cspViolations++;
  }

  incrementSecurityViolations(tenantId?: string): void {
    this.getCounters(tenantId).security.cspViolations++;
  }

  // ── Performance Metrics ─────────────────────────────────
  recordHookExecutionTime(hookName: string, timeMs: number, tenantId?: string): void {
    const c = this.getCounters(tenantId);
    c.performance.totalHookTime += timeMs;
    c.performance.hookExecutions++;

    if (timeMs > 100) {
      const count = c.performance.bottlenecks.get(hookName) || 0;
      c.performance.bottlenecks.set(hookName, count + 1);
    }
  }

  recordMetric(name: string, value: number, tenantId?: string): void {
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
      default:
        logger.trace(`[Metrics] Unhandled metric: ${name} = ${value}`);
    }
  }

  // ── Reporting ───────────────────────────────────────────
  getReport(tenantId?: string): MetricsReport {
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
        cacheHits: c.api.cacheHits,
        cacheMisses: c.api.cacheMisses,
        cacheHitRate: safeRate(c.api.cacheHits, c.api.cacheHits + c.api.cacheMisses),
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

  /** Reset all counters (global + tenants) */
  reset(): void {
    this.globalCounters = new MetricsCounters();
    this.tenantCounters.clear();
    logger.trace("Metrics service reset");
  }

  /** Export metrics in Prometheus-compatible format */
  exportPrometheus(): string {
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
        `svelty_security_violations_total{type="csp"} ${report.security.cspViolations}`,
      ].join("\n") + "\n"
    );
  }

  destroy(): void {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }
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
