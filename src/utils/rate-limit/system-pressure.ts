/**
 * @file src/utils/rate-limit/system-pressure.ts
 * @description Dynamic System Pressure — erkennt globale CPU/RAM-Last und liefert
 * einen Drosselungs-Faktor fuer die adaptive Rate-Limit-Schicht.
 *
 * Features:
 * - Process-local CPU: `process.cpuUsage()` delta over the poll interval, divided by
 *   (elapsed µs × core count). That is this Node process only.
 * - Host-load fallback: 1-minute `os.loadavg() / cores` when the platform reports a
 *   real load average (Linux/containers). Windows returns zeros — ignored, not faked.
 *   Shared-host saturation (other processes in the same machine) is visible here even
 *   when this process is idle. No hypervisor-specific paths.
 * - RAM: `process.memoryUsage().rss` vs heap proxy.
 * - EWMA over a rolling 5s window — a single spike does not throttle.
 * - Env: RATE_PRESSURE_CPU_THRESHOLD (0.80), RATE_PRESSURE_RAM_THRESHOLD (0.85),
 *   RATE_PRESSURE_POLL_MS (5000), RATE_PRESSURE_USE_LOADAVG (default on).
 * - Admin tier is always exempt.
 */

import os from "node:os";
import { logger } from "@utils/logger";
import { isHeapCritical } from "@utils/heap-pressure";
import { sampleProcessCpuShare } from "@utils/cpu-sample";
import type { UserTier } from "./adaptive";

// ─── Konfiguration ───────────────────────────────────────────────────────────

const CPU_THRESHOLD = Math.min(
  0.99,
  Math.max(0.5, parseFloat(process.env["RATE_PRESSURE_CPU_THRESHOLD"] ?? "0.80")),
);
const RAM_THRESHOLD = Math.min(
  0.99,
  Math.max(0.5, parseFloat(process.env["RATE_PRESSURE_RAM_THRESHOLD"] ?? "0.85")),
);
const POLL_MS = Math.max(1000, parseInt(process.env["RATE_PRESSURE_POLL_MS"] ?? "5000", 10));
const USE_LOADAVG = !/^(0|false|off)$/i.test(process.env["RATE_PRESSURE_USE_LOADAVG"] ?? "1");
const HEAP_REJECT = Math.min(
  0.99,
  Math.max(0.5, parseFloat(process.env["RATE_HEAP_REJECT"] ?? "0.92")),
);

/** EWMA-Glaettungsfaktor alpha — hoeher = mehr Gewicht auf aktuelle Messung. */
const EWMA_ALPHA = 0.25;

// ─── EWMA-Zustand (Modul-privat) ─────────────────────────────────────────────

interface PressureState {
  /** Normalisierter CPU-Auslastungswert [0, 1]. */
  cpuScore: number;
  /** Normalisierter RAM-Auslastungswert [0, 1]. */
  ramScore: number;
  /** Letzter `process.cpuUsage()`-Snapshot fuer Delta-Berechnung. */
  lastCpuUsage: NodeJS.CpuUsage;
  /** Zeitpunkt der letzten Messung (ms). */
  lastPollMs: number;
  /** Ist der Poller aktiv? */
  polling: boolean;
}

let state: PressureState | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Interne Mess-Logik ───────────────────────────────────────────────────────

function coreCount(): number {
  const n =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, n);
}

function measureProcessCpuScore(_lastUsage: NodeJS.CpuUsage, _elapsedMs: number): number {
  return sampleProcessCpuShare();
}

/**
 * Host 1-minute load average normalized by core count.
 * Returns null when the platform does not report load (Windows zeros).
 */
export function hostLoadScore(): number | null {
  if (!USE_LOADAVG) return null;
  const oneMin = os.loadavg()[0];
  if (!Number.isFinite(oneMin) || oneMin <= 0) return null;
  return Math.min(1, oneMin / coreCount());
}

function measureCpuScore(lastUsage: NodeJS.CpuUsage, elapsedMs: number): number {
  const processScore = measureProcessCpuScore(lastUsage, elapsedMs);
  const loadScore = hostLoadScore();
  return loadScore === null ? processScore : Math.max(processScore, loadScore);
}

function measureRamScore(): number {
  const mem = process.memoryUsage();
  // RSS / Heap-Limit als Proxy fuer RAM-Druck. Node.js-Heap-Limit via V8.
  // Fallback: 512 MB wenn nicht verfuegbar.
  const heapLimit = mem.heapTotal > 0 ? mem.heapTotal * 1.5 : 512 * 1024 * 1024;
  return Math.min(1, mem.rss / heapLimit);
}

