/**
 * @file src/stores/store.svelte.ts
 * @description Centralized store management for the CMS application
 */

import type { Locale } from '@src/paraglide/runtime';
import { getPublicSettings } from '@src/stores/globalSettings';

// Import necessary types
import type { ConstructorOfATypedSvelteComponent } from 'svelte';

// Store type for backward compatibility
type Store<T> = {
	value: T;
	set: (value: T) => void;
	update: (fn: (value: T) => T) => void;
	subscribe: (fn: (value: T) => void) => () => void;
};

// Helper function to create a store
function store<T>(initialValue: T): Store<T> {
	let value = initialValue;
	const subscribers = new Set<(value: T) => void>();

	return {
		get value() {
			return value;
		},
		set(newValue: T) {
			value = newValue;
			subscribers.forEach((fn) => fn(value));
		},
		update(fn: (value: T) => T) {
			value = fn(value);
			subscribers.forEach((fn) => fn(value));
		},
		subscribe(fn: (value: T) => void) {
			subscribers.add(fn);
			fn(value);
			return () => {
				subscribers.delete(fn);
			};
		}
	};
}

// Helper function to get cookie value
function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
	return null;
}

// Create base stores with proper fallbacks
const createBaseStores = () => {
	// Get settings from global settings or use defaults
	const settings = getPublicSettings();
	const availableLanguages = settings.AVAILABLE_CONTENT_LANGUAGES || ['en'];
	const baseLocale = settings.BASE_LOCALE || 'en';

	// Initialize translationProgress with guaranteed structure for all languages
	const initialTranslationProgress: TranslationProgress = { show: false };
	for (const lang of availableLanguages as Locale[]) {
		initialTranslationProgress[lang] = {
			total: new Set<string>(),
			translated: new Set<string>()
		};
	}

	// Create stores with proper fallbacks
	const systemLanguage = store<Locale>((getCookie('systemLanguage') as Locale) || (baseLocale as Locale));
	const contentLanguage = store<Locale>((getCookie('contentLanguage') as Locale) || (settings.DEFAULT_CONTENT_LANGUAGE as Locale) || 'en');

	return {
		systemLanguage,
		contentLanguage,
		translationProgress: store<TranslationProgress>(initialTranslationProgress)
	};
};

// Create the base stores
const baseStores = createBaseStores();

// Export the stores
export const systemLanguage = baseStores.systemLanguage;
export const contentLanguage = baseStores.contentLanguage;
export const translationProgress = baseStores.translationProgress;

// Interface definitions
interface ValidationErrors {
	[fieldName: string]: string | null;
}

interface SaveFunction {
	fn: (args?: unknown) => unknown;
	reset: () => void;
}

export interface TranslationSet {
	total: Set<string>;
	translated: Set<string>;
}

export type TranslationProgress = {
	[key in Locale]?: TranslationSet;
} & {
	show: boolean;
};

// Create validation store
function createValidationStore() {
	const errors = store<ValidationErrors>({});
	const isValid = store<boolean>(true);

	return {
		get errors() {
			return errors.value;
		},
		get isValid() {
			return isValid.value;
		},
		setErrors(newErrors: ValidationErrors) {
			errors.set(newErrors);
			isValid.set(Object.keys(newErrors).length === 0);
		},
		clearErrors() {
			errors.set({});
			isValid.set(true);
			}
	};
}

// Export validation store
export const validationStore = createValidationStore();

// Export save function store
export const saveFunction = store<SaveFunction | null>(null);

// Export other stores
export const avatarSrc = store<string>('');
export const headerActionButton = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
export const headerActionButton2 = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
export const pkgBgColor = store('variant-filled-primary');

// Listbox value store
export const listboxValue = store<string>('create');
export const storeListboxValue = listboxValue; // Alias for backwards compatibility

// Drawer expanded store
export const drawerExpanded = store<boolean>(true);

// Tab set store
export const tabSet = store<number>(0);

// Next button visibility store
export const shouldShowNextButton = store<boolean>(false);

// Save layer store - holds a save function that can be called by components
export const saveLayerStore = store<() => Promise<void>>(async () => {});

// Translation status stores
export const translationStatus = store<Record<string, unknown>>({});
export const completionStatus = store<number>(0);
export const translationStatusOpen = store<boolean>(false);

// Helper functions
export function setSystemLanguage(lang: Locale) {
	systemLanguage.set(lang);
	// Set cookie for persistence
	if (typeof document !== 'undefined') {
		document.cookie = `systemLanguage=${lang}; path=/; max-age=31536000`;
		}
}

export function setContentLanguage(lang: Locale) {
	contentLanguage.set(lang);
	// Set cookie for persistence
	if (typeof document !== 'undefined') {
		document.cookie = `contentLanguage=${lang}; path=/; max-age=31536000`;
	}
}

// Update functions for translation progress
export const updateTranslationStatus = (value: Record<string, unknown>) => {
	translationStatus.set(value);
};

export const updateCompletionStatus = (value: number) => {
	completionStatus.set(value);
};

export const updateTranslationStatusOpen = (value: boolean) => {
	translationStatusOpen.set(value);
};

// Alias for backwards compatibility
export const setTranslationStatusOpen = updateTranslationStatusOpen;

export const updateTranslationProgress = (value: TranslationProgress) => {
	translationProgress.set(value);
};

// Export table headers constant
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Export indexer
export const indexer = undefined;
