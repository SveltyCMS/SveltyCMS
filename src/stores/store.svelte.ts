/**
 * @file src/stores/store.svelte.ts
 * @description Global state management
 */

import type { Locale } from '@src/paraglide/runtime';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { SvelteSet } from 'svelte/reactivity';
import { createToaster } from '@skeletonlabs/skeleton-svelte';

// --- Helper Functions & Interfaces ---

// Helper function for avatar URL normalization
function normalizeAvatarUrl(url: string | null | undefined): string {
	const DEFAULT_AVATAR = '/Default_User.svg';

	// Guard: empty or null
	if (!url) return DEFAULT_AVATAR;

	// Pass-through: data URIs and absolute URLs
	if (url.startsWith('data:') || /^https?:\/\//i.test(url)) {
		return url;
	}

	// Pass-through: default avatar
	if (/^\/?Default_User\.svg$/i.test(url)) {
		return DEFAULT_AVATAR;
	}

	// Normalize: remove leading origin and slashes
	let normalized = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '/');

	// Guard: bare /files or /files/
	if (normalized === '/files' || normalized === '/files/') {
		return DEFAULT_AVATAR;
	}

	// Pass-through: already /files/
	if (normalized.startsWith('/files/')) {
		return normalized;
	}

	const trimmed = normalized.startsWith('/') ? normalized.slice(1) : normalized;

	// Guard: bare "files"
	if (trimmed === 'files') return DEFAULT_AVATAR;

	// Pass-through: static paths
	if (trimmed.startsWith('static/')) {
		return `/${trimmed}`;
	}

	const MEDIA_FOLDER = publicEnv.MEDIA_FOLDER;

	// Transform: mediaFiles/... → /files/...
	if (trimmed.startsWith(`${MEDIA_FOLDER}/`)) {
		const rest = trimmed.slice(MEDIA_FOLDER.length + 1);
		return `/files/${rest}`;
	}

	// Transform: avatars/... → /files/avatars/...
	if (trimmed.startsWith('avatars/')) {
		return `/files/${trimmed}`;
	}

	// Fallback: .svg → root, else → /files/
	return trimmed ? (trimmed.endsWith('.svg') ? `/${trimmed}` : `/files/${trimmed}`) : DEFAULT_AVATAR;
}

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
	availableLanguages = (publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) || [];
} catch {
	// If not available (e.g., during server initialization), use empty array
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
			_avatarSrc = normalizeAvatarUrl(newValue);
		} catch (error) {
			console.error('[Store] Avatar normalization failed:', error);
			_avatarSrc = '/Default_User.svg';
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

/**
 * Language Management with ParaglideJS Integration
 *
 * Architecture:
 * - systemLanguage store: UI state management (read/write interface for components)
 * - ParaglideJS: Reads from `systemLanguage` cookie, provides translations via getLocale()
 *
 * Flow:
 * 1. Component calls: systemLanguage.set('de')
 * 2. Store automatically sets cookie: systemLanguage=de
 * 3. ParaglideJS reads cookie and updates translations
 * 4. Components read via: getLocale() or systemLanguage.value
 *
 * Why not use ParaglideJS directly?
 * - ParaglideJS doesn't provide a client-side API to change language
 * - It relies on cookies/URL routing for language detection
 * - Our store provides the reactive bridge between UI and ParaglideJS
 */

// Get initial values from cookies or use defaults (with error handling for server-side)
let initialSystemLanguage: Locale;
let initialContentLanguage: Locale;

try {
	initialSystemLanguage = (getCookie('systemLanguage') as Locale | null) ?? (publicEnv.BASE_LOCALE as Locale) ?? 'en';
	initialContentLanguage = (getCookie('contentLanguage') as Locale | null) ?? (publicEnv.DEFAULT_CONTENT_LANGUAGE as Locale) ?? 'en';
} catch {
	// Fallback values for server-side initialization
	initialSystemLanguage = 'en' as Locale;
	initialContentLanguage = 'en' as Locale;
}

// Create reactive state for languages with cookie syncing
let _systemLanguage = $state<Locale>(initialSystemLanguage);
let _contentLanguage = $state<Locale>(initialContentLanguage);

// Subscriber sets for manual subscription tracking (server-safe)
const systemLanguageSubscribers = new SvelteSet<(value: Locale) => void>();
const contentLanguageSubscribers = new SvelteSet<(value: Locale) => void>();

// Notify all subscribers
function notifySystemLanguage() {
	for (const fn of systemLanguageSubscribers) {
		try {
			fn(_systemLanguage);
		} catch {
			// noop: subscriber errors shouldn't break notifications
		}
	}
}

function notifyContentLanguage() {
	for (const fn of contentLanguageSubscribers) {
		try {
			fn(_contentLanguage);
		} catch {
			// noop: subscriber errors shouldn't break notifications
		}
	}
}

// Language stores with Svelte store API compatibility (server-safe)
export const systemLanguage = {
	get value() {
		return _systemLanguage;
	},
	set value(newValue: Locale) {
		_systemLanguage = newValue;
		if (typeof document !== 'undefined' && newValue) {
			document.cookie = `systemLanguage=${newValue}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		}
		notifySystemLanguage();
	},
	set(newValue: Locale) {
		this.value = newValue;
	},
	update(fn: (value: Locale) => Locale) {
		this.value = fn(this.value);
	},
	subscribe(run: (value: Locale) => void) {
		systemLanguageSubscribers.add(run);
		// Run immediately with current value (Svelte store convention)
		try {
			run(_systemLanguage);
		} catch {
			// noop on initial call
		}
		return () => {
			systemLanguageSubscribers.delete(run);
		};
	}
};

export const contentLanguage = {
	get value() {
		return _contentLanguage;
	},
	set value(newValue: Locale) {
		_contentLanguage = newValue;
		if (typeof document !== 'undefined' && newValue) {
			document.cookie = `contentLanguage=${newValue}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		}
		notifyContentLanguage();
	},
	set(newValue: Locale) {
		this.value = newValue;
	},
	update(fn: (value: Locale) => Locale) {
		this.value = fn(this.value);
	},
	subscribe(run: (value: Locale) => void) {
		contentLanguageSubscribers.add(run);
		// Run immediately with current value (Svelte store convention)
		try {
			run(_contentLanguage);
		} catch {
			// noop on initial call
		}
		return () => {
			contentLanguageSubscribers.delete(run);
		};
	}
};

// Simple reactive state for other stores
let _headerActionButton = $state<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
let _headerActionButton2 = $state<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
let _pkgBgColor = $state('preset-filled-primary');
let _file = $state<File | null>(null);
let _saveEditedImage = $state(false);
let _saveFunction = $state<SaveFunction>({
	fn: () => {},
	reset: () => {}
});
let _validationErrors = $state<ValidationErrors>({});

// Subscriber sets for manual subscription tracking
const headerActionButtonSubscribers = new SvelteSet<(value: ConstructorOfATypedSvelteComponent | string | undefined) => void>();
const headerActionButton2Subscribers = new SvelteSet<(value: ConstructorOfATypedSvelteComponent | string | undefined) => void>();
const pkgBgColorSubscribers = new SvelteSet<(value: string) => void>();
const fileSubscribers = new SvelteSet<(value: File | null) => void>();
const saveEditedImageSubscribers = new SvelteSet<(value: boolean) => void>();
const saveFunctionSubscribers = new SvelteSet<(value: SaveFunction) => void>();
const validationErrorsSubscribers = new SvelteSet<(value: ValidationErrors) => void>();

// Helper to create simple store wrappers
function createSimpleStore<T>(getter: () => T, setter: (value: T) => void, subscribers: SvelteSet<(value: T) => void>) {
	const notify = () => {
		const currentValue = getter();
		for (const fn of subscribers) {
			try {
				fn(currentValue);
			} catch {
				// noop
			}
		}
	};

	return {
		get value() {
			return getter();
		},
		set value(newValue: T) {
			setter(newValue);
			notify();
		},
		set(newValue: T) {
			this.value = newValue;
		},
		update(fn: (value: T) => T) {
			this.value = fn(this.value);
		},
		subscribe(run: (value: T) => void) {
			subscribers.add(run);
			try {
				run(getter());
			} catch {
				// noop
			}
			return () => {
				subscribers.delete(run);
			};
		}
	};
}

// Export stores with Svelte store API compatibility
export const headerActionButton = createSimpleStore(
	() => _headerActionButton,
	(v) => {
		_headerActionButton = v;
	},
	headerActionButtonSubscribers
);

export const headerActionButton2 = createSimpleStore(
	() => _headerActionButton2,
	(v) => {
		_headerActionButton2 = v;
	},
	headerActionButton2Subscribers
);

export const pkgBgColor = createSimpleStore(
	() => _pkgBgColor,
	(v) => {
		_pkgBgColor = v;
	},
	pkgBgColorSubscribers
);

export const file = createSimpleStore(
	() => _file,
	(v) => {
		_file = v;
	},
	fileSubscribers
);

export const saveEditedImage = createSimpleStore(
	() => _saveEditedImage,
	(v) => {
		_saveEditedImage = v;
	},
	saveEditedImageSubscribers
);

export const saveFunction = createSimpleStore(
	() => _saveFunction,
	(v) => {
		_saveFunction = v;
	},
	saveFunctionSubscribers
);

export const validationErrors = createSimpleStore(
	() => _validationErrors,
	(v) => {
		_validationErrors = v;
	},
	validationErrorsSubscribers
);

// These are already using createRuneBackedStore which is fine
export const saveLayerStore = createRuneBackedStore<() => Promise<void>>(async () => {});
export const shouldShowNextButton = createRuneBackedStore(false);

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

// Export table headers constant
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Export indexer
export const indexer = undefined;

// Creates a reactive validation store
const isDev = process.env.NODE_ENV !== 'production';
const validationLogger = isDev ? (msg: string, ...args: any[]) => console.log(msg, ...args) : () => {}; // no-op in production

function createValidationStore() {
	let errors = $state<ValidationErrors>({});
	const isValid = $derived(Object.values(errors).every((error) => !error));
	const subscribers = new SvelteSet<(value: { errors: ValidationErrors; isValid: boolean }) => void>();

	const notify = () => {
		const current = { errors: { ...errors }, isValid: isValid };
		for (const fn of subscribers) {
			try {
				fn(current);
			} catch {
				// noop: subscriber errors shouldn't break notifications
			}
		}
	};

	return {
		_lastLoggedState: undefined as string | undefined,
		get errors() {
			return errors;
		},
		get isValid() {
			// Validation tracking is silent for performance
			return isValid;
		},
		setError: (fieldName: string, errorMessage: string | null) => {
			// Silent validation error setting
			errors[fieldName] = errorMessage;
			// 🔍 DEBUG: Log error setting
			validationLogger('[ValidationStore] setError:', fieldName, errorMessage, 'isValid:', isValid);
			notify();
		},
		clearError: (fieldName: string) => {
			// Silent validation error clearing
			if (fieldName in errors) {
				delete errors[fieldName];
				// 🔍 DEBUG: Log error clearing
				validationLogger('[ValidationStore] clearError:', fieldName, 'isValid:', isValid);
				notify();
			}
		},
		clearAllErrors: () => {
			errors = {};
			notify();
		},
		getError: (fieldName: string): string | null => {
			return errors[fieldName] || null;
		},
		hasError: (fieldName: string): boolean => {
			return !!errors[fieldName];
		},
		// Svelte store contract
		subscribe: (run: (value: { errors: ValidationErrors; isValid: boolean }) => void) => {
			subscribers.add(run);
			try {
				run({ errors: { ...errors }, isValid: isValid }); // Call the derived function
			} catch {
				// noop on initial call
			}
			return () => {
				subscribers.delete(run);
			};
		}
	};
}

export const validationStore = createValidationStore();

// --- Data Change Tracking Store ---
/**
 * Tracks whether form data has been modified from its initial state.
 * Used by Fields.svelte to communicate with save buttons in HeaderEdit/RightSidebar.
 *
 * Flow:
 * 1. Fields.svelte detects changes and calls setHasChanges(true)
 * 2. Save buttons check hasChanges before deciding to reload
 * 3. After save/cancel, reset() is called to clear the flag
 */
function createDataChangeStore() {
	let hasChanges = $state<boolean>(false);
	let initialDataSnapshot = $state<string>('');
	const subscribers = new SvelteSet<(value: boolean) => void>();

	const notify = () => {
		for (const fn of subscribers) {
			try {
				fn(hasChanges);
			} catch {
				// noop: subscriber errors shouldn't break notifications
			}
		}
	};

	return {
		get value() {
			return hasChanges;
		},
		get hasChanges() {
			return hasChanges;
		},
		get initialSnapshot() {
			return initialDataSnapshot;
		},
		setHasChanges: (value: boolean) => {
			if (hasChanges !== value) {
				hasChanges = value;
				notify();
			}
		},
		setInitialSnapshot: (data: Record<string, unknown>) => {
			initialDataSnapshot = JSON.stringify(data);
			hasChanges = false;
			notify();
		},
		compareWithCurrent: (currentData: Record<string, unknown>): boolean => {
			if (!initialDataSnapshot) return false;
			const currentSnapshot = JSON.stringify(currentData);
			const changed = currentSnapshot !== initialDataSnapshot;
			if (hasChanges !== changed) {
				hasChanges = changed;
				notify();
			}
			return changed;
		},
		reset: () => {
			hasChanges = false;
			initialDataSnapshot = '';
			notify();
		},
		// Svelte store contract
		subscribe: (run: (value: boolean) => void) => {
			subscribers.add(run);
			try {
				run(hasChanges);
			} catch {
				// noop on initial call
			}
			return () => {
				subscribers.delete(run);
			};
		}
	};
}

export const dataChangeStore = createDataChangeStore();

// Skeleton Toaster Singleton
export const toaster = createToaster();
