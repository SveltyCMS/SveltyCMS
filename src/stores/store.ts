/**
 * @file src/stores/store.ts
 * @description Global state management
 *
 * This module manages:
 * - System and content languages
 * - Internationalization messages
 * - UI state and components
 * - Validation and loading states
 */

import { publicEnv } from '@root/config/public';
import { writable, derived } from 'svelte/store';

// Paraglidejs
import * as m from '@src/paraglide/messages';
import { setLanguageTag, type AvailableLanguageTag } from '@src/paraglide/runtime';

// Define interfaces
interface ValidationErrors {
	[fieldName: string]: string | null;
}

interface TranslationProgress {
	[key: string]: {
		total: Set<any>;
		translated: Set<any>;
	};
}

interface SaveFunction {
	fn: (args?: unknown) => unknown;
	reset: () => void;
}

// Create base stores
const createBaseStores = () => {
	// Language and i18n
	const systemLanguage = writable<AvailableLanguageTag>(publicEnv.DEFAULT_SYSTEM_LANGUAGE);
	const contentLanguage = writable<AvailableLanguageTag>(publicEnv.DEFAULT_CONTENT_LANGUAGE);
	const messages = writable({ ...m });

	// Translation status
	const translationStatus = writable({});
	const completionStatus = writable(0);
	const translationStatusOpen = writable(false);
	const translationProgress = writable<TranslationProgress | { show: boolean }>({ show: false });

	// UI state
	const tabSet = writable(0);
	const headerActionButton = writable<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const headerActionButton2 = writable<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const pkgBgColor = writable('variant-filled-primary');
	const drawerExpanded = writable(true);
	const storeListboxValue = writable('create');

	// Loading state
	const loadingProgress = writable(0);
	const isLoading = writable(false);

	// Image handling
	const avatarSrc = writable('/Default_User.svg');
	const file = writable<File | null>(null);
	const saveEditedImage = writable(false);

	// Save functionality
	const saveFunction = writable<SaveFunction>({
		fn: () => {},
		reset: () => {}
	});
	const saveLayerStore = writable(async () => {});
	const shouldShowNextButton = writable(false);

	// Validation
	const validationErrors = writable<ValidationErrors>({});

	// Derived values
	const isSystemLanguageSet = derived(systemLanguage, ($systemLanguage) => !!$systemLanguage);
	const hasTranslationProgress = derived(translationStatus, ($translationStatus) => Object.keys($translationStatus).length > 0);
	const isDrawerCollapsed = derived(drawerExpanded, ($drawerExpanded) => !$drawerExpanded);
	const canSave = derived([isLoading, saveFunction], ([$isLoading, $saveFunction]) => !$isLoading && !!$saveFunction.fn);

	// Initialize language tag
	systemLanguage.subscribe((value) => {
		if (value) {
			setLanguageTag(value);
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
		validationErrors,

		// Derived values
		isSystemLanguageSet,
		hasTranslationProgress,
		isDrawerCollapsed,
		canSave
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
	validationErrors,
	isSystemLanguageSet,
	hasTranslationProgress,
	isDrawerCollapsed,
	canSave
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
