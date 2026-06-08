/**
 * @file src\databases\sqlite\performance-module.ts
 * @description Performance metrics module for SQLite
 */

import type { DatabaseResult, PerformanceMetrics, ISqlAdapter } from "../db-interface";
import { DatabaseModule } from "../core/base-adapter";

export class PerformanceModule extends DatabaseModule<ISqlAdapter> {
  async getMetrics(): Promise<DatabaseResult<PerformanceMetrics>> {
    const stats = this.adapter["metrics"];
    return {
      success: true,
      data: {
        queryCount: stats.queryCount,
        slowQueries: (this.adapter as any)._slowQueries || [],
        averageQueryTime: stats.lastLatency,
        cacheHitRate: stats.cacheHits / (stats.cacheHits + stats.cacheMisses || 1),
        connectionPoolUsage: 1,
      },
    };
  }

  async clearMetrics(): Promise<DatabaseResult<void>> {
    // Reset core metrics if needed
    return { success: true, data: undefined };
  }

  async enableProfiling(_enabled: boolean): Promise<DatabaseResult<void>> {
    return { success: true, data: undefined };
  }

  async getSlowQueries(_limit?: number): Promise<
    DatabaseResult<
      Array<{
        query: string;
        duration: number;
        timestamp: import("../db-interface").ISODateString;
      }>
    >
  > {
    return { success: true, data: [] };
  }
}
