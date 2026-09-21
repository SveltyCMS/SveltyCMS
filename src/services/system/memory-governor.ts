/**
 * @file src/services/system/memory-governor.ts
 * @description Autonomous memory governor for the background watchdog.
 *
 * Decides *when* to ask V8 for a collection pass and *how many* passes are
 * needed, so a burst (seeding, bulk import, media burst) does not leave the
 * process sitting on committed-but-unused pages until the container is killed.
 *
 * Features:
 * - Multi-signal trigger: heap ratio, live-set ratio (heap + external), and RSS
 *   against the cgroup limit — a body/buffer burst keeps `heapUsed` flat while
 *   RSS grows, which a heap-only trigger never sees
 * - Adaptive pass protocol: async major GC first (concurrent, off the request
 *   path), a sync pass only when the first one did not hand pages back
 * - Idle reclaim: returns the process to its own low-water mark when the event
 *   loop is quiet, without needing a container limit to be configured
 * - Backoff: doubles the cooldown while sweeps stay unproductive, resets on the
 *   first productive one — no GC thrash under a steady working set
 * - Cache trim as a last resort, only when real heap pressure remains after the
 *   passes (allocator bloat is not a reason to throw away turbo hits)
 *
 * Measured on Node 24 / Windows (2026-09-21, `_gc-probe.mjs`): a 370 MB RSS burst
 * drops to 59 MB on the first full GC, the second pass frees the remaining
 * external arenas, and 3 s of idle alone releases nothing.
 */

import { logger } from "@utils/logger";

const MB = 1024 * 1024;

/** Memory readings the governor reasons about (bytes / cumulative ms). */
export interface MemorySnapshot {
  rss: number;
  heapUsed: number;
  heapLimit: number;
  external: number;
  arrayBuffers: number;
  /** Cumulative user + system CPU time in ms — the idle/load signal. */
  cpuMs: number;
  /** cgroup/container memory limit in bytes, 0 when unconstrained. */
  constrained: number;
}

export interface MemoryGovernorDeps {
  /** Sample the process. */
  read: () => MemorySnapshot;
  /** Run one collection pass. `sync` blocks, `async` marks concurrently. */
  gc: (mode: "async" | "sync") => Promise<void>;
  /** Yield to the loop so V8's de-commit finishes before the next reading. */
  yieldToLoop: () => Promise<void>;
  /**
   * Drop the biggest bounded cache (turbo responses) as a last resort. May be
   * async: the first pressured sweep can reach this before the cache module has
   * finished loading, and awaiting the handle is what keeps that from silently
   * skipping the trim.
   */
  trimCaches: () => void | Promise<void>;
  now: () => number;
  log: (message: string) => void;
}

export interface MemoryGovernorConfig {
  /** Heap pressure: share of the V8 heap limit that triggers a sweep. */
  triggerRatio: number;
  /** RSS pressure in bytes versus the derived target. 0 = derive. */
  rssTargetBytes: number;
  /** Cooldown after a productive sweep. */
  cooldownMs: number;
  /** Cooldown ceiling while sweeps keep reclaiming nothing. */
  maxCooldownMs: number;
  /** Collection passes per sweep before giving up. */
  maxPasses: number;
  /** RSS gain that counts as productive. */
  minGainBytes: number;
  /** CPU/wall ratio below which the loop counts as idle. */
  idleCpuRatio: number;
  /** Idle reclaim fires above floor×factor… */
  idleFactor: number;
  /** …or floor + this slack, whichever is larger. */
  idleSlackBytes: number;
  /** Idle reclaim never fires below this RSS (small processes stay untouched). */
  minRssForIdleReclaim: number;
  /** Runtime cost that is never reclaimable (V8 code, native libs). */
  runtimeOverheadBytes: number;
  /** Ratio of the container limit that counts as pressure. */
  constrainedRatio: number;
}

