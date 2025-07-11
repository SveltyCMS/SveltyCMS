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
import type { ContentNode } from '../databases/dbInterface';

// Define types
type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

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

// Create reactive stores
export const collections = $state<{ [uuid: string]: Schema }>({});
export const collectionsById = $state<Map<string, Schema>>(new Map());

// Keep existing stores
let collectionState = $state<Schema | null>({} as Schema);
export const collection = {
	get value() {
		return collectionState;
	},
	set: (newValue: Schema | null) => {
		collectionState = newValue;
	},
	update: (fn: (value: Schema | null) => Schema | null) => {
		collectionState = fn(collectionState);
	}
};

// Create reactive state variables for collectionValue
let collectionValueState = $state<Record<string, unknown>>({});
export const collectionValue = {
	get value() {
		return collectionValueState;
	},
	set: (newValue: Record<string, unknown>) => {
		collectionValueState = newValue;
	},
	update: (fn: (value: Record<string, unknown>) => Record<string, unknown>) => {
		collectionValueState = fn(collectionValueState);
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
		modeState = fn(modeState);
	}
};

let modifyEntryState = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
export const modifyEntry = {
	get value() {
		return modifyEntryState;
	},
	set: (newValue: (status?: keyof typeof statusMap) => Promise<void>) => {
		modifyEntryState = newValue;
	},
	update: (fn: (value: (status?: keyof typeof statusMap) => Promise<void>) => (status?: keyof typeof statusMap) => Promise<void>) => {
		modifyEntryState = fn(modifyEntryState);
	}
};

export const selectedEntries = $state<string[]>([]);
export const targetWidget = $state<Widget>({ permissions: {} });

let contentStructureState = $state<ContentNode[]>([]);
export const contentStructure = {
	get value() {
		return contentStructureState;
	},
	set: (newValue: ContentNode[]) => {
		contentStructureState = newValue;
	},
	update: (fn: (value: ContentNode[]) => ContentNode[]) => {
		contentStructureState = fn(contentStructureState);
	}
};

// Reactive calculations
const totalCollections = $derived(Object.keys(collections).length);
const hasSelectedEntries = $derived(selectedEntries.length > 0);
const currentCollectionName = $derived(collection?.name);

export function getTotalCollections() {
	return totalCollections;
}
export function getHasSelectedEntries() {
	return hasSelectedEntries;
}
export function getCurrentCollectionName() {
	return currentCollectionName;
}

// Entry management
export const entryActions = {
	addEntry(entryId: string) {
		selectedEntries.push(entryId);
	},
	removeEntry(entryId: string) {
		const idx = selectedEntries.indexOf(entryId);
		if (idx !== -1) selectedEntries.splice(idx, 1);
	},
	clear() {
		selectedEntries.length = 0;
	}
};

// Type exports
export type { ModeType };
