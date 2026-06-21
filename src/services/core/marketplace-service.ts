/**
 * @file src/services/core/marketplace-service.ts
 * @description Marketplace proxy for themes, widgets, and plugins.
 *
 * Fetches catalog items from marketplace.sveltycms.com when available.
 * Falls back to local `/src/themes/*.json` builtins when the remote API is offline.
 *
 * ### Features:
 * - remote catalog proxy with timeout
 * - local theme fallback catalog
 * - install admin themes from marketplace items
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@utils/logger";
import {
  THEMES_DIR,
  importThemeFromJson,
  parseThemeFileContent,
  type ThemeFilePayload,
} from "./theme-file-sync";
import type { ThemeSummary } from "./admin-theme-service";

export type MarketplaceItemType = "theme" | "widget" | "plugin";

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  type: MarketplaceItemType;
  category: string;
  version: string;
  author: string;
  source: "remote" | "local";
  installable: boolean;
  installed?: boolean;
  previewUrl?: string;
  homepageUrl?: string;
  themeConfig?: ThemeFilePayload;
}

export interface MarketplaceListResult {
  items: MarketplaceItem[];
  total: number;
  source: "remote" | "local" | "mixed";
  remoteAvailable: boolean;
}

export interface MarketplaceListParams {
  type?: MarketplaceItemType;
  search?: string;
  category?: string;
  tenantId?: string | null;
}

const DEFAULT_BASE_URL = "https://marketplace.sveltycms.com";
const FETCH_TIMEOUT_MS = 8_000;

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function matchesQuery(item: MarketplaceItem, params: MarketplaceListParams): boolean {
  if (params.type && item.type !== params.type) return false;
  if (params.category && item.category.toLowerCase() !== params.category.toLowerCase()) {
    return false;
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    const haystack = `${item.name} ${item.description} ${item.category}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function loadLocalThemeCatalog(): MarketplaceItem[] {
  if (!existsSync(THEMES_DIR)) return [];

  const items = readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      try {
        const raw = readFileSync(join(THEMES_DIR, file), "utf-8");
        const theme = parseThemeFileContent(raw, file);
        const slug = slugify(theme.name);
        return {
          id: `local-theme-${slug}`,
          name: theme.name,
          description:
            (theme as { description?: string }).description || "SveltyCMS built-in admin theme",
          type: "theme" as const,
          category: "admin",
          version: "1.0.0",
          author: "SveltyCMS",
          source: "local" as const,
          installable: true,
          previewUrl: undefined,
          homepageUrl: "https://marketplace.sveltycms.com",
          themeConfig: theme,
        };
      } catch (err) {
        logger.warn(`[Marketplace] Skipping invalid theme file ${file}:`, err);
        return null;
      }
    })
    .filter((item) => item !== null) as MarketplaceItem[];
  return items;
}

async function fetchRemoteCatalog(
  params: MarketplaceListParams,
): Promise<MarketplaceItem[] | null> {
  const baseUrl = (process.env.MARKETPLACE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);

  const url = `${baseUrl}/api/v1/marketplace${query.size ? `?${query}` : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const body = await res.json();
    const rawItems = Array.isArray(body)
      ? body
      : Array.isArray(body?.items)
        ? body.items
        : Array.isArray(body?.data?.items)
          ? body.data.items
          : [];

    return rawItems
      .map((item: Record<string, unknown>) => normalizeRemoteItem(item))
      .filter((item: MarketplaceItem | null): item is MarketplaceItem => item !== null);
  } catch (err) {
    logger.debug("[Marketplace] Remote catalog unavailable:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRemoteItem(raw: Record<string, unknown>): MarketplaceItem | null {
  const name = typeof raw.name === "string" ? raw.name : null;
  const id = typeof raw.id === "string" ? raw.id : name ? `remote-${slugify(name)}` : null;
  const type = raw.type;
  if (!id || !name || (type !== "theme" && type !== "widget" && type !== "plugin")) {
    return null;
  }

  return {
    id,
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    type,
    category: typeof raw.category === "string" ? raw.category : "general",
    version: typeof raw.version === "string" ? raw.version : "1.0.0",
    author: typeof raw.author === "string" ? raw.author : "SveltyCMS Marketplace",
    source: "remote",
    installable: raw.installable !== false,
    previewUrl: typeof raw.previewUrl === "string" ? raw.previewUrl : undefined,
    homepageUrl: typeof raw.homepageUrl === "string" ? raw.homepageUrl : undefined,
    themeConfig:
      raw.themeConfig && typeof raw.themeConfig === "object"
        ? (raw.themeConfig as ThemeFilePayload)
        : undefined,
  };
}

export class MarketplaceService {
  private static instance: MarketplaceService;

  public static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) {
      MarketplaceService.instance = new MarketplaceService();
    }
    return MarketplaceService.instance;
  }

  async list(params: MarketplaceListParams = {}): Promise<MarketplaceListResult> {
    const localItems = loadLocalThemeCatalog();
    const remoteItems = await fetchRemoteCatalog(params);

    let items: MarketplaceItem[];
    let source: MarketplaceListResult["source"];
    const remoteAvailable = remoteItems !== null;

    if (remoteItems && remoteItems.length > 0) {
      const merged = new Map<string, MarketplaceItem>();
      for (const item of remoteItems) merged.set(item.id, item);
      for (const item of localItems) {
        if (!merged.has(item.id)) merged.set(item.id, item);
      }
      items = [...merged.values()];
      source = localItems.length > 0 ? "mixed" : "remote";
    } else {
      items = localItems;
      source = "local";
    }

    items = items.filter((item) => matchesQuery(item, params));

    if (params.tenantId !== undefined) {
      const installed = await this.getInstalledThemeNames(params.tenantId);
      items = items.map((item) =>
        item.type === "theme"
          ? {
              ...item,
              installed: installed.has(item.name) || installed.has(item.themeConfig?.name || ""),
            }
          : item,
      );
    }

    return { items, total: items.length, source, remoteAvailable };
  }

  private async getInstalledThemeNames(tenantId?: string | null): Promise<Set<string>> {
    const { adminThemeService } = await import("./admin-theme-service");
    const themes = await adminThemeService.listThemes(tenantId);
    return new Set(themes.map((t: ThemeSummary) => t.name));
  }

  async installTheme(
    itemId: string,
    tenantId?: string | null,
  ): Promise<{ theme: ThemeSummary; action: "created" | "updated" }> {
    const catalog = await this.list({ type: "theme", tenantId });
    const item = catalog.items.find((i) => i.id === itemId && i.type === "theme");
    if (!item) throw new Error(`Marketplace theme "${itemId}" not found`);
    if (!item.installable) throw new Error(`Theme "${item.name}" is not installable`);

    let themeConfig = item.themeConfig;
    if (!themeConfig && item.source === "local" && item.id.startsWith("local-theme-")) {
      const slug = item.id.replace("local-theme-", "");
      const file = readdirSync(THEMES_DIR).find((f) => slugify(f.replace(/\.json$/, "")) === slug);
      if (file) {
        const raw = readFileSync(join(THEMES_DIR, file), "utf-8");
        themeConfig = parseThemeFileContent(raw, file);
      }
    }

    if (!themeConfig) {
      themeConfig = await this.fetchRemoteThemeConfig(item);
    }

    const action = await importThemeFromJson(themeConfig, tenantId);
    const { adminThemeService } = await import("./admin-theme-service");
    const themes = await adminThemeService.listThemes(tenantId);
    const theme = themes.find((t) => t.name === themeConfig.name);
    if (!theme) throw new Error("Theme installed but not found in database");

    logger.info("[Marketplace] Theme installed", { itemId, name: themeConfig.name, action });
    return { theme, action };
  }

  private async fetchRemoteThemeConfig(item: MarketplaceItem): Promise<ThemeFilePayload> {
    const baseUrl = (process.env.MARKETPLACE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${baseUrl}/api/v1/marketplace/themes/${encodeURIComponent(item.id)}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) throw new Error(`Remote theme config unavailable (${res.status})`);

      const body = await res.json();
      const config = (body?.themeConfig ?? body?.data?.themeConfig ?? body) as ThemeFilePayload;
      if (!config?.name) throw new Error("Remote theme payload missing name");
      return config;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const marketplaceService = MarketplaceService.getInstance();
