/**
 * @file src/stores/collectionStore.ts
 * @description Manages the collection state for the application
 *
 * Features:
 *  - Collection state management
 * 	- Asynchronous collection initialization from server
 * 	- Collection updating with server synchronization
 * 	- Error handling for API calls
 * 	- TypeScript support with custom Collection type
 *
 */

import type { CollectionNames, Schema, CategoryData } from '@src/collections/types';

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

// Create a class to manage collection state
class CollectionState {
	// State declarations
	$state = {
		collections: {} as { [key in CollectionNames]: Schema },
		unAssigned: [] as Schema[],
		collection: undefined as Schema | undefined,
		collectionValue: {},
		mode: 'view' as ModeType,
		modifyEntry: undefined as ((status: keyof typeof statusMap) => Promise<void>) | undefined,
		selectedEntries: [] as string[],
		targetWidget: {},
		categories: {} as Record<string, CategoryData>
	};

	// Computed values
	get $derived() {
		return {
			// Example derived value - total number of collections
			totalCollections: Object.keys(this.$state.collections).length,
			// Example - check if any entries are selected
			hasSelectedEntries: this.$state.selectedEntries.length > 0,
			// Example - get active collection name
			activeCollectionName: this.$state.collection?.name
		};
	}

	// Methods to update state
	setCollections(collections: { [key in CollectionNames]: Schema }) {
		this.$state.collections = collections;
	}

	setUnAssigned(schemas: Schema[]) {
		this.$state.unAssigned = schemas;
	}

	setCollection(schema: Schema | undefined) {
		this.$state.collection = schema;
	}

	setCollectionValue(value: any) {
		this.$state.collectionValue = value;
	}

	setMode(mode: ModeType) {
		this.$state.mode = mode;
	}

	setModifyEntry(fn: ((status: keyof typeof statusMap) => Promise<void>) | undefined) {
		this.$state.modifyEntry = fn;
	}

	setSelectedEntries(entries: string[]) {
		this.$state.selectedEntries = entries;
	}

	setTargetWidget(widget: any) {
		this.$state.targetWidget = widget;
	}

	setCategories(categories: Record<string, CategoryData>) {
		this.$state.categories = categories;
	}

	// Helper methods
	addSelectedEntry(entryId: string) {
		if (!this.$state.selectedEntries.includes(entryId)) {
			this.$state.selectedEntries = [...this.$state.selectedEntries, entryId];
		}
	}

	removeSelectedEntry(entryId: string) {
		this.$state.selectedEntries = this.$state.selectedEntries.filter((id) => id !== entryId);
	}

	clearSelectedEntries() {
		this.$state.selectedEntries = [];
	}

	updateCategory(categoryId: string, data: CategoryData) {
		this.$state.categories = {
			...this.$state.categories,
			[categoryId]: data
		};
	}
}

// Export a singleton instance
export const collectionState = new CollectionState();

// For backward compatibility with existing code that uses stores
export const collections = {
	subscribe: (fn: (value: { [key in CollectionNames]: Schema }) => void) => {
		fn(collectionState.$state.collections);
		return () => {};
	},
	set: (value: { [key in CollectionNames]: Schema }) => collectionState.setCollections(value)
};

export const unAssigned = {
	subscribe: (fn: (value: Schema[]) => void) => {
		fn(collectionState.$state.unAssigned);
		return () => {};
	},
	set: (value: Schema[]) => collectionState.setUnAssigned(value)
};

export const collection = {
	subscribe: (fn: (value: Schema | undefined) => void) => {
		fn(collectionState.$state.collection);
		return () => {};
	},
	set: (value: Schema | undefined) => collectionState.setCollection(value)
};

export const collectionValue = {
	subscribe: (fn: (value: any) => void) => {
		fn(collectionState.$state.collectionValue);
		return () => {};
	},
	set: (value: any) => collectionState.setCollectionValue(value)
};

export const mode = {
	subscribe: (fn: (value: ModeType) => void) => {
		fn(collectionState.$state.mode);
		return () => {};
	},
	set: (value: ModeType) => collectionState.setMode(value)
};

export const modifyEntry = {
	subscribe: (fn: (value: ((status: keyof typeof statusMap) => Promise<void>) | undefined) => void) => {
		fn(collectionState.$state.modifyEntry);
		return () => {};
	},
	set: (value: ((status: keyof typeof statusMap) => Promise<void>) | undefined) => collectionState.setModifyEntry(value)
};

export const selectedEntries = {
	subscribe: (fn: (value: string[]) => void) => {
		fn(collectionState.$state.selectedEntries);
		return () => {};
	},
	set: (value: string[]) => collectionState.setSelectedEntries(value)
};

export const targetWidget = {
	subscribe: (fn: (value: any) => void) => {
		fn(collectionState.$state.targetWidget);
		return () => {};
	},
	set: (value: any) => collectionState.setTargetWidget(value)
};

export const categories = {
	subscribe: (fn: (value: Record<string, CategoryData>) => void) => {
		fn(collectionState.$state.categories);
		return () => {};
	},
	set: (value: Record<string, CategoryData>) => collectionState.setCategories(value)
};
