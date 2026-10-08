/**
 * @file tests/unit/rate-limit/request-clock-slot-sums.test.ts
 * @description Regression: getPredictedPressure O(1) per-Slot-Aggregate-Pfad
 * (slotTotals/slotActiveDays, gepflegt in recordRequest) ist exakt aequivalent
 * zur urspruenglichen Tages-Schleife ueber das Histogramm. Eine Referenz-
 * Implementierung der Schleife wird im Test nachgebaut und gegen das Modul
 * verglichen — inklusive Rollover-Stale-Daten-Semantik und `slotIndex`-Fast-Path.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  recordRequest,
  getPredictedPressure,
  _resetRequestClock,
} from "@utils/rate-limit/request-clock";

/** Muss zu den Modul-Defaults passen (RATE_CLOCK_* wird in Unit-Tests nicht gesetzt). */
const HISTORY_DAYS = 7;
const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

/** Replik der Modul-Interna (lokale Zeit, identische Formeln). */
function dayOf(ms: number): number {
  return Math.floor(ms / 86_400_000) % HISTORY_DAYS;
}

function slotOf(ms: number): number {
  const d = new Date(ms);
  return Math.floor((d.getHours() * 60 + d.getMinutes()) / SLOT_MINUTES) % SLOTS_PER_DAY;
}

/** Referenz: urspruengliche Tages-Schleife ueber ein explizites Histogramm. */
function refPressure(now: number, hist: number[][]): number {
  const currentDay = dayOf(now);
  const slot = slotOf(now);
  let historicalSum = 0;
  let historicalCount = 0;
  for (let d = 0; d < HISTORY_DAYS; d++) {
    if (d === currentDay) continue;
    const v = hist[d]![slot]!;
    if (v > 0) {
      historicalSum += v;
      historicalCount++;
    }
  }
  if (historicalCount === 0) return 0;
  const avg = historicalSum / historicalCount;
  const current = hist[currentDay]![slot]!;
  if (avg <= 0) return 0;
  const ratio = current / avg;
  return Math.min(1, Math.max(0, (ratio - 1) / 1.5));
}

afterEach(() => {
  _resetRequestClock();
});

describe("Request Clock — O(1)-Slot-Summen vs. Tages-Schleife", () => {
  // Feste Epoche; Historie liegt >= 4 Tage zurueck → Warmup (>= 24h) sicher erfuellt.
  const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
  // Anzahl Records je Historien-Tag (mit Nullen → prueft slotActiveDays-Logik).
  const VARIANTS: Array<readonly number[]> = [
    [2, 0, 5, 1, 0, 3, 7],
    [0, 0, 0, 0, 0, 0, 0],
    [9, 9, 9, 9, 9, 9, 9],
    [1, 2, 4, 8, 16, 32, 64],
  ];

  for (const [vi, counts] of VARIANTS.entries()) {
    it(`liefert identischen Druck wie die Referenz-Schleife (Variante ${vi})`, () => {
      const hist: number[][] = Array.from({ length: HISTORY_DAYS }, () =>
        Array.from({ length: SLOTS_PER_DAY }, () => 0),
      );
      // Historie: 7 Tage, jeweils >= 4 Tage vor NOW.
      for (let k = 0; k < HISTORY_DAYS; k++) {
        const ts = NOW - (k + 4) * 86_400_000;
        for (let c = 0; c < counts[k]!; c++) {
          recordRequest(ts);
          hist[dayOf(ts)]![slotOf(ts)]! += 1;
        }
      }
      // Aktueller Tag: eine Handvoll Requests.
      for (let c = 0; c < 11; c++) {
        recordRequest(NOW);
        hist[dayOf(NOW)]![slotOf(NOW)]! += 1;
      }

      expect(getPredictedPressure(NOW)).toBeCloseTo(refPressure(NOW, hist), 12);
    });
  }

  it("slotIndex-Fast-Path ist identisch zum intern berechneten Slot", () => {
    const ts0 = NOW - 5 * 86_400_000;
    recordRequest(ts0);
    const returned = recordRequest(NOW);
    expect(returned).toBe(slotOf(NOW));
    expect(getPredictedPressure(NOW, returned)).toBe(getPredictedPressure(NOW));
  });

  it("recordRequest gibt den Slot-Index des Requests zurueck", () => {
    const ts = NOW - 6 * 86_400_000;
    expect(recordRequest(ts)).toBe(slotOf(ts));
  });

  it("bleibt 0 vor dem Warmup und ohne historischen Schnitt", () => {
    // Ein Request "jetzt" → startMs = jetzt → nicht warmed up.
    recordRequest(NOW);
    expect(getPredictedPressure(NOW)).toBe(0);
  });
});
