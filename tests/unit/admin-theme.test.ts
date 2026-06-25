/**
 * @vitest-environment node
 * @file tests/unit/admin-theme.test.ts
 * @description White-box unit tests for AdminTheme class, merge strategy, derived values, and SSR component propagation.
 *
 * Tests:
 * - AdminTheme constructor defaults
 * - Density/variant getters and setters
 * - Derived values (densityScale, cardShadow, cardBorder, radii)
 * - Features merge (DEFAULT_THEME_FEATURES)
 * - User preferences merge on top of tenant theme
 * - CSS sanitization
 * - SSR component rendering with theme variable propagation
 */

import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import {
  AdminTheme,
  DEFAULT_THEME_FEATURES,
  type ThemeConfig,
} from "../../src/components/ui/theme-context.svelte";
import ThemeTestWrapper from "./components/ui/ThemeTestWrapper.svelte";
import {
  mergeAdminThemeWithUserPrefs,
  resolveLoginBranding,
  getRoleBasedDensity,
  isPreferenceLocked,
} from "../../src/utils/theme-merge";

// ─── AdminTheme Class ───

describe("AdminTheme", () => {
  it("should initialize with cozy/bordered defaults", () => {
    const theme = new AdminTheme();
    expect(theme.density).toBe("cozy");
    expect(theme.variant).toBe("bordered");
    expect(theme.accentMode).toBe("default");
    expect(theme.role).toBe("admin");
  });

  it("should initialize from partial config", () => {
    const theme = new AdminTheme({ density: "compact", variant: "flat" });
    expect(theme.density).toBe("compact");
    expect(theme.variant).toBe("flat");
  });

  it("should derive correct densityScale", () => {
    expect(new AdminTheme({ density: "compact" }).densityScale).toBe(0.85);
    expect(new AdminTheme({ density: "cozy" }).densityScale).toBe(1.0);
    expect(new AdminTheme({ density: "spacious" }).densityScale).toBe(1.25);
  });

  it("should derive correct spacingScale", () => {
    expect(new AdminTheme({ density: "compact" }).spacingScale).toBe(0.8);
    expect(new AdminTheme({ density: "cozy" }).spacingScale).toBe(1.0);
    expect(new AdminTheme({ density: "spacious" }).spacingScale).toBe(1.2);
  });

  it("should derive correct sidebarWidth per density", () => {
    expect(new AdminTheme({ density: "compact" }).sidebarWidth).toBe("200px");
    expect(new AdminTheme({ density: "cozy" }).sidebarWidth).toBe("240px");
    expect(new AdminTheme({ density: "spacious" }).sidebarWidth).toBe("300px");
  });

  it("should derive correct headerHeight per density", () => {
    expect(new AdminTheme({ density: "compact" }).headerHeight).toBe("48px");
    expect(new AdminTheme({ density: "cozy" }).headerHeight).toBe("64px");
    expect(new AdminTheme({ density: "spacious" }).headerHeight).toBe("72px");
  });

  it("should derive correct stickyBarHeight per density", () => {
    expect(new AdminTheme({ density: "compact" }).stickyBarHeight).toBe("44px");
    expect(new AdminTheme({ density: "cozy" }).stickyBarHeight).toBe("56px");
    expect(new AdminTheme({ density: "spacious" }).stickyBarHeight).toBe("64px");
  });

  it("should derive correct cardShadow per variant", () => {
    const flat = new AdminTheme({ variant: "flat" });
    const bordered = new AdminTheme({ variant: "bordered" });
    const elevated = new AdminTheme({ variant: "elevated" });

    expect(flat.cardShadow).toBe("none");
    expect(bordered.cardShadow).toContain("var(--admin-shadow-elevation");
    expect(elevated.cardShadow).toContain("var(--admin-shadow-elevated");
  });

  it("should derive correct cardBorder per variant", () => {
    expect(new AdminTheme({ variant: "flat" }).cardBorder).toBe("0");
    expect(new AdminTheme({ variant: "bordered" }).cardBorder).toContain(
      "var(--admin-border-width",
    );
  });

  it("should derive correct radii per density", () => {
    const compact = new AdminTheme({ density: "compact" });
    const cozy = new AdminTheme({ density: "cozy" });
    const spacious = new AdminTheme({ density: "spacious" });

    expect(compact.radiusCard).toBe("6px");
    expect(cozy.radiusCard).toBe("0.75rem");
    expect(spacious.radiusCard).toBe("16px");

    expect(compact.radiusInput).toBe("4px");
    expect(cozy.radiusInput).toBe("0.375rem");
    expect(spacious.radiusInput).toBe("10px");

    expect(compact.radiusButton).toBe("0.125rem");
    expect(cozy.radiusButton).toBe("0.25rem");
    expect(spacious.radiusButton).toBe("0.625rem");
  });

  it("should default features to DEFAULT_THEME_FEATURES", () => {
    const theme = new AdminTheme();
    expect(theme.features.stickyActionBar).toBe(false);
    expect(theme.features.collapsibleSidebar).toBe(false);
    expect(theme.features.reducedMotion).toBe(false);
    expect(theme.features.layoutRegions?.collections).toBe("left");
  });

  it("should merge features with defaults", () => {
    const theme = new AdminTheme({
      features: { stickyActionBar: true, reducedMotion: true },
    } as Partial<ThemeConfig>);
    expect(theme.features.stickyActionBar).toBe(true);
    expect(theme.features.reducedMotion).toBe(true);
    expect(theme.features.collapsibleSidebar).toBe(false); // default preserved
  });
});

