import { writable, type Writable } from 'svelte/store';
import { publicEnv } from '@root/config/public';
import type { Schema } from '@collections/types';

//paraglidejs
import * as m from '@src/paraglide/messages.js';
import { setLanguageTag, type AvailableLanguageTag } from '@src/paraglide/runtime';

// Categories
export const categories: Writable<
	Array<{
		name: string;
		icon: string;
		collections: Array<Schema>;
	}>
> = writable();
export const collections: Writable<Array<Schema>> = writable();
export const unAssigned: Writable<Array<Schema>> = writable();
export const collection: Writable<Schema> = writable();

// ------------ Collections ------------
// Collections stores
export const currentCollection = writable(null);
// collective data of collection
export const collectionValue: any = writable({});
// entry data of collection
export const entryData: Writable<any> = writable({});
// collective crud
export const mode: Writable<'view' | 'edit' | 'create' | 'delete' | 'modify'> = writable('view');
// collective status
// export const modifyEntry: Writable<(status: 'delete' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'test') => any> = writable(() => {});
export const modifyEntry: Writable<(status: keyof typeof statusMap) => any> = writable(() => {});

//entrylist statusMap
export const statusMap = {
	delete: 'deleted',
	publish: 'published',
	unpublish: 'unpublished',
	schedule: 'scheduled',
	clone: 'cloned',
	test: 'testing'
};

// -------------- Store ListboxValue -----------------
export const storeListboxValue: Writable<string> = writable('create');

// Store image data while editing
export const file = writable<File | null>(null);
export const saveEditedImage: Writable<boolean> = writable(false);

// ------------ Languages ------------
// Create a writable store for contentLanguage with initial value of PublicEnv.DEFAULT_CONTENT_LANGUAGE
export const contentLanguage: Writable<string> = writable(publicEnv.DEFAULT_CONTENT_LANGUAGE);

// Create a writable store for systemLanguage with initial value of PublicEnv.DEFAULT_SYSTEM_LANGUAGE
export const systemLanguage: Writable<AvailableLanguageTag> = writable(publicEnv.DEFAULT_SYSTEM_LANGUAGE) as any;

// Set the language tag
export const messages: Writable<typeof m> = writable({ ...m });
systemLanguage.subscribe((val) => {
	setLanguageTag(val);
	messages.set({ ...m });
});

// Content Translation Completion Status
export const translationStatus = writable({});
export const completionStatus = writable(0);
//  ------------ Other ------------
// TranslationStatus.svelte modal
export const translationStatusOpen = writable(false);

// Tab skeleton store
export const tabSet: Writable<number> = writable(0);

// Cancel/Reload HeaderButton
export const headerActionButton: Writable<boolean> = writable(true);
export const headerActionButton2: Writable<ConstructorOfATypedSvelteComponent | string> = writable();
export const drawerExpanded: Writable<boolean> = writable(true);

// Permission store
export const permissionStore = writable({});

// Create a writable store for Avatar
export const avatarSrc: Writable<string> = writable();

// Git Version check
export const pkgBgColor = writable('variant-filled-primary');

// loading indicator
export const loadingProgress = writable(0);
export const isLoading: Writable<boolean> = writable(false);

//MegaMenu Save Layer Store & trigger
export const saveFunction: Writable<{ fn: (args: any) => any; reset: () => any }> = writable({ fn: () => {}, reset: () => {} });
export const saveLayerStore = writable(async () => {});
export const shouldShowNextButton = writable(false);
