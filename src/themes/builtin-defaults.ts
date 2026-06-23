/**
 * @file src/themes/builtin-defaults.ts
 * @description Built-in default admin theme config sourced from `/src/themes/default.json`.
 *
 * Keeps setup seed, ThemeManager fallback, and file-based presets in sync.
 * Additional theme presets can be added as JSON files in `/src/themes/` —
 * they are auto-synced to the database on server boot.
 *
 * ### Features:
 * - load default.json at runtime
 * - map shorthand palette properties to scoped customCss
 * - export adminTheme config for DB seeding
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredAdminTheme } from "@src/services/core/admin-theme-service";
import { mapPresetToAdminTheme } from "@utils/theme-preset-mapper";

/** Read a built-in theme JSON file from `/src/themes/` */
export function loadBuiltinThemeFile(basename: string): Record<string, unknown> | null {
  const filePath = join(process.cwd(), "src", "themes", `${basename}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Admin theme config applied on fresh installs */
export function buildDefaultAdminThemeConfig(): Partial<StoredAdminTheme> {
  const preset = loadBuiltinThemeFile("default");
  if (!preset) {
    return inlineDefaultFallback();
  }

  const mapped = mapPresetToAdminTheme(preset);
  const {
    name: _name,
    description: _description,
    properties: _properties,
    presetSource: _presetSource,
    ...layout
  } = preset;

  return {
    ...layout,
    themeName: "default",
    customCss: mapped.customCss || undefined,
  };
}

function inlineDefaultFallback(): Partial<StoredAdminTheme> {
  return {
    density: "cozy",
    variant: "bordered",
    themeName: "default",
    features: {
      stickyActionBar: true,
      collapsibleSidebar: true,
      brandedLogin: true,
      highContrastMode: false,
      reducedMotion: false,
      layoutRegions: { collections: "left", mediaGalleries: "left" },
    },
    layoutState: {
      leftSidebar: "full",
      rightSidebar: "hidden",
      pageheader: "hidden",
      pagefooter: "hidden",
      header: "hidden",
      footer: "hidden",
    },
  };
}
