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

import path from "node:path";
import { logger } from "@utils/logger";
import { assertPackageCompatibleWithCms } from "@src/widgets/widget-compatibility";

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

  /** Download a plugin by slug, preferring JSON payloads with `files` + checksum. */
  async download(pluginSlug: string): Promise<MarketplacePlugin> {
    const pkg = await this.getPackage(pluginSlug);
    const downloadUrl = pkg.downloadUrl || `${this.baseUrl}/download/${encodeURIComponent(pkg.id)}`;
    const { validateEgressUrl, safeFetch } = await import("@src/utils/egress-guard");
    await validateEgressUrl(downloadUrl, { timeoutMs: 30_000, maxSizeBytes: 20 * 1024 * 1024 });
    const result = await safeFetch(downloadUrl, {
      headers: this.authHeaders(),
      timeoutMs: 30_000,
      maxSizeBytes: 20 * 1024 * 1024,
    });
    if (!result.success || result.status !== 200 || !result.body) {
      if (pkg.files && Object.keys(pkg.files).length > 0) return pkg;
      throw new Error(`Download failed for ${pluginSlug}: ${result.error || result.status}`);
    }
    try {
      const parsed = JSON.parse(result.body) as MarketplacePlugin & {
        files?: Record<string, string>;
      };
      if (parsed.files && typeof parsed.files === "object") {
        return { ...pkg, ...parsed, files: parsed.files };
      }
    } catch {
      // Non-JSON archive: keep metadata; installPlugin requires `files`.
    }
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

const ALLOWED_INSTALL_PREFIXES = [
  "src/plugins/",
  "src/widgets/",
  "src/widgets/custom/",
  "src/routes/(app)/dashboard/widgets/",
  "src/themes/",
] as const;

function assertSafeInstallPath(installPath: string, filename: string, cwd: string): string {
  if (!installPath || installPath.includes("\0") || filename.includes("\0")) {
    throw new Error("Invalid install path");
  }
  const normalized = installPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || filename.includes("..")) {
    throw new Error("Install path must not contain '..'");
  }
  const allowed = ALLOWED_INSTALL_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
  if (!allowed) {
    throw new Error(`Install path "${normalized}" is outside the allowed marketplace directories`);
  }
  const installDir = path.resolve(cwd, normalized);
  const filePath = path.resolve(installDir, filename);
  const rel = path.relative(installDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("File path escapes install directory");
  }
  return filePath;
}

/** Canonical SHA-256 of package files (sorted filenames, utf-8). */
export async function hashPackageFiles(files: Record<string, string>): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(files[name] ?? "");
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function verifyPackageChecksum(
  plugin: Pick<MarketplacePlugin, "id" | "checksum" | "sha256">,
  actual: string,
): void {
  const expected = (plugin.checksum || plugin.sha256 || "").trim().toLowerCase();
  if (!expected) return;
  if (expected !== actual.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${plugin.id}: expected ${expected}, got ${actual}`);
  }
}

/**
 * Install a plugin from the marketplace into the local project.
 * Creates the directory structure and writes all files after checksum + path checks.
 */
export async function installPlugin(
  pluginId: string,
  options: { licenseKey?: string; expectedChecksum?: string } = {},
): Promise<MarketplacePlugin> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const cwd = process.cwd();

  if (options.licenseKey) {
    marketplace.setLicense(options.licenseKey);
  }

  const plugin = await marketplace.download(pluginId);
  assertPackageCompatibleWithCms(plugin);
  if (!plugin.files || Object.keys(plugin.files).length === 0) {
    throw new Error(`Package ${pluginId} did not include installable files`);
  }

  const actual = await hashPackageFiles(plugin.files);
  if (options.expectedChecksum) {
    plugin.checksum = options.expectedChecksum;
  }
  verifyPackageChecksum(plugin, actual);

  const license = await marketplace.checkLicense(plugin.id);
  if (plugin.license && plugin.license !== "free" && !license.valid) {
    throw new Error(`License required for ${plugin.name} (${plugin.license})`);
  }

  await fs.mkdir(path.join(cwd, plugin.installPath.replace(/\\/g, "/")), { recursive: true });

  for (const [filename, content] of Object.entries(plugin.files)) {
    const filePath = assertSafeInstallPath(plugin.installPath, filename, cwd);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
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

/**
 * Install a dashboard widget package from the marketplace into the local project.
 * Dashboard widgets live in self-contained kebab-case folders under
 * `src/routes/(app)/dashboard/widgets/<folder>/` and are discovered at build
 * time via `import.meta.glob` — no manual registration required.
 *
 * The marketplace package must set `installPath` to
 * `src/routes/(app)/dashboard/widgets/<folder>` and include the widget's
 * `.svelte` component, `widget.json` manifest, and optional `.mdx` docs.
 */
export async function installDashboardWidget(widgetId: string): Promise<MarketplacePlugin> {
  const plugin = await installPlugin(widgetId);
  logger.info(
    `[Marketplace] Dashboard widget ${plugin.name} v${plugin.version} installed to ${plugin.installPath} — restart the dev server to pick it up`,
  );
  return plugin;
}