const DEFAULT_CONFIG: MemoryGovernorConfig = {
  triggerRatio: Number(process.env.SVELTY_MEMORY_TRIGGER_RATIO) || 0.7,
  rssTargetBytes: (Number(process.env.SVELTY_MEMORY_RSS_MB) || 0) * MB,
  cooldownMs: 5_000,
  maxCooldownMs: 120_000,
  maxPasses: 2,
  minGainBytes: 8 * MB,
  idleCpuRatio: 0.15,
  idleFactor: 1.6,
  idleSlackBytes: 128 * MB,
  minRssForIdleReclaim: 192 * MB,
  runtimeOverheadBytes: 64 * MB,
  constrainedRatio: 0.75,
};

/** Why a sweep ran — surfaced in the evidence log line. */
type Trigger = "heap" | "live-set" | "rss" | "idle";

export class MemoryGovernor {
  private readonly config: MemoryGovernorConfig;
  private readonly deps: MemoryGovernorDeps;

  private lastTickAt = 0;
  private lastCpuMs = 0;
  private lastSweepAt = 0;
  private cooldownMs: number;
  private unproductive = 0;
  /** Highest RSS this process actually needs right now (live set + runtime). */
  private rssFloor = 0;
  private sweeping = false;
  /** Diagnostics: totals for the health endpoint / tests. */
  public sweeps = 0;
  public reclaimedBytes = 0;

  constructor(deps: MemoryGovernorDeps, config: Partial<MemoryGovernorConfig> = {}) {
    this.deps = deps;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cooldownMs = this.config.cooldownMs;
  }

  /** RSS target derived from the container limit, the env override, or the heap limit. */
  private rssTarget(snap: MemorySnapshot): number {
    if (this.config.rssTargetBytes > 0) return this.config.rssTargetBytes;
    // A cgroup limit is the number that actually kills the process.
    if (snap.constrained > 0) return snap.constrained * this.config.constrainedRatio;
    // Unconstrained (dev/CI): RSS above the heap limit means committed-but-unused.
    return snap.heapLimit > 0 ? snap.heapLimit * 1.25 : 0;
  }

  /** Live bytes: what a collection pass cannot free. */
  private liveBytes(snap: MemorySnapshot): number {
    return snap.heapUsed + snap.external + snap.arrayBuffers;
  }

  /**
   * Runs one governor tick. Cheap: two syscalls plus arithmetic, no timers.
   * Callers schedule it (the watchdog runs it every couple of seconds).
   */
  public async tick(): Promise<void> {
    const now = this.deps.now();
    if (this.sweeping) return;
    if (now - this.lastSweepAt < this.cooldownMs) return;

    const snap = this.deps.read();
    const wallMs = this.lastTickAt > 0 ? now - this.lastTickAt : 0;
    const cpuDeltaMs = Math.max(0, snap.cpuMs - this.lastCpuMs);
    this.lastTickAt = now;
    this.lastCpuMs = snap.cpuMs;
    const busyRatio = wallMs > 0 ? cpuDeltaMs / wallMs : 1;

    // The floor is "what we actually need": the live set plus non-reclaimable
    // runtime. It rises with a genuinely larger working set (no point sweeping
    // toward a stale floor) and falls whenever we observe a lower idle RSS.
    const liveFloor = this.liveBytes(snap) + this.config.runtimeOverheadBytes;
    if (liveFloor > this.rssFloor) this.rssFloor = liveFloor;
    else if (busyRatio < this.config.idleCpuRatio && snap.rss < this.rssFloor)
      this.rssFloor = snap.rss;

    const live = this.liveBytes(snap);
    const heapPressured =
      snap.heapLimit > 0 && snap.heapUsed / snap.heapLimit > this.config.triggerRatio;
    // External-heavy bursts (HTTP bodies, parsed buffers) keep heapUsed flat.
    const livePressured = snap.heapLimit > 0 && live / snap.heapLimit > this.config.triggerRatio;
    const target = this.rssTarget(snap);
    const rssPressured = target > 0 && snap.rss > target;
    const idleTarget = Math.max(
      this.rssFloor * this.config.idleFactor,
      this.rssFloor + this.config.idleSlackBytes,
    );
    const idleReclaim =
      busyRatio < this.config.idleCpuRatio &&
      snap.rss > idleTarget &&
      snap.rss > this.config.minRssForIdleReclaim;

    let trigger: Trigger | null = null;
    if (heapPressured) trigger = "heap";
    else if (livePressured) trigger = "live-set";
    else if (rssPressured) trigger = "rss";
    else if (idleReclaim) trigger = "idle";
    if (!trigger) return;

    await this.sweep(snap, trigger, busyRatio);
  }

