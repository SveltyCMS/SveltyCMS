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
import type { Schema, CategoryData } from '@src/collections/types';
import type { Permission } from '@src/auth/types';

// Define types
type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';
type CollectionType = string; // Base type for collection names

// Widget interface
interface Widget {
    permissions: Record<string, Record<string, boolean>>;
    [key: string]: any; // Allow other properties
}

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
export const collections = store<{ [key: CollectionType]: Schema }>({} as { [key: CollectionType]: Schema });
export const unAssigned = store<Schema[]>([]);
export const collection = store<Schema>({} as Schema);
export const collectionValue = store({} as { [key: string]: any });
export const mode = store<ModeType>('view');
export const modifyEntry = store((_: keyof typeof statusMap): any => {});
export const selectedEntries = store<string[]>([]);
export const targetWidget = store<Widget>({ permissions: {} });
export const categories = store<Record<string, CategoryData>>({});

// Reactive calculations using store
export const totalCollections = store(() => Object.keys(collections.value).length);
export const hasSelectedEntries = store(() => selectedEntries.value.length > 0);
export const currentCollectionName = store(() => collection.value?.name);

// Helper functions for selected entries
export const selectedEntriesActions = {
	addEntry: (entryId: string) => {
		const current = selectedEntries.value;
		if (!current.includes(entryId)) {
			selectedEntries.set([...current, entryId]);
		}
	},

	removeEntry: (entryId: string) => {
		const currentEntries = selectedEntries.value;
		selectedEntries.set(currentEntries.filter((id) => id !== entryId));
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
