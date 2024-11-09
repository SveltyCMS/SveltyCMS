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

// Paraglidejs
import * as m from '@src/paraglide/messages.js';
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

// Main application state manager
class AppStateManager {
	// State declaration
	$state = {
		// Language and i18n
		systemLanguage: publicEnv.DEFAULT_SYSTEM_LANGUAGE as AvailableLanguageTag,
		contentLanguage: publicEnv.DEFAULT_CONTENT_LANGUAGE as AvailableLanguageTag,
		messages: { ...m },

		// Translation status
		translationStatus: {},
		completionStatus: 0,
		translationStatusOpen: false,
		translationProgress: { show: false } as TranslationProgress | { show: boolean },

		// UI state
		tabSet: 0,
		headerActionButton: undefined as ConstructorOfATypedSvelteComponent | string | undefined,
		headerActionButton2: undefined as ConstructorOfATypedSvelteComponent | string | undefined,
		pkgBgColor: 'variant-filled-primary',
		drawerExpanded: true,
		storeListboxValue: 'create',

		// Loading state
		loadingProgress: 0,
		isLoading: false,

		// Image handling
		avatarSrc: '/Default_User.svg',
		file: null as File | null,
		saveEditedImage: false,

		// Save functionality
		saveFunction: {
			fn: () => {},
			reset: () => {}
		} as SaveFunction,
		saveLayerStore: async () => {},
		shouldShowNextButton: false,

		// Validation
		validationErrors: {} as ValidationErrors
	};

	// Computed values
	get $derived() {
		return {
			isSystemLanguageSet: !!this.$state.systemLanguage,
			hasTranslationProgress: Object.keys(this.$state.translationStatus).length > 0,
			isDrawerCollapsed: !this.$state.drawerExpanded,
			canSave: !this.$state.isLoading && !!this.$state.saveFunction.fn
		};
	}

	// Table headers (constant)
	readonly tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

	constructor() {
		// Initialize language tag
		if (this.$state.systemLanguage) {
			setLanguageTag(this.$state.systemLanguage);
			this.$state.messages = { ...m };
		}
	}

	// Language methods
	setSystemLanguage(lang: AvailableLanguageTag) {
		this.$state.systemLanguage = lang;
		setLanguageTag(lang);
		this.$state.messages = { ...m };
	}

	setContentLanguage(lang: AvailableLanguageTag) {
		this.$state.contentLanguage = lang;
	}

	// Translation methods
	updateTranslationStatus(status: any) {
		this.$state.translationStatus = status;
	}

	setTranslationProgress(progress: TranslationProgress | { show: boolean }) {
		this.$state.translationProgress = progress;
	}

	// UI state methods
	setTabSet(value: number) {
		this.$state.tabSet = value;
	}

	setHeaderActionButton(component: ConstructorOfATypedSvelteComponent | string) {
		this.$state.headerActionButton = component;
	}

	toggleDrawer() {
		this.$state.drawerExpanded = !this.$state.drawerExpanded;
	}

	// Loading methods
	setLoading(isLoading: boolean) {
		this.$state.isLoading = isLoading;
	}

	updateLoadingProgress(progress: number) {
		this.$state.loadingProgress = progress;
	}

	// Image handling methods
	setAvatarSrc(src: string) {
		this.$state.avatarSrc = src;
	}

	setFile(file: File | null) {
		this.$state.file = file;
	}

	// Save functionality methods
	setSaveFunction(fn: SaveFunction['fn'], reset: () => void) {
		this.$state.saveFunction = { fn, reset };
	}

	// Validation methods
	setValidationError(fieldName: string, errorMessage: string | null) {
		this.$state.validationErrors = {
			...this.$state.validationErrors,
			[fieldName]: errorMessage
		};
	}

	clearValidationError(fieldName: string) {
		const newErrors = { ...this.$state.validationErrors };
		delete newErrors[fieldName];
		this.$state.validationErrors = newErrors;
	}

	hasValidationError(fieldName: string): boolean {
		return !!this.$state.validationErrors[fieldName];
	}

	getValidationError(fieldName: string): string | null {
		return this.$state.validationErrors[fieldName] || null;
	}
}

// Create and export singleton instance
export const appState = new AppStateManager();

// For backward compatibility with existing code that uses stores
export const systemLanguage = {
	subscribe: (fn: (value: AvailableLanguageTag) => void) => {
		fn(appState.$state.systemLanguage);
		return () => {};
	},
	set: (value: AvailableLanguageTag) => appState.setSystemLanguage(value)
};

export const contentLanguage = {
	subscribe: (fn: (value: AvailableLanguageTag) => void) => {
		fn(appState.$state.contentLanguage);
		return () => {};
	},
	set: (value: AvailableLanguageTag) => appState.setContentLanguage(value)
};

export const messages = {
	subscribe: (fn: (value: typeof m) => void) => {
		fn(appState.$state.messages);
		return () => {};
	},
	set: (value: typeof m) => {
		appState.$state.messages = value;
	}
};

// Export avatar store
export const avatarSrc = {
	subscribe: (fn: (value: string) => void) => {
		fn(appState.$state.avatarSrc);
		return () => {};
	},
	set: (value: string) => appState.setAvatarSrc(value)
};

// Export other stores and constants
export const { tableHeaders } = appState;
export const indexer = undefined;

// Export validation store interface
export const validationStore = {
	subscribe: (fn: (value: ValidationErrors) => void) => {
		fn(appState.$state.validationErrors);
		return () => {};
	},
	setError: (fieldName: string, errorMessage: string | null) => appState.setValidationError(fieldName, errorMessage),
	clearError: (fieldName: string) => appState.clearValidationError(fieldName),
	getError: (fieldName: string) => appState.getValidationError(fieldName),
	hasError: (fieldName: string) => appState.hasValidationError(fieldName)
};
