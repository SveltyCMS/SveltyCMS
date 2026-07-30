/**
 * @file src/utils/theme-preset-mapper.ts
 * @description Hardened mapper for CSS preset imports.
 *
 * ### Hardening (audit 2026-07):
 * - CSS inject prevention: blocks @import, @media, url(), expression(), javascript:
 * - Regex-based CSS parsing: handles both minified and pretty-printed CSS
 * - Property validation: ensures only --prefixed custom properties pass through
 * - Value validation in expand: palette values checked before color-mix generation
 *
 * Maps Skeleton.dev CSS preset exports and other theme formats to StoredAdminTheme.
 * Used by admin-theme-service when importing presets from the marketplace or local files.
 */

/** 🛡️ Validates CSS values against injection attacks */
function isUnsafeValue(value: string): boolean {
  const unsafePatterns = [
    /url\s*\(/i,
    /expression\s*\(/i,
    /javascript\s*:/i,
    /@import/i,
    /@media/i,
  ];
  return unsafePatterns.some((pattern) => pattern.test(value));
}

// Property name remapping: Skeleton.dev → SveltyCMS admin theme
const PROPERTY_REMAP: Record<string, string> = {
  "--color-accent-500": "--color-tertiary-500",
  "--radius-base": "--admin-radius-button",
  "--radius-container": "--admin-radius-card",
};

// Shorthand color key → CSS custom property prefix
const SHORTHAND_COLOR_TO_PREFIX: Record<string, string> = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  tertiary: "--color-tertiary",
  success: "--color-success",
  warning: "--color-warning",
  error: "--color-error",
  surface: "--color-surface",
};

export interface SkeletonPreset {
  name?: string;
  css?: string;
  code?: string;
  properties?: Record<string, string>;
  colors?: Record<string, string>;
  presetSource?: string;
}

// --- Property CSS mapping ---

/**
 * Maps theme properties to scoped admin CSS.
 * Handles property name remapping and blocks unsafe values.
 * When surface palette tokens are present, re-binds semantic `--admin-bg-*`
 * roles so page/card elevation follows the imported palette.
 */
export function mapThemePropertiesToCss(properties: Record<string, string>): string {
  let css = ".admin-theme-container, [data-admin-theme] {\n";
  let hasSurface = false;
  for (let [prop, value] of Object.entries(properties)) {
    // Block unsafe values
    if (isUnsafeValue(value)) continue;
    // Only allow CSS custom property keys
    if (!prop.startsWith("--")) continue;
    // Apply Skeleton → SveltyCMS property name remapping
    prop = PROPERTY_REMAP[prop] || prop;
    if (prop.startsWith("--color-surface-")) hasSurface = true;
    css += `  ${prop}: ${value};\n`;
  }
  if (hasSurface) {
    // Light defaults: page + card share surface-50; dark elevation is in the dark block
    css += "  --admin-bg-page: var(--color-surface-50);\n";
    css += "  --admin-bg-card: var(--color-surface-50);\n";
    css += "  --admin-bg-sidebar: var(--color-surface-100, var(--color-surface-50));\n";
    css += "  --admin-border-default: var(--color-surface-200, var(--color-surface-500));\n";
    css += "  --admin-border-subtle: var(--color-surface-100, var(--color-surface-50));\n";
    css += "  --admin-text-body: var(--color-surface-900, var(--color-surface-500));\n";
    css += "  --admin-text-muted: var(--color-surface-500);\n";
  }
  css += "}\n";
  if (hasSurface) {
    css += "html.dark .admin-theme-container,\nhtml.dark [data-admin-theme] {\n";
    css +=
      "  --admin-bg-page: var(--color-surface-950, var(--color-surface-900, var(--color-surface-500)));\n";
    css +=
      "  --admin-bg-card: var(--color-surface-800, var(--color-surface-900, var(--color-surface-500)));\n";
    css += "  --admin-bg-sidebar: var(--color-surface-950, var(--color-surface-900));\n";
    css += "  --admin-border-default: var(--color-surface-600, var(--color-surface-500));\n";
    css += "  --admin-border-subtle: var(--color-surface-700, var(--color-surface-500));\n";
    css += "  --admin-text-body: var(--color-surface-100, var(--color-surface-50));\n";
    css += "  --admin-text-muted: var(--color-surface-400, var(--color-surface-500));\n";
    css += "}\n";
  }
  return css;
}

// Alias for backward compatibility during migration
export const mapSkeletonPropertiesToCss = mapThemePropertiesToCss;

/**
 * Expands shorthand palette properties to full shade scales.
 */
export function expandShorthandPaletteProperties(
  palette: Record<string, string>,
): Record<string, string> {
  const expanded: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette)) {
    const prefix = SHORTHAND_COLOR_TO_PREFIX[key];
    if (!prefix) continue;
    // Validate value before expanding
    if (isUnsafeValue(value)) continue;

    if (key === "surface") {
      // Full surface scale so dark-mode --admin-bg-card/page can elevate cards
      expanded[`${prefix}-50`] = value;
      expanded[`${prefix}-100`] = `color-mix(in srgb, ${value} 92%, black)`;
      expanded[`${prefix}-200`] = `color-mix(in srgb, ${value} 85%, black)`;
      expanded[`${prefix}-300`] = `color-mix(in srgb, ${value} 70%, black)`;
      expanded[`${prefix}-400`] = `color-mix(in srgb, ${value} 55%, black)`;
      expanded[`${prefix}-500`] = `color-mix(in srgb, ${value} 45%, black)`;
      expanded[`${prefix}-600`] = `color-mix(in srgb, ${value} 35%, black)`;
      expanded[`${prefix}-700`] = `color-mix(in srgb, ${value} 25%, black)`;
      expanded[`${prefix}-800`] = `color-mix(in srgb, ${value} 18%, black)`;
      expanded[`${prefix}-900`] = `color-mix(in srgb, ${value} 12%, black)`;
      expanded[`${prefix}-950`] = `color-mix(in srgb, ${value} 8%, black)`;
    } else {
      expanded[`${prefix}-500`] = value;
      expanded[`${prefix}-50`] = `color-mix(in srgb, ${value}, white)`;
      expanded[`${prefix}-950`] = `color-mix(in srgb, ${value}, black)`;
    }
  }
  return expanded;
}

