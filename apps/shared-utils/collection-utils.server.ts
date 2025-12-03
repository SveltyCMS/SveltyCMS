import { contentManager } from '@src/content/ContentManager';
import type { Locale } from '@src/paraglide/runtime';
import { logger } from '@utils/logger.server';
import { SvelteMap } from 'svelte/reactivity';

/**
 * Constructs a redirect URL to the first available collection, prefixed with the given language.
 * Returns null if no collections are found, allowing the caller to decide on a fallback route.
 * @param language The validated user language (e.g., 'en', 'de').
 */
export async function fetchAndRedirectToFirstCollection(language: Locale): Promise<string | null> {
	try {
		logger.debug(`Fetching first collection path for language: \x1b[34m${language}\x1b[0m`);

		const firstCollection = await contentManager.getFirstCollection();
		if (firstCollection?.path) {
			// Ensure the collection path has a leading slash
			const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
			const redirectUrl = `/${language}${collectionPath}`;
			logger.info(`Redirecting to first collection: \x1b[34m${firstCollection.name}\x1b[0m at path: \x1b[34m${redirectUrl}\x1b[0m`);
			return redirectUrl;
		}

		logger.warn('No collections found via getFirstCollection(), returning null.');
		return null; // Return null if no collections are configured
	} catch (err) {
		logger.error('Error in fetchAndRedirectToFirstCollection:', err);
		return null; // Return null on error
	}
}

const cachedFirstCollectionPaths = new SvelteMap<Locale, { path: string; expiry: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * A cached function to get the redirect path for the first available collection.
 * The cache is language-aware and helps avoid redundant database lookups.
 * @param language The validated user language.
 */
export async function getCachedFirstCollectionPath(language: Locale): Promise<string | null> {
	const now = Date.now();
	const cachedEntry = cachedFirstCollectionPaths.get(language);

	// Return cached result if still valid
	if (cachedEntry && now < cachedEntry.expiry) {
		return cachedEntry.path;
	}

	// Fetch fresh data by calling the utility function
	const result = await fetchAndRedirectToFirstCollection(language);

	// Cache the result if it's a valid path
	if (result) {
		cachedFirstCollectionPaths.set(language, { path: result, expiry: now + CACHE_DURATION });
	}

	return result;
}
