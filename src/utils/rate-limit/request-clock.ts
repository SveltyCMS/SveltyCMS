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
 *   einen Faktor [0, 1] zurueck. O(1) im Hot-Path: statt der Tages-Schleife
 *   werden pro Slot laufende Summen/Nonzero-Tageszaehler gefuehrt (Update
 *   in `recordRequest`, dem einzigen Schreiber des Histogramms — Ergebnis
 *   ist exakt identisch zur Schleifen-Berechnung).
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

/**
 * Laufende Aggregat-Spalten pro Slot (fuer getPredictedPressure in O(1)):
 * - `slotTotals[slot]`      = Summe ueber ALLE Tage (Σ_d histogram[d][slot])
 * - `slotActiveDays[slot]`  = Anzahl Tage mit Count > 0 in diesem Slot
 *
 * Werden ausschliesslich in `recordRequest` (dem einzigen Schreiber des
 * Histogramms) gepflegt und sind damit per Konstruktion exakt gleich zu
 * einer Schleifen-Summe ueber das Histogramm — inklusive des bestehenden
 * Rollover-Verhaltens (Tag-Zeile wird beim Umlauf NICHT genullt).
 */
let slotTotals: number[] = [];
let slotActiveDays: number[] = [];

/**
 * Wiederverwendetes Date-Objekt fuer die Slot-Berechnung im Hot-Path:
 * `new Date(nowMs)` zweimal pro Request (2 Heap-Allokationen) wird durch
 * `setTime` + Lesen der lokalen Stunden/Minuten ersetzt. Die LOKALZEIT-
 * Semantik inkl. DST-Verhalten bleibt exakt identisch — bewusst keine
 * UTC-Arithmetik, die die Slot-Grenzen verschieben wuerde.
 */
const slotScratch = new Date(0);

function ensureInit(nowMs: number): void {
  if (initialized) return;
  histogram = Array.from({ length: HISTORY_DAYS }, () =>
    Array.from({ length: SLOTS_PER_DAY }, () => 0),
  );
  slotTotals = Array.from({ length: SLOTS_PER_DAY }, () => 0);
  slotActiveDays = Array.from({ length: SLOTS_PER_DAY }, () => 0);
  startMs = nowMs;
  initialized = true;
  logger.debug("[RequestClock] Initialisiert: %d Tage x %d Slots", HISTORY_DAYS, SLOTS_PER_DAY);
}

// ─── Slot-Berechnung ──────────────────────────────────────────────────────────

function getSlotIndex(nowMs: number): number {
  slotScratch.setTime(nowMs);
  const minuteOfDay = slotScratch.getHours() * 60 + slotScratch.getMinutes();
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
 *
 * Gibt den Slot-Index zurueck, damit der Aufrufer ihn an
 * `getPredictedPressure()` weiterreichen kann (spart die zweite
 * Slot-Berechnung im selben Request).
 */
export function recordRequest(nowMs = Date.now()): number {
  ensureInit(nowMs);
  const day = getDayIndex(nowMs);
  const slot = getSlotIndex(nowMs);
  if (histogram[day]![slot]! === 0) {
    slotActiveDays[slot]! += 1;
  }
  slotTotals[slot]! += 1;
  histogram[day]![slot]! += 1;
  return slot;
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
export function getPredictedPressure(nowMs = Date.now(), slotIndex?: number): number {
  if (!isWarmedUp(nowMs)) return 0;

  const currentDay = getDayIndex(nowMs);
  const slot = slotIndex === undefined ? getSlotIndex(nowMs) : slotIndex;
  const current = histogram[currentDay]![slot]!;

  // Historischer Schnitt (alle Tage ausser dem aktuellen) — O(1) via
  // Aggregat-Spalten statt Tages-Schleife; mathematisch identisch.
  const historicalSum = slotTotals[slot]! - current;
  const historicalCount = slotActiveDays[slot]! - (current > 0 ? 1 : 0);

  if (historicalCount === 0) return 0;

  const avg = historicalSum / historicalCount;

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
  slotTotals = [];
  slotActiveDays = [];
  startMs = 0;
  initialized = false;
}
