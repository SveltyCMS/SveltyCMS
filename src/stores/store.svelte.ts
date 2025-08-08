/**
 * @file src/stores/store.svelte.ts
 * @description Global state management
 */

import { publicEnv } from '@root/config/public';
import { store } from '@utils/reactivity.svelte';
import type { Locale } from '@src/paraglide/runtime';

// --- Helper Functions & Interfaces ---

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

// Helper function to get cookie value
function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
	return null;
}

// --- Rune-based Stores ---

// Initialize translationProgress with a guaranteed structure
const initialTranslationProgress: TranslationProgress = { show: false };

// Safely handle the languages array to prevent server-side initialization errors
let availableLanguages: Locale[] = [];
try {
	availableLanguages = (publicEnv?.AVAILABLE_CONTENT_LANGUAGES as Locale[]) || [];
} catch {
	// If publicEnv is not available (e.g., during server initialization), use empty array
	console.warn('publicEnv not available during store initialization, using empty languages array');
	availableLanguages = [];
}

for (const lang of availableLanguages) {
	initialTranslationProgress[lang] = {
		total: new Set<string>(),
		translated: new Set<string>()
	};
}

// Internal state - not exported directly
const _translationProgress = $state<TranslationProgress>(initialTranslationProgress);
let _tabSetState = $state<number>(0);
let _drawerExpandedState = $state<boolean>(true);
let _listboxValueState = $state<string>('create');
let _avatarSrc = $state('/Default_User.svg');
const _translationStatus = $state({});
let _completionStatus = $state(0);
let _translationStatusOpen = $state(false);

// Export getter functions for the runes
export function getTranslationProgress() {
	return _translationProgress;
}

export function getTabSetState() {
	return _tabSetState;
}

export function getDrawerExpandedState() {
	return _drawerExpandedState;
}

export function getListboxValueState() {
	return _listboxValueState;
}

export function getAvatarSrc() {
	return _avatarSrc;
}

export function getTranslationStatus() {
	return _translationStatus;
}

export function getCompletionStatus() {
	return _completionStatus;
}

export function getTranslationStatusOpen() {
	return _translationStatusOpen;
}

// Export store-like objects for backward compatibility
export const translationProgress = {
	get value() {
		return _translationProgress;
	},
	set value(newValue: TranslationProgress) {
		Object.assign(_translationProgress, newValue);
	}
};

export const tabSetState = {
	get value() {
		return _tabSetState;
	},
	set value(newValue: number) {
		_tabSetState = newValue;
	}
};

export const drawerExpandedState = {
	get value() {
		return _drawerExpandedState;
	},
	set value(newValue: boolean) {
		_drawerExpandedState = newValue;
	}
};

export const listboxValueState = {
	get value() {
		return _listboxValueState;
	},
	set value(newValue: string) {
		_listboxValueState = newValue;
	}
};

export const avatarSrc = {
	get value() {
		return _avatarSrc;
	},
	set value(newValue: string) {
		_avatarSrc = newValue;
	}
};

// Additional store-like objects for other runes
export const translationStatusStore = {
	get value() {
		return _translationStatus;
	},
	set value(newValue: Record<string, unknown>) {
		Object.assign(_translationStatus, newValue);
	}
};

export const completionStatusStore = {
	get value() {
		return _completionStatus;
	},
	set value(newValue: number) {
		_completionStatus = newValue;
	}
};

export const translationStatusOpenStore = {
	get value() {
		return _translationStatusOpen;
	},
	set value(newValue: boolean) {
		_translationStatusOpen = newValue;
	}
};

// Function-style exports for backward compatibility with old usage
export const translationStatus = () => _translationStatus;
export const completionStatus = () => _completionStatus;
export const translationStatusOpen = () => _translationStatusOpen;

// Export helper functions for backward compatibility
export function setTranslationStatusOpen(value: boolean) {
	_translationStatusOpen = value;
}

export function updateTranslationStatus(value: Record<string, unknown>) {
	Object.assign(_translationStatus, value);
}

export function updateCompletionStatus(value: number) {
	_completionStatus = value;
}

export function updateTranslationStatusOpen(value: boolean) {
	_translationStatusOpen = value;
}

// --- Legacy Svelte 3/4 Stores (for compatibility) ---

// Get initial values from cookies or use defaults (with error handling for server-side)
let initialSystemLanguage: Locale;
let initialContentLanguage: Locale;

try {
	initialSystemLanguage = (getCookie('systemLanguage') as Locale | null) ?? (publicEnv?.BASE_LOCALE as Locale) ?? 'en';
	initialContentLanguage = (getCookie('contentLanguage') as Locale | null) ?? (publicEnv?.DEFAULT_CONTENT_LANGUAGE as Locale) ?? 'en';
} catch {
	// Fallback values for server-side initialization
	initialSystemLanguage = 'en' as Locale;
	initialContentLanguage = 'en' as Locale;
}

export const systemLanguage = store<Locale>(initialSystemLanguage);
export const contentLanguage = store<Locale>(initialContentLanguage);

// Other legacy stores
export const headerActionButton = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
export const headerActionButton2 = store<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
export const pkgBgColor = store('variant-filled-primary');
export const file = store<File | null>(null);
export const saveEditedImage = store(false);
export const saveFunction = store<SaveFunction>({
	fn: () => {},
	reset: () => {}
});
export const saveLayerStore = store(async () => {});
export const shouldShowNextButton = store(false);
export const validationErrors = store<ValidationErrors>({});

// Update cookies when language stores change
systemLanguage.subscribe((sysLang) => {
	if (typeof document !== 'undefined' && sysLang) {
		document.cookie = `systemLanguage=${sysLang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
	}
});

contentLanguage.subscribe((contentLang) => {
	if (typeof document !== 'undefined' && contentLang) {
		document.cookie = `contentLanguage=${contentLang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
	}
});

// --- Backward Compatibility Helpers ---

// For components still using the old store-like API for runes
export const tabSet = {
	get value() {
		return _tabSetState;
	},
	set(newValue: number) {
		_tabSetState = newValue;
	},
	update(fn: (value: number) => number) {
		_tabSetState = fn(_tabSetState);
	},
	subscribe(fn: (value: number) => void) {
		return $effect.root(() => {
			$effect(() => fn(_tabSetState));
			return () => {};
		});
	}
};

export const drawerExpanded = {
	get value() {
		return _drawerExpandedState;
	},
	set(newValue: boolean) {
		_drawerExpandedState = newValue;
	},
	update(fn: (value: boolean) => boolean) {
		_drawerExpandedState = fn(_drawerExpandedState);
	},
	subscribe(fn: (value: boolean) => void) {
		return $effect.root(() => {
			$effect(() => fn(_drawerExpandedState));
			return () => {};
		});
	}
};

export const storeListboxValue = {
	get value() {
		return _listboxValueState;
	},
	set(newValue: string) {
		_listboxValueState = newValue;
	},
	update(fn: (value: string) => string) {
		_listboxValueState = fn(_listboxValueState);
	},
	subscribe(fn: (value: string) => void) {
		return $effect.root(() => {
			$effect(() => fn(_listboxValueState));
			return () => {};
		});
	}
};

// Updates the system language, ensuring the change is persisted to cookies
export function setSystemLanguage(lang: Locale) {
	systemLanguage.set(lang);
}

// Export table headers constant
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Export indexer
export const indexer = undefined;

// Creates a reactive validation store
function createValidationStore() {
	let errors = $state<ValidationErrors>({});
	const isValid = $derived(() => Object.values(errors).every((error) => !error));

	return {
		get errors() {
			return errors;
		},
		get isValid() {
			return isValid;
		},
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
