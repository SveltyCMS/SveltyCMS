/**
 * @file src/utils/cpu-profiler.ts
 * @description Env-gated in-process V8 CPU profiler that flushes `.cpuprofile`
 * snapshots on an interval, so attribution survives a hard process kill.
 *
 * `node --cpu-prof` writes its profile only on a clean exit. A soak or
 * benchmark harness that SIGTERMs its child and SIGKILLs it a moment later
 * therefore produces no file at all — the terminal symptom this module fixes:
 * the newest snapshot on disk is at most one interval old, whatever happens to
 * the process. Profiles load straight into Chrome DevTools or
 * `speedscope` like any `--cpu-prof` output.
 *
 * ### Features:
 * - `SVELTY_CPU_PROFILE=<dir>` enables it; unset ⇒ one env read, no imports
 * - `SVELTY_CPU_PROFILE_INTERVAL_MS` sets the cadence (default 30 s, floor 1 s)
 * - `Profiler.stop`/`Profiler.start` cycling: sampling resumes for each window
 * - Atomic writes (`.tmp` + rename) and rotation, newest 2 snapshots kept
 * - Never throws into the server: failures are logged and sampling stops
 */

import { logger } from "@utils/logger";

/** Manifest of one written snapshot. */
export interface CpuProfilerSnapshot {
  file: string;
  bytes: number;
  samples: number;
}

export type CpuProfilerStatus = "disabled" | "started" | "unavailable";

const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 1_000;
const SNAPSHOTS_KEPT = 2;
const SAMPLING_INTERVAL_US = 1_000;

/**
 * Structural view of `inspector.Session` — the two methods this module uses,
 * with the result-bearing overload V8 needs for `Profiler.stop`.
 */
interface InspectorSessionLike {
  connect(): void;
  disconnect(): void;
  post(
    method: string,
    params: Record<string, unknown> | null,
    callback: (err: Error | null, result?: Record<string, unknown>) => void,
  ): void;
}

interface ProfilerState {
  session: InspectorSessionLike | null;
  timer: ReturnType<typeof setInterval> | null;
  seq: number;
  busy: boolean;
}

/**
 * State hangs off `globalThis` so a dev HMR reload cannot leave a second
 * sampler running against the same process.
 */
function profilerState(): ProfilerState {
  const host = globalThis as typeof globalThis & { __SVELTY_CPU_PROFILER__?: ProfilerState };
  host.__SVELTY_CPU_PROFILER__ ??= { session: null, timer: null, seq: 0, busy: false };
  return host.__SVELTY_CPU_PROFILER__;
}

function readEnv(name: string): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

/** Snapshot directory, or null when profiling is off. */
export function cpuProfileDir(): string | null {
  return readEnv("SVELTY_CPU_PROFILE");
}

function snapshotIntervalMs(): number {
  const raw = Number(readEnv("SVELTY_CPU_PROFILE_INTERVAL_MS"));
  return Number.isFinite(raw) && raw >= MIN_INTERVAL_MS ? raw : DEFAULT_INTERVAL_MS;
}

function post(
  target: InspectorSessionLike,
  method: string,
  params: Record<string, unknown> | null = null,
): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    target.post(method, params, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function writeSnapshot(
  profile: Record<string, unknown>,
): Promise<CpuProfilerSnapshot | null> {
  const dir = cpuProfileDir();
  if (!dir) return null;

  const { mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `cpu-${stamp}-${String(profilerState().seq++).padStart(3, "0")}.cpuprofile`;
  const file = join(dir, name);
  const json = JSON.stringify(profile);

  // A SIGKILL mid-write must never leave a truncated file as the newest snapshot.
  writeFileSync(`${file}.tmp`, json);
  renameSync(`${file}.tmp`, file);

  const entries = readdirSync(dir);
  // Temp files survive a hard kill — sweep them so the directory stays a list
  // of loadable profiles only.
  for (const stale of entries) {
    if (!stale.endsWith(".cpuprofile.tmp")) continue;
    try {
      unlinkSync(join(dir, stale));
    } catch {
      // Another rotation won the race — nothing to do.
    }
  }
  // ISO-stamped names sort oldest → newest; keep the newest N.
  const kept = entries.filter((entry) => entry.endsWith(".cpuprofile")).sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - SNAPSHOTS_KEPT))) {
    try {
      unlinkSync(join(dir, old));
    } catch {
      // Another rotation won the race — nothing to do.
    }
  }

  return {
    file,
    bytes: Buffer.byteLength(json, "utf8"),
    samples: Array.isArray(profile.samples) ? profile.samples.length : 0,
  };
}

