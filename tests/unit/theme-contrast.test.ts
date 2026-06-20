/**
 * @vitest-environment node
 * @file tests/unit/theme-contrast.test.ts
 * @description Unit tests for admin theme palette contrast auditing.
 */

import { describe, it, expect } from "vitest";
import {
  auditThemePalette,
  contrastRatio,
  parseColorToRgb,
  auditPresetJson,
} from "../../src/utils/theme-contrast";

describe("theme-contrast", () => {
  it("parses hex colors", () => {
    expect(parseColorToRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(parseColorToRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("computes contrast ratio for black on white", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeGreaterThan(20);
  });

  it("flags low-contrast corporate-style palette pairs", () => {
    const warnings = auditThemePalette({
      primary: "#ffff00",
      tertiary: "#ffff00",
      surface: "#ffffff",
      "surface-900": "#ffff00",
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.pair.includes("Primary accent"))).toBe(true);
  });

  it("passes audit for corporate shorthand palette", () => {
    const warnings = auditPresetJson(
      JSON.stringify({
        name: "Corporate",
        properties: {
          primary: "#0f766e",
          tertiary: "#1d4ed8",
          surface: "#f8fafc",
        },
      }),
    );
    expect(warnings.length).toBe(0);
  });
});