// ─── DEFAULT_THEME_FEATURES ───

describe("DEFAULT_THEME_FEATURES", () => {
  it("should have all required feature flags", () => {
    expect(DEFAULT_THEME_FEATURES).toHaveProperty("stickyActionBar");
    expect(DEFAULT_THEME_FEATURES).toHaveProperty("collapsibleSidebar");
    expect(DEFAULT_THEME_FEATURES).toHaveProperty("brandedLogin");
    expect(DEFAULT_THEME_FEATURES).toHaveProperty("highContrastMode");
    expect(DEFAULT_THEME_FEATURES).toHaveProperty("reducedMotion");
    expect(DEFAULT_THEME_FEATURES).toHaveProperty("layoutRegions");
  });

  it("should default layoutRegions.collections to left", () => {
    expect(DEFAULT_THEME_FEATURES.layoutRegions?.collections).toBe("left");
    expect(DEFAULT_THEME_FEATURES.layoutRegions?.mediaGalleries).toBe("left");
  });
});

// ─── User Preferences Merge Strategy ───

describe("theme-merge utilities", () => {
  it("getRoleBasedDensity returns role-appropriate defaults", () => {
    expect(getRoleBasedDensity("admin")).toBe("spacious");
    expect(getRoleBasedDensity("translator")).toBe("compact");
    expect(getRoleBasedDensity("editor")).toBe("cozy");
  });

  it("mergeAdminThemeWithUserPrefs applies user density and variant", () => {
    const merged = mergeAdminThemeWithUserPrefs(
      { density: "cozy", variant: "bordered" },
      { density: "compact", variant: "elevated" },
      "editor",
    );
    expect(merged.density).toBe("compact");
    expect(merged.variant).toBe("elevated");
  });

  it("mergeAdminThemeWithUserPrefs respects locked settings", () => {
    const merged = mergeAdminThemeWithUserPrefs(
      { density: "cozy", lockedSettings: { density: true, variant: true } },
      { density: "compact", variant: "flat" },
      "editor",
    );
    expect(merged.density).toBe("cozy");
    expect(merged.variant).toBe("bordered");
  });

  it("mergeAdminThemeWithUserPrefs applies accessibility overrides when unlocked", () => {
    const merged = mergeAdminThemeWithUserPrefs(
      { features: { reducedMotion: false, highContrastMode: false } },
      { reducedMotion: true, highContrast: true },
      "editor",
    );
    expect(merged.features.reducedMotion).toBe(true);
    expect(merged.features.highContrastMode).toBe(true);
  });

  it("mergeAdminThemeWithUserPrefs clears accessibility overrides when explicitly false", () => {
    const merged = mergeAdminThemeWithUserPrefs(
      { features: { reducedMotion: true, highContrastMode: true } },
      { reducedMotion: false, highContrast: false },
      "editor",
    );
    expect(merged.features.reducedMotion).toBe(false);
    expect(merged.features.highContrastMode).toBe(false);
  });

  it("mergeAdminThemeWithUserPrefs merges layoutState when unlocked", () => {
    const merged = mergeAdminThemeWithUserPrefs(
      { layoutState: { leftSidebar: "full", rightSidebar: "hidden" } },
      { layoutState: { rightSidebar: "full" } },
      "editor",
    );
    expect(merged.layoutState.leftSidebar).toBe("full");
    expect(merged.layoutState.rightSidebar).toBe("full");
  });

  it("isPreferenceLocked returns true only when lock flag is set", () => {
    expect(isPreferenceLocked({ density: true }, "density")).toBe(true);
    expect(isPreferenceLocked({ density: true }, "variant")).toBe(false);
  });

  it("resolveLoginBranding exposes tenant site name when branded login is on", () => {
    const branding = resolveLoginBranding(
      {
        features: { brandedLogin: true },
        variant: "elevated",
        customCss: ".x {}",
      },
      "Acme CMS",
    );
    expect(branding.siteName).toBe("Acme CMS");
    expect(branding.brandedLogin).toBe(true);
    expect(branding.variant).toBe("elevated");
    expect(branding.customCss).toBe(".x {}");
  });

  it("resolveLoginBranding omits custom CSS when branded login is off", () => {
    const branding = resolveLoginBranding(
      { features: { brandedLogin: false }, customCss: ".x {}" },
      "SveltyCMS",
    );
    expect(branding.brandedLogin).toBe(false);
    expect(branding.customCss).toBeUndefined();
  });
});

