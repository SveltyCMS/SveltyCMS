/**
 * @file src/services/core/theme-file-sync.ts
 * @description Sync `/src/themes/*.json` files into the theme database.
 *
 * Used on server boot (production/preview) and by the Vite dev plugin (HMR).
 * Keeps Git-tracked theme files and the DB in sync without requiring Vite.
 *
 * ### Features:
 * - parse and validate theme JSON files
 * - create or update themes by name
 * - batch scan on boot
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { logger } from "@utils/logger";
import type { StoredAdminTheme } from "./admin-theme-service";
import { mapPresetToAdminTheme, type ThemePreset } from "@utils/theme-preset-mapper";

export const THEMES_DIR = join(process.cwd(), "src", "themes");

export type ThemeFileSyncAction = "created" | "updated" | "skipped" | "error";

export interface ThemeFileSyncResult {
  file: string;
  name: string;
  action: ThemeFileSyncAction;
  error?: string;
}

export type ThemeFilePayload = Partial<StoredAdminTheme> & { name: string };

/** Marks a payload as the built-in default theme (matches `src/themes/default.json`). */
export const BUILTIN_PRESET_SOURCE = "sveltycms-builtin";

/**
 * Former names of the built-in default theme.
 *
 * The built-in was historically seeded as `SveltyCMSTheme`; a later file sync that
 * named `src/themes/default.json` `Default` created a SECOND, inactive row and left
 * the active legacy row carrying a stale palette in `config.adminTheme.customCss`.
 * Because the layout injects the ACTIVE theme's custom CSS, that stale palette kept
 * overriding the `src/app.css` `@theme` brand tokens. Syncing the built-in now
 * converges both rows onto one canonical theme and clears the stale override.
 */
export const LEGACY_BUILTIN_THEME_NAMES = new Set(["SveltyCMSTheme"]);

/** Parse theme JSON and ensure a `name` field exists */
export function parseThemeFileContent(raw: string, sourceFile?: string): ThemeFilePayload {
  const themeJson = JSON.parse(raw) as Record<string, unknown>;
  if (!themeJson.name || typeof themeJson.name !== "string") {
    throw new Error(`Theme file ${sourceFile ?? "unknown"} missing "name" field`);
  }

  const mapped = mapPresetToAdminTheme(themeJson as ThemePreset);
  const { properties: _properties, css: _css, code: _code, ...rest } = themeJson;
  return { ...rest, ...mapped } as ThemeFilePayload;
}

/**
 * Import or update a single theme object in the database.
 *
 * For the built-in default theme this also converges legacy duplicates: the row
 * that is currently ACTIVE wins (it is what the layout renders), the payload is
 * applied to it — clearing a stale `customCss` — and any leftover duplicate
 * built-in row that is neither active nor default is pruned.
 */
export async function importThemeFromJson(
  themeJson: ThemeFilePayload,
  tenantId?: string | null,
): Promise<"created" | "updated"> {
  const { adminThemeService } = await import("./admin-theme-service");
  const existing = await adminThemeService.listThemes(tenantId);

  const isBuiltin = themeJson.presetSource === BUILTIN_PRESET_SOURCE;
  const candidates = existing.filter(
    (t) => t.name === themeJson.name || (isBuiltin && LEGACY_BUILTIN_THEME_NAMES.has(t.name)),
  );

  if (candidates.length === 0) {
    await adminThemeService.createTheme(themeJson.name, themeJson, tenantId);
    return "created";
  }

  // Prefer the active row (the one the layout renders), then the default, then the
  // canonical name — renames must never orphan the theme that is actually live.
  const primary =
    candidates.find((t) => t.isActive) ??
    candidates.find((t) => t.isDefault) ??
    candidates.find((t) => t.name === themeJson.name) ??
    candidates[0];

  await adminThemeService.saveAdminTheme(themeJson, tenantId, primary.id);

  for (const candidate of candidates) {
    if (candidate.id === primary.id || candidate.isActive || candidate.isDefault) continue;
    try {
      await adminThemeService.deleteTheme(candidate.id, tenantId);
      logger.info(`[ThemeFileSync] Pruned duplicate built-in theme "${candidate.name}"`);
    } catch (err) {
      logger.warn(`[ThemeFileSync] Could not prune duplicate theme "${candidate.name}":`, err);
    }
  }

  return "updated";
}

/** Sync one theme file from disk */
export async function syncThemeFile(
  filePath: string,
  tenantId?: string | null,
): Promise<ThemeFileSyncResult> {
  const file = basename(filePath);
  try {
    const raw = readFileSync(filePath, "utf-8");
    const themeJson = parseThemeFileContent(raw, file);
    const action = await importThemeFromJson(themeJson, tenantId);
    return { file, name: themeJson.name, action };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[ThemeFileSync] Failed to sync ${file}:`, err);
    return { file, name: file, action: "error", error: message };
  }
}

/**
 * Scan `/src/themes/*.json` and import all files into the database.
 * Safe to call on every server boot — updates existing themes by name.
 */
export async function syncAllThemeFiles(tenantId?: string | null): Promise<ThemeFileSyncResult[]> {
  if (!existsSync(THEMES_DIR)) {
    logger.debug("[ThemeFileSync] /src/themes directory not found — skipping");
    return [];
  }

  const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    logger.debug("[ThemeFileSync] No theme JSON files in /src/themes");
    return [];
  }

  logger.info(`[ThemeFileSync] Boot scan: ${files.length} file(s)`);
  const results: ThemeFileSyncResult[] = [];

  for (const file of files) {
    results.push(await syncThemeFile(join(THEMES_DIR, file), tenantId));
  }

  const synced = results.filter((r) => r.action === "created" || r.action === "updated");
  if (synced.length > 0) {
    logger.info(
      `[ThemeFileSync] Synced ${synced.length} theme(s): ${synced.map((r) => r.name).join(", ")}`,
    );
  }

  const errors = results.filter((r) => r.action === "error");
  if (errors.length > 0) {
    logger.warn(`[ThemeFileSync] ${errors.length} file(s) failed to sync`);
  }

  return results;
}
