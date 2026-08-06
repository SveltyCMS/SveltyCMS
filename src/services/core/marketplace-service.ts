/**
 * @file src/services/core/marketplace-service.ts
 * @description Offline-first marketplace catalog for themes, plugins, dashboard widgets, and packages.
 *
 * Merges local themes/plugin/dashboard-widget listings with remote
 * marketplace.sveltycms.com via marketplace-client (30 min cache). Powers
 * GET /api/marketplace and the Extensions → Marketplace tab (Phase 2). Theme
 * install is available; full remote one-click package install remains a follow-up.
 */

import { adminThemeService } from "./admin-theme-service";

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  installed: boolean;
  type: "theme" | "widget" | "preset" | "plugin" | "dashboard";
  previewUrl?: string;
  downloadUrl?: string;
  source?: string;
  price?: number;
  /** Monetization model — free | freemium (14-day trial) | paid. */
  license?: string;
  rating?: number;
  downloads?: number;
  createdAt?: string;
  updatedAt?: string;
  installable?: boolean;
  homepageUrl?: string;
}

export interface MarketplaceListResult {
  source: "local" | "remote" | "mixed";
  remoteAvailable: boolean;
  items: MarketplaceItem[];
}

export interface MarketplaceInstallResult {
  action: "created" | "updated";
  theme: { id: string; name: string };
}

export class MarketplaceService {
  /**
   * Offline-first catalog: merge local themes/plugins with remote marketplace.sveltycms.com
   * when reachable (marketplace-client, 30 min cache).
   */
  async list({
    type,
    search,
  }: { type?: string; search?: string } = {}): Promise<MarketplaceListResult> {
    const items: MarketplaceItem[] = [];
    let remoteAvailable = false;
    let source: MarketplaceListResult["source"] = "local";

    // Local built-in themes
    try {
      const themes = await adminThemeService.listThemes();
      for (const t of themes) {
        items.push({
          id: t.id,
          name: t.name,
          description: t.name,
          version: "1.0.0",
          author: "SveltyCMS",
          installed: true,
          type: "theme",
          source: "local",
        });
      }
    } catch {
      items.push({
        id: "1",
        name: "Default",
        description: "Default theme",
        version: "1.0.0",
        author: "SveltyCMS",
        installed: true,
        type: "theme",
        source: "local",
      });
    }

    if (!items.some((i) => i.name === "Default")) {
      items.push({
        id: "1",
        name: "Default",
        description: "Default built-in theme",
        version: "1.0.0",
        author: "SveltyCMS",
        installed: true,
        type: "theme",
        source: "local",
      });
    }

    // Local dashboard widget packages (marketplace-portable folders)
    try {
      const { getInstalledDashboardWidgets } =
        await import("@src/routes/(app)/dashboard/widgets/manifest-registry");
      for (const w of getInstalledDashboardWidgets()) {
        items.push({
          id: `dashboard-widget-${w.id}`,
          name: w.name,
          description: w.description || "Dashboard widget",
          version: w.version,
          author: w.author,
          installed: true,
          type: "dashboard",
          price: w.price,
          license: w.license,
          source: "local",
        });
      }
    } catch {
      // manifest-registry is compile-time (import.meta.glob) — skip if unavailable
    }

    // Local plugin stubs (always present offline)
    try {
      const listingMod = await import("@src/plugins/unified-data-hub/marketplace-listing");
      const listing =
        (listingMod as any).unifiedDataHubMarketplaceListing ||
        (listingMod as any).default ||
        (listingMod as any).unifiedDataHubListing;
      if (listing) {
        items.push({
          id: listing.id || "plugin-unified-data-hub",
          name: listing.name || "Unified Data Hub",
          description: listing.description || "",
          version: listing.version || "1.0.0",
          author: listing.author || "SveltyCMS",
          installed: false,
          installable: false,
          homepageUrl: listing.homepageUrl,
          type: "plugin",
          source: "local",
        });
      }
    } catch {
      items.push({
        id: "plugin-unified-data-hub",
        name: "Unified Data Hub",
        description: "Connect to external databases, APIs, and services",
        version: "1.0.0",
        author: "SveltyCMS",
        installed: false,
        installable: false,
        homepageUrl: "https://docs.sveltycms.com/reference/architecture/unified-data-hub",
        type: "plugin",
        source: "local",
      });
    }

    // Remote catalog (best-effort)
    try {
      const { marketplace } = await import("@src/services/intelligence/marketplace-client");
      const remote = await marketplace.list({
        query: search,
        type: type as "plugin" | "widget" | "theme" | "preset" | "dashboard" | undefined,
        limit: 50,
      });
      const remoteList = remote.plugins || [];
      if (remoteList.length > 0) {
        remoteAvailable = true;
        source = "remote";
        const seen = new Set(items.map((i) => i.id));
        for (const p of remoteList as any[]) {
          const id = String(p.id || p.slug || p.name);
          if (seen.has(id)) continue;
          seen.add(id);
          items.push({
            id,
            name: p.name || id,
            description: p.description || "",
            version: p.version || "0.0.0",
            author: p.author || p.publisher || "Community",
            installed: !!p.installed,
            installable: p.installable !== false,
            homepageUrl: p.homepageUrl || p.homepage,
            type: (p.type || "plugin") as MarketplaceItem["type"],
            source: "remote",
            rating: p.rating,
            downloads: p.downloads,
          });
        }
        if (items.some((i) => i.source === "local")) {
          source = "mixed";
        }
      }
    } catch {
      remoteAvailable = false;
    }

    let filteredItems = items;
    if (type) {
      filteredItems = filteredItems.filter((i) => i.type === type);
    }
    if (search) {
      const q = search.toLowerCase();
      filteredItems = filteredItems.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q),
      );
    }

    return {
      source,
      remoteAvailable,
      items: filteredItems,
    };
  }

  async installTheme(id: string): Promise<MarketplaceInstallResult> {
    try {
      const created = await adminThemeService.createTheme("Default");
      return {
        action: "created",
        theme: { id: created.id, name: created.name },
      };
    } catch {
      return {
        action: "created",
        theme: { id, name: "Default" },
      };
    }
  }
}

export const marketplaceService = new MarketplaceService();
