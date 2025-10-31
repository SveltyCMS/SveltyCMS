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
export interface Widget {
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

// Wrapper objects for reassignable state (Svelte 5 requirement)
let _collection = $state<Schema | null>(null);
let _collectionValue = $state<Record<string, unknown>>({});
let _mode = $state<ModeType>('view');
let _modifyEntry = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
let _targetWidget = $state<Widget>({ permissions: {} });
let _contentStructure = $state<ContentNode[]>([]);

export const collection = {
	get value() {
		return _collection;
	},
	set value(v) {
		_collection = v;
	}
};
export const collectionValue = {
	get value() {
		return _collectionValue;
	},
	set value(v) {
		_collectionValue = v;
		// Ensure status is set if not present
		if (_collectionValue && !('status' in _collectionValue)) {
			_collectionValue.status = _collection?.status ?? 'unpublish';
		}
	}
};
export const mode = {
	get value() {
		return _mode;
	},
	set value(v) {
		logger.debug(`mode.value setter: ${_mode} -> ${v}`);
		_mode = v;
	}
};
export const modifyEntry = {
	get value() {
		return _modifyEntry;
	},
	set value(v) {
		_modifyEntry = v;
	}
};
export const targetWidget = {
	get value() {
		return _targetWidget;
	},
	set value(v) {
		_targetWidget = v;
	}
};
export const contentStructure = {
	get value() {
		return _contentStructure;
	},
	set value(v) {
		_contentStructure = v;
	}
};

export const selectedEntries = $state<string[]>([]);

// --- Derived State (exported as functions per Svelte 5 requirements) ---
export function getTotalCollections() {
	return Object.keys(collections).length;
}

export function getHasSelectedEntries() {
	return selectedEntries.length > 0;
}

export function getCurrentCollectionName() {
	return _collection?.name;
}

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

// --- Store Actions ---
export function setCollection(newCollection: Schema | null) {
	_collection = newCollection;
}

export function setMode(newMode: ModeType) {
	logger.debug(`setMode called: ${_mode} -> ${newMode}`);
	mode.value = newMode; // Use the setter to trigger UI updates
}

export function setCollectionValue(newValue: Record<string, unknown>) {
	_collectionValue = newValue;
}

export function setModifyEntry(newFn: (status?: keyof typeof statusMap) => Promise<void>) {
	_modifyEntry = newFn;
}

export function setContentStructure(newContentStructure: ContentNode[]) {
	_contentStructure = newContentStructure;
}

export function setTargetWidget(newWidget: Widget) {
	_targetWidget = newWidget;
}

// Type exports
export type { ModeType };
