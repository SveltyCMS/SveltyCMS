/**
 * @file src/stores/store.svelte.ts
 * @description Global state management
 *
 * This module manages:
 * - System and content languages
 * - Internationalization messages
 * - UI state and components
 * - Validation and loading states
 */

import { publicEnv } from '@root/config/public';
import { store } from '@utils/reactivity.svelte';

// Paraglidejs
import * as m from '@src/paraglide/messages';
import { setLanguageTag, type AvailableLanguageTag } from '@src/paraglide/runtime';

// Define interfaces
interface ValidationErrors {
	[fieldName: string]: string | null;
}

interface SaveFunction {
	fn: (args?: unknown) => unknown;
	reset: () => void;
}

// Translation progress types
export interface TranslationSet {
	total: Set<string>;
	translated: Set<string>;
}

export type TranslationProgress = {
	[key in AvailableLanguageTag]?: TranslationSet;
} & {
	show: boolean;
};

// Helper function to get cookie value
function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
	return null;
}

// Create base stores
const createBaseStores = () => {
	// Get initial values from cookies or use defaults
	const initialSystemLanguage = (getCookie('systemLanguage') as AvailableLanguageTag | null) ?? publicEnv.DEFAULT_SYSTEM_LANGUAGE;
	const initialContentLanguage = (getCookie('contentLanguage') as AvailableLanguageTag | null) ?? publicEnv.DEFAULT_CONTENT_LANGUAGE;

	// Language and i18n
	const systemLanguage = store<AvailableLanguageTag>(initialSystemLanguage as AvailableLanguageTag);
	const contentLanguage = store<AvailableLanguageTag>(initialContentLanguage as AvailableLanguageTag);
	const messages = store({ ...m });

	// Translation status
	const translationStatus = store({});
	const completionStatus = store(0);
	const translationStatusOpen = store(false);

	// Initialize translationProgress with guaranteed structure for all languages
	const initialTranslationProgress: TranslationProgress = { show: false };
	for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES as AvailableLanguageTag[]) {
		initialTranslationProgress[lang] = {
			total: new Set<string>(),
			translated: new Set<string>()
		};
	}
	const translationProgress = store<TranslationProgress>(initialTranslationProgress);

	// UI state
	const tabSet = store(0);
	const headerActionButton = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const headerActionButton2 = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const pkgBgColor = store('variant-filled-primary');
	const drawerExpanded = store(true);
	const storeListboxValue = store('create');

	// Loading state
	const loadingProgress = store(0);
	const isLoading = store(false);

	// Image handling
	const avatarSrc = store('/Default_User.svg');
	const file = store<File | null>(null);
	const saveEditedImage = store(false);

	// Save functionality
	const saveFunction = store<SaveFunction>({
		fn: () => { },
		reset: () => { }
	});
	const saveLayerStore = store(async () => { });
	const shouldShowNextButton = store(false);

	// Validation
	const validationErrors = store<ValidationErrors>({});

	// Use store subscriptions for cookie updates
	systemLanguage.subscribe((sysLang) => {
		if (typeof window !== 'undefined' && sysLang) {
			document.cookie = `systemLanguage=${sysLang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
			setLanguageTag(sysLang);
			messages.set({ ...m });
		}
	});

	contentLanguage.subscribe((contentLang) => {
		if (typeof window !== 'undefined' && contentLang) {
			document.cookie = `contentLanguage=${contentLang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
			setLanguageTag(contentLang);
			messages.set({ ...m });
		}
	});

	return {
		// Language and i18n
		systemLanguage,
		contentLanguage,
		messages,

		// Translation status
		translationStatus,
		completionStatus,
		translationStatusOpen,
		translationProgress,

		// UI state
		tabSet,
		headerActionButton,
		headerActionButton2,
		pkgBgColor,
		drawerExpanded,
		storeListboxValue,

		// Loading state
		loadingProgress,
		isLoading,

		// Image handling
		avatarSrc,
		file,
		saveEditedImage,

		// Save functionality
		saveFunction,
		saveLayerStore,
		shouldShowNextButton,

		// Validation
		validationErrors
	};
};

// Create and export stores
const stores = createBaseStores();

// Export individual stores
export const {
	systemLanguage,
	contentLanguage,
	messages,
	translationStatus,
	completionStatus,
	translationStatusOpen,
	translationProgress,
	tabSet,
	headerActionButton,
	headerActionButton2,
	pkgBgColor,
	drawerExpanded,
	storeListboxValue,
	loadingProgress,
	isLoading,
	avatarSrc,
	file,
	saveEditedImage,
	saveFunction,
	saveLayerStore,
	shouldShowNextButton,
	validationErrors
} = stores;

// Export table headers constant
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Export indexer
export const indexer = undefined;

/**
 * Creates a reactive validation store using Svelte 5 runes.
 * This store manages validation errors and provides derived state for validity.
 */
function createValidationStore() {
	let errors = $state<ValidationErrors>({});

	// Derived state that automatically recalculates when `errors` changes.
	const isValid = $derived(Object.values(errors).every(error => !error));

	return {
		// Expose reactive state directly
		get errors() { return errors; },
		get isValid() { return isValid; },

		// Methods to manipulate the state
		setError: (fieldName: string, errorMessage: string | null) => {
			errors[fieldName] = errorMessage;
		},

		clearError: (fieldName: string) => {
			if (fieldName in errors) {
				delete errors[fieldName];
			}
		},

		clearAllErrors: () => {
			errors = {};
		},

		getError: (fieldName: string): string | null => {
			return errors[fieldName] || null;
		},

		hasError: (fieldName: string): boolean => {
			return !!errors[fieldName];
		}
	};
}

export const validationStore = createValidationStore();