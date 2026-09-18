/**
 * @file src/utils/rate-limit/system-pressure.ts
 * @description Dynamic System Pressure — erkennt globale CPU/RAM-Last und liefert
 * einen Drosselungs-Faktor fuer die adaptive Rate-Limit-Schicht.
 *
 * Features:
 * - Liest `process.cpuUsage()` + `process.memoryUsage()` (Node.js Built-ins, kein npm-Dep)
 * - Exponentially Weighted Moving Average (EWMA) ueber ein rollierendes 5s-Fenster —
 *   ein einzelner Spike loest kein Throttling aus (Spike-Resistenz).
 * - Konfiguration via Umgebungsvariablen: RATE_PRESSURE_CPU_THRESHOLD (default 0.80),
 *   RATE_PRESSURE_RAM_THRESHOLD (default 0.85), RATE_PRESSURE_POLL_MS (default 5000).
 * - Admin-Tier ist immer AUSGENOMMEN — Operations muessen bei Last funktionieren.
 * - Singleton-Pattern mit Lazy-Initialisierung (kein overhead auf Unit-Test-Import).
 */

import { logger } from "@utils/logger";
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

function measureCpuScore(lastUsage: NodeJS.CpuUsage, elapsedMs: number): number {
  const current = process.cpuUsage(lastUsage);
  // cpuUsage liefert Microsekunden (user + system) seit dem letzten Snapshot.
  const totalCpuMicros = current.user + current.system;
  // Normalisieren: elapsedMs * 1000 = verfuegbare Microsekunden auf einem Kern.
  const availableMicros = elapsedMs * 1000;
  return availableMicros > 0 ? Math.min(1, totalCpuMicros / availableMicros) : 0;
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

  const score = getPressureScore();
  const hi = CPU_THRESHOLD + 0.05;

  if (score < CPU_THRESHOLD) return 1.0;

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

/**
 * Gibt einen menschenlesbaren Status-String zurueck (fuer Health-Endpoints).
 */
export function describePressure(): string {
  const score = getPressureScore();
  if (!state) return "monitor_off";
  if (score < CPU_THRESHOLD) return "normal";
  if (score < CPU_THRESHOLD + 0.05) return "elevated";
  return "high";
}
