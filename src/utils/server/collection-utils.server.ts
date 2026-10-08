/**
 * @file src/utils/server/collection-utils.server.ts
 * @description First-collection redirect resolution with a language- and
 * tenant-aware 5-minute memo cache (server-only).
 *
 * ### Features:
 * - `fetchAndRedirectToFirstCollection` resolves the redirect URL uncached.
 * - `getCachedFirstCollectionPath` memoizes per locale (global) or per
 *   `tenantId:locale`; null results and errors are never cached.
 * - `invalidateFirstCollectionPathCache` drops all entries when the
 *   collection set changes (setup reset, collectionbuilder mutations).
 * - The per-tenant map is bounded (oldest-entry eviction at capacity, same
 *   policy as permission-cache.ts); the global map is naturally bounded by
 *   the locale set.
 */

import { contentSystem } from "@src/content/index.server";
import type { Locale } from "@src/paraglide/runtime";
import { logger } from "@utils/logger";

/**
 * Constructs a redirect URL to the first available collection, prefixed with the given language.
 * Returns null if no collections are found, allowing the caller to decide on a fallback route.
 * @param language The validated user language (e.g., 'en', 'de').
 */
export async function fetchAndRedirectToFirstCollection(
  language: Locale,
  tenantId?: string | null,
): Promise<string | null> {
  try {
    logger.debug(
      `Fetching first collection path for language: ${language}, tenant: ${tenantId || "global"}`,
    );

    const redirectUrl = await contentSystem.getFirstCollectionRedirectUrl(language, tenantId);
    if (redirectUrl) {
      logger.info(`Redirecting to first collection at path: ${redirectUrl}`, { tenantId });
      return redirectUrl;
    }

    logger.debug(
      "[Collections] No collection available yet — skipping the first-collection redirect.",
    );
    return null; // Return null if no collections are configured
  } catch (err) {
    logger.error("Error in fetchAndRedirectToFirstCollection:", err);
    return null; // Return null on error
  }
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/** Capacity of the per-tenant map (one entry per tenant:locale pair). */
const MAX_TENANT_CACHE_ENTRIES = 100;

interface CachedPath {
  path: string;
  expiry: number;
}

// Plain `Map`s on purpose: server-only caches — the reactivity bookkeeping of
// `SvelteMap` would be pure overhead here. Map preserves insertion order,
// which the bounded tenant map uses to evict the oldest entry.
const cachedFirstCollectionPaths = new Map<Locale, CachedPath>();
const cachedFirstCollectionPathsByTenant = new Map<string, CachedPath>();

/**
 * Clears the memoized first-collection redirect paths.
 * Must be called whenever the collection set changes (setup completion/reset,
 * collectionbuilder mutations) — otherwise a stale 5-minute entry redirects
 * logins/fresh installs to a collection route that no longer exists.
 */
export function invalidateFirstCollectionPathCache(): void {
  cachedFirstCollectionPaths.clear();
  cachedFirstCollectionPathsByTenant.clear();
}

/** Stores a tenant-scoped entry, evicting the oldest entry when at capacity. */
function cacheTenantPath(cacheKey: string, entry: CachedPath): void {
  if (cachedFirstCollectionPathsByTenant.size >= MAX_TENANT_CACHE_ENTRIES) {
    const oldestKey = cachedFirstCollectionPathsByTenant.keys().next().value;
    if (oldestKey) cachedFirstCollectionPathsByTenant.delete(oldestKey);
  }
  cachedFirstCollectionPathsByTenant.set(cacheKey, entry);
}

/**
 * A cached function to get the redirect path for the first available collection.
 * The cache is language-aware and helps avoid redundant database lookups.
 * @param language The validated user language.
 */
export async function getCachedFirstCollectionPath(
  language: Locale,
  tenantId?: string | null,
): Promise<string | null> {
  const now = Date.now();
  // The composite key is only built on the tenant path — the global map is
  // keyed by the locale directly, so the common no-tenant path allocates nothing.
  const cacheKey = tenantId ? `${tenantId}:${language}` : language;
  const cachedEntry = tenantId
    ? cachedFirstCollectionPathsByTenant.get(cacheKey)
    : cachedFirstCollectionPaths.get(language);

  // Return cached result if still valid
  if (cachedEntry && now < cachedEntry.expiry) {
    return cachedEntry.path;
  }

  // Fetch fresh data by calling the utility function
  const result = await fetchAndRedirectToFirstCollection(language, tenantId);

  // Cache the result if it's a valid path (null results are never cached)
  if (result) {
    const entry: CachedPath = { path: result, expiry: now + CACHE_DURATION };
    if (tenantId) cacheTenantPath(cacheKey, entry);
    else cachedFirstCollectionPaths.set(language, entry);
  }

  return result;
}
