/**
 * @file src/services/seo/sitemap-cache.ts
 * @description In-memory cache for dynamic sitemaps.
 */

interface SitemapCacheEntry {
  xml: string;
  timestamp: number;
}

const sitemapCache = new Map<string, SitemapCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get sitemap from cache if valid
 */
export function getCachedSitemap(tenantId: string): string | null {
  const entry = sitemapCache.get(tenantId);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.xml;
  }
  return null;
}

/**
 * Set sitemap cache
 */
export function setCachedSitemap(tenantId: string, xml: string) {
  sitemapCache.set(tenantId, {
    xml,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate sitemap cache for a tenant
 */
export function invalidateSitemapCache(tenantId: string) {
  sitemapCache.delete(tenantId);
}
