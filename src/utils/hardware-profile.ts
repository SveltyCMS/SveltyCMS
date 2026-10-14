/**
 * @file src/utils/hardware-profile.ts
 * @description Hardware-adaptive runtime profile — detects the host machine once at
 * boot and derives lean tuning knobs for every CPU-critical subsystem.
 *
 * The CMS must run well on ANY hardware: a 1-core VPS and a 24-core workstation
 * share the same code, but not the same pools/threads. This module is the single
 * source of truth for that adaptation — hooks (sharp/threadpool), DB connection
 * pools, module-loader workers and compression all read from here.
 *
 * ### Features:
 * - Sync + memoized (zero cost after first call, no async, no I/O)
 * - Tier classification (single → huge) for dashboards and logs
 * - Memory-aware: every budget derives from the EFFECTIVE limit
 *   (`process.constrainedMemory()` / cgroup, else host total) — heap, RSS
 *   target, L1 caches, body limit and per-subsystem worker/pool caps
 * - Every knob is env-overridable — explicit deployment config always wins
 * - Physical-core aware (HT: logical ≥ 2× physical on typical hosts)
 * - GPU: libvips/sharp has NO GPU backend (verified empirically) — media
 *   parallelism is capped by the CPU tier, not by any GPU probe.
 */

import os from "node:os";
// RELATIVE import — this module is reachable from vite.config.ts (via
// src/utils/compilation/compile.ts), whose config loader (esbuild) cannot
// resolve `@src`/`@utils` path aliases.
import { getGlobal, setGlobal } from "./native-utils.ts";

// The profile is detected ONCE (first process boot) and published to the shared
// global registry — every module, chunk and worker-thread import reads the same
// frozen object instead of re-detecting. `initHardwareProfile()` in hooks.server.ts
// is the boot entry point.
const HW_PROFILE_KEY = "__SVELTY_HARDWARE_PROFILE__";

// ─── Types ────────────────────────────────────────────────────────────────

export type HardwareTier = "single" | "small" | "medium" | "large" | "huge";

/**
 * Memory tier derived from the memory the OS actually allows this process
 * (cgroup limit when constrained, else host total) — NOT from the host's
 * physical RAM. Container limits are what kill the process.
 */
export type MemoryTier = "nano" | "small" | "medium" | "large" | "xlarge";

/** Derived memory budgets for one effective-memory limit (see `deriveMemoryBudgets`). */
export interface MemoryBudgets {
  /** L1 response-cache budget for the LIST tier (`SVELTY_L1_MAX_MB` overrides). */
  l1CacheMb: number;
  /** Point-read tier of the L1 response cache. */
  l1PointCacheMb: number;
  /** Hard ceiling for the DERIVED DB pool on this memory tier. */
  dbPoolCap: number;
  /** Per-subsystem caps — never below the functional minimums (they cap, never floor). */
  workerCap: number;
  compileCap: number;
  jobCap: number;
  sharpCap: number;
}

