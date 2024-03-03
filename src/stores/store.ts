import { writable, type Writable } from 'svelte/store';
import { PUBLIC_CONTENT_LANGUAGES, PUBLIC_AVAILABLE_SYSTEMLANGUAGES } from '$env/static/public';
import type { Schema } from '@collections/types';

//paraglidejs
import { sourceLanguageTag, availableLanguageTags } from '@src/paraglide/runtime';

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
export const entryData: Writable<any> = writable({});
// collective crud
export const mode: Writable<'view' | 'edit' | 'create' | 'delete' | 'modify'> = writable('view');
// collective status
export const modifyEntry: Writable<(status: 'delete' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'test') => any> = writable(() => {});

// Store image data while editing
export const file = writable<File | null>(null);
export const saveEditedImage: Writable<boolean> = writable(false);

// Create a writable store to hold the selected row data
export const selectedRows = writable([]);

// ------------ Languages ------------
// Create a writable store for contentLanguage with initial value of PUBLIC_CONTENT_LANGUAGES
export const contentLanguage = writable(Object.keys(JSON.parse(PUBLIC_CONTENT_LANGUAGES))[0]);
export const defaultContentLanguage = Object.keys(JSON.parse(PUBLIC_CONTENT_LANGUAGES))[0];

// Create a writable store for systemLanguage
export const systemLanguage = writable(globalThis?.localStorage?.getItem('systemLanguage') || sourceLanguageTag);

//Filter systemLanguage via environment file
export const AVAILABLE_SYSTEMLANGUAGES = PUBLIC_AVAILABLE_SYSTEMLANGUAGES
	? (JSON.parse(PUBLIC_AVAILABLE_SYSTEMLANGUAGES) as string[])
	: availableLanguageTags; // default value

// TranslationStatus.svelte
export const translationStatusOpen = writable(false);

//  ------------ Other ------------

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

// -------------- Store ListboxValue -----------------
// export const storeListboxValue: Writable<string> = writable('create');
export const storeListboxValue: Writable<'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete' | 'test'> = writable('create');
