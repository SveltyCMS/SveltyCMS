/**
 * @file src/utils/rate-limit/request-clock.ts
 * @description Predictive Throttling — erkennt wiederkehrende Last-Muster anhand
 * eines rollierenden 24h-Histogramms und gibt einen Vorhersage-Druck zurueck.
 *
 * Features:
 * - 96 Slots a 15 Minuten = exakt 24 Stunden (< 1 KB RAM).
 * - Jeder Request inkrementiert den aktuellen Slot.
 * - `getPredictedPressure()`: Vergleicht den aktuellen Slot-Count mit dem
 *   gleitenden Durchschnitt der letzten N Tage (gleicher Slot) und gibt
 *   einen Faktor [0, 1] zurueck.
 * - Warmup-Schutz: Erste 24h nach Start → kein Predictive-Throttling (Factor = 0).
 * - Kein PII — nur aggregierte Slot-Counts.
 * - Konfiguration: RATE_CLOCK_SLOT_MINUTES (default 15), RATE_CLOCK_HISTORY_DAYS (default 7).
 */

import { logger } from "@utils/logger";

// ─── Konfiguration ────────────────────────────────────────────────────────────

const SLOT_MINUTES = Math.max(1, parseInt(process.env["RATE_CLOCK_SLOT_MINUTES"] ?? "15", 10));
const HISTORY_DAYS = Math.max(
  1,
  Math.min(30, parseInt(process.env["RATE_CLOCK_HISTORY_DAYS"] ?? "7", 10)),
);

/** Anzahl Slots pro Tag (z.B. 96 fuer 15-Minuten-Slots). */
const SLOTS_PER_DAY = Math.floor((24 * 60) / SLOT_MINUTES);

// ─── Zustand ──────────────────────────────────────────────────────────────────

/**
 * Rollendes Histogramm: [dayIndex][slotIndex].
 * dayIndex rotiert modulo HISTORY_DAYS, slotIndex modulo SLOTS_PER_DAY.
 */
let histogram: number[][] = [];
let startMs = 0;
let initialized = false;

function ensureInit(nowMs: number): void {
  if (initialized) return;
  histogram = Array.from({ length: HISTORY_DAYS }, () =>
    Array.from({ length: SLOTS_PER_DAY }, () => 0),
  );
  startMs = nowMs;
  initialized = true;
  logger.debug("[RequestClock] Initialisiert: %d Tage x %d Slots", HISTORY_DAYS, SLOTS_PER_DAY);
}

// ─── Slot-Berechnung ──────────────────────────────────────────────────────────

function getSlotIndex(nowMs: number): number {
  const minuteOfDay = new Date(nowMs).getHours() * 60 + new Date(nowMs).getMinutes();
  return Math.floor(minuteOfDay / SLOT_MINUTES) % SLOTS_PER_DAY;
}

function getDayIndex(nowMs: number): number {
  const daysSinceEpoch = Math.floor(nowMs / 86_400_000);
  return daysSinceEpoch % HISTORY_DAYS;
}

/**
 * Gibt zurueck, ob die Warmup-Phase abgeschlossen ist (>= 24h Daten).
 */
function isWarmedUp(nowMs: number): boolean {
  return initialized && nowMs - startMs >= 24 * 60 * 60 * 1000;
}

// ─── Öffentliche API ─────────────────────────────────────────────────────────

/**
 * Erfasst einen eingehenden Request im Histogramm.
 * Sollte im Rate-Limit-Hot-Path aufgerufen werden.
 */
export function recordRequest(nowMs = Date.now()): void {
  ensureInit(nowMs);
  const day = getDayIndex(nowMs);
  const slot = getSlotIndex(nowMs);
  histogram[day]![slot]! += 1;
}

/**
 * Gibt den vorhergesagten Last-Druck [0, 1] fuer den aktuellen Zeitslot zurueck.
 *
 * Algorithmus:
 * 1. Berechne den Durchschnitt des aktuellen Slots ueber alle verfuegbaren Tage
 *    (ausser dem heutigen, da der noch rollt).
 * 2. Vergleiche mit dem aktuellen Slot-Count.
 * 3. Faktor = (currentCount / avgCount) normalisiert auf [0, 1].
 *
 * - Vor Warmup: 0 (kein Predictive-Throttling).
 * - Wenn kein historischer Schnitt vorhanden: 0.
 */
export function getPredictedPressure(nowMs = Date.now()): number {
  if (!isWarmedUp(nowMs)) return 0;

  const currentDay = getDayIndex(nowMs);
  const slot = getSlotIndex(nowMs);

  // Historischer Schnitt (alle Tage ausser dem aktuellen)
  let historicalSum = 0;
  let historicalCount = 0;
  for (let d = 0; d < HISTORY_DAYS; d++) {
    if (d === currentDay) continue;
    const v = histogram[d]![slot]!;
    if (v > 0) {
      historicalSum += v;
      historicalCount++;
    }
  }

  if (historicalCount === 0) return 0;

  const avg = historicalSum / historicalCount;
  const current = histogram[currentDay]![slot]!;

  if (avg <= 0) return 0;

  // Pressure = Wie weit liegt der aktuelle Slot ueber dem Durchschnitt?
  // Faktor 1.0 = exakt Durchschnitt, 2.0 = doppelt so viel (100% ueber Durchschnitt).
  // Wir normalisieren: 0 bis 2x Durchschnitt → 0.0 bis 1.0.
  const ratio = current / avg;
  return Math.min(1, Math.max(0, (ratio - 1) / 1.5)); // linear, ab 1x, maximal bei 2.5x
}

/**
 * Gibt den Histogramm-Slot-Count fuer Debug/Health-Endpoints zurueck.
 */
export function describeRequestClock(nowMs = Date.now()): {
  slot: number;
  dayIndex: number;
  currentCount: number;
  warmedUp: boolean;
  predictedPressure: number;
} {
  ensureInit(nowMs);
  return {
    slot: getSlotIndex(nowMs),
    dayIndex: getDayIndex(nowMs),
    currentCount: histogram[getDayIndex(nowMs)]![getSlotIndex(nowMs)]!,
    warmedUp: isWarmedUp(nowMs),
    predictedPressure: getPredictedPressure(nowMs),
  };
}

/**
 * Setzt den Zustand zurueck (fuer Tests).
 */
export function _resetRequestClock(): void {
  histogram = [];
  startMs = 0;
  initialized = false;
}
