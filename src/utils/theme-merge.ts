/**
 * @file src/utils/theme-merge.ts
 * @description Hardened theme merging utility.
 *
 * ### Hardening (audit 2026-07):
 * - Deep merge: deepMerge replaces Object.assign for nested LayoutState/features
 * - CSS sanitization: blocks expression() and javascript: in custom CSS
 * - Immutability: returns new objects, no mutation of input arguments
 * - Nullish coalescing: ?? ensures false/0 aren't treated as undefined
 *
 * Merge tenant admin theme defaults with per-user preferences and locked settings.
 * Also resolves login-page branding (logo, accent, site name) from tenant admin theme config.
 */

import {
  DEFAULT_THEME_FEATURES,
  type LayoutState,
  type ThemeFeatures,
} from "@components/ui/theme-context.svelte";

export type AdminDensity = "compact" | "cozy" | "spacious";
export type AdminVariant = "flat" | "bordered" | "elevated";

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

export interface LoginBranding {
  siteName: string;
  brandedLogin: boolean;
  customCss?: string;
  variant?: AdminVariant;
  themeName?: string;
  logoUrl?: string;
  accentColor?: string;
}

/** Check if a specific preference is locked by admin settings */
export function isPreferenceLocked(
  locked: AdminLockedSettings | undefined | null,
  key: keyof AdminLockedSettings,
): boolean {
  return locked?.[key] === true;
}

/**
 * Deep merge helper to prevent shallow-copy issues
 * when merging complex LayoutState objects.
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T> | undefined): T {
  if (!source) return target;
  const output = { ...target };
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null && key in target) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key] as any;
    }
  }
  return output;
}

/** 🛡️ Filters custom CSS input to prevent simple style injection */
function sanitizeCss(css?: string): string | undefined {
  if (!css) return undefined;
  if (css.includes("expression(") || css.includes("javascript:")) return undefined;
  return css;
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

  // Use deep merge for nested layoutRegions to prevent clobbering defaults
  const features: ThemeFeatures = deepMerge(DEFAULT_THEME_FEATURES, tenantConfig?.features);

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

  return {
    density: !locked.density && userPrefs?.density ? userPrefs.density : base.density,
    variant: !locked.variant && userPrefs?.variant ? userPrefs.variant : base.variant,
    features: {
      ...base.features,
      reducedMotion:
        !locked.reducedMotion && userPrefs?.reducedMotion !== undefined
          ? userPrefs.reducedMotion
          : base.features.reducedMotion,
      highContrastMode:
        !locked.highContrast && userPrefs?.highContrast !== undefined
          ? userPrefs.highContrast
          : base.features.highContrastMode,
    },
    layoutState:
      !locked.layoutState && userPrefs?.layoutState
        ? deepMerge(base.layoutState, userPrefs.layoutState)
        : base.layoutState,
  };
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
    customCss: brandedLogin ? sanitizeCss(adminTheme?.customCss) : undefined,
    variant: brandedLogin ? adminTheme?.variant : undefined,
    themeName: brandedLogin ? adminTheme?.themeName || adminTheme?.name : undefined,
    logoUrl: brandedLogin ? (tenantAssets?.logoUrl ?? undefined) : undefined,
    accentColor: brandedLogin ? (tenantAssets?.accentColor ?? undefined) : undefined,
  };
}
