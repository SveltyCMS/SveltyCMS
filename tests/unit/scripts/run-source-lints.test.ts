/**
 * @file tests/unit/scripts/run-source-lints.test.ts
 * @description Pins the single-process aggregation of the five source lints.
 *
 * Each rule has its own fixture suite; this test proves the shared gate surfaces
 * the offenses with the expected prefix and fails closed, so moving the rules
 * out of five separate checks cannot silently drop one.
 */

import { describe, expect, it } from "vitest";
import { runSourceLints } from "../../../scripts/check/run-source-lints";

function file(path: string, source: string) {
  return { path, source };
}

describe("run-source-lints", () => {
  it("passes a clean source set", () => {
    const report = runSourceLints([
      file(
        "src/services/clean.ts",
        "import { nowISODateString } from '@utils/date';\nexport const t = nowISODateString();\n",
      ),
    ]);

    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("surfaces a direct ISO-now call with the date-helpers prefix", () => {
    const report = runSourceLints([
      file("src/services/clock.ts", "export const t = new Date().toISOString();\n"),
    ]);

    expect(report.ok).toBe(false);
    expect(report.dateCallOffenses).toHaveLength(1);
    expect(report.violations[0]).toContain("date-helpers src/services/clock.ts:1");
  });

  it("surfaces an ungated module-scope timer", () => {
    const report = runSourceLints([
      file("src/services/timers.ts", "setInterval(() => {}, 1000);\n"),
    ]);

    expect(report.ok).toBe(false);
    expect(report.timerOffenses.length).toBeGreaterThan(0);
    expect(
      report.violations.some((v) => v.startsWith("global-timers src/services/timers.ts")),
    ).toBe(true);
  });

  it("reports every rule family in one pass", () => {
    const report = runSourceLints([
      file("src/services/a.ts", "export const t = new Date().toISOString();\n"),
      file("src/services/b.ts", "setInterval(() => {}, 1000);\n"),
    ]);

    expect(report.ok).toBe(false);
    expect(report.violations.length).toBeGreaterThanOrEqual(2);
    expect(report.violations.some((v) => v.startsWith("date-helpers "))).toBe(true);
    expect(report.violations.some((v) => v.startsWith("global-timers "))).toBe(true);
  });
});
