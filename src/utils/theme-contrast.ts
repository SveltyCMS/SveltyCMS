/**
 * @file src/utils/theme-contrast.ts
 * @description Hardened theme contrast auditing utility.
 *
 * ### Hardening (audit 2026-07):
 * - Shorthand hex support: expands #FFF → #FFFFFF (3-digit → 6-digit)
 * - Input validation: parseColorToRgb returns null on invalid/malformed hex
 * - Divide-by-zero guard: contrastRatio returns 1.0 on invalid color inputs
 * - Type safety: auditPresetJson validates properties is an object
 *
 * Analyzes theme JSON for WCAG contrast compliance.
 * Used by admin-theme-service when importing presets.
 */

export interface ContrastWarning {
  message: string;
  level: "info" | "warning" | "error";
  pair?: string;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lCube = l_ * l_ * l_;
  const mCube = m_ * m_ * m_;
  const sCube = s_ * s_ * s_;

  const rLin = +4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const gLin = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const bLin = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  const toSrgb = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;

  return [
    clampByte(toSrgb(rLin) * 255),
    clampByte(toSrgb(gLin) * 255),
    clampByte(toSrgb(bLin) * 255),
  ];
}

/**
 * Parses a CSS color string (`#rgb`, `#rrggbb`, `rgb(...)`, or `oklch(...)`) to RGB.
 * 🛡️ Hardened: Handles 3-digit shorthand (#FFF), rgb/rgba(), oklch(), and returns null on invalid input.
 */
export function parseColorToRgb(color: string): [number, number, number] | null {
  if (typeof color !== "string") return null;
  const trimmed = color.trim();
  if (!trimmed) return null;

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*[\d.%]+)?\s*\)$/i,
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [clampByte(r), clampByte(g), clampByte(b)];
  }

  const oklchMatch = trimmed.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.%]+)?\s*\)$/i,
  );
  if (oklchMatch) {
    const rawL = Number(oklchMatch[1]);
    const l = oklchMatch[2] === "%" ? rawL / 100 : rawL;
    const c = Number(oklchMatch[3]);
    const h = Number(oklchMatch[4]);
    return isNaN(l) || isNaN(c) || isNaN(h) ? null : oklchToRgb(l, c, h);
  }

  let clean = trimmed.replace(/^#/, "");

  // Expand shorthand (e.g., "F00" → "FF0000")
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return null;

  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);

  return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
}

/**
 * Calculate the relative luminance of an RGB color.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * WCAG contrast ratio. 🛡️ Returns 1.0 on invalid input to prevent divide-by-zero.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = parseColorToRgb(hex1);
  const rgb2 = parseColorToRgb(hex2);

  if (!rgb1 || !rgb2) return 1.0;

  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 3.0 draft APCA (Accessible Perceptual Contrast Algorithm) Lc value
 * between a foreground (text) color and a background color.
 * Returns a signed Lc percentage roughly in [-108, +106] (0 on invalid input).
 */
export function apcaContrast(foreground: string, background: string): number {
  const fg = parseColorToRgb(foreground);
  const bg = parseColorToRgb(background);
  if (!fg || !bg) return 0;

  const toY = (r: number, g: number, b: number) =>
    0.2126729 * Math.pow(r / 255, 2.4) +
    0.7151522 * Math.pow(g / 255, 2.4) +
    0.072175 * Math.pow(b / 255, 2.4);

  const softClamp = (y: number) => (y >= 0.022 ? y : y + Math.pow(0.022 - y, 1.414));

  const yTxt = softClamp(toY(fg[0], fg[1], fg[2]));
  const yBg = softClamp(toY(bg[0], bg[1], bg[2]));

  if (Math.abs(yBg - yTxt) < 0.0005) return 0;

  const sapc =
    yBg > yTxt
      ? (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14
      : (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;

  if (Math.abs(sapc) < 0.1) return 0;
  return (sapc > 0 ? sapc - 0.027 : sapc + 0.027) * 100;
}

/**
 * Audit a theme palette for low-contrast pairs.
 */
export function auditThemePalette(palette: Record<string, string>): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];

  const checkPairs = [
    { name: "Primary accent on surface", fg: palette.primary, bg: palette.surface },
    { name: "Tertiary accent on surface", fg: palette.tertiary, bg: palette.surface },
    { name: "Surface text on surface", fg: palette["surface-900"], bg: palette.surface },
  ];

  for (const pair of checkPairs) {
    // Only audit if both colors exist
    if (pair.fg && pair.bg) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      if (ratio < 4.5) {
        warnings.push({
          message: `Low contrast: ${pair.name} (ratio: ${ratio.toFixed(2)})`,
          level: ratio < 3 ? "error" : "warning",
          pair: pair.name,
        });
      }
    }
  }

  return warnings;
}

/**
 * Audit a preset JSON string for contrast and accessibility issues.
 * Returns an array of warnings for display in the import UI.
 */
export function auditPresetJson(presetJson: string): ContrastWarning[] {
  try {
    const preset = JSON.parse(presetJson);
    const warnings: ContrastWarning[] = [];

    if (preset?.properties && typeof preset.properties === "object") {
      warnings.push(...auditThemePalette(preset.properties));
    }

    if (preset?.colors) {
      warnings.push({
        message: "Custom theme imported. Please verify WCAG contrast ratios manually.",
        level: "info",
      });
    }

    return warnings;
  } catch {
    return [{ message: "Unable to parse preset JSON for contrast audit.", level: "warning" }];
  }
}