export interface HardwareProfile {
  /**
   * Logical CPUs visible to THIS process — cgroup CPU-quota and cpuset aware
   * (`os.availableParallelism()`), NOT `os.cpus().length`, which reports the
   * HOST's cores inside a container. `HARDWARE_CPU_CORES` overrides.
   */
  cores: number;
  /** Best-effort physical core count (HT-aware). */
  physicalCores: number;
  /** Host logical cores (`os.cpus().length`) — differs from `cores` under a cgroup CPU quota. */
  hostCores: number;
  model: string;
  tier: HardwareTier;
  /**
   * CPU budget for the CMS (0.25–1.0). The rest is reserved for co-hosted
   * services (DB server, Redis, nginx) on all-in-one deployments. Dedicated
   * app servers set `HARDWARE_CPU_BUDGET=1`. This is the GLOBAL ceiling —
   * each workload gets its own prioritized share of it (media > compile >
   * workers > jobs > db fan-out), because media pipelines need far more CPU
   * than DB handling does.
   */
  cpuBudget: number;
  /** Cores the CMS may actually use: `max(1, floor(cores × cpuBudget))`. */
  budgetCores: number;
  /** Physical-core budget (same factor). */
  budgetPhysicalCores: number;
  /** libuv `UV_THREADPOOL_SIZE` — blocking-I/O offload threads. */
  threadPoolSize: number;
  /**
   * Media pipeline (sharp/libvips) concurrency. Media is the burstiest,
   * most CPU-hungry workload → the LARGEST share of the budget. Measured:
   * beyond ~50% of physical budget the 12-way parallel variant pipelines
   * already saturate, so the cap stays low even on huge hosts.
   */
  sharpConcurrency: number;
  /**
   * Networked-DB connection pool default (MariaDB/Postgres/Mongo). DB handling
   * gets the MOST CONSERVATIVE share: every pooled query burns CPU on the
   * (possibly co-hosted) DB server, so the app must not drown it in sockets.
   */
  dbPoolSize: number;
  /** Minimum pre-warmed idle DB connections in pool. */
  dbPoolMin: number;
  /** MongoDB `minPoolSize` — pre-spawned connections (scaled down on weak boxes). */
  mongoMinPool: number;
  /** Module-loader worker pool size. */
  workerPoolSize: number;
  /** AST compilation fan-out (content sync / builds). */
  compileConcurrency: number;
  /** Background job queue max concurrent handlers. */
  jobConcurrency: number;
  /** Gzip level used for cache pre-compression (lower = less CPU on weak boxes). */
  gzipLevel: number;
  /** Brotli quality cap for cache pre-compression. */
  brotliQuality: number;
  /** Total host memory in bytes (`os.totalmem()`). */
  totalMemoryBytes: number;
  /**
   * Memory the OS actually allows this process: `process.constrainedMemory()`
   * (cgroup / container limit) when set, else `os.totalmem()`. Every memory
   * budget below derives from THIS, so a container follows its limit, not the
   * host's RAM. `HARDWARE_MEM_LIMIT_MB` overrides the detection.
   */
  effectiveMemoryBytes: number;
  /** Memory tier derived from `effectiveMemoryBytes`. */
  memTier: MemoryTier;
  /** V8 old-space cap a launcher may apply (`NODE_HEAP_MB` overrides). */
  nodeHeapMb: number;
  /**
   * RSS target for the memory governor: `effectiveMemoryBytes ×
   * SVELTY_MEMORY_CONSTRAINED_RATIO` (the SAME ratio knob the governor uses),
   * so the boot line and the governor can never disagree. `0` when the process
   * is unconstrained — the governor then derives from the V8 heap limit, and
   * `SVELTY_MEMORY_RSS_MB` remains the absolute operator override.
   */
  rssTargetMb: number;
  /** L1 response-cache budget for the LIST tier (`SVELTY_L1_MAX_MB` overrides). */
  l1CacheMb: number;
  /** Point-read L1 tier in MB (`SVELTY_L1_POINT_MAX_MB` overrides). */
  l1PointCacheMb: number;
  /** Default request-body ceiling in MB (`BODY_SIZE_LIMIT_MB` overrides). */
  bodySizeLimitMb: number;
  /**
   * Hardware-adaptive SQLite PRAGMA cache_size (in KiB, positive number;
   * applied as negative KiB in SQLite pragmas: `PRAGMA cache_size = -N`).
   * Dynamically scales from 16MB on <1.5GB RAM boxes up to 256MB on high-end hosts.
   */
  sqliteCacheSizeKb: number;
  /**
   * Hardware-adaptive SQLite PRAGMA mmap_size in bytes.
   * Dynamically scales from 64MB on small boxes up to 512MB on large hosts.
   */
  sqliteMmapSizeBytes: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const MIN_THREAD_POOL = 4; // libuv default — I/O threads block, so 4 is safe even on 1 core
const MAX_THREAD_POOL = 32; // beyond this the pool oversubscribes and burns stack memory
const MIN_SHARP = 1; // single-core hosts must not oversubscribe CPU-bound pipelines
const MAX_SHARP = 8; // measured: 4≈24 threads on a 24-core host — cap keeps headroom
const MIN_DB_POOL = 4;
const MAX_DB_POOL = 100; // mirrors the historical hardcoded ceiling
const MIN_WORKERS = 2; // module loader needs ≥2 for fork-join content scans
const MAX_WORKERS = 8; // each worker loads a full module graph — cap memory

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function envInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function envSignedInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

function envFloat(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw || !/^(0\.\d+|1(\.0+)?)$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Physical-core estimate from the CPU model string. Intel/AMD expose the
 * physical count in the model ("i9-14900K" → 24 logical / 8P+16E), but parsing
 * vendor strings is fragile — the pragmatic proxy is: when logical cores are a
 * multiple of 2 and load-average math suggests HT, report half. Conservative
 * fallback: logical count (physical ≥ logical is impossible, so under-estimating
 * physical only makes the profile slightly more conservative — safe).
 */
function estimatePhysicalCores(logical: number): number {
  if (logical <= 2) return logical;
  const htFactor = envInt("HARDWARE_PHYSICAL_CORES");
  if (htFactor) return htFactor;
  // Common HT ratio is exactly 2× on consumer/desktop; servers often expose
  // logical=physical. Only halve when the count is even AND > 4 — small boxes
  // rarely disable HT and over-reporting physical hurts nothing there.
  return logical > 4 && logical % 2 === 0 ? Math.floor(logical / 2) : logical;
}

function classifyTier(cores: number): HardwareTier {
  if (cores >= 17) return "huge";
  if (cores >= 9) return "large";
  if (cores >= 5) return "medium";
  if (cores >= 3) return "small";
  return "single";
}

/**
 * CPUs this process may actually use. `os.cpus().length` reports the HOST's
 * cores inside a container, so a `--cpus=1` container looked like a 24-core box
 * and got 24 libuv threads plus weak-box compression disabled. libuv's
 * `availableParallelism()` honours both the cgroup CPU quota (`cpu.max`) and
 * `cpuset` — the number every CPU-derived budget below must scale from.
 */
function detectLogicalCores(): number {
  const override = envInt("HARDWARE_CPU_CORES");
  if (override !== null && override > 0) return override;
  try {
    const available = typeof os.availableParallelism === "function" ? os.availableParallelism() : 0;
    if (available > 0) return available;
  } catch {
    /* platform without availableParallelism — fall through to the host count */
  }
  return Math.max(1, os.cpus().length);
}

// ─── Memory tiers & derived budgets ───────────────────────────────────────

const MB = 1024 * 1024;

/**
 * Memory tier from the EFFECTIVE limit (cgroup-aware). Boundaries are the
 * documented deployment classes: 256–512 MB VPS → 512 MB–1 GB → 1–2 GB →
 * 2–8 GB → ≥8 GB.
 */
export function classifyMemoryTier(effectiveMemBytes: number): MemoryTier {
  const mb = effectiveMemBytes / MB;
  if (mb < 512) return "nano";
  if (mb < 1024) return "small";
  if (mb < 2048) return "medium";
  if (mb < 8192) return "large";
  return "xlarge";
}

/**
 * Budget rows, one per memory class, looked up by the row's `minMb` floor.
 * `MemoryTier` stays the coarse 5-class label (dashboards/logs); the rows are
 * finer, because a single row spanning 2–8 GB cannot hold the ≤70 % invariant
 * at its floor.
 *
 * Linear values are RATIOS (heap 0.5, request body 1/32, RSS 0.75 of the
 * effective limit — one constant each, so `index.cjs` can mirror them without a
 * table); rows carry only the values that are genuinely tiered and non-linear
 * (L1 cache budgets and the per-subsystem caps). Caps only ever reduce derived
 * knobs; the functional minimums (`MIN_WORKERS`, `MIN_DB_POOL`, …) still apply.
 *
 * Unit-tested invariant: `deriveNodeHeapMb(limit) + row.l1CacheMb +
 * row.l1PointCacheMb ≤ 70 %` of the effective limit — booting never requires a
 * sweep just to fit.
 */
const MEMORY_BUDGET_ROWS: ReadonlyArray<{ minMb: number; budgets: MemoryBudgets }> = [
  // ~256 MB (nano VPS): one media slot, two module workers, four DB sockets.
  {
    minMb: 0,
    budgets: {
      l1CacheMb: 16,
      l1PointCacheMb: 8,
      dbPoolCap: 4,
      workerCap: 2,
      compileCap: 4,
      jobCap: 5,
      sharpCap: 1,
    },
  },
  // ~512 MB
  {
    minMb: 512,
    budgets: {
      l1CacheMb: 32,
      l1PointCacheMb: 16,
      dbPoolCap: 6,
      workerCap: 2,
      compileCap: 4,
      jobCap: 5,
      sharpCap: 2,
    },
  },
  // ~1 GB
  {
    minMb: 1024,
    budgets: {
      l1CacheMb: 64,
      l1PointCacheMb: 32,
      dbPoolCap: 8,
      workerCap: 2,
      compileCap: 4,
      jobCap: 5,
      sharpCap: 2,
    },
  },
  // 2–4 GB
  {
    minMb: 2048,
    budgets: {
      l1CacheMb: 96,
      l1PointCacheMb: 48,
      dbPoolCap: 12,
      workerCap: 4,
      compileCap: 8,
      jobCap: 10,
      sharpCap: 4,
    },
  },
  // 4–16 GB
  {
    minMb: 4096,
    budgets: {
      l1CacheMb: 128,
      l1PointCacheMb: 64,
      dbPoolCap: 16,
      workerCap: 4,
      compileCap: 16,
      jobCap: 25,
      sharpCap: 4,
    },
  },
  // ≥16 GB
  {
    minMb: 16384,
    budgets: {
      l1CacheMb: 256,
      l1PointCacheMb: 128,
      dbPoolCap: 32,
      workerCap: 8,
      compileCap: 32,
      jobCap: 50,
      sharpCap: 8,
    },
  },
];

/** Derive every memory budget from one effective-memory limit. Pure + testable. */
export function deriveMemoryBudgets(effectiveMemBytes: number): MemoryBudgets {
  const mb = Math.floor(effectiveMemBytes / MB);
  let row = MEMORY_BUDGET_ROWS[0];
  for (const candidate of MEMORY_BUDGET_ROWS) {
    if (mb >= candidate.minMb) row = candidate;
  }
  return row.budgets;
}

interface EffectiveMemory {
  bytes: number;
  /** True when the value came from a real constraint (cgroup or explicit override). */
  constrained: boolean;
}

/**
 * The ONE constant `index.cjs` shares with this module for
 * `--max-old-space-size`: the launcher cannot import TypeScript, so the heap
 * rule is a ratio rather than a table (a table would be a second source of
 * truth for six numbers). 0.5 × the effective limit, clamped — reproduces the
 * documented rows exactly: 256→128 · 512→256 · 1G→512 · 2G→1024 · 4G→2048 · ≥8G→4096.
 * The unit suite pins those six values, so the launcher and this module cannot
 * drift without a red test.
 */
export const NODE_HEAP_RATIO = 0.5;
export const MIN_NODE_HEAP_MB = 128;
export const MAX_NODE_HEAP_MB = 4096;

/**
 * Request-body budget as a fraction of the effective limit, clamped. One ratio
 * (not a table) so `index.cjs`'s `BODY_SIZE_LIMIT` rule mirrors this module
 * exactly: 256→8 · 512→16 · 1G→32 · 2G→64 · ≥4G→128 MB.
 */
export const BODY_LIMIT_RATIO = 1 / 32;
export const MIN_BODY_LIMIT_MB = 8;
export const MAX_BODY_LIMIT_MB = 128;

/** Request-body budget for one effective limit (`API_MAX_BODY_SIZE_MB` overrides). */
export function deriveBodyLimitMb(effectiveMemBytes: number, ratio = BODY_LIMIT_RATIO): number {
  const mb = effectiveMemBytes / MB;
  return clamp(Math.round(mb * ratio), MIN_BODY_LIMIT_MB, MAX_BODY_LIMIT_MB);
}

/** V8 old-space cap for one effective limit — the launcher's rule, testable here. */
export function deriveNodeHeapMb(effectiveMemBytes: number, ratio = NODE_HEAP_RATIO): number {
  const mb = effectiveMemBytes / MB;
  return clamp(Math.round(mb * ratio), MIN_NODE_HEAP_MB, MAX_NODE_HEAP_MB);
}

/**
 * Which V8 heap ceiling is aligned with which memory limit — the shared shape
 * the health responders emit. Pure over its inputs so both responders report the
 * same `heapAligned` verdict (and neither has to import `node:v8` here).
 */
export interface HardwareDiagnostics {
  summary: string;
  cpuTier: HardwareTier;
  memTier: MemoryTier;
  cores: number;
  hostCores: number;
  effectiveMemoryBytes: number;
  nodeHeapMb: number;
  heapLimitMb: number;
  heapAligned: boolean;
  rssTargetMb: number;
  l1CacheMb: number;
  l1PointCacheMb: number;
  bodySizeLimitMb: number;
  dbPoolSize: number;
  workerPoolSize: number;
  threadPoolSize: number;
  sharpConcurrency: number;
}

/**
 * Diagnostic payload for the health endpoints (verbose only). `heapAligned` is
 * the actionable field: false means the runtime's own heap ceiling is not
 * aligned with the memory the OS allows — start via `index.cjs`, or set
 * `NODE_OPTIONS=--max-old-space-size=<nodeHeapMb>`.
 */
export function hardwareDiagnostics(
  profile: HardwareProfile,
  heapLimitBytes: number,
): HardwareDiagnostics {
  return {
    summary: describeHardware(profile),
    cpuTier: profile.tier,
    memTier: profile.memTier,
    cores: profile.cores,
    hostCores: profile.hostCores,
    effectiveMemoryBytes: profile.effectiveMemoryBytes,
    nodeHeapMb: profile.nodeHeapMb,
    heapLimitMb: Math.round(heapLimitBytes / MB),
    heapAligned: isHeapAligned(heapLimitBytes, profile.effectiveMemoryBytes),
    rssTargetMb: profile.rssTargetMb,
    l1CacheMb: profile.l1CacheMb,
    l1PointCacheMb: profile.l1PointCacheMb,
    bodySizeLimitMb: profile.bodySizeLimitMb,
    dbPoolSize: profile.dbPoolSize,
    workerPoolSize: profile.workerPoolSize,
    threadPoolSize: profile.threadPoolSize,
    sharpConcurrency: profile.sharpConcurrency,
  };
}

/**
 * Whether V8's heap limit is aligned with the effective memory limit.
 *
 * V8 on Node 24 DOES read cgroups (measured: 259 MB of heap in a 256 MB
 * container, 560 MB in a 1 GB one) — but its cap is not conservative on tiny
 * boxes: 259 MB of old-space on a 256 MB container means the heap alone equals
 * the limit, leaving nothing for code space, buffers and thread stacks.
 * Aligned = heap ≤ 75 % of the effective limit (what `index.cjs` targets).
 */
export function isHeapAligned(heapLimitBytes: number, effectiveMemBytes: number): boolean {
  if (!(effectiveMemBytes > 0) || !(heapLimitBytes > 0)) return true;
  return heapLimitBytes <= effectiveMemBytes * 0.75;
}

/**
 * The single RSS-target derivation, shared with the memory governor:
 * `round(effective limit × ratio)` when the process is constrained, `0`
 * otherwise (the governor then derives from the V8 heap limit). Exported so the
 * governor / boot-log contract is unit-testable without a container.
 */
export function deriveRssTargetMb(
  effectiveMemBytes: number,
  constrained: boolean,
  ratio = 0.75,
): number {
  if (!constrained) return 0;
  return Math.round((effectiveMemBytes / MB) * clamp(ratio, 0.25, 1.0));
}

/**
 * A memory limit only counts as a constraint when it is meaningfully below the
 * host total. Node reports `0` from `constrainedMemory()` when unconstrained,
 * but **Bun reports the host total** — without this guard a bare-metal Bun
deployment would look "constrained" and replace the governor's heap-derived
 * fallback with a target nobody can exceed.
 */
export function isMemoryConstrained(limitBytes: number, hostTotalBytes: number): boolean {
  return limitBytes > 0 && (hostTotalBytes <= 0 || limitBytes < hostTotalBytes * 0.95);
}

/**
 * The memory the OS actually allows this process. `process.constrainedMemory()`
 * reports the cgroup limit (0 when unconstrained); `HARDWARE_MEM_LIMIT_MB`
 * forces a value for environments without cgroups (Windows dev, tests).
 */
function detectEffectiveMemoryBytes(): EffectiveMemory {
  const override = envInt("HARDWARE_MEM_LIMIT_MB");
  if (override !== null && override > 0) return { bytes: override * MB, constrained: true };
  const hostTotal = typeof os.totalmem === "function" ? os.totalmem() : 4096 * MB;
  const reported =
    typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  if (isMemoryConstrained(reported, hostTotal)) {
    return { bytes: reported, constrained: true };
  }
  return { bytes: hostTotal, constrained: false };
}

/** Derived value capped by the memory tier; an explicit env value always wins (and ignores the memory cap). */
function envOrMemoryCapped(
  name: string,
  derived: number,
  min: number,
  absMax: number,
  memCap: number,
): number {
  const env = envInt(name);
  return env !== null ? clamp(env, min, absMax) : clamp(derived, min, Math.min(absMax, memCap));
}

// ─── Profile construction (memoized + shared) ─────────────────────────────

let _profile: HardwareProfile | null = null;

function buildProfile(): HardwareProfile {
  const hostCores = Math.max(1, os.cpus().length);
  const logical = detectLogicalCores();
  const physical = estimatePhysicalCores(logical);
  const tier = classifyTier(logical);
  const weakBox = tier === "single" || tier === "small";

  const totalMem = typeof os.totalmem === "function" ? os.totalmem() : 1024 * 1024 * 1024 * 4;
  // 🧠 EFFECTIVE MEMORY: what the OS actually allows THIS process. A container
  // must follow its cgroup limit, not the host's RAM — every budget below
  // derives from this number.
  const effective = detectEffectiveMemoryBytes();
  const effectiveMem = effective.bytes;
  const effectiveMemMb = Math.floor(effectiveMem / MB);
  const memTier = classifyMemoryTier(effectiveMem);
  const memBudgets = deriveMemoryBudgets(effectiveMem);

  // 🧠 RSS TARGET — ONE derivation, shared with the memory governor: the
  // effective limit × `SVELTY_MEMORY_CONSTRAINED_RATIO` (the ratio is the knob,
  // the MB is derived). `SVELTY_MEMORY_RSS_MB` stays the absolute operator
  // override. Unconstrained hosts get 0 — the governor derives from the V8
  // heap limit there, and a machine-blind absolute never ships as a default.
  const constrainedRatio = clamp(envFloat("SVELTY_MEMORY_CONSTRAINED_RATIO") ?? 0.75, 0.25, 1.0);
  const rssTargetMb =
    envInt("SVELTY_MEMORY_RSS_MB") ??
    deriveRssTargetMb(effectiveMem, effective.constrained, constrainedRatio);

  // 🧠 DYNAMIC SQLITE CACHE SIZE: scales with the EFFECTIVE memory limit.
  // SQLite negative cache_size means KiB (e.g. -64000 = 64MB).
  // - <1.5GB (small container/VPS): 16MB (-16000 KiB)
  // - 1.5–3.5GB: 32MB (-32000 KiB)
  // - 3.5–7.5GB: 64MB (-64000 KiB)
  // - 7.5–15.5GB: 128MB (-128000 KiB)
  // - ≥15.5GB (workstation/server): 256MB (-256000 KiB)
  let defaultSqliteCacheKb = 64000;
  if (effectiveMemMb < 1500) defaultSqliteCacheKb = 16000;
  else if (effectiveMemMb < 3500) defaultSqliteCacheKb = 32000;
  else if (effectiveMemMb < 7500) defaultSqliteCacheKb = 64000;
  else if (effectiveMemMb < 15500) defaultSqliteCacheKb = 128000;
  else defaultSqliteCacheKb = 256000;

  const rawEnvCache = envSignedInt("SQLITE_CACHE_SIZE");
  const sqliteCacheSizeKb = rawEnvCache !== null ? Math.abs(rawEnvCache) : defaultSqliteCacheKb;

  // 🧠 DYNAMIC SQLITE MMAP SIZE: scales with the effective memory limit.
  let defaultMmapBytes = 268435456;
  if (effectiveMemMb < 1500) defaultMmapBytes = 67108864; // 64MB
  else if (effectiveMemMb < 3500) defaultMmapBytes = 134217728; // 128MB
  else if (effectiveMemMb < 7500) defaultMmapBytes = 268435456; // 256MB
  else defaultMmapBytes = 536870912; // 512MB

  const sqliteMmapSizeBytes = envInt("SQLITE_MMAP_SIZE") ?? defaultMmapBytes;

  // 🧠 CPU BUDGET: the CMS reserves headroom for co-hosted services (DB server,
  // Redis, nginx) on all-in-one deployments. Default 75% — a dedicated app
  // server (managed/remote DB) sets HARDWARE_CPU_BUDGET=1. libuv I/O threads
  // block and stay on logical cores; every CPU-bound knob scales with the
  // budget so the co-hosted DB never starves.
  const cpuBudget = clamp(envFloat("HARDWARE_CPU_BUDGET") ?? 0.75, 0.25, 1.0);
  const budgetCores = Math.max(1, Math.floor(logical * cpuBudget));
  const budgetPhysicalCores = Math.max(1, Math.floor(physical * cpuBudget));

  // 🧠 WORKLOAD-PRIORITIZED ALLOCATION (per-workload share of the budget):
  // media (bursty, CPU-hungry) gets the LARGEST slice; DB fan-out the most
  // conservative (the co-hosted DB server needs CPU per query); background
  // compile/jobs sit in between. Every knob is env-overridable.
  const profile: HardwareProfile = {
    cores: logical,
    physicalCores: physical,
    hostCores,
    model: os.cpus()[0]?.model?.trim() || "Unknown",
    tier,
    cpuBudget,
    budgetCores,
    budgetPhysicalCores,
    // libuv: I/O threads block, so even weak boxes get the default 4; huge
    // boxes get up to 32 (fs/zlib/crypto/dns offload under load). Kept on
    // LOGICAL cores — blocking I/O threads don't steal CPU from co-hosted DBs.
    threadPoolSize: clamp(
      envInt("UV_THREADPOOL_SIZE") ?? logical,
      MIN_THREAD_POOL,
      MAX_THREAD_POOL,
    ),
    // MEDIA — highest priority: up to 50% of the physical budget. Measured
    // flat beyond ~50% on a 24-core host (the 12-way parallel variant
    // pipelines saturate first), so the cap stays low even on huge boxes.
    sharpConcurrency: envOrMemoryCapped(
      "SHARP_CONCURRENCY",
      Math.ceil(budgetPhysicalCores * 0.5),
      MIN_SHARP,
      MAX_SHARP,
      memBudgets.sharpCap,
    ),
    // DB — most conservative: 2 concurrent queries per budget core keeps a
    // co-hosted DB server breathing while covering realistic fan-out. The
    // memory tier caps the DERIVED value (a 1-core/512 MB box gets 4, not 20);
    // an explicit `DB_POOL_SIZE` / `DATABASE_MAX_CONNECTIONS` always wins.
    dbPoolSize: envOrMemoryCapped(
      "DB_POOL_SIZE",
      Math.max(MIN_DB_POOL, budgetCores * 2),
      MIN_DB_POOL,
      MAX_DB_POOL,
      memBudgets.dbPoolCap,
    ),
    dbPoolMin: clamp(
      envInt("DB_POOL_MIN") ??
        (tier === "huge" ? 5 : tier === "large" ? 3 : tier === "medium" ? 2 : 1),
      1,
      10,
    ),
    // Mongo pre-spawns min connections — a quarter of the budget, capped small.
    mongoMinPool: clamp(envInt("MONGO_MIN_POOL_SIZE") ?? Math.ceil(budgetCores / 4), 1, 10),
    // Module workers: fork-join scans need ≥2; each loads a full module graph.
    // The memory tier caps the derived value (never below MIN_WORKERS — the
    // loader requires 2 for fork-join).
    workerPoolSize: envOrMemoryCapped(
      "MODULE_WORKER_POOL_SIZE",
      Math.ceil(budgetCores / 2),
      MIN_WORKERS,
      MAX_WORKERS,
      memBudgets.workerCap,
    ),
    // Compilation (content sync / collection builds): CPU-bound fan-out,
    // 75% of the budget (matches the historical heuristic) with a ceiling.
    compileConcurrency: envOrMemoryCapped(
      "COMPILE_CONCURRENCY",
      Math.max(4, Math.floor(budgetCores * 0.75)),
      4,
      32,
      memBudgets.compileCap,
    ),
    // Background jobs: 50% of the budget so the request path keeps headroom.
    jobConcurrency: envOrMemoryCapped(
      "JOB_CONCURRENCY",
      Math.max(5, Math.floor(budgetCores * 0.5)),
      5,
      50,
      memBudgets.jobCap,
    ),
    // Compression: weak boxes cap quality to keep CPU for the request path.
    // Strong boxes keep the size-adaptive levels (gzip 4-9 / brotli 4-8).
    gzipLevel: weakBox ? 4 : 9,
    brotliQuality: weakBox ? 4 : 8,
    totalMemoryBytes: totalMem,
    effectiveMemoryBytes: effectiveMem,
    memTier,
    // Memory-derived budgets — every one of them env-overridable. Wired by the
    // consumers in the same changeset series (governor / L1 cache / body limit
    // / launcher); exposed here so there is ONE source of truth.
    nodeHeapMb: envInt("NODE_HEAP_MB") ?? deriveNodeHeapMb(effectiveMem),
    rssTargetMb,
    l1CacheMb: envInt("SVELTY_L1_MAX_MB") ?? memBudgets.l1CacheMb,
    l1PointCacheMb: envInt("SVELTY_L1_POINT_MAX_MB") ?? memBudgets.l1PointCacheMb,
    bodySizeLimitMb: envInt("BODY_SIZE_LIMIT_MB") ?? deriveBodyLimitMb(effectiveMem),
    sqliteCacheSizeKb,
    sqliteMmapSizeBytes,
  };

  // Publish to the shared global registry — the single detection every module
  // reads from (all cores/workers behave identically, zero re-detection cost).
  setGlobal(HW_PROFILE_KEY, profile);
  _profile = profile;
  return profile;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Returns the shared hardware profile. The FIRST call detects + publishes to the
 * global registry; every later call (any module, chunk or worker import) returns
 * the same frozen object. Sync + memoized — zero cost on hot paths.
 */
export function getHardwareProfile(): HardwareProfile {
  const existing = getGlobal<HardwareProfile | null>(HW_PROFILE_KEY, null);
  if (existing) {
    _profile = existing;
    return existing;
  }
  if (!_profile) _profile = buildProfile();
  return _profile;
}

/**
 * Explicit boot-time entry point — call ONCE at process start so the shared
 * profile exists before any pool/thread/worker consumes it. Idempotent.
 */
export function initHardwareProfile(): HardwareProfile {
  return getHardwareProfile();
}

/** Human-readable one-liner for boot logs / setup wizard / dashboard. */
export function describeHardware(profile: HardwareProfile = getHardwareProfile()): string {
  const hostMb = Math.round(profile.totalMemoryBytes / MB);
  const effectiveMb = Math.round(profile.effectiveMemoryBytes / MB);
  return [
    `${profile.model}`,
    // Host cores and the CPUs actually granted — they differ under --cpus/cpuset.
    profile.cores !== profile.hostCores
      ? `${profile.hostCores}c host→limit=${profile.cores}c`
      : `${profile.physicalCores}P/${profile.cores}T cores`,
    // Host RAM and the effective (cgroup) limit — they differ inside containers.
    effectiveMb !== hostMb ? `RAM=${hostMb}MB→limit=${effectiveMb}MB` : `RAM=${hostMb}MB`,
    `cpu=${profile.tier} mem=${profile.memTier}`,
    `budget=${Math.round(profile.cpuBudget * 100)}% (${profile.budgetCores}T)`,
    `heap=${profile.nodeHeapMb}MB`,
    // 0 = unconstrained: the governor derives from the V8 heap limit instead.
    profile.rssTargetMb > 0 ? `rssTarget=${profile.rssTargetMb}MB` : "rssTarget=none",
    `l1=${profile.l1CacheMb}MB`,
    `body=${profile.bodySizeLimitMb}MB`,
    `threadPool=${profile.threadPoolSize}`,
    `media(sharp)=${profile.sharpConcurrency}`,
    `dbPool=${profile.dbPoolSize}`,
    `workers=${profile.workerPoolSize}`,
    `sqliteCache=${Math.round(profile.sqliteCacheSizeKb / 1000)}MB`,
    `compile=${profile.compileConcurrency}`,
    `jobs=${profile.jobConcurrency}`,
  ].join(" · ");
}
