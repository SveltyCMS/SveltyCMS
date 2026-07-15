/**
 * @file src/utils/theme-contrast.ts
 * @description Theme contrast auditing utility.
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
 * Parse a hex color string to RGB array.
 */
export function parseColorToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
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
 * Calculate the WCAG contrast ratio between two hex colors.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = parseColorToRgb(hex1);
  const [r2, g2, b2] = parseColorToRgb(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Audit a theme palette for low-contrast pairs.
 */
export function auditThemePalette(palette: Record<string, string>): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const pairs: { name: string; foreground: string; background: string }[] = [];

  if (palette.primary && palette.surface) {
    pairs.push({
      name: "Primary accent on surface",
      foreground: palette.primary,
      background: palette.surface,
    });
  }

  if (palette.tertiary && palette.surface) {
    pairs.push({
      name: "Tertiary accent on surface",
      foreground: palette.tertiary,
      background: palette.surface,
    });
  }

  if (palette["surface-900"] && palette.surface) {
    pairs.push({
      name: "Surface text on surface",
      foreground: palette["surface-900"],
      background: palette.surface,
    });
  }

  for (const pair of pairs) {
    const ratio = contrastRatio(pair.foreground, pair.background);
    if (ratio < 4.5) {
      warnings.push({
        message: `Low contrast: ${pair.name} (ratio: ${ratio.toFixed(2)})`,
        level: ratio < 3 ? "error" : "warning",
        pair: pair.name,
      });
    }
  }

  return warnings;
}

/**
 * Audit a preset JSON string for contrast and accessibility issues.
 * Returns an array of warnings for display in the import UI.
 */
export function auditPresetJson(presetJson: string): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  try {
    const preset = JSON.parse(presetJson);

    if (preset.properties) {
      const paletteWarnings = auditThemePalette(preset.properties);
      warnings.push(...paletteWarnings);
    }

    if (preset.colors) {
      warnings.push({
        message: "Custom theme imported. Please verify WCAG contrast ratios manually.",
        level: "info",
      });
    }
  } catch {
    warnings.push({
      message: "Unable to parse preset JSON for contrast audit.",
      level: "warning",
    });
  }
  return warnings;
}
