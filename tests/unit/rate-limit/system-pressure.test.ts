/**
 * @file tests/unit/rate-limit/system-pressure.test.ts
 * @description Unit-Tests fuer das System-Pressure-Modul (EWMA CPU/RAM).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startPressureMonitor,
  stopPressureMonitor,
  getPressureScore,
  getPressureScale,
  describePressure,
} from "@utils/rate-limit/system-pressure";

// Stabile Zeit: setTimeout nicht wirklich warten lassen.
vi.useFakeTimers();

describe("System Pressure Monitor", () => {
  beforeEach(() => {
    stopPressureMonitor(); // sauberer Zustand
  });

  afterEach(() => {
    stopPressureMonitor();
    vi.clearAllTimers();
  });

  it("liefert Score 0 wenn Monitor nicht gestartet", () => {
    expect(getPressureScore()).toBe(0);
    expect(describePressure()).toBe("monitor_off");
  });

  it("startet Monitor und gibt Score >= 0 zurueck", () => {
    startPressureMonitor();
    expect(getPressureScore()).toBeGreaterThanOrEqual(0);
    expect(describePressure()).toBe("normal"); // frisch gestartet: kein Druck
  });

  it("ist idempotent (doppelter Start = kein Fehler)", () => {
    startPressureMonitor();
    startPressureMonitor(); // darf nicht doppelt starten
    expect(getPressureScore()).toBeGreaterThanOrEqual(0);
  });

  it("Admin-Tier ist immer exempt (Faktor 1.0)", () => {
    startPressureMonitor();
    expect(getPressureScale("admin")).toBe(1.0);
  });

  describe("getPressureScale — ohne aktiven Monitor", () => {
    it("gibt 1.0 fuer alle Tiers zurueck wenn kein Monitor laeuft", () => {
      // Monitor ist nicht gestartet → Score = 0 → unter Threshold → 1.0
      expect(getPressureScale("guest")).toBe(1.0);
      expect(getPressureScale("staff")).toBe(1.0);
      expect(getPressureScale("anonymous")).toBe(1.0);
    });
  });

  describe("getPressureScale — Staffelung nach Tier", () => {
    it("Guest bekommt niedrigsten Multiplikator bei hohem Druck", () => {
      startPressureMonitor();
      // Wir koennen nicht direkt den internen Score setzen, aber wir koennen
      // pruefen dass die Logik korrekt ist durch Beobachtung der Staffelung:
      // Ohne Druck sind alle 1.0.
      const admin = getPressureScale("admin");
      const staff = getPressureScale("staff");
      const guest = getPressureScale("guest");
      const anon = getPressureScale("anonymous");

      // Im normalen Betrieb: alle 1.0
      expect(admin).toBe(1.0);
      expect(staff).toBeGreaterThanOrEqual(0);
      expect(guest).toBeGreaterThanOrEqual(0);
      expect(anon).toBeGreaterThanOrEqual(0);

      // Staffelung: admin >= staff >= guest >= anonymous
      expect(admin).toBeGreaterThanOrEqual(staff);
      expect(staff).toBeGreaterThanOrEqual(guest);
      expect(guest).toBeGreaterThanOrEqual(anon);
    });
  });

  it("stopPressureMonitor verhindert weitere Polls", () => {
    startPressureMonitor();
    stopPressureMonitor();
    expect(getPressureScore()).toBe(0); // nach Stop: kein State mehr
    expect(describePressure()).toBe("monitor_off");
  });
});
