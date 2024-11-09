/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state for the application using Svelte stores.
 */

import { writable } from 'svelte/store';
import type { CollectionNames, Schema, CategoryData } from '@src/collections/types';

// Define types
type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

// Create stores with initial values
export const collections = writable<{ [key in CollectionNames]: Schema }>({} as { [key in CollectionNames]: Schema });
export const unAssigned = writable<Schema[]>([]);
export const collection = writable<Schema | undefined>(undefined);
export const collectionValue = writable<any>({});
export const mode = writable<ModeType>('view');
export const modifyEntry = writable<((status: keyof typeof statusMap) => Promise<void>) | undefined>(undefined);
export const selectedEntries = writable<string[]>([]);
export const targetWidget = writable<any>({});
export const categories = writable<Record<string, CategoryData>>({});

// Status map for various collection states
export const statusMap = {
	deleted: 'deleted',
	published: 'published',
	unpublished: 'unpublished',
	scheduled: 'scheduled',
	cloned: 'cloned',
	testing: 'testing'
} as const;
