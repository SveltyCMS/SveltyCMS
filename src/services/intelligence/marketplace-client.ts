/**
 * @file src/services/intelligence/marketplace-client.ts
 * @description Catalog client for the SveltyCMS Marketplace API (marketplace.sveltycms.com).
 * Handles plugin/widget discovery, license verification and update checks.
 *
 * This module runs in the BROWSER as well (extensions UI), so it stays free of Node
 * builtins and the egress guard. Downloading and installing packages needs both —
 * that half lives in `marketplace-install.server.ts`.
 *
 * ### Features:
 * - Browse marketplace plugins/widgets with search and category filtering
 * - License verification (free, pro, enterprise tiers)
 * - Version checking and update notifications
 * - Offline-first: caches listings locally, works without marketplace connectivity
 */

import { logger } from "@utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────

export type PluginType = "widget" | "plugin" | "theme" | "dashboard" | "preset" | "integration";

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
  /** SHA-256 hex of canonical file contents (sorted filenames). */
  checksum?: string;
  sha256?: string;
  downloadUrl?: string;
  checkoutUrl?: string;
  price?: number;
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

  /**
   * Absolute download URL for a package (an explicit `downloadUrl` wins).
   * Public so the server-side install path shares one URL rule.
   */
  downloadUrlFor(pkg: Pick<MarketplacePlugin, "id" | "downloadUrl">): string {
    return pkg.downloadUrl || `${this.baseUrl}/download/${encodeURIComponent(pkg.id)}`;
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

  // ─── Public plumbing (shared with the server-side install path) ────────

  /** Headers for authenticated marketplace requests (license key included). */
  public authHeaders(): Record<string, string> {
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
 * Set the marketplace license key (for pro/enterprise plugins).
 */
export function setLicenseKey(key: string): void {
  marketplace.setLicense(key);
}
