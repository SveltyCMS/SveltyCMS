/**
 * @file src/routes/(app)/dashboard/widgets/manifest-registry.ts
 * @description Compile-time registry of installed dashboard widget packages.
 *
 * Each dashboard widget lives in its own kebab-case folder under
 * `widgets/<folder>/` with a `widget.json` manifest (marketplace-portable
 * package). The co-located `readme.mdx` marketplace description is a
 * required package file, enforced by `scripts/check-dashboard-widget-packages.mjs`
 * (filesystem scan — MDX is not a Vite module type in the CMS build).
 *
 * ### Features:
 * - dashboard widget package enumeration (id, name, license, defaultSize, …)
 * - used by telemetry (extension inventory) and the marketplace catalog
 * - installed packages added on disk are picked up on the next build
 */

export type DashboardWidgetLicense = "free" | "freemium" | "paid";
export type DashboardWidgetCategory = "monitoring" | "logs" | "content" | "static";

export interface DashboardWidgetManifest {
  /** Stable package id (kebab-case folder name). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description shown in the widget picker / marketplace card. */
  description?: string;
  /** Iconify icon id. */
  icon: string;
  /** Semver package version. */
  version: string;
  /** Always "dashboard-widget" for dashboard packages. */
  type: "dashboard-widget";
  /** Package author (displayed in marketplace listings). */
  author: string;
  /** Monetization model — free | freemium (14-day trial) | paid. */
  license: DashboardWidgetLicense;
  /** Price in EUR for freemium/paid packages (0 for free). */
  price?: number;
  /** Component filename (without .svelte) — the stable registry key. */
  component: string;
  /** Recommended grid size. */
  defaultSize: { w: number; h: number };
  /** Widget category — powers default fetch/cache/refresh behavior. */
  category?: DashboardWidgetCategory;
}

// Compile-time discovery — Vite resolves this at build time.
const widgetManifestModules = import.meta.glob<{ default: DashboardWidgetManifest }>(
  "./*/widget.json",
  { eager: true },
);

/**
 * Returns all installed dashboard widget packages, sorted by display name.
 */
export function getInstalledDashboardWidgets(): DashboardWidgetManifest[] {
  return Object.values(widgetManifestModules)
    .map((mod) => mod.default)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the manifest for a single package (by folder id), or undefined.
 */
export function getDashboardWidgetManifest(id: string): DashboardWidgetManifest | undefined {
  return getInstalledDashboardWidgets().find((m) => m.id === id);
}
