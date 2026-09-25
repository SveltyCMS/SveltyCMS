/**
 * @file src/utils/color-ramp.ts
 * @description Hue-preserving OKLCH color-ramp generator for palette seeds.
 *
 * Turns a single brand hex into a full 50–950 shade scale the same way the
 * Instatic "Core Framework" token engine does: the perceptual lightness ladder is
 * shifted so the brand color lands exactly on its anchor step (brand fidelity),
 * hue is preserved, and chroma is tapered toward the extremes so near-white and
 * near-black steps do not turn neon. Colors that fall outside sRGB are pulled
 * back by reducing chroma — never by clipping RGB, which would shift the hue.
 *
 * ### Features:
 * - Hex → OKLCH → hex round-trip (no dependencies, client + server safe)
 * - Full 11-step ramp anchored on the seed (500 for accents, 50 for surfaces)
 * - Perceptually even lightness ladder + chroma taper near the extremes
 * - Gamut-mapped via chroma reduction (hue-preserving, never RGB-clipped)
 * - Returns `null` for non-hex input so callers can fall back safely
 */

/** Canonical Tailwind-aligned ramp steps. */
export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export type RampStep = (typeof RAMP_STEPS)[number];

export interface OklchColor {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma, 0 (gray) upward. */
  c: number;
  /** Hue angle in degrees, 0–360. */
  h: number;
}

export interface ColorRampOptions {
  /** Ramp step that must equal the seed verbatim (default 500). */
  anchor?: RampStep;
  /** How hard to mute chroma toward the extremes, 0–1 (default 0.6). */
  chromaTaper?: number;
}

/**
 * Nominal OKLCH lightness per step (Tailwind-like). The generated ramp shifts
 * this ladder uniformly so the seed's own lightness lands on the anchor step.
 */
const NOMINAL_LIGHTNESS: Record<RampStep, number> = {
  50: 0.971,
  100: 0.936,
  200: 0.885,
  300: 0.808,
  400: 0.704,
  500: 0.604,
  600: 0.51,
  700: 0.42,
  800: 0.335,
  900: 0.262,
  950: 0.196,
};

const GAMUT_EPSILON = 1e-4;

/** Expand `#rgb`/`#rrggbb` (with or without `#`) to a lowercase `#rrggbb`. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

/** sRGB channel (0–1) → linear-light. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Linear-light → sRGB channel (0–1), not clamped. */
function toSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Convert an sRGB hex to OKLCH, or `null` when the hex is malformed. */
export function parseHexToOklch(hex: string): OklchColor | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const r = toLinear(parseInt(normalized.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(normalized.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(normalized.slice(5, 7), 16) / 255);

  const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const bb = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;

  const c = Math.sqrt(a * a + bb * bb);
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l, c, h: h < 0 ? h + 360 : h };
}

/** Linear-light RGB triple for an OKLCH color (may fall outside 0–1). */
function oklchToLinearRgb(color: OklchColor): { r: number; g: number; b: number } {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const bb = color.c * Math.sin(hRad);

  const lRoot = color.l + 0.3963377774 * a + 0.2158037573 * bb;
  const mRoot = color.l - 0.1055613458 * a - 0.0638541728 * bb;
  const sRoot = color.l - 0.0894841775 * a - 1.291485548 * bb;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** True when the color is representable in sRGB (within rounding tolerance). */
export function inSrgbGamut(color: OklchColor): boolean {
  const { r, g, b } = oklchToLinearRgb(color);
  return [r, g, b].every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON);
}

/**
 * Pull a color into sRGB by reducing chroma (binary search), keeping hue and
 * lightness — the hue-preserving alternative to clipping RGB channels.
 */
function clampChromaToGamut(color: OklchColor): OklchColor {
  if (inSrgbGamut(color)) return color;
  let low = 0;
  let high = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (inSrgbGamut({ ...color, c: mid })) low = mid;
    else high = mid;
  }
  return { ...color, c: low };
}

/** Convert an OKLCH color to a lowercase `#rrggbb` (gamut-mapped, never clipped). */
export function oklchToHex(color: OklchColor): string {
  const safe = clampChromaToGamut({ ...color, l: Math.min(1, Math.max(0, color.l)) });
  const { r, g, b } = oklchToLinearRgb(safe);
  const channel = (linear: number) =>
    Math.round(Math.min(1, Math.max(0, toSrgb(linear))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Generate a full 50–950 ramp from a single hex seed.
 *
 * The seed lands verbatim on `anchor`; every other step keeps the seed's hue,
 * spaces lightness perceptually evenly around it, and tapers chroma toward the
 * extremes. Returns `null` for anything that is not a valid hex color, so the
 * caller can keep its existing behavior for `oklch()`/named-color input.
 */
export function generateColorRamp(
  baseHex: string,
  options: ColorRampOptions = {},
): Record<RampStep, string> | null {
  const normalized = normalizeHex(baseHex);
  const base = parseHexToOklch(baseHex);
  if (!normalized || !base) return null;

  const anchor = options.anchor ?? 500;
  const chromaTaper = Math.min(1, Math.max(0, options.chromaTaper ?? 0.6));
  const delta = base.l - NOMINAL_LIGHTNESS[anchor];

  const ramp = {} as Record<RampStep, string>;
  for (const step of RAMP_STEPS) {
    if (step === anchor) {
      ramp[step] = normalized;
      continue;
    }
    const lightness = Math.min(0.995, Math.max(0.04, NOMINAL_LIGHTNESS[step] + delta));
    // d = 0 mid-ramp, → 1 at the extremes; mutes neon tints/shades.
    const extremity = Math.min(1, Math.abs(lightness - 0.5) / 0.5);
    const chroma = base.c * (1 - chromaTaper * extremity);
    ramp[step] = oklchToHex({ l: lightness, c: chroma, h: base.h });
  }
  return ramp;
}