  /** Full sweep: passes until something is gained, plus a cache trim under real pressure. */
  private async sweep(first: MemorySnapshot, trigger: Trigger, busyRatio: number): Promise<void> {
    this.sweeping = true;
    this.lastSweepAt = this.deps.now();
    let before = first;
    let after = first;

    try {
      for (let pass = 1; pass <= this.config.maxPasses; pass++) {
        // First pass concurrent (marking runs off the request path); later passes
        // block, because a sweep only repeats when the cheap pass did not help.
        await this.deps.gc(pass === 1 ? "async" : "sync");
        await this.deps.yieldToLoop();
        after = this.deps.read();
        const gain = before.rss - after.rss;
        this.deps.log(
          `🧹 [Memory] pass ${pass}/${this.config.maxPasses} (${trigger}) ` +
            `rss ${mb(before.rss)}→${mb(after.rss)}MB · heap ${mb(before.heapUsed)}→${mb(after.heapUsed)}MB ` +
            `· ext+ab ${mb(before.external + before.arrayBuffers)}→${mb(after.external + after.arrayBuffers)}MB ` +
            `· limit ${mb(after.heapLimit)}MB · busy ${(busyRatio * 100).toFixed(0)}%`,
        );
        if (gain >= this.config.minGainBytes) break;
        if (!this.stillPressured(after)) break;
        before = after;
      }

      // Real heap pressure left after collecting: the live set itself is too big
      // for the cap, so the bounded caches are the thing to give up.
      if (after.heapLimit > 0 && after.heapUsed / after.heapLimit > this.config.triggerRatio) {
        const heapBefore = after.heapUsed;
        await this.deps.trimCaches();
        await this.deps.gc("sync");
        await this.deps.yieldToLoop();
        const trimmed = this.deps.read();
        this.deps.log(
          `🧹 [Memory] cache trim (heap still ${((heapBefore / after.heapLimit) * 100).toFixed(
            0,
          )}% of limit) heap ${mb(heapBefore)}→${mb(trimmed.heapUsed)}MB · ` +
            `rss ${mb(after.rss)}→${mb(trimmed.rss)}MB`,
        );
        after = trimmed;
      }

      const gained = first.rss - after.rss;
      this.reclaimedBytes += Math.max(0, gained);
      this.sweeps++;
      this.registerSweepOutcome(gained);
    } catch (err) {
      // A failed pass must never take the watchdog down or spin.
      this.registerSweepOutcome(0);
      logger.debug("[Memory] governor sweep failed (non-fatal)", err);
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Productive → back to the fast cadence so a burst tail is caught too.
   * Unproductive → double the cooldown instead of burning CPU on GC.
   */
  private registerSweepOutcome(gained: number): void {
    if (gained >= this.config.minGainBytes) {
      this.cooldownMs = this.config.cooldownMs;
      this.unproductive = 0;
      return;
    }
    this.unproductive++;
    this.cooldownMs = Math.min(
      this.config.maxCooldownMs,
      this.config.cooldownMs * 2 ** this.unproductive,
    );
  }

  /** True while a pressure signal is still above its threshold. */
  private stillPressured(snap: MemorySnapshot): boolean {
    if (snap.heapLimit > 0 && snap.heapUsed / snap.heapLimit > this.config.triggerRatio)
      return true;
    if (snap.heapLimit > 0 && this.liveBytes(snap) / snap.heapLimit > this.config.triggerRatio) {
      return true;
    }
    const target = this.rssTarget(snap);
    return target > 0 && snap.rss > target;
  }

  /** Diagnostics for tests and the watchdog log. */
  public get state(): {
    cooldownMs: number;
    unproductive: number;
    rssFloor: number;
    sweeps: number;
    reclaimedBytes: number;
  } {
    return {
      cooldownMs: this.cooldownMs,
      unproductive: this.unproductive,
      rssFloor: this.rssFloor,
      sweeps: this.sweeps,
      reclaimedBytes: this.reclaimedBytes,
    };
  }
}

function mb(bytes: number): number {
  return Math.round(bytes / MB);
}
