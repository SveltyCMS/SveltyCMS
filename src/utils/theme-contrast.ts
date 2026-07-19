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

/**
 * Parses a hex color string to RGB.
 * 🛡️ Hardened: Handles 3-digit shorthand (#FFF) and ensures valid hex length.
 */
export function parseColorToRgb(hex: string): [number, number, number] | null {
  let clean = hex.replace("#", "");

  // Expand shorthand (e.g., "F00" → "FF0000")
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (clean.length !== 6) return null;

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
