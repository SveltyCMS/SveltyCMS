/**
 * @file src/stores/store.ts
 * @description Initializes and manages global stores for the application's state management.
 *
 * This module sets up various Svelte stores for managing:
 * - System and content languages
 * - Internationalization messages
 * - Save functionality
 * - Table headers and UI components
 */
import { writable, type Writable } from 'svelte/store';
import { publicEnv } from '@root/config/public';

// Paraglidejs
import * as m from '@src/paraglide/messages.js';
import { setLanguageTag, type AvailableLanguageTag } from '@src/paraglide/runtime';

// System and Content Language Stores
export const systemLanguage: Writable<AvailableLanguageTag> = writable(publicEnv.DEFAULT_SYSTEM_LANGUAGE);
export const contentLanguage: Writable<string> = writable(publicEnv.DEFAULT_CONTENT_LANGUAGE);

// Internationalization messages store with ParaglideJS messages
// Set the language tag
export const messages: Writable<typeof m> = writable({ ...m });

// Subscribe to systemLanguage store changes to set the language tag and update messages
systemLanguage.subscribe((val) => {
	setLanguageTag(val);
	messages.set({ ...m });
});

// Translation Completion Status
export const translationStatus = writable({});
export const completionStatus = writable(0);
// TranslationStatus.svelte modal
export const translationStatusOpen = writable(false);
export const translationProgress: Writable<{ [key: string]: { total: Set<any>; translated: Set<any> } } | { show: boolean; }> =
	writable({
		show: false
	});

// Tab skeleton store
export const tabSet: Writable<number> = writable(0);

// Initialize header action button store
export const headerActionButton: Writable<ConstructorOfATypedSvelteComponent | string> = writable();
export const headerActionButton2: Writable<ConstructorOfATypedSvelteComponent | string> = writable();
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Git Version store
export const pkgBgColor = writable('variant-filled-primary');

// Loading indicator
export const loadingProgress = writable(0);
export const isLoading: Writable<boolean> = writable(false);

// Store for save function and layer saving triggers
export const saveFunction: Writable<{ fn: (args: any) => any; reset: () => any }> = writable({ fn: () => {}, reset: () => {} });
export const saveLayerStore = writable(async () => {});
export const shouldShowNextButton = writable(false);

// Avatar Image store
export const avatarSrc = writable<string>('/Default_User.svg');

// Store image data while editing
export const file = writable<File | null>(null);
export const saveEditedImage: Writable<boolean> = writable(false);

// Define indexer, currently set to undefined for ....
export const indexer = undefined;

export const drawerExpanded: Writable<boolean> = writable(true);

//  Store ListboxValue
export const storeListboxValue: Writable<string> = writable('create');

// Widget store

// Define the interface for validation errors
interface ValidationErrors {
	[fieldName: string]: string | null;
}
// Create a writable store for validation errors
export const validationStore = (() => {
	const { subscribe, update } = writable<ValidationErrors>({});

	const setError = (fieldName: string, errorMessage: string | null) => {
		update((errors) => ({ ...errors, [fieldName]: errorMessage }));
	};

	const clearError = (fieldName: string) => {
		update((errors) => {
			delete errors[fieldName];
			return errors;
		});
	};
	const getError = (fieldName: string): string | null => {
		let error: string | null = null;
		subscribe((errors) => {
			error = errors[fieldName] || null;
		})();
		return error;
	};

	const hasError = (fieldName: string): boolean => {
		let hasError = false;
		subscribe((errors) => {
			hasError = !!errors[fieldName];
		})();
		return hasError;
	};

	return {
		subscribe,
		setError,
		clearError,
		getError,
		hasError
	};
})();