function poll(): void {
  if (!state) return;

  const nowMs = Date.now();
  const elapsedMs = nowMs - state.lastPollMs;

  const rawCpu = measureCpuScore(state.lastCpuUsage, elapsedMs);
  const rawRam = measureRamScore();

  // EWMA-Glaettung — verhindert Spike-Ueberreaktionen.
  state.cpuScore = EWMA_ALPHA * rawCpu + (1 - EWMA_ALPHA) * state.cpuScore;
  state.ramScore = EWMA_ALPHA * rawRam + (1 - EWMA_ALPHA) * state.ramScore;
  state.lastCpuUsage = process.cpuUsage();
  state.lastPollMs = nowMs;

  logger.debug(
    "[SystemPressure] cpu=%s ram=%s",
    state.cpuScore.toFixed(3),
    state.ramScore.toFixed(3),
  );

  pollTimer = setTimeout(poll, POLL_MS);
}

// ─── Öffentliche API ─────────────────────────────────────────────────────────

/**
 * Startet den Hintergrund-Poller (idempotent).
 * Wird von der Rate-Limit-Initialisierung aufgerufen.
 */
export function startPressureMonitor(): void {
  if (state?.polling) return;
  state = {
    cpuScore: 0,
    ramScore: 0,
    lastCpuUsage: process.cpuUsage(),
    lastPollMs: Date.now(),
    polling: true,
  };
  pollTimer = setTimeout(poll, POLL_MS);
  logger.debug(
    "[SystemPressure] Monitor gestartet (poll=%dms, cpu≥%s, ram≥%s)",
    POLL_MS,
    CPU_THRESHOLD,
    RAM_THRESHOLD,
  );
}

/**
 * Stoppt den Poller (fuer Tests / Graceful Shutdown).
 */
export function stopPressureMonitor(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (state) state.polling = false;
  state = null;
}

/**
 * Gibt den kombinierten Pressure-Score [0, 1] zurueck.
 * 0 = idle, 1 = maximale Last.
 * Verwendet den hoehere der beiden EWMA-Scores (CPU oder RAM) als Signal.
 */
export function getPressureScore(): number {
  if (!state) return 0;
  return Math.max(state.cpuScore, state.ramScore);
}

/**
 * Gibt den Drosselungs-Multiplikator fuer den angegebenen Tier zurueck.
 *
 * Staffelung:
 * - Admin:     immer 1.0 (ausgenommen)
 * - score < CPU_THRESHOLD:       1.0 (kein Eingriff)
 * - score in [threshold, +5%]:   Staff 0.85 / Guest 0.70 / Anonymous 0.55
 * - score > threshold + 5%:      Staff 0.70 / Guest 0.50 / Anonymous 0.35
 */
export function getPressureScale(tier: UserTier): number {
  if (tier === "admin") return 1.0; // Admin immer frei

  const cpu = state?.cpuScore ?? 0;
  const ram = state?.ramScore ?? 0;
  const score = Math.max(cpu, ram);
  const cpuHot = cpu >= CPU_THRESHOLD;
  const ramHot = ram >= RAM_THRESHOLD;
  if (!cpuHot && !ramHot) return 1.0;
  const hi = CPU_THRESHOLD + 0.05;

  if (score < hi) {
    // Mittlere Last-Zone
    if (tier === "staff") return 0.85;
    if (tier === "guest") return 0.7;
    return 0.55; // anonymous
  }

  // Hohe Last-Zone
  if (tier === "staff") return 0.7;
  if (tier === "guest") return 0.5;
  return 0.35; // anonymous
}

/** Circuit-break mutations when V8 heap is critically full (same ratio as handle-security). */
export function shouldRejectMutations(): boolean {
  return isHeapCritical(HEAP_REJECT);
}

/**
 * Cost multiplier for threat throttling (1.0 idle → 2.0 critical).
 * Inverse of capacity scale — same EWMA, one source.
 */
export function getPressureCostMultiplier(): number {
  const score = getPressureScore();
  if (score < CPU_THRESHOLD) return 1;
  const span = Math.max(0.05, 1 - CPU_THRESHOLD);
  return Math.min(2, 1 + (score - CPU_THRESHOLD) / span);
}

/** Human-readable pressure band for health endpoints. */
export function describePressure(): string {
  if (!state) return "monitor_off";
  const cpuHot = state.cpuScore >= CPU_THRESHOLD;
  const ramHot = state.ramScore >= RAM_THRESHOLD;
  if (!cpuHot && !ramHot) return "normal";
  const hi = CPU_THRESHOLD + 0.05;
  if (Math.max(state.cpuScore, state.ramScore) < hi && !ramHot) return "elevated";
  return "high";
}
