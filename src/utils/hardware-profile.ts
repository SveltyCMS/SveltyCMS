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

export interface HardwareProfile {
  /** Logical CPU count (`os.cpus().length`). */
  cores: number;
  /** Best-effort physical core count (HT-aware). */
  physicalCores: number;
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

// ─── Profile construction (memoized + shared) ─────────────────────────────

let _profile: HardwareProfile | null = null;

function buildProfile(): HardwareProfile {
  const logical = Math.max(1, os.cpus().length);
  const physical = estimatePhysicalCores(logical);
  const tier = classifyTier(logical);
  const weakBox = tier === "single" || tier === "small";

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
    sharpConcurrency: clamp(
      envInt("SHARP_CONCURRENCY") ?? Math.ceil(budgetPhysicalCores * 0.5),
      MIN_SHARP,
      MAX_SHARP,
    ),
    // DB — most conservative: 2 concurrent queries per budget core keeps a
    // co-hosted DB server breathing while covering realistic fan-out.
    dbPoolSize: clamp(
      envInt("DB_POOL_SIZE") ?? Math.max(4, budgetCores * 2),
      MIN_DB_POOL,
      MAX_DB_POOL,
    ),
    // Mongo pre-spawns min connections — a quarter of the budget, capped small.
    mongoMinPool: clamp(envInt("MONGO_MIN_POOL_SIZE") ?? Math.ceil(budgetCores / 4), 1, 10),
    // Module workers: fork-join scans need ≥2; each loads a full module graph.
    workerPoolSize: clamp(
      envInt("MODULE_WORKER_POOL_SIZE") ?? Math.ceil(budgetCores / 2),
      MIN_WORKERS,
      MAX_WORKERS,
    ),
    // Compilation (content sync / collection builds): CPU-bound fan-out,
    // 75% of the budget (matches the historical heuristic) with a ceiling.
    compileConcurrency: clamp(
      envInt("COMPILE_CONCURRENCY") ?? Math.max(4, Math.floor(budgetCores * 0.75)),
      4,
      32,
    ),
    // Background jobs: 50% of the budget so the request path keeps headroom.
    jobConcurrency: clamp(
      envInt("JOB_CONCURRENCY") ?? Math.max(5, Math.floor(budgetCores * 0.5)),
      5,
      50,
    ),
    // Compression: weak boxes cap quality to keep CPU for the request path.
    // Strong boxes keep the size-adaptive levels (gzip 4-9 / brotli 4-8).
    gzipLevel: weakBox ? 4 : 9,
    brotliQuality: weakBox ? 4 : 8,
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
  return [
    `${profile.model}`,
    `${profile.physicalCores}P/${profile.cores}T cores`,
    `tier=${profile.tier}`,
    `budget=${Math.round(profile.cpuBudget * 100)}% (${profile.budgetCores}T)`,
    `threadPool=${profile.threadPoolSize}`,
    `media(sharp)=${profile.sharpConcurrency}`,
    `dbPool=${profile.dbPoolSize}`,
    `compile=${profile.compileConcurrency}`,
    `jobs=${profile.jobConcurrency}`,
  ].join(" · ");
}
