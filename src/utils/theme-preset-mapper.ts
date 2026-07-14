/**
 * @file src/utils/theme-preset-mapper.ts
 * @description Maps Skeleton.dev CSS preset exports and other theme formats to StoredAdminTheme.
 *
 * Used by admin-theme-service when importing presets from the marketplace or local files.
 */

export interface SkeletonPreset {
  name?: string;
  css?: string;
  code?: string;
  colors?: Record<string, string>;
}

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
    (typeof preset.css === "string" || typeof preset.code === "string")
  );
}

/**
 * Map a Skeleton.dev preset (or similar) to a StoredAdminTheme-compatible partial object.
 */
export function mapPresetToAdminTheme(preset: SkeletonPreset): {
  name: string;
  customCss?: string;
} {
  const css = preset.css || preset.code || "";
  return {
    name: preset.name || "Imported Preset",
    customCss: css || undefined,
  };
}
