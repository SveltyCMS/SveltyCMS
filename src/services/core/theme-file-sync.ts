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
import { normalizeSkeletonThemePayload } from "@utils/theme-preset-mapper";

export const THEMES_DIR = join(process.cwd(), "src", "themes");

export type ThemeFileSyncAction = "created" | "updated" | "skipped" | "error";

export interface ThemeFileSyncResult {
  file: string;
  name: string;
  action: ThemeFileSyncAction;
  error?: string;
}

export type ThemeFilePayload = Partial<StoredAdminTheme> & { name: string };

/** Parse theme JSON and ensure a `name` field exists */
export function parseThemeFileContent(raw: string, sourceFile?: string): ThemeFilePayload {
  const themeJson = JSON.parse(raw) as Record<string, unknown>;
  if (!themeJson.name || typeof themeJson.name !== "string") {
    throw new Error(`Theme file ${sourceFile ?? "unknown"} missing "name" field`);
  }

  const skeleton = normalizeSkeletonThemePayload(themeJson);
  if (skeleton) {
    const { properties: _properties, css: _css, code: _code, ...rest } = themeJson;
    return { ...rest, ...skeleton } as ThemeFilePayload;
  }

  return themeJson as ThemeFilePayload;
}

/** Import or update a single theme object in the database */
export async function importThemeFromJson(
  themeJson: ThemeFilePayload,
  tenantId?: string | null,
): Promise<"created" | "updated"> {
  const { adminThemeService } = await import("./admin-theme-service");
  const existing = await adminThemeService.listThemes(tenantId);
  const match = existing.find((t) => t.name === themeJson.name);
  if (match) {
    await adminThemeService.saveAdminTheme(themeJson, tenantId, match.id);
    return "updated";
  }
  await adminThemeService.createTheme(themeJson.name, themeJson, tenantId);
  return "created";
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
