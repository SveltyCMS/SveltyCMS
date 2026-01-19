/**
 * @file shared/utils/src/server/collection-utils.server.ts
 * @description Utility functions for collection management
 *
 * ### Features
 * - Caching of first collection paths for 5 minutes
 * - Language-aware caching
 * - Error handling
 * - Structured logging
 */

import { contentManager } from '@content/ContentManager';
import type { Locale } from '$lib/paraglide/runtime.js';
import { logger } from '@shared/utils/logger.server';
import { SvelteMap } from 'svelte/reactivity';

/**
 * Constructs a redirect URL to the first available collection, prefixed with the given language.
 * Returns null if no collections are found, allowing the caller to decide on a fallback route.
 * @param language The validated user language (e.g., 'en', 'de').
 */
export async function fetchAndRedirectToFirstCollection(language: Locale): Promise<string | null> {
	try {
		logger.debug(`Fetching first collection path for language: ${language}`);

		const firstCollection = await contentManager.getFirstCollection();
		if (firstCollection?.path) {
			// Ensure the collection path has a leading slash
			const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
			const redirectUrl = `/${language}${collectionPath}`;
			logger.info(`Redirecting to first collection: ${firstCollection.name} at path: ${redirectUrl}`);
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
