/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state for the application using Svelte stores.
 *
 * This module provides functionality to:
 * - Manage the collection state for the application
 * - Manage the selected entries for a collection
 * - Manage the target widget for a collection
 * - Manage the modify entry state for a collection
 * - Manage the status map for a collection
 */

import { writable, type Writable } from 'svelte/store';
import type { CollectionNames, Schema } from '@src/collections/types';

// Stores for managing collections and their states
export const collections = writable({}) as Writable<{ [key in CollectionNames]: Schema }>; // Stores dynamic collections, allowing runtime modification.
export const unAssigned: Writable<Schema[]> = writable([]); // Tracks unassigned collections that don't belong to a category or schema.
export const collection: Writable<Schema> = writable(); // Manages the current active collection being worked on.
export const collectionValue: Writable<any> = writable({}); //Stores dynamic values or content related to the current collection.

// Collective crud
export const mode: Writable<'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media'> = writable('view');

// Store for managing modify entry actions (CRUD) for collections
export const modifyEntry: Writable<(status: keyof typeof statusMap) => Promise<void>> = writable();

// Store for managing selected entries in a collection
export const selectedEntries: Writable<string[]> = writable([]);

// Store for managing the target widget in a collection
export const targetWidget: Writable<any> = writable({});

// Status map for various collection states
export const statusMap = {
	delete: 'deleted',
	publish: 'published',
	unpublish: 'unpublished',
	schedule: 'scheduled',
	clone: 'cloned',
	test: 'testing'
};

interface Collection extends Omit<Schema, 'name'> {
	id: number;
	name: CollectionNames;
}

//  Initialize categories store with an array structure
export const categories: Writable<
	Array<{
		id: number;
		name: string;
		icon: string;
		collections: Array<Collection>;
	}>
> = writable();
