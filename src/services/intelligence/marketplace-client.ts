/**
 * @file src/services/intelligence/marketplace-client.ts
 * @description Client for the SveltyCMS Marketplace API (marketplace.sveltycms.com).
 * Handles plugin/widget discovery, license verification, installation, and updates.
 *
 * ### Features:
 * - Browse marketplace plugins/widgets with search and category filtering
 * - License-aware download (free, pro, enterprise tiers)
 * - Version checking and update notifications
 * - One-click installation into src/plugins/ or src/widgets/
 * - Offline-first: caches listings locally, works without marketplace connectivity
 */

import { logger } from "@utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────

export type PluginType = "widget" | "plugin" | "theme" | "integration";

export type LicenseTier = "free" | "pro" | "enterprise";

export interface MarketplacePlugin {
  id: string;
  name: string;
  type: PluginType;
  description: string;
  author: string;
  version: string;
  license: LicenseTier;
  downloads: number;
  rating: number;
  icon?: string;
  tags: string[];
  requiresSveltyCMS: string; // min version
  installPath: string; // relative path e.g. "src/plugins/pagespeed"
  files: Record<string, string>; // filename → content
  updatedAt: string;
}

export interface MarketplaceSearchParams {
  query?: string;
  type?: PluginType;
  license?: LicenseTier;
  page?: number;
  limit?: number;
  sort?: "downloads" | "rating" | "updated" | "name";
}

export interface MarketplaceListResponse {
  plugins: MarketplacePlugin[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LicenseCheckResponse {
  valid: boolean;
  tier: LicenseTier;
  expiresAt?: string;
  pluginId: string;
}

// ─── Client ───────────────────────────────────────────────────────────────

const MARKETPLACE_BASE = "https://marketplace.sveltycms.com/api";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let _listingsCache: MarketplacePlugin[] | null = null;
let _cacheTime = 0;

class MarketplaceClient {
  private baseUrl: string;
  private licenseKey?: string;

  constructor(baseUrl = MARKETPLACE_BASE) {
    this.baseUrl = baseUrl;
  }

  /** Set license key for pro/enterprise plugin access. */
  setLicense(key: string): void {
    this.licenseKey = key;
  }

  /** Fetch plugin listings with optional caching. */
  async list(params: MarketplaceSearchParams = {}): Promise<MarketplaceListResponse> {
    const _cacheKey = JSON.stringify(params);

    if (_listingsCache && Date.now() - _cacheTime < CACHE_TTL && !params.query) {
      const filtered = this.filterCached(params);
      return {
        plugins: filtered,
        total: filtered.length,
        page: params.page || 1,
        totalPages: 1,
      };
    }

    const url = new URL(`${this.baseUrl}/packages`);
    if (params.query) url.searchParams.set("q", params.query);
    if (params.type) url.searchParams.set("type", params.type);
    if (params.license) url.searchParams.set("license", params.license);
    if (params.page) url.searchParams.set("page", String(params.page));
    if (params.limit) url.searchParams.set("limit", String(params.limit));
    if (params.sort) url.searchParams.set("sort", params.sort);

    try {
      const res = await fetch(url.toString(), {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        logger.warn(`[Marketplace] List request failed: ${res.status}`);
        return this.fallbackResponse(params);
      }

      const data = await res.json();

      // Update cache
      if (!params.query && !params.type && !params.license) {
        _listingsCache = data.plugins || data;
        _cacheTime = Date.now();
      }

      return this.normalizeResponse(data, params);
    } catch (err) {
      logger.warn("[Marketplace] Connection failed — serving cached/fallback", err);
      return this.fallbackResponse(params);
    }
  }

  /** Download a plugin by slug. */
  async download(pluginSlug: string): Promise<MarketplacePlugin> {
    // First get package details, then download
    const pkg = await this.getPackage(pluginSlug);
    const res = await fetch(`${this.baseUrl}/download/${pkg.id}`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Download failed for ${pluginSlug}: ${res.status}`);
    // Response is the zip/archive — for now return the package metadata
    // Full install flow handles extraction in installPlugin()
    return pkg;
  }

  /** Get package details by slug. */
  async getPackage(slug: string): Promise<MarketplacePlugin> {
    const res = await fetch(`${this.baseUrl}/packages/${encodeURIComponent(slug)}`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Package not found: ${slug}`);
    return res.json();
  }

  /** Verify license via marketplace License API v1. */
  async checkLicense(pluginId: string): Promise<LicenseCheckResponse> {
    if (!this.licenseKey) {
      return { valid: true, tier: "free", pluginId };
    }

    const res = await fetch(`${this.baseUrl}/v1/license/verify`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pluginId, licenseKey: this.licenseKey }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { valid: true, tier: "free", pluginId };
    }

    return res.json();
  }

  /** Check for updates for installed plugins. */
  async checkUpdates(installed: { id: string; version: string }[]): Promise<MarketplacePlugin[]> {
    const res = await fetch(`${this.baseUrl}/plugins/updates`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plugins: installed }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.updates || [];
  }

  /** Search plugins by text query. */
  async search(query: string, type?: PluginType): Promise<MarketplacePlugin[]> {
    const result = await this.list({ query, type, limit: 20 });
    return result.plugins;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-SveltyCMS-Version": "2026.6",
    };
    if (this.licenseKey) {
      headers["X-License-Key"] = this.licenseKey;
    }
    return headers;
  }

  private filterCached(params: MarketplaceSearchParams): MarketplacePlugin[] {
    if (!_listingsCache) return [];
    let results = _listingsCache;
    if (params.type) results = results.filter((p) => p.type === params.type);
    if (params.license) results = results.filter((p) => p.license === params.license);
    if (params.query) {
      const q = params.query.toLowerCase();
      results = results.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      );
    }
    return results;
  }

  private normalizeResponse(data: any, _params: MarketplaceSearchParams): MarketplaceListResponse {
    if (Array.isArray(data)) {
      return { plugins: data, total: data.length, page: 1, totalPages: 1 };
    }
    return data as MarketplaceListResponse;
  }

  private fallbackResponse(params: MarketplaceSearchParams): MarketplaceListResponse {
    return {
      plugins: this.filterCached(params),
      total: _listingsCache?.length || 0,
      page: 1,
      totalPages: 1,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────

export const marketplace = new MarketplaceClient();

/**
 * Install a plugin from the marketplace into the local project.
 * Creates the directory structure and writes all files.
 */
export async function installPlugin(pluginId: string): Promise<MarketplacePlugin> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const cwd = process.cwd();

  const plugin = await marketplace.download(pluginId);
  const installDir = path.join(cwd, plugin.installPath);

  // Create directory structure
  await fs.mkdir(installDir, { recursive: true });

  // Write all plugin files
  for (const [filename, content] of Object.entries(plugin.files)) {
    const filePath = path.join(installDir, filename);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  logger.info(`[Marketplace] Installed ${plugin.name} v${plugin.version} to ${plugin.installPath}`);
  return plugin;
}

/**
 * Set the marketplace license key (for pro/enterprise plugins).
 */
export function setLicenseKey(key: string): void {
  marketplace.setLicense(key);
}
