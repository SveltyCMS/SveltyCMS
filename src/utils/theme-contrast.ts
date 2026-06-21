/**
 * @file src/utils/theme-contrast.ts
 * @description WCAG contrast auditing for admin theme palette imports.
 *
 * Validates common foreground/background pairs used in the admin shell.
 * Advisory only — imports are not blocked.
 *
 * ### Features:
 * - hex and rgb color parsing
 * - relative luminance contrast ratios
 * - shorthand and full `--color-*` property extraction
 */

import { expandShorthandPaletteProperties } from "@utils/theme-preset-mapper";

export interface ContrastWarning {
  pair: string;
  ratio: number;
  required: number;
  level: "AA" | "AAA";
  foreground: string;
  background: string;
}

type Rgb = [number, number, number];

const AUDIT_PAIRS: {
  fg: string;
  bg: string;
  label: string;
  required: number;
  level: "AA" | "AAA";
}[] = [
  {
    fg: "surface-900",
    bg: "surface-50",
    label: "Body text on page background",
    required: 4.5,
    level: "AA",
  },
  {
    fg: "primary-500",
    bg: "surface-50",
    label: "Primary accent on surface",
    required: 3,
    level: "AA",
  },
  {
    fg: "tertiary-500",
    bg: "surface-50",
    label: "Tertiary accent on surface",
    required: 3,
    level: "AA",
  },
  {
    fg: "#ffffff",
    bg: "primary-500",
    label: "White label on primary button",
    required: 4.5,
    level: "AA",
  },
  {
    fg: "#ffffff",
    bg: "tertiary-500",
    label: "White label on tertiary button",
    required: 4.5,
    level: "AA",
  },
  { fg: "error-500", bg: "surface-50", label: "Error accent on surface", required: 3, level: "AA" },
];

function parseHexColor(value: string): Rgb | null {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;

  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function parseRgbColor(value: string): Rgb | null {
  const match = value.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Parse supported CSS color literals to sRGB */
export function parseColorToRgb(value: string): Rgb | null {
  const trimmed = value.trim();
  return parseHexColor(trimmed) ?? parseRgbColor(trimmed);
}

function relativeLuminance([r, g, b]: Rgb): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColorToRgb(foreground);
  const bg = parseColorToRgb(background);
  if (!fg || !bg) return null;

  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Build token map from theme properties (shorthand or `--color-*`) */
export function extractPaletteTokens(properties: Record<string, unknown>): Map<string, string> {
  const expanded = expandShorthandPaletteProperties(properties);
  const tokens = new Map<string, string>();

  for (const [key, value] of Object.entries(expanded)) {
    if (typeof value !== "string") continue;
    if (!key.startsWith("--color-")) continue;
    if (value.includes("color-mix")) continue;
    const token = key.replace("--color-", "");
    tokens.set(token, value);
  }

  return tokens;
}

function resolveTokenColor(token: string, palette: Map<string, string>): string | null {
  if (token.startsWith("#")) return token;
  return palette.get(token) ?? null;
}

/** Audit palette pairs; returns warnings for ratios below WCAG AA thresholds */
export function auditThemePalette(properties: Record<string, unknown>): ContrastWarning[] {
  const palette = extractPaletteTokens(properties);
  if (palette.size === 0) return [];

  const warnings: ContrastWarning[] = [];

  for (const pair of AUDIT_PAIRS) {
    const fgColor = resolveTokenColor(pair.fg, palette);
    const bgColor = resolveTokenColor(pair.bg, palette);
    if (!fgColor || !bgColor) continue;

    const ratio = contrastRatio(fgColor, bgColor);
    if (ratio === null) continue;

    if (ratio < pair.required) {
      warnings.push({
        pair: pair.label,
        ratio: Math.round(ratio * 100) / 100,
        required: pair.required,
        level: pair.level,
        foreground: fgColor,
        background: bgColor,
      });
    }
  }

  return warnings;
}

/** Extract `properties` from preset JSON for contrast audit */
export function auditPresetJson(presetJson: string): ContrastWarning[] {
  try {
    const preset = JSON.parse(presetJson) as Record<string, unknown>;
    if (preset.properties && typeof preset.properties === "object") {
      return auditThemePalette(preset.properties as Record<string, unknown>);
    }
    return [];
  } catch {
    return [];
  }
}
