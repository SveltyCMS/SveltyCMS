/**
 * @vitest-environment node
 * @file tests/unit/theme-contrast.test.ts
 * @description Unit tests for admin theme palette contrast auditing.
 */

import { describe, it, expect } from "vitest";
import {
  apcaContrast,
  auditThemePalette,
  contrastRatio,
  parseColorToRgb,
  auditPresetJson,
} from "../../src/utils/theme-contrast";

describe("theme-contrast", () => {
  it("parses hex, rgb, and oklch colors", () => {
    expect(parseColorToRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(parseColorToRgb("#000000")).toEqual([0, 0, 0]);
    expect(parseColorToRgb("#f00")).toEqual([255, 0, 0]);
    expect(parseColorToRgb("rgb(255, 128, 0)")).toEqual([255, 128, 0]);
    expect(parseColorToRgb("oklch(1 0 0)")).toEqual([255, 255, 255]);
    expect(parseColorToRgb("oklch(0% 0 0)")).toEqual([0, 0, 0]);
    expect(parseColorToRgb("invalid-color")).toBeNull();
  });

  it("computes WCAG 2.x contrast ratio and WCAG 3.0 APCA Lc", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeGreaterThan(20);
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeGreaterThan(20);

    // Dark text on white background -> positive Lc ≈ +106.04 (APCA-W3 reference vector)
    const lcDarkOnLight = apcaContrast("#000000", "#ffffff");
    expect(lcDarkOnLight).toBeCloseTo(106.04, 1);

    // Light text on dark background -> negative Lc ≈ -107.88 (APCA-W3 reference vector)
    const lcLightOnDark = apcaContrast("#ffffff", "#000000");
    expect(lcLightOnDark).toBeCloseTo(-107.88, 1);

    // Mid-gray #888888 on white #ffffff -> APCA reference ≈ +63.06
    expect(apcaContrast("#888888", "#ffffff")).toBeCloseTo(63.06, 1);

    // Identical colors -> 0 Lc
    expect(apcaContrast("#777777", "#777777")).toBe(0);
  });

  it("flags low-contrast corporate-style palette pairs", () => {
    const warnings = auditThemePalette({
      primary: "#ffff00",
      tertiary: "#ffff00",
      surface: "#ffffff",
      "surface-900": "#ffff00",
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.pair?.includes("Primary accent"))).toBe(true);
  });

  it("passes audit for a corporate-style shorthand palette", () => {
    const warnings = auditPresetJson(
      JSON.stringify({
        name: "Default",
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