async function shutdown(): Promise<void> {
  const state = profilerState();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  const active = state.session;
  state.session = null;
  if (!active) return;
  try {
    await post(active, "Profiler.disable");
  } catch {
    // Session already gone — disconnect below is enough.
  }
  try {
    active.disconnect();
  } catch {
    // Already disconnected.
  }
}

/** Stop sampling, write the profile, and start the next window. */
async function snapshotAndResume(): Promise<CpuProfilerSnapshot | null> {
  const state = profilerState();
  const active = state.session;
  if (!active || state.busy) return null;
  state.busy = true;
  try {
    const stopped = await post(active, "Profiler.stop");
    const profile = stopped?.profile;
    if (!profile || typeof profile !== "object") {
      await resumeIfActive(active);
      return null;
    }
    const written = await writeSnapshot(profile as Record<string, unknown>);
    await resumeIfActive(active);
    return written;
  } catch (err) {
    logger.error("[CPU-PROFILE] snapshot failed — sampling stopped", { error: errorText(err) });
    await shutdown();
    return null;
  } finally {
    state.busy = false;
  }
}

async function resumeIfActive(target: InspectorSessionLike): Promise<void> {
  const state = profilerState();
  // A manual stop may have run while the profile was being written.
  if (state.session !== target) return;
  try {
    await post(target, "Profiler.start");
  } catch (err) {
    logger.error("[CPU-PROFILE] resume failed — sampling stopped", { error: errorText(err) });
    await shutdown();
  }
}

/**
 * Write a snapshot now (the interval calls this; tests and probes may too).
 * Returns null when profiling is off or a cycle is already in flight.
 */
export function takeCpuProfilerSnapshot(): Promise<CpuProfilerSnapshot | null> {
  return snapshotAndResume();
}

/**
 * Start sampling when `SVELTY_CPU_PROFILE` points at a directory. Idempotent:
 * a running sampler is reused. Never rejects — boot must not depend on it.
 */
export async function startCpuProfilerIfEnabled(): Promise<CpuProfilerStatus> {
  const dir = cpuProfileDir();
  if (!dir) return "disabled";
  const state = profilerState();
  if (state.session) return "started";

  let created: InspectorSessionLike;
  try {
    const { Session } = await import("node:inspector");
    created = new Session() as unknown as InspectorSessionLike;
    created.connect();
    await post(created, "Profiler.enable");
    await post(created, "Profiler.setSamplingInterval", { interval: SAMPLING_INTERVAL_US });
    await post(created, "Profiler.start");
  } catch (err) {
    // Runtimes without a usable `node:inspector` (or with the profiler already
    // held by another session) land here — the server keeps running.
    logger.error("[CPU-PROFILE] unavailable in this runtime", { error: errorText(err), dir });
    return "unavailable";
  }

  state.session = created;
  const everyMs = snapshotIntervalMs();
  state.timer = setInterval(() => {
    void takeCpuProfilerSnapshot();
  }, everyMs);
  // A diagnostic timer must never be a reason for the process to stay alive.
  state.timer.unref?.();
  logger.info(`[CPU-PROFILE] V8 sampling active — snapshot every ${everyMs} ms → ${dir}`);
  return "started";
}

/** Final snapshot (best effort) and a clean inspector disconnect. */
export async function stopCpuProfiler(): Promise<void> {
  if (!profilerState().session) return;
  const last = await takeCpuProfilerSnapshot();
  if (last) {
    logger.info(
      `[CPU-PROFILE] final snapshot: ${last.file} (${last.samples} samples, ${last.bytes} B)`,
    );
  }
  await shutdown();
}
