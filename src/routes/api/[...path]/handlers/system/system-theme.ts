/**
 * @file src/routes/api/[...path]/handlers/system/system-theme.ts
 * @description Admin theme CRUD, presets, and multi-theme management routes.
 */

import { json, type RequestEvent } from "@sveltejs/kit";
import { AppError } from "@utils/error-handling";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse, validateRequestBody } from "../base";
import { any, minLength, object, optional, pipe, string } from "valibot";

/** Cached lazy handle to the admin theme service — one module-registry lookup instead of one per call. */
let adminThemeServiceModulePromise:
  | Promise<typeof import("@src/services/core/admin-theme-service")>
  | undefined;
function loadAdminThemeServiceModule(): Promise<
  typeof import("@src/services/core/admin-theme-service")
> {
  return (adminThemeServiceModulePromise ??= import("@src/services/core/admin-theme-service"));
}

const ImportPresetSchema = object({
  presetJson: pipe(string(), minLength(1, "presetJson is required")),
});

const CreateThemeSchema = object({
  name: pipe(string(), minLength(1, "name is required")),
  settings: optional(any()),
});

const ThemeIdSchema = object({
  themeId: pipe(string(), minLength(1, "themeId is required")),
});

const CloneThemeSchema = object({
  sourceId: pipe(string(), minLength(1, "sourceId is required")),
  name: pipe(string(), minLength(1, "name is required")),
});

/**
 * --- THEME ---
 */
export async function handleThemeRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];
  const request = event.request;

  // ── Admin Theme CRUD ──
  if (action === "admin-theme" && request.method === "GET") {
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const theme = await adminThemeService.getAdminTheme(tenantId);
    return json(theme ?? {});
  }
  if (action === "admin-theme" && request.method === "POST") {
    const body = await request.json();
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const result = await adminThemeService.saveAdminTheme(body, tenantId);
    return successResponse(event, result);
  }
  if (action === "admin-theme" && request.method === "DELETE") {
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const result = await adminThemeService.resetToDefaults(tenantId);
    return successResponse(event, result);
  }
  if (action === "import-preset" && request.method === "POST") {
    const { presetJson } = await validateRequestBody(event, ImportPresetSchema);
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const { theme, contrastWarnings } = await adminThemeService.importPreset(presetJson, tenantId);
    return json({ success: true, data: theme, warnings: contrastWarnings });
  }

  // ── Multi-Theme Management ──
  if (action === "list" && request.method === "GET") {
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const themes = await adminThemeService.listThemes(tenantId);
    return json(themes);
  }
  if (action === "create" && request.method === "POST") {
    const { name, settings } = await validateRequestBody(event, CreateThemeSchema);
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const result = await adminThemeService.createTheme(name, settings, tenantId);
    return successResponse(event, result, 201);
  }
  if (action === "delete" && request.method === "POST") {
    const { themeId } = await validateRequestBody(event, ThemeIdSchema);
    const { adminThemeService } = await loadAdminThemeServiceModule();
    await adminThemeService.deleteTheme(themeId, tenantId);
    return successResponse(event, { success: true });
  }
  if (action === "activate" && request.method === "POST") {
    const { themeId } = await validateRequestBody(event, ThemeIdSchema);
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const result = await adminThemeService.activateTheme(themeId, tenantId);
    return successResponse(event, result);
  }
  if (action === "clone" && request.method === "POST") {
    const { sourceId, name } = await validateRequestBody(event, CloneThemeSchema);
    const { adminThemeService } = await loadAdminThemeServiceModule();
    const result = await adminThemeService.cloneTheme(sourceId, name, tenantId);
    return successResponse(event, result, 201);
  }

  // ── Existing theme endpoints ──
  const { ThemeManager } = await import("@src/databases/theme-manager");
  const themeManager = ThemeManager.getInstance();

  if (action === "get-current-theme" && request.method === "GET") {
    const theme = await themeManager.getTheme(tenantId);
    if (!theme) throw new AppError("No active theme found.", 404);
    return rawResponse(event, theme);
  }
  if (action === "update-theme" && request.method === "POST") {
    const { themeId, customCss } = await request.json();
    if (!themeId) throw new AppError("themeId is required", 400);
    const result = await cms.db.system.themes.update(themeId as DatabaseId, {
      customCss,
    });
    if (!result.success || !result.data)
      throw new AppError("Theme update failed or theme not found", 404);
    await themeManager.refresh();
    return successResponse(event, result.data);
  }
  if (action === "set-default" && request.method === "POST") {
    const { themeId } = await request.json();
    await cms.db.system.themes.setDefault(themeId as DatabaseId);
    return successResponse(event, { success: true });
  }
  throw new AppError(`Theme action ${action} not implemented`, 404);
}
