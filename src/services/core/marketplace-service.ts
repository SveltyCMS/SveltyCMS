/**
 * @file src/services/core/marketplace-service.ts
 * @description Offline-first marketplace catalog for themes, plugins, dashboard widgets, and packages.
 *
 * Merges local themes/plugin/dashboard-widget listings with remote
 * marketplace.sveltycms.com via marketplace-client (30 min cache). Powers
 * GET /api/marketplace and the Extensions → Marketplace tab (Phase 2).
 * Remote packages install via checksum-verified `install()`; themes use
 * `installTheme()`.
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
  theme?: { id: string; name: string };
  package?: { id: string; name: string; version: string; installPath: string; type: string };
  checksum?: string;
  licenseRequired?: boolean;
  checkoutUrl?: string;
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
        limit: 100,
      });
      const remoteList = remote.plugins || [];
      if (remoteList.length > 0) {
        remoteAvailable = true;
        source = "remote";

        // Collect locally installed identifiers
        const localInstalledKeys = new Set<string>();
        for (const item of items) {
          if (item.installed) {
            localInstalledKeys.add(item.id.toLowerCase());
            localInstalledKeys.add(
              item.id.toLowerCase().replace(/^(dashboard-widget-|widget-|plugin-|theme-)/, ""),
            );
          }
        }

        // Also check installed plugins from registry
        try {
          const { availablePlugins } = await import("@src/plugins");
          for (const p of availablePlugins) {
            const pid = p.metadata.id.toLowerCase();
            localInstalledKeys.add(pid);
            localInstalledKeys.add(`plugin-${pid}`);
          }
        } catch {}

        // Also check installed custom widgets
        const customWidgets = [
          "ai-enrichment",
          "audio-player",
          "code-editor",
          "color-picker",
          "country-select",
          "currency",
          "custom-dropdown",
          "date-range-picker",
          "file-upload",
          "geolocation",
          "icon-picker",
          "json-editor",
          "markdown-editor",
          "phone-number",
          "rating",
          "remote-video",
          "seo",
        ];
        for (const cw of customWidgets) {
          localInstalledKeys.add(cw);
          localInstalledKeys.add(`widget-${cw}`);
        }

        // Replace local stubs with rich remote items
        const remoteItems: MarketplaceItem[] = [];
        const remoteIds = new Set<string>();

        for (const p of remoteList as any[]) {
          const id = String(p.id || p.slug || p.name);
          const slug = String(p.slug || "").toLowerCase();
          const cleanId = id
            .toLowerCase()
            .replace(/^(dashboard-widget-|widget-|plugin-|theme-)/, "");
          const cleanSlug = slug.replace(/^(dashboard-widget-|widget-|plugin-|theme-)/, "");

          if (remoteIds.has(id)) continue;
          remoteIds.add(id);

          const isInstalled =
            !!p.installed ||
            localInstalledKeys.has(id.toLowerCase()) ||
            localInstalledKeys.has(cleanId) ||
            (slug ? localInstalledKeys.has(slug) || localInstalledKeys.has(cleanSlug) : false);

          const name =
            typeof p.displayName === "object"
              ? p.displayName?.en || Object.values(p.displayName)[0] || p.name || id
              : p.displayName || p.name || id;

          const description =
            typeof p.description === "object"
              ? p.description?.en || Object.values(p.description)[0] || ""
              : p.description || "";

          const normalizedType = p.type === "dashboard-widget" ? "dashboard" : p.type || "plugin";

          remoteItems.push({
            id,
            name: String(name),
            description: String(description),
            version: p.version || "0.0.0",
            author: p.author || p.publisher || "SveltyCMS",
            installed: isInstalled,
            installable: !isInstalled && p.installable !== false,
            homepageUrl: p.homepageUrl || p.homepage,
            type: normalizedType as MarketplaceItem["type"],
            source: "remote",
            rating: typeof p.avgRating === "string" ? parseFloat(p.avgRating) : p.rating,
            downloads: p.downloadCount ?? p.downloads,
            price: p.pricingType === "free" ? 0 : p.priceCents ? p.priceCents / 100 : p.price,
            license: p.licenseLabel || p.pricingType || p.license,
          });
        }

        // Keep local-only items that were not present in remote catalog
        const remoteCleanIds = new Set(
          remoteItems.map((r) =>
            r.id.toLowerCase().replace(/^(dashboard-widget-|widget-|plugin-|theme-)/, ""),
          ),
        );
        for (const localItem of items) {
          const localCleanId = localItem.id
            .toLowerCase()
            .replace(/^(dashboard-widget-|widget-|plugin-|theme-)/, "");
          if (!remoteCleanIds.has(localCleanId) && !remoteIds.has(localItem.id)) {
            remoteItems.push(localItem);
          }
        }

        items.length = 0;
        items.push(...remoteItems);
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

  /**
   * One-click install: themes go through adminThemeService; remote packages
   * download with checksum verification and path allowlisting.
   */
  async install(
    id: string,
    options: { type?: MarketplaceItem["type"]; licenseKey?: string; checksum?: string } = {},
  ): Promise<MarketplaceInstallResult> {
    if (options.type === "theme" || (!options.type && id === "1")) {
      return this.installTheme(id);
    }

    const { installPlugin, hashPackageFiles } =
      await import("@src/services/intelligence/marketplace-install.server");
    const { setLicenseKey } = await import("@src/services/intelligence/marketplace-client");
    if (options.licenseKey) setLicenseKey(options.licenseKey);

    try {
      const plugin = await installPlugin(id, {
        licenseKey: options.licenseKey,
        expectedChecksum: options.checksum,
      });
      const checksum = plugin.files ? await hashPackageFiles(plugin.files) : undefined;
      return {
        action: "created",
        package: {
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          installPath: plugin.installPath,
          type: plugin.type,
        },
        checksum,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/license required/i.test(message)) {
        return {
          action: "created",
          licenseRequired: true,
          checkoutUrl: `https://marketplace.sveltycms.com/checkout?package=${encodeURIComponent(id)}`,
          package: {
            id,
            name: id,
            version: "0.0.0",
            installPath: "",
            type: options.type || "plugin",
          },
        };
      }
      throw err;
    }
  }
}

export const marketplaceService = new MarketplaceService();
