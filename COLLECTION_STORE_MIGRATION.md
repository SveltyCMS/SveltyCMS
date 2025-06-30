# Collection Store Migration Example

This shows how to migrate `src/stores/collectionStore.svelte.ts` from custom store to Svelte 5 runes.

## Current State Analysis

The collection store has a mix of custom stores and some Svelte 5 runes already. Let's migrate the remaining custom stores.

## Step 1: Update Imports

**Before:**
```typescript
import { store } from '@utils/reactivity.svelte';
```

**After:**
```typescript
import { $state, $derived } from 'svelte';
```

## Step 2: Convert Store Declarations

**Before:**
```typescript
// Create reactive stores 
export const collections = store<{ [uuid: string]: Schema }>({});
export const collectionsById = store<Map<string, Schema>>(new Map());
export const currentCollectionId = store<string | null>(null);

// Keep existing stores
export const collectionsLoading = store<boolean>(false);
export const collectionsError = store<string | null>(null);
export const unAssigned = store<Schema>({} as Schema);
export const collection = store<Schema | null>({} as Schema);

export const modifyEntry = store<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
export const selectedEntries = store<string[]>([]);
export const targetWidget = store<Widget>({ permissions: {} });

export const contentStructure = store<ContentNode[]>([]);

// Reactive calculations 
export const totalCollections = store(() => Object.keys(collections.value).length);
export const hasSelectedEntries = store(() => selectedEntries.value.length > 0);
export const currentCollectionName = store(() => collection.value?.name);
```

**After:**
```typescript
// Create reactive stores 
export const collections = $state<{ [uuid: string]: Schema }>({});
export const collectionsById = $state<Map<string, Schema>>(new Map());
export const currentCollectionId = $state<string | null>(null);

// Keep existing stores
export const collectionsLoading = $state<boolean>(false);
export const collectionsError = $state<string | null>(null);
export const unAssigned = $state<Schema>({} as Schema);
export const collection = $state<Schema | null>({} as Schema);

export const modifyEntry = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
export const selectedEntries = $state<string[]>([]);
export const targetWidget = $state<Widget>({ permissions: {} });

export const contentStructure = $state<ContentNode[]>([]);

// Reactive calculations 
export const totalCollections = $derived(Object.keys(collections).length);
export const hasSelectedEntries = $derived(selectedEntries.length > 0);
export const currentCollectionName = $derived(collection?.name);
```

## Step 3: Update Store Usage

**Before:**
```typescript
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
```

**After:**
```typescript
// Entry management
export const entryActions = {
	addEntry(entryId: string) {
		selectedEntries = [...selectedEntries, entryId];
	},
	removeEntry(entryId: string) {
		selectedEntries = selectedEntries.filter((id) => id !== entryId);
	},
	clear() {
		selectedEntries = [];
	}
};
```

## Step 4: Complete Migrated File

```typescript
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

import { $state, $derived } from 'svelte';
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
export const currentCollectionId = $state<string | null>(null);

// Keep existing stores
export const collectionsLoading = $state<boolean>(false);
export const collectionsError = $state<string | null>(null);
export const unAssigned = $state<Schema>({} as Schema);
export const collection = $state<Schema | null>({} as Schema);

// Create reactive state variables for collectionValue
let collectionValueState = $state<Record<string, unknown>>({});
export const collectionValue = {
	get value() { return collectionValueState; },
	set: (newValue: Record<string, unknown>) => { collectionValueState = newValue; },
	update: (fn: (value: Record<string, unknown>) => Record<string, unknown>) => {
		collectionValueState = fn(collectionValueState);
	}
};

// Create reactive state variables for mode
let modeState = $state<ModeType>('view');
export const mode = {
	get value() { return modeState; },
	set: (newMode: ModeType) => { modeState = newMode; },
	update: (fn: (value: ModeType) => ModeType) => {
		modeState = fn(modeState);
	}
};

export const modifyEntry = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
export const selectedEntries = $state<string[]>([]);
export const targetWidget = $state<Widget>({ permissions: {} });

export const contentStructure = $state<ContentNode[]>([]);

// Reactive calculations 
export const totalCollections = $derived(Object.keys(collections).length);
export const hasSelectedEntries = $derived(selectedEntries.length > 0);
export const currentCollectionName = $derived(collection?.name);

// Entry management
export const entryActions = {
	addEntry(entryId: string) {
		selectedEntries = [...selectedEntries, entryId];
	},
	removeEntry(entryId: string) {
		selectedEntries = selectedEntries.filter((id) => id !== entryId);
	},
	clear() {
		selectedEntries = [];
	}
};

// Type exports
export type { ModeType };
```

## Key Changes Summary

1. **Imports**: `store` → `$state, $derived`
2. **Store Creation**: `store<T>(value)` → `$state<T>(value)`
3. **Derived Stores**: `store(() => expr)` → `$derived(expr)`
4. **Store Access**: `.value` → direct access
5. **Store Updates**: `.set()` → direct assignment
6. **Store Updates**: `.update()` → direct assignment with spread

## Testing the Migration

After migration, test:

1. Collection loading and display
2. Entry selection and management
3. Mode switching
4. Collection value updates
5. Reactive calculations (totalCollections, hasSelectedEntries, etc.)
6. Console for any errors

## Benefits

- **Simpler API**: Direct assignment instead of `.set()` and `.update()`
- **Better Performance**: Native Svelte 5 runes are optimized
- **Cleaner Code**: Less boilerplate with direct access
- **Future-Proof**: Aligned with Svelte 5's direction
</rewritten_file> 