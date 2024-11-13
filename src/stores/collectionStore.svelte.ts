/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state usingreactive states
 *
 * Features:
 *  - Collection state management with Svelte 5 runes
 * 	- Asynchronous collection initialization
 * 	- Collection updating with reactive states
 * 	- TypeScript support with custom Collection type
 */

import { store } from '@src/utils/reactivity.svelte';
import type { CollectionTypes, Schema, CategoryData } from '@src/collections/types';

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

// Create reactive stores
export const collections = store<{ [key in CollectionTypes]: Schema }>({} as { [key in CollectionTypes]: Schema });
export const unAssigned = store<Schema[]>([]);
export const collection = store<Schema>({} as Schema);
export const collectionValue = store({} as { [key: string]: any });
export const mode = store<ModeType>('view');
export const modifyEntry = store((_: keyof typeof statusMap): any => {});
export const selectedEntries = store<string[]>([]);
export const targetWidget = store({});
export const categories = store<Record<string, CategoryData>>({});

// Reactive calculations
export const totalCollections = store(0);
export const hasSelectedEntries = store(false);
export const activeCollectionName = store<string | undefined>(undefined);

// Update derived values whenever the source stores change
collections.subscribe(($collections) => {
	totalCollections.set(Object.keys($collections).length);
});

selectedEntries.subscribe(($selectedEntries) => {
	hasSelectedEntries.set($selectedEntries.length > 0);
});

collection.subscribe(($collection) => {
	activeCollectionName.set($collection?.name);
});

// Helper functions for selected entries
export const selectedEntriesActions = {
	addEntry: (entryId: string) => {
		const current = selectedEntries();
		if (!current.includes(entryId)) {
			selectedEntries.set([...current, entryId]);
		}
	},

	removeEntry: (entryId: string) => {
		selectedEntries.set(selectedEntries().filter((id) => id !== entryId));
	},

	clear: () => {
		selectedEntries.set([]);
	}
};

// Helper functions for categories
export const categoryActions = {
	updateCategory: (categoryId: string, data: CategoryData) => {
		categories.update((current) => ({
			...current,
			[categoryId]: data
		}));
	}
};

// Type exports
export type { ModeType };
