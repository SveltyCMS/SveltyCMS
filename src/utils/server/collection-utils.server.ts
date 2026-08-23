import { contentSystem } from "@src/content/index.server";
import type { Locale } from "@src/paraglide/runtime";
import { logger } from "@utils/logger";
import { SvelteMap } from "svelte/reactivity";

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

    logger.warn("No collections found via getSmartFirst(), returning null.");
    return null; // Return null if no collections are configured
  } catch (err) {
    logger.error("Error in fetchAndRedirectToFirstCollection:", err);
    return null; // Return null on error
  }
}

const cachedFirstCollectionPaths = new SvelteMap<Locale, { path: string; expiry: number }>();
const cachedFirstCollectionPathsByTenant = new SvelteMap<
  string,
  { path: string; expiry: number }
>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

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

  // Cache the result if it's a valid path
  if (result) {
    const entry = {
      path: result,
      expiry: now + CACHE_DURATION,
    };
    if (tenantId) cachedFirstCollectionPathsByTenant.set(cacheKey, entry);
    else cachedFirstCollectionPaths.set(language, entry);
  }

  return result;
}
