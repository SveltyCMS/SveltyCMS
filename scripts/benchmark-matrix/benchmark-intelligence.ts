/**
 * @file scripts/benchmark-matrix/benchmark-intelligence.ts
 * @description Performance intelligence engine — enriches regression results
 * with forecasts, confidence scores, and fix suggestions.
 *
 * Imported by the matrix runner (reporting.ts) after detectRegressions().
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DeepAnalysis {
  forecastRunsToBreach: number | null;
  confidenceScore: number;
  suggestedFix: string;
  severity: "info" | "warn" | "critical";
  rootCauseDetail: string;
}

// ─────────────────────────────────────────────────────────────
// Per-metric budgets
// ─────────────────────────────────────────────────────────────

const METRIC_BUDGETS: Record<string, number> = {
  collections: 5,
  graphql_avg: 12,
  db_raw: 50,
  hooks: 2,
  mem_growth: 60,
  index_pressure: 250,
};

function getBudget(metricKey: string): number {
  return METRIC_BUDGETS[metricKey] ?? 100;
}

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

export class PerformanceIntelligence {
  analyze(regression: {
    db: string;
    metric: string;
    current: number;
    changePct: number;
    slope?: number;
    rootCause?: string;
    confidence?: number;
    direction?: string;
  }): DeepAnalysis {
    const metricKey = regression.metric.replace(/[^a-z0-9]/g, "_").toLowerCase();

    // 1. Forecast
    const forecast = this.forecastBreach(regression.current, regression.slope || 0, metricKey);

    // 2. Confidence
    const confidence = this.calculateConfidence(
      regression.slope || 0,
      regression.confidence || 0.5,
    );

    // 3. Root cause detail
    const rootCauseDetail = this.enrichRootCause(regression.rootCause || "unknown");

    // 4. Fix suggestion
    const suggestedFix = this.generateFixSuggestion(
      regression.db,
      regression.rootCause || "unknown",
      confidence,
    );

    // 5. Severity
    const severity = this.getSeverity(forecast, regression.changePct, confidence);

    return {
      forecastRunsToBreach: forecast,
      confidenceScore: Math.round(confidence * 100),
      suggestedFix,
      severity,
      rootCauseDetail,
    };
  }

  private forecastBreach(current: number, slope: number, metricKey: string): number | null {
    if (slope <= 0.01) return null;
    const budget = getBudget(metricKey);
    const target = budget * 0.8;
    return Math.max(1, Math.ceil((target - current) / slope));
  }

  private calculateConfidence(_slope: number, existingConfidence: number): number {
    return Math.min(0.95, existingConfidence * 1.3);
  }

  private enrichRootCause(rootCause: string): string {
    const map: Record<string, string> = {
      adapter:
        "Database adapter performance degradation — check connection pool, indexes, query plans",
      adapter_bottleneck:
        "Database adapter bottleneck — check connection pool, indexes, query plans",
      middleware: "Request pipeline overhead — middleware runs on every request",
      native: "Native bindings / memory management — check sharp, better-sqlite3",
      scale: "High-load bottleneck — connection pool saturation or lock contention",
      cold_start: "Cold start overhead — imports, schema loading, cache warming",
      gc_pause: "GC pause — check memory allocation patterns",
      improvement: "Performance improved — no action needed",
      throughput_drop: "Throughput degradation — connection pool or network bottleneck",
      severe_regression: "Severe regression — immediate investigation required",
      normal_variance: "Normal variance — within acceptable range",
    };
    return map[rootCause] || rootCause;
  }

  private generateFixSuggestion(db: string, rootCause: string, confidence: number): string {
    const dbPath = `src/databases/${db.replace("-redis", "")}/`;
    const suggestions: Record<string, string> = {
      adapter: `Check indexes/query plans in \`${dbPath}crud-methods.ts\` and \`${dbPath}adapter-core.ts\``,
      adapter_bottleneck: `Check indexes/query plans in \`${dbPath}crud-methods.ts\``,
      middleware: "Profile `src/hooks.server.ts` for synchronous blocking operations",
      native: "Check native modules for memory leaks. Run with `--inspect`",
      scale: "Increase connection pool size or implement request batching",
      cold_start: "Audit top-level imports. Use dynamic imports for non-critical modules",
      gc_pause: "Check for large object allocations in hot paths",
      throughput_drop: "Check connection pool saturation and network bottlenecks",
      severe_regression: "Bisect recent commits. Check hooks and database adapters",
    };
    const fix = suggestions[rootCause] || "Manual investigation recommended";
    const note = confidence < 0.6 ? " (Low confidence — run full matrix for confirmation)" : "";
    return fix + note;
  }

  private getSeverity(
    forecast: number | null,
    changePct: number,
    confidence: number,
  ): "info" | "warn" | "critical" {
    if ((forecast && forecast <= 5) || (Math.abs(changePct) > 30 && confidence > 0.7))
      return "critical";
    if ((forecast && forecast <= 15) || Math.abs(changePct) > 15) return "warn";
    return "info";
  }
}
