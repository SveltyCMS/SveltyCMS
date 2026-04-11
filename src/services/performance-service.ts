/**
 * @file src/services/performance-service.ts
 * @description Persistent metrics repository for the Self-Learning State Machine.
 *
 * Optimized for:
 * - Low DB Pressure: Uses consolidated snapshotting to minimize row count.
 * - Non-blocking: All persistence operations are offloaded to background tasks.
 * - Enterprise Observability: Tracks its own persistence latency.
 */

import type { ServicePerformanceMetrics, SystemStateStore } from "@src/stores/system/types";
import { logger } from "@utils/logger";

export class PerformanceService {
  private static instance: PerformanceService;
  private readonly SNAPSHOT_KEY = "SYSTEM_METRICS_SNAPSHOT";
  private readonly BENCHMARK_PREFIX = "BENCH_";

  public static getInstance(): PerformanceService {
    if (!PerformanceService.instance) {
      PerformanceService.instance = new PerformanceService();
    }
    return PerformanceService.instance;
  }

  private async getDbAdapter() {
    const { dbAdapter } = await import("@src/databases/db");
    return dbAdapter;
  }

  /**
   * Save learned metrics for all services.
   * Optimized: Consolidates all service metrics into a single atomic snapshot.
   */
  async saveMetrics(services: SystemStateStore["services"]): Promise<void> {
    // Fire-and-forget to avoid blocking the state machine
    Promise.resolve().then(async () => {
      const start = performance.now();
      const dbAdapter = await this.getDbAdapter();
      if (!dbAdapter?.system.preferences) return;

      try {
        // Consolidate into a single structured object
        const metricsMap: Record<string, ServicePerformanceMetrics> = {};
        for (const [name, status] of Object.entries(services)) {
          metricsMap[name] = status.metrics;
        }

        await dbAdapter.system.preferences.set(
          this.SNAPSHOT_KEY,
          JSON.stringify({
            version: "2.0",
            updatedAt: Date.now(),
            data: metricsMap,
          }),
          "system",
          undefined,
          "performance",
        );

        const duration = (performance.now() - start).toFixed(2);
        logger.debug(`[PerformanceService] Metrics snapshot saved in ${duration}ms`);
      } catch (error) {
        logger.error("[PerformanceService] Failed to save metrics snapshot:", error);
      }
    });
  }

  /**
   * Load historical metrics from the database.
   */
  async loadMetrics(): Promise<Record<string, ServicePerformanceMetrics>> {
    const dbAdapter = await this.getDbAdapter();
    if (!dbAdapter?.system.preferences) return {};

    try {
      // 1. Try to load modern consolidated snapshot
      const snapshotResult = await dbAdapter.system.preferences.get(this.SNAPSHOT_KEY, "system");

      if (snapshotResult.success && snapshotResult.data) {
        const snapshot =
          typeof snapshotResult.data === "string"
            ? JSON.parse(snapshotResult.data)
            : snapshotResult.data;

        if (snapshot.version === "2.0") {
          return snapshot.data;
        }
      }

      // 2. Fallback: Load legacy individual metrics (for migration path)
      const legacyResult = await dbAdapter.system.preferences.getByCategory(
        "performance",
        "system",
      );
      if (legacyResult.success && legacyResult.data) {
        const metrics: Record<string, ServicePerformanceMetrics> = {};
        for (const [key, value] of Object.entries(legacyResult.data)) {
          if (key.startsWith("PERF_METRICS_")) {
            const name = key.replace("PERF_METRICS_", "");
            metrics[name] = typeof value === "string" ? JSON.parse(value) : value;
          }
        }
        return metrics;
      }

      return {};
    } catch (error) {
      logger.error("[PerformanceService] Failed to load metrics:", error);
      return {};
    }
  }

  /**
   * Record a specific benchmark.
   * Optimized: Uses a more compact key and background persistence.
   */
  async recordBenchmark(name: string, value: number): Promise<void> {
    Promise.resolve().then(async () => {
      const dbAdapter = await this.getDbAdapter();
      if (!dbAdapter?.system.preferences) return;

      try {
        await dbAdapter.system.preferences.set(
          `${this.BENCHMARK_PREFIX}${name}`,
          JSON.stringify({ v: value, t: Date.now() }),
          "system",
          undefined,
          "benchmark",
        );
      } catch (error) {
        logger.error(`[PerformanceService] Failed to record benchmark ${name}:`, error);
      }
    });
  }
}

export const performanceService = PerformanceService.getInstance();
