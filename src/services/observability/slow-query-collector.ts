/**
 * @file src/services/observability/slow-query-collector.ts
 * @description
 * Autonomous service for tracking slow database queries and recommending optimizations.
 *
 * Logic:
 * - Aggregates queries taking > 50ms (configurable).
 * - Identifies structural patterns (which collections and fields are queried).
 * - Detects "JSON Fallback" scans that should be promoted to physical columns.
 * - Suggests compound indexes for multi-tenant isolation.
 */

import { logger } from "@utils/logger";
import { metricsService } from "./metrics-service";

export interface SlowQuery {
  collection: string;
  fields: string[];
  executionTime: number;
  tenantId?: string | null;
  isJsonScan: boolean;
  timestamp: number;
}

class SlowQueryCollector {
  private slowQueries: SlowQuery[] = [];
  private readonly MAX_HISTORY = 1000;
  private readonly SLOW_THRESHOLD_MS = 50;

  /**
   * Records a query execution for analysis.
   */
  public recordQuery(
    collection: string,
    filter: any,
    executionTime: number,
    tenantId?: string | null,
  ): void {
    if (executionTime < this.SLOW_THRESHOLD_MS) return;

    metricsService.recordMetric("db:slow_query", 1, tenantId);

    const fields = filter ? Object.keys(filter) : [];
    const isJsonScan = fields.some(
      (f) => !["_id", "tenantId", "status", "path", "nodeType"].includes(f),
    );

    const slowQuery: SlowQuery = {
      collection,
      fields,
      executionTime,
      tenantId,
      isJsonScan,
      timestamp: Date.now(),
    };

    this.slowQueries.push(slowQuery);
    if (this.slowQueries.length > this.MAX_HISTORY) {
      this.slowQueries.shift();
    }

    // Proactive Alerting
    if (executionTime > 500) {
      logger.warn(
        `[IndexRecommender] CRITICAL SLOW QUERY: ${collection} took ${executionTime.toFixed(2)}ms. Fields: ${fields.join(", ")}`,
      );
    } else {
      logger.debug(
        `[IndexRecommender] Slow query detected: ${collection} (${executionTime.toFixed(2)}ms)`,
      );
    }
  }

  /**
   * Generates optimization recommendations based on observed slow queries.
   */
  public getRecommendations() {
    const counts = new Map<string, { count: number; totalTime: number; jsonScans: number }>();

    for (const q of this.slowQueries) {
      const key = `${q.collection}:${q.fields.sort().join(",")}`;
      const stats = counts.get(key) || { count: 0, totalTime: 0, jsonScans: 0 };
      stats.count++;
      stats.totalTime += q.executionTime;
      if (q.isJsonScan) stats.jsonScans++;
      counts.set(key, stats);
    }

    const recommendations = [];
    for (const [key, stats] of counts.entries()) {
      if (stats.count < 3) continue; // Minimum 3 occurrences to suggest index

      const [collection, fieldsStr] = key.split(":");
      const fields = fieldsStr.split(",");
      const avgTime = stats.totalTime / stats.count;

      let suggestion = "";
      if (stats.jsonScans > stats.count * 0.8) {
        suggestion = `PROMOTION: Field(s) [${fields.join(", ")}] in "${collection}" are frequently scanned via JSON extraction. Consider promoting them to indexed physical columns.`;
      } else {
        suggestion = `INDEX: Frequent slow queries on "${collection}" using [${fields.join(", ")}]. Consider adding a compound index.`;
      }

      recommendations.push({
        collection,
        fields,
        avgTime,
        frequency: stats.count,
        suggestion,
      });
    }

    return recommendations.sort((a, b) => b.avgTime - a.avgTime);
  }

  public clear(): void {
    this.slowQueries = [];
  }
}

export const slowQueryCollector = new SlowQueryCollector();
