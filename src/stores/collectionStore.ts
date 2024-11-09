/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state for the application using Svelte stores
 *
 * Features:
 *  - Collection state management
 * 	- Asynchronous collection initialization from server
 * 	- Collection updating with server synchronization
 * 	- Error handling for API calls
 * 	- TypeScript support with custom Collection type
 */

import type { CollectionNames, Schema, CategoryData } from '@src/collections/types';
import { writable, derived } from 'svelte/store';

// Define types
type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

// Status map for various collection states
export const statusMap = {
	deleted: 'deleted',
	published: 'published',
	unpublished: 'unpublished',
	scheduled: 'scheduled',
	cloned: 'cloned',
	testing: 'testing'
} as const;

// Define CollectionValue interface
interface CollectionValue {
	_id?: string;
	_scheduled?: number;
	createdAt?: number;
	updatedAt?: number;
	createdBy?: string;
	updatedBy?: string;
	status?: keyof typeof statusMap;
	[key: string]: any;
}

// Create base stores
const createCollectionStores = () => {
	// Base stores
	const collections = writable<{ [key in CollectionNames]: Schema }>({} as { [key in CollectionNames]: Schema });
	const unAssigned = writable<Schema[]>([]);
	const collection = writable<Schema | undefined>(undefined);
	const collectionValue = writable<CollectionValue>({});
	const mode = writable<ModeType>('view');
	const modifyEntry = writable<((status: keyof typeof statusMap) => Promise<void>) | undefined>(undefined);
	const selectedEntries = writable<string[]>([]);
	const targetWidget = writable({});
	const categories = writable<Record<string, CategoryData>>({});

	// Derived values
	const totalCollections = derived(collections, ($collections) => Object.keys($collections).length);
	const hasSelectedEntries = derived(selectedEntries, ($selectedEntries) => $selectedEntries.length > 0);
	const activeCollectionName = derived(collection, ($collection) => $collection?.name);

	// Helper functions
	const addSelectedEntry = (entryId: string) => {
		selectedEntries.update(($entries) => {
			if (!$entries.includes(entryId)) {
				return [...$entries, entryId];
			}
			return $entries;
		});
	};

	const removeSelectedEntry = (entryId: string) => {
		selectedEntries.update(($entries) => $entries.filter((id) => id !== entryId));
	};

	const clearSelectedEntries = () => {
		selectedEntries.set([]);
	};

	const updateCategory = (categoryId: string, data: CategoryData) => {
		categories.update(($categories) => ({
			...$categories,
			[categoryId]: data
		}));
	};

	return {
		// Base stores
		collections,
		unAssigned,
		collection,
		collectionValue,
		mode,
		modifyEntry,
		selectedEntries,
		targetWidget,
		categories,

		// Derived values
		totalCollections,
		hasSelectedEntries,
		activeCollectionName,

		// Helper functions
		addSelectedEntry,
		removeSelectedEntry,
		clearSelectedEntries,
		updateCategory
	};
};

// Create and export stores
const stores = createCollectionStores();

// Export individual stores with their full store interface
export const collections = {
	subscribe: stores.collections.subscribe,
	set: stores.collections.set
};

export const unAssigned = {
	subscribe: stores.unAssigned.subscribe,
	set: stores.unAssigned.set
};

export const collection = {
	subscribe: stores.collection.subscribe,
	set: stores.collection.set
};

export const collectionValue = {
	subscribe: stores.collectionValue.subscribe,
	set: stores.collectionValue.set,
	update: (updater: (value: CollectionValue) => CollectionValue) => {
		stores.collectionValue.update(updater);
	}
};

export const mode = {
	subscribe: stores.mode.subscribe,
	set: stores.mode.set
};

export const modifyEntry = {
	subscribe: stores.modifyEntry.subscribe,
	set: stores.modifyEntry.set
};

export const selectedEntries = {
	subscribe: stores.selectedEntries.subscribe,
	set: stores.selectedEntries.set,
	addEntry: stores.addSelectedEntry,
	removeEntry: stores.removeSelectedEntry,
	clear: stores.clearSelectedEntries
};

export const targetWidget = {
	subscribe: stores.targetWidget.subscribe,
	set: stores.targetWidget.set
};

export const categories = {
	subscribe: stores.categories.subscribe,
	set: stores.categories.set,
	updateCategory: stores.updateCategory
};

// Export derived values
export const totalCollections = { subscribe: stores.totalCollections.subscribe };
export const hasSelectedEntries = { subscribe: stores.hasSelectedEntries.subscribe };
export const activeCollectionName = { subscribe: stores.activeCollectionName.subscribe };

// Export types
export type { CollectionValue };
