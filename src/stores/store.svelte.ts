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
import { createToaster } from '@skeletonlabs/skeleton-svelte';



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

// skeleton Toast store
export const toaster = createToaster();


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
	const translationProgress = store<TranslationProgress>({
		show: false
	});

	// UI state
	const tabSet = store(0);
	const headerActionButton = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const headerActionButton2 = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const pkgBgColor = store('preset-filled-primary-500');
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

// Export validation store interface
export const validationStore = {
	subscribe: validationErrors.subscribe,
	setError: (fieldName: string, errorMessage: string | null) => {
		validationErrors.update((errors) => ({
			...errors,
			[fieldName]: errorMessage
		}));
	},
	clearError: (fieldName: string) => {
		validationErrors.update((errors) => {
			const newErrors = { ...errors };
			delete newErrors[fieldName];
			return newErrors;
		});
	},
	getError: (fieldName: string) => {
		let error: string | null = null;
		validationErrors.subscribe((errors) => {
			error = errors[fieldName] || null;
		})();
		return error;
	},
	hasError: (fieldName: string) => {
		let hasError = false;
		validationErrors.subscribe((errors) => {
			hasError = !!errors[fieldName];
		})();
		return hasError;
	}
};
