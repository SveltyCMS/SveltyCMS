/**
 * @file src/stores/store.svelte.ts
 * @description Global state management
 *
 * Performance Optimizations Applied:
 * - Fine-grained reactivity using $state and $derived runes
 * - Minimal re-renders through value comparison checks
 * - Efficient subscription management with $effect.root
 * - Optimized store-like interfaces for backward compatibility
 * - Smart cookie persistence with browser checks
 * - Memory-efficient validation store with derived validity state
 *
 * This module manages:
 * - System and content languages with cookie persistence
 * - Internationalization messages and translation progress
 * - UI state components (tabs, drawer, listbox values)
 * - Validation and loading states with reactive error handling
 * - Image handling with avatar management
 * - Form save functionality with optimized state snapshots
 */

import { publicEnv } from '@root/config/public';
import { store } from '@utils/reactivity.svelte';

// Paraglidejs
import { type Locale } from '@src/paraglide/runtime';

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
	[key in Locale]?: TranslationSet;
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
	const initialSystemLanguage = (getCookie('systemLanguage') as Locale | null) ?? (publicEnv.DEFAULT_SYSTEM_LANGUAGE as Locale);
	const initialContentLanguage = (getCookie('contentLanguage') as Locale | null) ?? (publicEnv.DEFAULT_CONTENT_LANGUAGE as Locale);

	// Language and ParaglideJS i18n
	const systemLanguage = store<Locale>(initialSystemLanguage);
	const contentLanguage = store<Locale>(initialContentLanguage);

	// Translation status - using Svelte 5 runes
	let translationStatus = $state({});
	let completionStatus = $state(0);
	let translationStatusOpen = $state(false);

	// Initialize translationProgress with guaranteed structure for all languages
	const initialTranslationProgress: TranslationProgress = { show: false };
	for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) {
		initialTranslationProgress[lang] = {
			total: new Set<string>(),
			translated: new Set<string>()
		};
	}
	let translationProgress = $state<TranslationProgress>(initialTranslationProgress);

	// UI state with optimized rune-based stores
	let tabSetState = $state<number>(0);
	const tabSet = {
		get value() {
			return tabSetState;
		},
		set(newValue: number) {
			if (tabSetState !== newValue) {
				tabSetState = newValue;
			}
		},
		update(fn: (value: number) => number) {
			const newValue = fn(tabSetState);
			if (tabSetState !== newValue) {
				tabSetState = newValue;
			}
		},
		subscribe(fn: (value: number) => void) {
			return $effect.root(() => {
				$effect(() => {
					fn(tabSetState);
				});
				return () => {};
			});
		}
	};

	let drawerExpandedState = $state<boolean>(true);
	const drawerExpanded = {
		get value() {
			return drawerExpandedState;
		},
		set(newValue: boolean) {
			if (drawerExpandedState !== newValue) {
				drawerExpandedState = newValue;
			}
		},
		update(fn: (value: boolean) => boolean) {
			const newValue = fn(drawerExpandedState);
			if (drawerExpandedState !== newValue) {
				drawerExpandedState = newValue;
			}
		},
		subscribe(fn: (value: boolean) => void) {
			return $effect.root(() => {
				$effect(() => {
					fn(drawerExpandedState);
				});
				return () => {};
			});
		}
	};

	const headerActionButton = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const headerActionButton2 = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	const pkgBgColor = store('variant-filled-primary');

	// Optimized listbox value using Svelte 5 runes for better performance
	// This uses $state for fine-grained reactivity and minimal re-renders
	let listboxValueState = $state<string>('create');

	// Create store-like interface for backward compatibility with existing components
	// This provides optimal performance while maintaining API compatibility
	const storeListboxValue = {
		get value() {
			return listboxValueState;
		},
		set(newValue: string) {
			// Only update if value actually changed for performance
			if (listboxValueState !== newValue) {
				listboxValueState = newValue;
			}
		},
		update(fn: (value: string) => string) {
			const newValue = fn(listboxValueState);
			if (listboxValueState !== newValue) {
				listboxValueState = newValue;
			}
		},
		subscribe(fn: (value: string) => void) {
			return $effect.root(() => {
				$effect(() => {
					fn(listboxValueState);
				});
				return () => {}; // cleanup function
			});
		}
	};

	// Image handling
	let avatarSrc = $state('/Default_User.svg');
	const file = store<File | null>(null);
	const saveEditedImage = store(false);

	// Save functionality
	const saveFunction = store<SaveFunction>({
		fn: () => {},
		reset: () => {}
	});
	const saveLayerStore = store(async () => {});
	const shouldShowNextButton = store(false);

	// Validation
	// Performance Optimizations Summary:
	// 1. Fine-grained reactivity: $state runes track changes at the variable level
	// 2. Minimal re-renders: Value comparison prevents unnecessary updates
	// 3. Efficient subscriptions: $effect.root manages subscription lifecycle
	// 4. Memory optimization: Cleanup functions prevent memory leaks
	// 5. Type safety: Full TypeScript support with proper interfaces

	// Validation store with $derived for automatic validity calculation
	const validationErrors = store<ValidationErrors>({});

	// Use store subscriptions for cookie updates
	systemLanguage.subscribe((sysLang) => {
		if (typeof window !== 'undefined' && sysLang) {
			document.cookie = `systemLanguage=${sysLang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		}
	});

	contentLanguage.subscribe((contentLang) => {
		if (typeof window !== 'undefined' && contentLang) {
			document.cookie = `contentLanguage=${contentLang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		}
	});

	return {
		// Language and ParaglideJS i18n
		systemLanguage,
		contentLanguage,

		// Translation status - rune-based reactive state
		get translationStatus() {
			return translationStatus;
		},
		set translationStatus(value) {
			translationStatus = value;
		},
		get completionStatus() {
			return completionStatus;
		},
		set completionStatus(value) {
			completionStatus = value;
		},
		get translationStatusOpen() {
			return translationStatusOpen;
		},
		set translationStatusOpen(value) {
			translationStatusOpen = value;
		},
		get translationProgress() {
			return translationProgress;
		},
		set translationProgress(value) {
			translationProgress = value;
		},

		// UI state
		tabSet,
		headerActionButton,
		headerActionButton2,
		pkgBgColor,
		drawerExpanded,
		storeListboxValue,

		// Image handling - rune-based reactive state
		get avatarSrc() {
			return avatarSrc;
		},
		set avatarSrc(value) {
			avatarSrc = value;
		},
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
	tabSet,
	headerActionButton,
	headerActionButton2,
	pkgBgColor,
	drawerExpanded,
	storeListboxValue,
	file,
	saveEditedImage,
	saveFunction,
	saveLayerStore,
	shouldShowNextButton,
	validationErrors
} = stores;

// Export rune-based stores
export const avatarSrc = {
	get value() {
		return stores.avatarSrc;
	},
	set(value: string) {
		stores.avatarSrc = value;
	}
};

// Export rune-based translation stores with function-like API to match existing usage
export const translationStatus = () => stores.translationStatus;
export const completionStatus = () => stores.completionStatus;
export const translationStatusOpen = () => stores.translationStatusOpen;
export const setTranslationStatusOpen = (value: boolean) => {
	stores.translationStatusOpen = value;
};
export const translationProgress = () => stores.translationProgress;

// Export update functions for the rune-based stores
export const updateTranslationStatus = (value: Record<string, unknown>) => {
	stores.translationStatus = value;
};
export const updateCompletionStatus = (value: number) => {
	stores.completionStatus = value;
};
export const updateTranslationStatusOpen = (value: boolean) => {
	stores.translationStatusOpen = value;
};
export const updateTranslationProgress = (value: TranslationProgress) => {
	stores.translationProgress = value;
};

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
	const isValid = $derived(() => Object.values(errors).every((error) => !error));

	return {
		// Expose reactive state directly
		get errors() {
			return errors;
		},
		get isValid() {
			return isValid;
		},

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
