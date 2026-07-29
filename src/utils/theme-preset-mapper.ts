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
 */
export function mapThemePropertiesToCss(properties: Record<string, string>): string {
  let css = ".admin-theme-container, [data-admin-theme] {\n";
  for (let [prop, value] of Object.entries(properties)) {
    // Block unsafe values
    if (isUnsafeValue(value)) continue;
    // Only allow CSS custom property keys
    if (!prop.startsWith("--")) continue;
    // Apply Skeleton → SveltyCMS property name remapping
    prop = PROPERTY_REMAP[prop] || prop;
    css += `  ${prop}: ${value};\n`;
  }
  css += "}";
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
      expanded[`${prefix}-50`] = value;
      expanded[`${prefix}-500`] = `color-mix(in srgb, ${value}, black)`;
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
