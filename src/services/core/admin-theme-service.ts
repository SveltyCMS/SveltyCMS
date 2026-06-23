/**
 * @file src/services/core/admin-theme-service.ts
 * @description Server-side service for admin theme management.
 *
 * Manages multiple named admin themes.
 * Each Theme DB record stores its admin settings in `config.adminTheme`.
 *
 * ### Features:
 * - Create, list, activate, delete named themes
 * - Save/load per-theme admin config (density, variant, features, custom CSS)
 * - Custom CSS sanitization
 * - Skeleton.dev preset import
 * - Tenant-aware storage
 */

import { ThemeManager } from "@src/databases/theme-manager";
import type { ThemeConfig as AdminThemeSettings } from "@components/ui/theme-context.svelte";
import { logger } from "@utils/logger";
import {
  isSkeletonCssExport,
  isSkeletonPreset,
  mapPresetToAdminTheme,
} from "@utils/theme-preset-mapper";
import { auditPresetJson, type ContrastWarning } from "@utils/theme-contrast";
import type { DatabaseId } from "@src/content/types";
import type { Theme } from "@src/databases/db-interface";

/** Admin-controlled locks — when true, users cannot override that preference */
export interface AdminLockedSettings {
  density?: boolean;
  variant?: boolean;
  reducedMotion?: boolean;
  highContrast?: boolean;
  layoutState?: boolean;
}

/** Shape stored in Theme.config.adminTheme */
export interface StoredAdminTheme extends AdminThemeSettings {
  updatedAt?: string;
  presetSource?: string;
  /** Per-theme layout state (sidebar visibility, regions) persisted to DB */
  layoutState?: import("@components/ui/theme-context.svelte").LayoutState;
  /** Settings users are not allowed to override via personal preferences */
  lockedSettings?: AdminLockedSettings;
}

/** Lightweight theme summary for the selector UI */
export interface ThemeSummary {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  density?: string;
  variant?: string;
  updatedAt?: string;
}

const ADMIN_THEME_KEY = "adminTheme";

function sanitizeCss(css: string): string {
  return css
    .replace(/url\s*\([^)]*\)/gi, "url()")
    .replace(/expression\s*\(/gi, "/* blocked */")
    .replace(/javascript\s*:/gi, "/* blocked */")
    .replace(/behavior\s*:/gi, "/* blocked */")
    .replace(/@import/gi, "/* blocked */")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "");
}

function extractAdminTheme(theme: Theme): StoredAdminTheme | null {
  const raw = (theme.config as Record<string, unknown>)?.[ADMIN_THEME_KEY];
  if (!raw || typeof raw !== "object") return null;
  return raw as StoredAdminTheme;
}

