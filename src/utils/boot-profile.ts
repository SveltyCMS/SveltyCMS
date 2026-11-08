/**
 * @file src/utils/boot-profile.ts
 * @description Opt-in boot phase profiler for cold-start attribution.
 *
 * Cold start is the only latency budget in the benchmark suite with real weight
 * (~1.9 s vs sub-millisecond request paths), but it was measured as one opaque
 * number. This module records named timestamps during boot so the benchmark can
 * say *where* the time went instead of only how much there was.
 *
 * Disabled by default: every call is a branch on a module-level boolean, and
 * `bootPhases()` returns `null` so no allocation or payload change happens in
 * normal operation.
 *
 * Features:
 * - Zero-cost when `SVELTY_BOOT_PROFILE` is not `"1"`
 * - Records absolute time from module evaluation plus the delta per phase
 * - Safe on the client (`process` is absent → disabled)
 */

const ENABLED = typeof process !== "undefined" && process.env?.SVELTY_BOOT_PROFILE === "1";

const ORIGIN = typeof performance !== "undefined" ? performance.now() : 0;

export interface BootPhase {
  /** Phase name, in the order it was marked. */
  name: string;
  /** Milliseconds since this module was first evaluated. */
  atMs: number;
  /** Milliseconds since the previous phase. */
  deltaMs: number;
}

const phases: BootPhase[] = [];

/** Record a boot phase. No-op unless `SVELTY_BOOT_PROFILE=1`. */
export function markBoot(name: string): void {
  if (!ENABLED) return;
  const atMs = performance.now() - ORIGIN;
  const previous = phases.length > 0 ? phases[phases.length - 1].atMs : 0;
  phases.push({ name, atMs, deltaMs: atMs - previous });
}

/** Snapshot of recorded phases, or `null` when profiling is off. */
export function bootPhases(): BootPhase[] | null {
  if (!ENABLED) return null;
  return phases.map((phase) => ({ ...phase }));
}

let reported = false;

/** Print the phase table once (server stdout, captured by the benchmark harness). */
export function reportBootOnce(): void {
  if (!ENABLED || reported) return;
  reported = true;
  const total = phases.length > 0 ? phases[phases.length - 1].atMs : 0;
  const body = phases
    .map((phase) => `${phase.name}=${phase.deltaMs.toFixed(0)}ms(t=${phase.atMs.toFixed(0)})`)
    .join(" ");
  // stderr: the benchmark harness pipes child stderr through (stdout is swallowed).
  console.error(`[boot-profile] total=${total.toFixed(0)}ms ${body}`);
}
