import { publicEnv } from '@root/config/public';
import { writable, type Writable } from 'svelte/store';

import type { CollectionNames, Schema } from '@src/collections/types';

// ParaglideJS
import * as m from '@src/paraglide/messages.js';
import { setLanguageTag, type AvailableLanguageTag } from '@src/paraglide/runtime';

// Initialize system language store with default language
export const systemLanguage: Writable<AvailableLanguageTag> = writable(publicEnv.DEFAULT_SYSTEM_LANGUAGE) as any;

// Initialize messages store with ParaglideJS messages
export const messages: Writable<typeof m> = writable({ ...m });

// Initialize content language store with default content language
export const contentLanguage: Writable<string> = writable(publicEnv.DEFAULT_CONTENT_LANGUAGE);

// Initialize categories store with an array structure
export const categories: Writable<
	Array<{
		name: string;
		icon: string;
		collections: Array<Schema>;
	}>
> = writable();

// Initialize collections store with a dictionary structure
export const collections = writable({}) as Writable<{ [key in CollectionNames]: Schema }>;

// Initialize unassigned collections store with an array structure
export const unAssigned: Writable<Array<Schema>> = writable();

// Initialize individual collection store
export const collection: Writable<Schema> = writable();

// Initialize save function store with default functions
export const saveFunction: Writable<{ fn: (args: any) => any; reset: () => any }> = writable({
	fn: () => {},
	reset: () => {}
});

// Define table headers
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Initialize header action button store
export const headerActionButton: Writable<ConstructorOfATypedSvelteComponent | string> = writable();

// Define indexer, currently set to undefined
export const indexer = undefined;

// Subscribe to systemLanguage store changes to set the language tag and update messages
systemLanguage.subscribe((val) => {
	setLanguageTag(val);
	messages.set({ ...m });
});
