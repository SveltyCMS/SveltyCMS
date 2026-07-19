/**
 * @file src/services/core/marketplace-service.ts
 * @description Marketplace integration for themes and widgets.
 *
 * Currently stubbed — the full marketplace integration is planned.
 * The appearance page references MarketplaceItem for type safety.
 */

import { adminThemeService } from "./admin-theme-service";

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  installed: boolean;
  type: "theme" | "widget" | "preset" | "plugin";
  previewUrl?: string;
  downloadUrl?: string;
  source?: string;
  price?: number;
  rating?: number;
  downloads?: number;
  createdAt?: string;
  updatedAt?: string;
  installable?: boolean;
  homepageUrl?: string;
}

export interface MarketplaceListResult {
  source: "local" | "remote";
  remoteAvailable: boolean;
  items: MarketplaceItem[];
}

export interface MarketplaceInstallResult {
  action: "created" | "updated";
  theme: { id: string; name: string };
}

export class MarketplaceService {
  async list({
    type,
    search,
  }: { type?: string; search?: string } = {}): Promise<MarketplaceListResult> {
    // In a real implementation, we'd fetch from a remote API.
    // For now, we return local built-in items.
    const items: MarketplaceItem[] = [];

    // Add local built-in themes from adminThemeService
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
      // Admin theme service not available - add defaults
      items.push({
        id: "1",
        name: "Default",
        description: "Default theme",
        version: "1.0.0",
        author: "SveltyCMS",
        installed: false,
        type: "theme",
        source: "local",
      });
    }

    // Add Default theme if not already present
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

    // Add Unified Data Hub plugin
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

    let filteredItems = items;
    if (type) {
      filteredItems = filteredItems.filter((i) => i.type === type);
    }
    if (search) {
      filteredItems = filteredItems.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()),
      );
    }

    return {
      source: "local",
      remoteAvailable: false,
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
