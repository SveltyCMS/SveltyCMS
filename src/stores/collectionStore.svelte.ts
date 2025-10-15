/**
 * @file src/stores/collectionStore.svelte.ts
 * @description Manages the collection state
 *
 * Features:
 *  - Collection state management
 * 	- Asynchronous collection initialization
 * 	- Collection updating with reactive states
 * 	- TypeScript support with custom Collection type
 */

import type { Schema } from '@src/content/types';
import { SvelteMap } from 'svelte/reactivity';
import type { ContentNode } from '../content/types';

import { contentManager } from '@src/content/ContentManager';
import type { Locale } from '@src/paraglide/runtime';
import { logger } from '@utils/logger.svelte';

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

// Define types
type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

// Widget interface
interface Widget {
	permissions: Record<string, Record<string, boolean>>;
	[key: string]: Record<string, Record<string, boolean>> | unknown;
}

// Status map for various collection states
export const statusMap = {
	publish: 'publish',
	unpublish: 'unpublish',
	draft: 'draft',
	archived: 'archived'
};

// --- State using Svelte 5 Runes ---
export const collections = $state<{ [uuid: string]: Schema }>({});
export const collectionsById = new SvelteMap<string, Schema>();
export const currentCollectionId = $state<string | null>(null);
export const collectionsLoading = $state<boolean>(false);
export const collectionsError = $state<string | null>(null);
export const unAssigned = $state<Schema>({} as Schema);
export const collection = $state<Schema | null>(null);
export const collectionValue = $state<Record<string, unknown>>({});
export const mode = $state<ModeType>('view');
export const modifyEntry = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
export const selectedEntries = $state<string[]>([]);
export const targetWidget = $state<Widget>({ permissions: {} });
export const contentStructure = $state<ContentNode[]>([]);

// --- Effects ---
$effect(() => {
	if (collectionValue && !('status' in collectionValue)) {
		collectionValue.status = collection?.status ?? 'unpublish';
	}
});

// --- Derived State ---
export const totalCollections = $derived(Object.keys(collections).length);
export const hasSelectedEntries = $derived(selectedEntries.length > 0);
export const currentCollectionName = $derived(collection?.name);

// --- Entry Management ---
export const entryActions = {
	addEntry(entryId: string) {
		if (!selectedEntries.includes(entryId)) {
			selectedEntries.push(entryId);
		}
	},
	removeEntry(entryId: string) {
		const index = selectedEntries.indexOf(entryId);
		if (index > -1) {
			selectedEntries.splice(index, 1);
		}
	},
	clear() {
		selectedEntries.length = 0;
	}
};

// Type exports
export type { ModeType };
