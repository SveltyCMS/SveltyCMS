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
 * - Memory governor (see ./memory-governor.ts): multi-signal trigger, adaptive
 *   collection passes, and idle reclaim so committed pages go back to the OS
 *   once a burst is over instead of waiting for the container limit.
 */

import { logger } from "@utils/logger";
import { getSystemState, updateServiceHealth } from "@src/stores/system/state.svelte.ts";
import { getDbInitPromise, getBootPhase } from "@src/databases/db";
import { maintenanceService } from "./maintenance-service";
import { MemoryGovernor, type MemorySnapshot } from "./memory-governor";

/** `gc(options)` is Node ≥ 22; older V8 ignores the options object. */
type RawGc = (options?: { type?: "major" | "minor"; execution?: "sync" | "async" }) => unknown;

/**
 * Cached `node:v8` handle — the heap limit and the GC accessor both come from it.
 * Absent under Bun (no `node:vm`), where the governor falls back to RSS + idle.
 */
let v8Handle: Promise<typeof import("node:v8") | null> | null = null;
function loadV8(): Promise<typeof import("node:v8") | null> {
  v8Handle ??= import("node:v8").catch(() => null);
  return v8Handle;
}

/** Resolved once at `start()` so the governor's memory sample stays synchronous. */
let v8Module: typeof import("node:v8") | null = null;

let gcHandle: Promise<RawGc | null> | null = null;

/**
 * Prefer the real global (Node started with `--expose-gc`); otherwise expose it
 * ourselves via `node:v8` + `node:vm` (lazy, best-effort — Bun has no `vm`).
 */
function loadGc(): Promise<RawGc | null> {
  gcHandle ??= (async () => {
    const existing = (globalThis as { gc?: RawGc }).gc;
    if (typeof existing === "function") return existing;
    try {
      const v8 = await loadV8();
      if (!v8) return null;
      const vm = await import("node:vm");
      v8.setFlagsFromString("--expose-gc");
      const fn = (vm as { runInNewContext: (code: string) => unknown }).runInNewContext("gc") as
        | RawGc
        | undefined;
      v8.setFlagsFromString("--no-expose-gc");
      return typeof fn === "function" ? fn : null;
    } catch {
      return null;
    }
  })();
  return gcHandle;
}

/**
 * One collection pass. `async` lets V8 mark concurrently (the safe choice while
 * requests are in flight); `sync` is the second pass, when the cheap one did not
 * hand pages back. The options form is probed once — an older V8 that ignores it
 * gets a plain call instead.
 */
async function runGc(mode: "async" | "sync"): Promise<void> {
  const gc = (globalThis as { gc?: RawGc }).gc ?? (await loadGc());
  if (!gc) return;
  try {
    const ret = gc({ type: "major", execution: mode });
    if (ret && typeof (ret as Promise<void>).then === "function") await (ret as Promise<void>);
  } catch {
    gc();
  }
}

class SystemWatchdog {
  private intervalId: NodeJS.Timeout | null = null;
  private memoryIntervalId: NodeJS.Timeout | null = null;
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
  /**
   * Governor tick, independent of the 10 s health tick: a burst that ends in
   * between must not leave the process holding its high-water mark for a minute.
   */
  private readonly MEMORY_CHECK_INTERVAL = Number(process.env.SVELTY_MEMORY_CHECK_MS) || 2_000;

  private readonly governor: MemoryGovernor;
  /** Lazy response-cache handle for the governor's last-resort trim. */
  private responseCache: { trimLocal: () => void } | null = null;

  constructor() {
    this.governor = new MemoryGovernor({
      read: () => this.readMemory(),
      gc: runGc,
      yieldToLoop: () => new Promise<void>((resolve) => setImmediate(resolve)),
      // Awaits the cache handle: a pressured sweep in the first seconds of boot
      // would otherwise find `responseCache` still null and trim nothing.
      trimCaches: async () => {
        await this.ensureResponseCache();
        this.responseCache?.trimLocal();
      },
      now: () => Date.now(),
      log: (message) => logger.warn(message),
    });
  }

  /** Synchronous process sample; `heapLimit` stays 0 where `node:v8` is absent. */
  private readMemory(): MemorySnapshot {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapLimit: v8Module ? v8Module.getHeapStatistics().heap_size_limit : 0,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      cpuMs: (cpu.user + cpu.system) / 1000,
      // cgroup/container limit — the number that actually kills the process.
      constrained:
        typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0,
    };
  }

  /**
   * Resolve the cache module once so the governor's trim stays synchronous.
   * Dynamic on purpose: the watchdog is imported during boot, and a static
   * import would pull the cache stack into that graph early (cycle risk).
   */
  private async ensureResponseCache(): Promise<void> {
    if (this.responseCache) return;
    try {
      const mod = await import("@src/services/cache/response-cache");
      this.responseCache = mod.responseCache;
    } catch (err) {
      logger.debug("[Memory] response cache unavailable for trimming", err);
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

    // Cache the v8 handle for the synchronous memory sample, then start the
    // governor tick. Both are fire-and-forget: recovery and health checks must
    // not wait on module loading.
    void loadV8().then((v8) => {
      v8Module = v8;
    });
    void this.ensureResponseCache();
    this.startMemoryGovernor();
  }

  /**
   * Runs the memory governor on its own fast timer. Separated from the health
   * tick so the release latency after a burst is measured in seconds.
   */
  private startMemoryGovernor(): void {
    if (this.memoryIntervalId) return;
    this.memoryIntervalId = setInterval(() => {
      this.governor.tick().catch((err) => logger.debug("[Memory] governor tick failed", err));
    }, this.MEMORY_CHECK_INTERVAL);
    if (typeof this.memoryIntervalId.unref === "function") {
      this.memoryIntervalId.unref();
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

  /** Memory governor diagnostics (used by tests and support logs). */
  public get memoryState() {
    return this.governor.state;
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.memoryIntervalId) {
      clearInterval(this.memoryIntervalId);
      this.memoryIntervalId = null;
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
