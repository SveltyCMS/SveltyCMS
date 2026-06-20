/**
 * @file src/themes/builtin-defaults.ts
 * @description Built-in default admin theme config sourced from `/themes/corporate.json`.
 *
 * Keeps setup seed, ThemeManager fallback, and file-based presets in sync.
 *
 * ### Features:
 * - load corporate.json at runtime
 * - map shorthand palette properties to scoped customCss
 * - export adminTheme config for DB seeding
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredAdminTheme } from "@src/services/core/admin-theme-service";
import { mapSkeletonPresetToAdminTheme } from "@utils/skeleton-preset-mapper";

/** Read a built-in theme JSON file from `/themes/` */
export function loadBuiltinThemeFile(basename: string): Record<string, unknown> | null {
  const filePath = join(process.cwd(), "themes", `${basename}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Admin theme config applied on fresh installs (Corporate workspace) */
export function buildDefaultAdminThemeConfig(): Partial<StoredAdminTheme> {
  const corporate = loadBuiltinThemeFile("corporate");
  if (!corporate) {
    return inlineCorporateFallback();
  }

  const mapped = mapSkeletonPresetToAdminTheme(corporate);
  const {
    name: _name,
    description: _description,
    properties: _properties,
    presetSource: _presetSource,
    ...layout
  } = corporate;

  return {
    ...layout,
    themeName: "corporate",
    customCss: mapped.customCss || undefined,
  };
}

function inlineCorporateFallback(): Partial<StoredAdminTheme> {
  return {
    density: "cozy",
    variant: "bordered",
    themeName: "corporate",
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
