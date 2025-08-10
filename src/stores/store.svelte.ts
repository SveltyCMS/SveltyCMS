/**
 * @file src/stores/store.svelte.ts
 * @description Global state management
 */

import { publicEnv } from '@root/config/public';
import type { Locale } from '@src/paraglide/runtime';
import { store } from '@utils/reactivity.svelte';
import { SvelteSet } from 'svelte/reactivity';

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
		// Normalize avatar URL so it consistently uses the /files route in prod builds
		try {
			if (!newValue) {
				_avatarSrc = '/Default_User.svg';
				return;
			}

			// data URI or absolute http(s) URLs are used as-is
			if (newValue.startsWith('data:') || /^https?:\/\//i.test(newValue)) {
				_avatarSrc = newValue;
				return;
			}

			// Default static avatar should never go through /files
			if (/^\/?Default_User\.svg$/i.test(newValue)) {
				_avatarSrc = '/Default_User.svg';
				return;
			}

			const MEDIA_FOLDER = publicEnv?.MEDIA_FOLDER || 'mediaFiles';

			// Strip any leading origin or duplicate slashes (defensive)
			let url = newValue.replace(/^https?:\/\/[^/]+/i, '');

			// Ensure no leading double slashes
			url = url.replace(/^\/+/, '/');

			// Guard against invalid bare /files URL which would 400 the files endpoint
			if (url === '/files' || url === '/files/') {
				_avatarSrc = '/Default_User.svg';
				return;
			}

			// If already using /files, leave as-is
			if (url.startsWith('/files/')) {
				_avatarSrc = url;
				return;
			}

			// Remove leading slash for uniform checks below
			const trimmed = url.startsWith('/') ? url.slice(1) : url;

			// Additional guard for "files" without a path
			if (trimmed === 'files') {
				_avatarSrc = '/Default_User.svg';
				return;
			}

			// Respect explicit static/ paths (leave as root path)
			if (trimmed.startsWith('static/')) {
				_avatarSrc = `/${trimmed}`;
				return;
			}

			// Cases:
			// - mediaFiles/avatars/...
			// - avatars/...
			// - mediaFiles/mediaFiles/avatars/... (defensive)
			if (trimmed.startsWith(`${MEDIA_FOLDER}/`)) {
				const rest = trimmed.slice(MEDIA_FOLDER.length + 1); // after media folder/
				_avatarSrc = `/files/${rest}`;
				return;
			}

			if (trimmed.startsWith('avatars/')) {
				_avatarSrc = `/files/${trimmed}`;
				return;
			}

			// Fallback: if it looks like a relative media path, prefix /files/
			// Otherwise, keep as-is
			_avatarSrc = trimmed ? (trimmed.endsWith('.svg') ? `/${trimmed}` : `/files/${trimmed}`) : '/Default_User.svg';
		} catch {
			_avatarSrc = newValue || '/Default_User.svg';
		}
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

// --- Small helper: rune-backed store that also behaves like a Svelte store ---
function createRuneBackedStore<T>(initial: T) {
	let state = $state<T>(initial);
	const subscribers = new SvelteSet<(v: T) => void>();
	const notify = () => {
		for (const fn of subscribers) {
			try {
				fn(state);
			} catch {
				// noop: subscriber errors shouldn't break notifications
			}
		}
	};
	return {
		// Rune-style value access
		get value() {
			return state;
		},
		set value(v: T) {
			state = v;
			notify();
		},
		// Svelte store API for backward compatibility
		set(v: T) {
			state = v;
			notify();
		},
		update(fn: (v: T) => T) {
			state = fn(state);
			notify();
		},
		subscribe(run: (v: T) => void) {
			subscribers.add(run);
			try {
				run(state);
			} catch {
				// noop on initial call
			}
			return () => {
				subscribers.delete(run);
			};
		}
	} as const;
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
// Switch to rune-backed values while preserving store API
export const saveLayerStore = createRuneBackedStore<() => Promise<void>>(async () => {});
export const shouldShowNextButton = createRuneBackedStore(false);
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
