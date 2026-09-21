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
 * - Memory governor: trims byte-heavy caches and asks V8 to de-commit above a
 *   soft limit, so a large write burst (e.g. seeding 100k documents) does not
 *   leave the container at its high-water mark forever
 */

import { logger } from "@utils/logger";
import { getSystemState, updateServiceHealth } from "@src/stores/system/state.svelte.ts";
import { getDbInitPromise, getBootPhase } from "@src/databases/db";
import { maintenanceService } from "./maintenance-service";
import { responseCache } from "@src/services/cache/response-cache";

/**
 * V8 keeps committed pages after a traffic spike; `docker stats` then reports the
 * high-water mark even though `heapUsed` already fell back. A GC pass is the only
 * in-process lever that lets V8's memory reducer de-commit free pages promptly.
 * Prefer the real global (Node started with --expose-gc); otherwise expose it
 * ourselves via `node:v8` + `node:vm` (lazy, best-effort — Bun has no `vm`).
 */
async function resolveGc(): Promise<(() => void) | null> {
  const g = globalThis as { gc?: () => void };
  if (typeof g.gc === "function") return g.gc;
  try {
    const [v8, vm] = await Promise.all([import("node:v8"), import("node:vm")]);
    v8.setFlagsFromString("--expose-gc");
    const fn = (vm as { runInNewContext: (code: string) => unknown }).runInNewContext("gc") as
      | (() => void)
      | undefined;
    v8.setFlagsFromString("--no-expose-gc");
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

/** Cached `node:v8` handle — heap limit is only needed by the memory governor. */
let v8Handle: Promise<typeof import("node:v8") | null> | null = null;
function loadV8(): Promise<typeof import("node:v8") | null> {
  v8Handle ??= import("node:v8").catch(() => null);
  return v8Handle;
}

class SystemWatchdog {
  private intervalId: NodeJS.Timeout | null = null;
  private recoveryAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly CHECK_INTERVAL = 10_000; // 10 seconds
  private readonly MAINTENANCE_INTERVAL = 300_000; // 5 minutes
  private lastMaintenance = 0;
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly RECOVERY_BACKOFF_BASE = 5_000; // 5 seconds base backoff
  // A DB that stays "initializing" this long while the system claims READY is a
  // genuine hang (boot deadlock, unresponsive driver). Shorter "initializing"
  // windows are legitimate lazy re-initialization (content re-sync, phase re-boot)
  // and must NOT escalate to RECOVERY — that blocks all requests mid-operation.
  private readonly STUCK_INIT_THRESHOLD_MS = 30_000;

  // ── Memory governor ────────────────────────────────────────────────────
  /** Trim caches + request a GC pass above this share of the V8 heap limit. */
  private readonly MEMORY_TRIGGER_RATIO = Number(process.env.SVELTY_MEMORY_TRIGGER_RATIO) || 0.7;
  /** Never run the governor more often than this (GC pauses are not free). */
  private readonly MEMORY_MIN_INTERVAL = 60_000;
  private lastMemorySweep = 0;
  private gcFn: (() => void) | null | undefined;

  /**
   * Releases committed-but-unused memory after a burst.
   *
   * Bounded L1 caches are the biggest byte holders, and emptying them is what
   * actually frees heap objects; the GC pass that follows is what returns the
   * pages to the OS (V8 only de-commits after a major GC).
   */
  private async sweepMemory(heapUsed: number, heapLimit: number): Promise<void> {
    const now = Date.now();
    if (now - this.lastMemorySweep < this.MEMORY_MIN_INTERVAL) return;
    this.lastMemorySweep = now;

    const usedMb = Math.round(heapUsed / 1024 / 1024);
    const limitMb = Math.round(heapLimit / 1024 / 1024);
    logger.warn(
      `🧹 [Memory] heap ${usedMb}MB / limit ${limitMb}MB exceeds ${Math.round(
        this.MEMORY_TRIGGER_RATIO * 100,
      )}% — trimming caches and requesting a GC pass`,
    );

    try {
      await responseCache.clearLocal();
    } catch (err) {
      logger.debug("[Memory] cache trim failed (non-fatal)", err);
    }

    if (this.gcFn === undefined) this.gcFn = await resolveGc();
    if (this.gcFn) {
      try {
        this.gcFn();
      } catch (err) {
        logger.debug("[Memory] gc() failed (non-fatal)", err);
      }
    } else {
      logger.debug("[Memory] no gc() available — relying on V8's memory reducer");
    }
  }

  /**
   * Starts the autonomous watchdog.
   */
  public start() {
    // Production parity: the watchdog runs during benchmarks too — autonomous
    // recovery is part of real production behavior.
    if (this.intervalId) return;
    logger.info("🛡️ Autonomous System Watchdog started");
    this.intervalId = setInterval(() => this.check(), this.CHECK_INTERVAL);
    // .unref() — consistent with JobQueue and Outbox: the watchdog timer must not
    // keep the process alive on its own when all requests have drained. This eliminates
    // event-loop pressure during idle periods and allows clean graceful shutdown.
    if (typeof this.intervalId.unref === "function") {
      this.intervalId.unref();
    }
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

    // 2. Drift Detection: System says READY/WARMED but the DB is not healthy.
    if (overallState === "READY" || overallState === "WARMED") {
      const dbStatus = services.database.status;
      const dbSince = services.database.lastChecked ?? Date.now();
      // Immediate drift: genuinely degraded. "initializing" only counts as drift
      // once it exceeds the stuck threshold — lazy re-initialization flips the DB
      // to "initializing" for a few seconds during normal operation (e.g. content
      // re-sync after a test reset or a phase re-boot), and escalating that to
      // RECOVERY blocks every request until the re-init finishes.
      const isDegraded = dbStatus === "unhealthy";
      const isStuckInitializing =
        dbStatus === "initializing" && Date.now() - dbSince > this.STUCK_INIT_THRESHOLD_MS;
      if (isDegraded || isStuckInitializing) {
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

    // 4. Memory governor — a write burst commits far more than the steady-state
    // heap; V8 holds those pages unless something asks it to shrink back.
    const v8 = await loadV8();
    if (v8) {
      const mem = process.memoryUsage();
      const heapLimit = v8.getHeapStatistics().heap_size_limit;
      if (heapLimit > 0 && mem.heapUsed / heapLimit > this.MEMORY_TRIGGER_RATIO) {
        await this.sweepMemory(mem.heapUsed, heapLimit);
      }
    }
  }

  /**
   * Attempts an autonomous recovery for a failed service.
   */
  private async attemptRecovery(serviceName: string, _overallState: string) {
    const now = Date.now();
    const record = this.recoveryAttempts.get(serviceName) || {
      count: 0,
      lastAttempt: 0,
    };

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

// 🛡️ HMR SAFETY: Stop the watchdog when Vite hot-reloads this module
// to prevent stale timers from using the closed module runner.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    watchdog.stop();
  });
  import.meta.hot.accept(() => {
    // The new module instance must be started since the original
    // `watchdog.start()` call in hooks.server.ts won't re-trigger.
    watchdog.start();
  });
}