// ─── CSS Sanitization (from admin-theme-service) ───

describe("CSS sanitization", () => {
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

  it("should strip url() references", () => {
    expect(sanitizeCss("background: url('http://evil.com')")).toBe("background: url()");
  });

  it("should strip @import directives", () => {
    expect(sanitizeCss("@import url('bad.css');")).toContain("/* blocked */");
  });

  it("should strip javascript: URIs", () => {
    expect(sanitizeCss("behavior: javascript:alert(1)")).toContain("/* blocked */");
  });

  it("should strip script tags", () => {
    expect(sanitizeCss("<script>alert(1)</script>body { color: red; }")).toBe(
      "body { color: red; }",
    );
  });

  it("should strip HTML tags", () => {
    expect(sanitizeCss("<div>body { color: red; }</div>")).toBe("body { color: red; }");
  });

  it("should pass safe CSS unchanged", () => {
    const safe = ".header { color: oklch(65% 0.2 260deg); }";
    expect(sanitizeCss(safe)).toBe(safe);
  });
});

// ─── SSR Component Propagation ───

describe("AdminTheme SSR propagation", () => {
  it("propagates compact density variables to Button, Card, Input, and Badge", () => {
    const { body } = render(ThemeTestWrapper, {
      props: { density: "compact", role: "translator" },
    });

    // Button scaling and styling
    expect(body).toContain("height: 32px;");
    expect(body).toContain("padding-inline-start: 12.8px;");
    expect(body).toContain("padding-inline-end: 12.8px;");
    expect(body).toContain("gap: 6.4px;");
    expect(body).toContain("border-radius: var(--admin-radius-button, 0.25rem);");

    // Card styling
    expect(body).toContain("border-radius: var(--admin-radius-card, 0.75rem);");
    expect(body).toContain("border-width: var(--admin-border-width, 1px);");
    expect(body).toContain("box-shadow: var(--admin-shadow-elevation");

    // Input scaling
    expect(body).toContain("padding-inline-start: 9.6px;");
    expect(body).toContain("padding-inline-end: 9.6px;");
    expect(body).toContain("padding-top: 6.4px;");
    expect(body).toContain("padding-bottom: 6.4px;");

    // Badge styling
    expect(body).toContain("border-radius: var(--admin-radius-input, 6px);");
  });

  it("propagates spacious density variables to components", () => {
    const { body } = render(ThemeTestWrapper, {
      props: { density: "spacious", role: "admin" },
    });

    // Button scaling (height = 40 * 1.2 = 48px, px = 16 * 1.2 = 19.2px)
    expect(body).toContain("height: 48px;");
    expect(body).toContain("padding-inline-start: 19.2px;");
    expect(body).toContain("padding-inline-end: 19.2px;");
    expect(body).toContain("gap: 9.6px;");

    // Input scaling (height = 40 * 1.2 = 48px, px = 12 * 1.2 = 14.4px)
    expect(body).toContain("padding-inline-start: 14.4px;");
    expect(body).toContain("padding-inline-end: 14.4px;");
  });
});
