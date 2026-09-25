/**
 * @vitest-environment node
 * @file tests/unit/color-ramp.test.ts
 * @description Unit tests for the hue-preserving OKLCH palette ramp generator.
 */

import { describe, it, expect } from "vitest";
import {
  RAMP_STEPS,
  generateColorRamp,
  inSrgbGamut,
  normalizeHex,
  oklchToHex,
  parseHexToOklch,
  type OklchColor,
  type RampStep,
} from "@utils/color-ramp";

const TEAL = "#0f766e";

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function rampAsOklch(ramp: Record<RampStep, string>): Record<RampStep, OklchColor> {
  const out = {} as Record<RampStep, OklchColor>;
  for (const step of RAMP_STEPS) {
    const parsed = parseHexToOklch(ramp[step]);
    if (!parsed) throw new Error(`step ${step} is not a valid hex: ${ramp[step]}`);
    out[step] = parsed;
  }
  return out;
}

describe("color-ramp", () => {
  it("emits the full 11-step ladder with the seed verbatim on its anchor", () => {
    const ramp = generateColorRamp(TEAL);
    expect(ramp).not.toBeNull();
    expect(Object.keys(ramp!)).toHaveLength(RAMP_STEPS.length);
    expect(ramp![500]).toBe(TEAL);
    for (const step of RAMP_STEPS) expect(ramp![step]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("spaces lightness monotonically and preserves hue", () => {
    const oklch = rampAsOklch(generateColorRamp(TEAL)!);
    const base = parseHexToOklch(TEAL)!;

    for (let i = 1; i < RAMP_STEPS.length; i++) {
      expect(oklch[RAMP_STEPS[i]].l).toBeLessThan(oklch[RAMP_STEPS[i - 1]].l);
    }
    for (const step of RAMP_STEPS) {
      expect(hueDistance(oklch[step].h, base.h)).toBeLessThan(5);
    }
  });

  it("anchors surfaces on step 50 and derives a dark tail", () => {
    const ramp = generateColorRamp("#f8fafc", { anchor: 50 })!;
    expect(ramp[50]).toBe("#f8fafc");
    const oklch = rampAsOklch(ramp);
    expect(oklch[950].l).toBeLessThan(0.3);
    expect(oklch[50].l).toBeGreaterThan(oklch[950].l);
  });

  it("keeps achromatic seeds neutral", () => {
    const oklch = rampAsOklch(generateColorRamp("#808080")!);
    for (const step of RAMP_STEPS) {
      expect(oklch[step].c).toBeLessThan(0.02);
      expect(oklch[step].h === 0 || Number.isFinite(oklch[step].h)).toBe(true);
    }
  });

  it("gamut-maps out-of-gamut extremes without clipping RGB", () => {
    const ramp = generateColorRamp("#00ff00")!;
    for (const step of RAMP_STEPS) {
      const parsed = parseHexToOklch(ramp[step])!;
      expect(inSrgbGamut(parsed)).toBe(true);
    }
    // Hue of the neon green stays in the green band across the ladder.
    for (const step of RAMP_STEPS) {
      const hue = parseHexToOklch(ramp[step])!.h;
      expect(hue).toBeGreaterThan(90);
      expect(hue).toBeLessThan(180);
    }
  });

  it("round-trips a hex through OKLCH and rejects invalid input", () => {
    const oklch = parseHexToOklch(TEAL)!;
    expect(oklchToHex(oklch)).toBe(TEAL);
    expect(parseHexToOklch("not-a-color")).toBeNull();
    expect(generateColorRamp("oklch(0.5 0.2 200)")).toBeNull();
    expect(generateColorRamp("")).toBeNull();
  });

  it("normalizes shorthand hex", () => {
    expect(normalizeHex("#fff")).toBe("#ffffff");
    expect(normalizeHex("0F766E")).toBe("#0f766e");
    expect(generateColorRamp("#fff")![500]).toBe("#ffffff");
  });
});