/**
 * Parses a CSS block export into a properties object.
 * 🛡️ Uses regex — handles both minified and pretty-printed CSS.
 */
export function parseSkeletonCssBlock(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    props[match[1].trim()] = match[2].trim();
  }
  return props;
}

// --- Detection ---

/**
 * Check if a CSS string appears to be a Skeleton.dev CSS export.
 */
export function isSkeletonCssExport(css: string): boolean {
  return css.includes("skeleton") || css.includes("sk-theme") || css.includes("[data-theme=");
}

/**
 * Check if a parsed preset object is a Skeleton.dev preset.
 */
export function isSkeletonPreset(preset: Record<string, unknown>): boolean {
  return (
    typeof preset.name === "string" &&
    (typeof preset.css === "string" || typeof preset.code === "string" || !!preset.properties)
  );
}

// --- Preset to Admin Theme mapping ---

/**
 * Converts a properties object (shorthand or longhand) to CSS.
 */
function propertiesToCss(properties: Record<string, string>): string {
  const hasLonghand = Object.keys(properties).some((k) => k.startsWith("--"));
  if (hasLonghand) {
    return mapThemePropertiesToCss(properties);
  }
  const expanded = expandShorthandPaletteProperties(properties);
  return mapThemePropertiesToCss(expanded);
}

/**
 * Map a Skeleton.dev preset (or similar) to a StoredAdminTheme-compatible partial object.
 */
export function mapPresetToAdminTheme(preset: SkeletonPreset): {
  name: string;
  customCss?: string;
  presetSource?: string;
} {
  let customCss: string | undefined;

  if (preset.css) {
    customCss = preset.css;
  } else if (preset.code) {
    customCss = preset.code;
  } else if (preset.properties && Object.keys(preset.properties).length > 0) {
    customCss = propertiesToCss(preset.properties);
  }

  return {
    name: preset.name || "Imported Preset",
    customCss,
    presetSource: preset.presetSource || "imported",
  };
}

/** Markers so palette studio can replace only its own block inside customCss. */
export const PALETTE_CSS_START = "/* sveltycms-palette-start */";
export const PALETTE_CSS_END = "/* sveltycms-palette-end */";

export type PaletteSeedKey =
  | "primary"
  | "secondary"
  | "tertiary"
  | "success"
  | "warning"
  | "error"
  | "surface";

export type PaletteSeeds = Partial<Record<PaletteSeedKey, string>>;

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Validate a seed hex color for the palette studio. */
export function isValidPaletteHex(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

/**
 * Build scoped admin CSS from shorthand palette seeds (primary, surface, …).
 * Uses the same expansion path as Skeleton / theme JSON import.
 */
export function buildPaletteCssFromSeeds(seeds: PaletteSeeds): string {
  const properties: Record<string, string> = {};
  for (const [key, raw] of Object.entries(seeds)) {
    if (!raw || !SHORTHAND_COLOR_TO_PREFIX[key]) continue;
    const value = raw.trim();
    // Studio seeds are hex-only; Skeleton import path still accepts oklch/CSS via propertiesToCss
    if (!isValidPaletteHex(value)) continue;
    properties[key] = value;
  }
  if (Object.keys(properties).length === 0) return "";
  return propertiesToCss(properties);
}

/**
 * Merge palette-generated CSS into existing customCss without wiping manual rules.
 */
export function mergePaletteCssIntoCustomCss(
  existing: string | undefined,
  paletteCss: string,
): string {
  const block = paletteCss.trim()
    ? `${PALETTE_CSS_START}\n${paletteCss.trim()}\n${PALETTE_CSS_END}`
    : "";
  const re = /\/\* sveltycms-palette-start \*\/[\s\S]*?\/\* sveltycms-palette-end \*\//g;
  const base = (existing ?? "").replace(re, "").trim();
  if (!block) return base;
  if (!base) return block;
  return `${base}\n\n${block}`;
}

/** Default Corporate workspace seeds (matches src/themes/default.json). */
export const DEFAULT_PALETTE_SEEDS: Required<
  Pick<
    PaletteSeeds,
    "primary" | "secondary" | "tertiary" | "success" | "warning" | "error" | "surface"
  >
> = {
  primary: "#0f766e",
  secondary: "#334155",
  tertiary: "#1d4ed8",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  surface: "#f8fafc",
};

/**
 * Normalize a Skeleton.dev theme payload to a StoredAdminTheme-compatible format.
 */
export function normalizeSkeletonThemePayload(payload: Record<string, unknown>): {
  name: string;
  customCss?: string;
  presetSource?: string;
} {
  let customCss: string | undefined;

  if (typeof payload.css === "string" && payload.css) {
    customCss = payload.css;
  } else if (typeof payload.code === "string" && payload.code) {
    customCss = payload.code;
  } else if (payload.properties && typeof payload.properties === "object") {
    customCss = propertiesToCss(payload.properties as Record<string, string>);
  }

  return {
    name: (payload.name as string) || "Imported Theme",
    customCss,
    presetSource: (payload.presetSource as string) || "imported",
  };
}
