/**
 * @file src/services/system/watchdog.ts
 * @description
 * Enterprise Autonomous Watchdog for SveltyCMS.
 * Monitors service health and performs automatic self-recovery (healing).
 *
 * Features:
 * - Exponential backoff for recovery attempts
 * - Drift detection (service health vs overall state)
 * - Phase-aware recovery (only re-init what is broken)
 */

import { logger } from "@utils/logger";
import { getSystemState, updateServiceHealth } from "@src/stores/system/state";
import { getDbInitPromise, getBootPhase } from "@src/databases/db";
import { maintenanceService } from "./maintenance-service";

class SystemWatchdog {
  private intervalId: NodeJS.Timeout | null = null;
  private recoveryAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly CHECK_INTERVAL = 10_000; // 10 seconds
  private readonly MAINTENANCE_INTERVAL = 300_000; // 5 minutes
  private lastMaintenance = 0;
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly RECOVERY_BACKOFF_BASE = 5_000; // 5 seconds base backoff

  /**
   * Starts the autonomous watchdog.
   */
  public start() {
    if (process.env.BENCHMARK_MODE === "true") {
      logger.info("🛡️ Autonomous Watchdog DISABLED (Benchmark Mode)");
      return;
    }
    if (this.intervalId) return;
    logger.info("🛡️ Autonomous System Watchdog started");
    this.intervalId = setInterval(() => this.check(), this.CHECK_INTERVAL);
  }

  /**
   * Performs a health check and triggers recovery if needed.
   */
  private async check() {
    const state = getSystemState();
    const { overallState, services } = state;

    // Skip check if system is explicitly in MAINTENANCE or FAILED (hard failure)
    if (overallState === "MAINTENANCE" || overallState === "FAILED") return;

    // 1. Check CRITICAL services (Database, Auth)
    const criticalServices: (keyof typeof services)[] = ["database", "auth"];

    for (const serviceName of criticalServices) {
      const service = services[serviceName];
      if (service.status === "unhealthy") {
        await this.attemptRecovery(serviceName, state.overallState);
      }
    }

    // 2. Drift Detection: If system says READY but critical services are initializing/unhealthy
    if (overallState === "READY" || overallState === "WARMED") {
      const dbStatus = services.database.status;
      if (dbStatus !== "healthy") {
        logger.warn(
          `🚨 Drift detected: System is ${overallState} but database is ${dbStatus}. Triggering re-sync.`,
        );
        await this.attemptRecovery("database", overallState);
      }
    }

    // 3. Autonomous Maintenance Cycle
    const now = Date.now();
    if (now - this.lastMaintenance > this.MAINTENANCE_INTERVAL) {
      this.lastMaintenance = now;
      await maintenanceService.runMaintenance();
    }
  }

  /**
   * Attempts an autonomous recovery for a failed service.
   */
  private async attemptRecovery(serviceName: string, _overallState: string) {
    const now = Date.now();
    const record = this.recoveryAttempts.get(serviceName) || { count: 0, lastAttempt: 0 };

    // Calculate backoff: base * 2^count
    const backoff = this.RECOVERY_BACKOFF_BASE * Math.pow(2, record.count);

    if (now - record.lastAttempt < backoff) {
      return; // Still in backoff period
    }

    if (record.count >= this.MAX_RECOVERY_ATTEMPTS) {
      logger.error(
        `❌ Recovery threshold exceeded for ${serviceName}. System intervention required.`,
      );
      // We don't stop the watchdog, but we stop trying for this service until manual reset
      return;
    }

    logger.info(
      `🔄 Autonomous Recovery: Attempting to heal ${serviceName} (Attempt ${record.count + 1})`,
    );

    record.count++;
    record.lastAttempt = now;
    this.recoveryAttempts.set(serviceName, record);

    try {
      // Phase-aware recovery
      // If DB failed, we might need to re-init everything from Phase 0
      // If Auth failed, we might only need Phase 1 (CORE)
      const targetPhase = getBootPhase() || "FULL";

      updateServiceHealth(
        serviceName as any,
        "initializing",
        `Autonomous recovery in progress (Attempt ${record.count})`,
      );

      // Trigger a re-initialization promise
      await getDbInitPromise(true, targetPhase);

      logger.info(`✅ Autonomous Recovery: ${serviceName} successfully healed.`);
      // On success, we reset the count
      this.recoveryAttempts.delete(serviceName);
    } catch (err) {
      logger.error(`❌ Autonomous Recovery failed for ${serviceName}:`, err);
    }
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const watchdog = new SystemWatchdog();
