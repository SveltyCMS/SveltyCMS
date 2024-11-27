/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state using Svelte 5 runes
 *
 * Features:
 *  - Collection state management with Svelte 5 runes
 * 	- Asynchronous collection initialization
 * 	- Collection updating with reactive states
 * 	- TypeScript support with custom Collection type
 */

import { store } from '@utils/reactivity.svelte';
import type { Schema, CategoryData } from '@src/collections/types';

// Define types
type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';
type CollectionType = string; // Base type for collection names

// Widget interface
interface Widget {
	permissions: Record<string, Record<string, boolean>>;
	[key: string]: Record<string, Record<string, boolean>> | unknown;
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

// Create reactive stores using Svelte 5 runes
export const collections = store<{ [key: CollectionType]: Schema }>({});
export const collectionsLoading = store<boolean>(false);
export const collectionsError = store<string | null>(null);
export const unAssigned = store<Schema[]>([]);
export const collection = store<Schema>({} as Schema);
export const collectionValue = store<Record<string, unknown>>({});
export const mode = store<ModeType>('view');
export const modifyEntry = store((): void => {});
export const selectedEntries = store<string[]>([]);
export const targetWidget = store<Widget>({ permissions: {} });
export const categories = store<Record<string, CategoryData>>({});

// Reactive calculations using Svelte 5 runes
export const totalCollections = store(() => Object.keys(collections.value).length);
export const hasSelectedEntries = store(() => selectedEntries.value.length > 0);
export const currentCollectionName = store(() => collection.value?.name);

// Entry management
export const entryActions = {
	addEntry(entryId: string) {
		selectedEntries.update((entries) => [...entries, entryId]);
	},
	removeEntry(entryId: string) {
		selectedEntries.update((entries) => entries.filter((id) => id !== entryId));
	},
	clear() {
		selectedEntries.set([]);
	}
};

// Helper functions for categories
export const categoryActions = {
	updateCategory(categoryId: string, data: CategoryData) {
		categories.update((cats) => ({
			...cats,
			[categoryId]: { ...cats[categoryId], ...data }
		}));
	}
};

// Type exports
export type { ModeType };