function buildDefaults(name: string): StoredAdminTheme {
  return {
    id: "default",
    name,
    density: "cozy",
    variant: "bordered",
    accentMode: "default",
    role: "admin",
    themeName: "default",
    features: {
      stickyActionBar: false,
      collapsibleSidebar: false,
      brandedLogin: false,
      highContrastMode: false,
      reducedMotion: false,
      layoutRegions: {
        collections: "left",
        mediaGalleries: "left",
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export class AdminThemeService {
  private static instance: AdminThemeService;

  public static getInstance(): AdminThemeService {
    if (!AdminThemeService.instance) {
      AdminThemeService.instance = new AdminThemeService();
    }
    return AdminThemeService.instance;
  }

  // ═══════════════════════════════════════════════
  //  Theme CRUD
  // ═══════════════════════════════════════════════

  /** List all themes with their admin config summaries */
  async listThemes(tenantId?: string | null): Promise<ThemeSummary[]> {
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("ThemeManager DB not available");

    const themes: Theme[] = await db.system.themes.getAllThemes({
      tenantId: tenantId as unknown as DatabaseId,
    });
    if (!Array.isArray(themes)) return [];

    return themes.map((t) => {
      const admin = extractAdminTheme(t);
      return {
        id: String(t._id),
        name: t.name,
        isActive: t.isActive,
        isDefault: t.isDefault,
        density: admin?.density,
        variant: admin?.variant,
        updatedAt: admin?.updatedAt,
      };
    });
  }

  /** Get the active admin theme config (falls back to defaults) */
  async getAdminTheme(tenantId?: string | null): Promise<StoredAdminTheme | null> {
    const tm = ThemeManager.getInstance();
    try {
      const theme = await tm.getTheme(tenantId);
      if (!theme) return null;
      return extractAdminTheme(theme) || buildDefaults(theme.name);
    } catch (err) {
      logger.error("Failed to load admin theme:", err);
      return null;
    }
  }

  /** Save admin config to a specific theme (defaults to active theme) */
  async saveAdminTheme(
    settings: Partial<StoredAdminTheme>,
    tenantId?: string | null,
    themeId?: string,
  ): Promise<StoredAdminTheme> {
    const tm = ThemeManager.getInstance();
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("ThemeManager DB not available");

    // Determine target theme
    let theme: Theme;
    if (themeId) {
      const themes: Theme[] = await db.system.themes.getAllThemes({
        tenantId: tenantId as unknown as DatabaseId,
      });
      const found = themes.find((t) => String(t._id) === themeId);
      if (!found) throw new Error(`Theme ${themeId} not found`);
      theme = found;
    } else {
      theme = await tm.getTheme(tenantId);
    }

    if (!theme) throw new Error("No theme found");

    if (settings.customCss) {
      settings.customCss = sanitizeCss(settings.customCss);
    }

    const existing = extractAdminTheme(theme);
    const merged: StoredAdminTheme = {
      ...buildDefaults(theme.name),
      ...existing,
      ...settings,
      name: settings.name || existing?.name || theme.name,
      updatedAt: new Date().toISOString(),
    } as StoredAdminTheme;

    const updatedConfig = {
      ...(theme.config as Record<string, unknown>),
      [ADMIN_THEME_KEY]: merged,
    };

    await db.system.themes.update(theme._id, { config: updatedConfig } as any);
    await tm.refresh();

    if (settings.name && settings.name !== theme.name) {
      await db.system.themes.update(theme._id, { name: settings.name } as any);
      await tm.refresh();
    }

    logger.info("Admin theme saved", { themeId: String(theme._id), tenantId });
    return merged;
  }

  /** Create a new theme with admin settings */
  async createTheme(
    name: string,
    settings?: Partial<StoredAdminTheme>,
    tenantId?: string | null,
  ): Promise<ThemeSummary> {
    const tm = ThemeManager.getInstance();
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("ThemeManager DB not available");

    const adminConfig = {
      ...buildDefaults(name),
      ...settings,
      name,
      updatedAt: new Date().toISOString(),
    };

    const result = await db.system.themes.install({
      _id: globalThis.crypto.randomUUID(),
      name,
      path: `/themes/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      isActive: false,
      isDefault: false,
      config: {
        assetsPath: "",
        tailwindConfigPath: "",
        [ADMIN_THEME_KEY]: adminConfig,
      },
      customCss: settings?.customCss,
    } as any);

    if (!result.success || !result.data) {
      throw new Error("Failed to create theme");
    }

    await tm.refresh();
    logger.info("Theme created", { name, tenantId });

    return {
      id: String(result.data._id),
      name,
      isActive: false,
      isDefault: false,
      density: adminConfig.density,
      variant: adminConfig.variant,
    };
  }

  /** Delete a theme (cannot delete the active/default theme) */
  async deleteTheme(themeId: string, tenantId?: string | null): Promise<void> {
    const tm = ThemeManager.getInstance();
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("ThemeManager DB not available");

    const themes: Theme[] = await db.system.themes.getAllThemes({
      tenantId: tenantId as unknown as DatabaseId,
    });
    const theme = themes.find((t) => String(t._id) === themeId);
    if (!theme) throw new Error("Theme not found");
    if (theme.isActive || theme.isDefault) {
      throw new Error("Cannot delete the active or default theme. Activate another theme first.");
    }

    await db.system.themes.uninstall(themeId as DatabaseId);
    await tm.refresh();
    logger.info("Theme deleted", { themeId, tenantId });
  }

  /** Activate a theme (deactivates others) */
  async activateTheme(themeId: string, tenantId?: string | null): Promise<StoredAdminTheme> {
    const tm = ThemeManager.getInstance();
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("ThemeManager DB not available");

    const themes: Theme[] = await db.system.themes.getAllThemes({
      tenantId: tenantId as unknown as DatabaseId,
    });
    const target = themes.find((t) => String(t._id) === themeId);
    if (!target) throw new Error("Theme not found");

    // Deactivate all, then activate target
    await db.system.themes.setDefault(themeId as DatabaseId);
    await tm.refresh();

    const admin = extractAdminTheme(target) || buildDefaults(target.name);
    logger.info("Theme activated", { themeId, name: target.name, tenantId });
    return admin;
  }

  /** Clone an existing theme */
  async cloneTheme(
    sourceId: string,
    newName: string,
    tenantId?: string | null,
  ): Promise<ThemeSummary> {
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("ThemeManager DB not available");

    const themes: Theme[] = await db.system.themes.getAllThemes({
      tenantId: tenantId as unknown as DatabaseId,
    });
    const source = themes.find((t) => String(t._id) === sourceId);
    if (!source) throw new Error("Source theme not found");

    const sourceAdmin = extractAdminTheme(source) || buildDefaults(source.name);

    return this.createTheme(newName, { ...sourceAdmin, name: newName }, tenantId);
  }

  // ═══════════════════════════════════════════════
  //  Presets
  // ═══════════════════════════════════════════════

  async importPreset(
    presetJson: string,
    tenantId?: string | null,
  ): Promise<{ theme: StoredAdminTheme; contrastWarnings: ContrastWarning[] }> {
    let preset: Record<string, unknown>;
    try {
      preset = JSON.parse(presetJson);
    } catch {
      throw new Error("Invalid JSON preset format.");
    }

    const mapped: Partial<StoredAdminTheme> = { presetSource: "imported" };

    const hasSkeletonCss =
      (typeof preset.css === "string" && isSkeletonCssExport(preset.css)) ||
      (typeof preset.code === "string" && isSkeletonCssExport(preset.code));

    if (isSkeletonPreset(preset) || hasSkeletonCss) {
      const skeleton = mapPresetToAdminTheme(preset);
      mapped.name = skeleton.name;
      if (skeleton.customCss) mapped.customCss = skeleton.customCss;
    } else if (preset.id && preset.density) {
      Object.assign(mapped, preset as Partial<StoredAdminTheme>);
    } else {
      throw new Error("Unrecognized preset format. Expected Skeleton.dev or SveltyCMS theme JSON.");
    }

    const contrastWarnings = auditPresetJson(presetJson);
    const theme = await this.saveAdminTheme(mapped, tenantId);
    return { theme, contrastWarnings };
  }

  async resetToDefaults(tenantId?: string | null): Promise<StoredAdminTheme> {
    return this.saveAdminTheme(buildDefaults("Default"), tenantId);
  }
}

export const adminThemeService = AdminThemeService.getInstance();
