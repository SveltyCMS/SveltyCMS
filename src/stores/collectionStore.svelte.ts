/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state
 *
 * Features:
 *  - Collection state management
 * 	- Asynchronous collection initialization
 * 	- Collection updating with reactive states
 * 	- TypeScript support with custom Collection type
 */

import type { Schema } from '@src/content/types';
import { store } from '@utils/reactivity.svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { ContentNode } from '../content/types';

// Helper: Initialize collectionValue status if missing
function ensureCollectionValueStatus() {
	if (collectionValueState && !('status' in collectionValueState)) {
		collectionValueState.status = collection.value?.status ?? 'unpublish';
	}
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

// Create reactive stores
export const collections = store<{ [uuid: string]: Schema }>({});
export const collectionsById = store<SvelteMap<string, Schema>>(new SvelteMap());
export const currentCollectionId = store<string | null>(null);

// Keep existing stores
export const collectionsLoading = store<boolean>(false);
export const collectionsError = store<string | null>(null);
export const unAssigned = store<Schema>({} as Schema);
export const collection = store<Schema | null>({} as Schema);

// Create reactive state variables for collectionValue
let collectionValueState = $state<Record<string, unknown>>({});
export const collectionValue = {
	get value() {
		ensureCollectionValueStatus();
		return collectionValueState;
	},
	set: (newValue: Record<string, unknown>) => {
		collectionValueState = newValue;
		ensureCollectionValueStatus();
	},
	update: (fn: (value: Record<string, unknown>) => Record<string, unknown>) => {
		const newValue = fn(collectionValueState);
		collectionValueState = newValue;
		ensureCollectionValueStatus();
	}
};

// Create reactive state variables for mode
let modeState = $state<ModeType>('view');
export const mode = {
	get value() {
		return modeState;
	},
	set: (newMode: ModeType) => {
		modeState = newMode;
	},
	update: (fn: (value: ModeType) => ModeType) => {
		const newMode = fn(modeState);
		modeState = newMode;
	}
};

export const modifyEntry = store<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
export const selectedEntries = store<string[]>([]);
export const targetWidget = store<Widget>({ permissions: {} });

export const contentStructure = store<ContentNode[]>([]);

// Reactive calculations
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

// Type exports
export type { ModeType };
