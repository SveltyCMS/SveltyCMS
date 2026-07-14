/**
 * @file src/utils/theme-merge.ts
 * @description Merge tenant admin theme defaults with per-user preferences and locked settings.
 * Also resolves login-page branding (logo, accent, site name) from tenant admin theme config.
 *
 * ### Features:
 * - Role-based density fallbacks
 * - User preference overlay with admin lock enforcement
 * - Login branding resolution for unauthenticated routes (see `resolveLoginBranding`)
 */

import {
  DEFAULT_THEME_FEATURES,
  type LayoutState,
  type ThemeFeatures,
} from "@components/ui/theme-context.svelte";

export type AdminDensity = "compact" | "cozy" | "spacious";
export type AdminVariant = "flat" | "bordered" | "elevated";

/** Admin-controlled locks — when true, users cannot override that setting */
export interface AdminLockedSettings {
  density?: boolean;
  variant?: boolean;
  reducedMotion?: boolean;
  highContrast?: boolean;
  layoutState?: boolean;
}

export interface TenantAdminThemeConfig {
  density?: AdminDensity;
  variant?: AdminVariant;
  features?: Partial<ThemeFeatures>;
  layoutState?: Partial<LayoutState>;
  customCss?: string;
  lockedSettings?: AdminLockedSettings;
  themeName?: string;
  name?: string;
}

export interface UserThemePreferences {
  density?: AdminDensity;
  variant?: AdminVariant;
  reducedMotion?: boolean;
  highContrast?: boolean;
  layoutState?: Record<string, "full" | "hidden">;
}

export interface MergedAdminTheme {
  density: AdminDensity;
  variant: AdminVariant;
  features: ThemeFeatures;
  layoutState: Partial<LayoutState>;
}

/** Check if a specific preference is locked by admin settings */
export function isPreferenceLocked(
  locked: AdminLockedSettings | undefined | null,
  key: keyof AdminLockedSettings,
): boolean {
  return locked?.[key] === true;
}

export interface LoginBranding {
  siteName: string;
  brandedLogin: boolean;
  customCss?: string;
  variant?: AdminVariant;
  themeName?: string;
  logoUrl?: string;
  accentColor?: string;
}

export function getRoleBasedDensity(role: string): AdminDensity {
  if (role === "admin" || role === "manager") return "spacious";
  if (role === "translator") return "compact";
  return "cozy";
}

export function buildTenantThemeDefaults(
  tenantConfig: TenantAdminThemeConfig | null | undefined,
  role: string,
): MergedAdminTheme {
  const density = tenantConfig?.density ?? getRoleBasedDensity(role);
  const variant = tenantConfig?.variant ?? "bordered";
  const features: ThemeFeatures = {
    ...DEFAULT_THEME_FEATURES,
    ...tenantConfig?.features,
    layoutRegions: {
      ...DEFAULT_THEME_FEATURES.layoutRegions!,
      ...tenantConfig?.features?.layoutRegions,
    },
  };

  return {
    density,
    variant,
    features,
    layoutState: { ...tenantConfig?.layoutState },
  };
}

/** Merge user preferences on top of tenant theme; locked settings block user overrides */
export function mergeAdminThemeWithUserPrefs(
  tenantConfig: TenantAdminThemeConfig | null | undefined,
  userPrefs: UserThemePreferences | null | undefined,
  role: string,
): MergedAdminTheme {
  const base = buildTenantThemeDefaults(tenantConfig, role);
  const locked = tenantConfig?.lockedSettings ?? {};

  let density = base.density;
  let variant = base.variant;
  const features = { ...base.features };
  const layoutState = { ...base.layoutState };

  if (userPrefs?.density && !locked.density) {
    density = userPrefs.density;
  }
  if (userPrefs?.variant && !locked.variant) {
    variant = userPrefs.variant;
  }
  if (userPrefs?.reducedMotion !== undefined && !locked.reducedMotion) {
    features.reducedMotion = userPrefs.reducedMotion;
  }
  if (userPrefs?.highContrast !== undefined && !locked.highContrast) {
    features.highContrastMode = userPrefs.highContrast;
  }
  if (userPrefs?.layoutState && !locked.layoutState) {
    Object.assign(layoutState, userPrefs.layoutState);
  }

  return { density, variant, features, layoutState };
}

/** Resolve login-page branding from tenant admin theme + site name */
export function resolveLoginBranding(
  adminTheme: TenantAdminThemeConfig | null | undefined,
  siteName: string,
  tenantAssets?: { logoUrl?: string | null; accentColor?: string | null },
): LoginBranding {
  const brandedLogin = adminTheme?.features?.brandedLogin ?? false;
  return {
    siteName: siteName || "SveltyCMS",
    brandedLogin,
    customCss: brandedLogin ? adminTheme?.customCss : undefined,
    variant: brandedLogin ? adminTheme?.variant : undefined,
    themeName: brandedLogin ? adminTheme?.themeName || adminTheme?.name : undefined,
    logoUrl: brandedLogin ? tenantAssets?.logoUrl || undefined : undefined,
    accentColor: brandedLogin ? tenantAssets?.accentColor || undefined : undefined,
  };
}
