/**
 * @file src/stores/store.svelte.ts
 * @description Global state management with Enterprise-grade reactivity (SveltyCMS 2025)
 */

import type { Locale } from '@src/paraglide/runtime';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { createToaster } from '@skeletonlabs/skeleton-svelte';

// --- TYPES & INTERFACES ---

interface SaveFunction {
	fn: (args?: unknown) => unknown;
	reset: () => void;
}

export interface TranslationSet {
	total: SvelteSet<string>;
	translated: SvelteSet<string>;
}

export type TranslationProgress = {
	[key in Locale]?: TranslationSet;
} & {
	show: boolean;
};

// --- HELPER FUNCTIONS ---

/**
 * Normalizes avatar URLs to ensure consistency across environments.
 */
export function normalizeAvatarUrl(url: string | null | undefined): string {
	const DEFAULT_AVATAR = '/Default_User.svg';
	if (!url) return DEFAULT_AVATAR;

	if (url.startsWith('data:') || /^https?:\/\//i.test(url)) return url;
	if (/^\/?Default_User\.svg$/i.test(url)) return DEFAULT_AVATAR;

	let normalized = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '/');
	if (normalized === '/files' || normalized === '/files/') return DEFAULT_AVATAR;
	if (normalized.startsWith('/files/')) return normalized;

	const trimmed = normalized.startsWith('/') ? normalized.slice(1) : normalized;
	if (trimmed === 'files') return DEFAULT_AVATAR;

	if (trimmed.startsWith('static/')) return `/${trimmed}`;

	const MEDIA_FOLDER = publicEnv.MEDIA_FOLDER;
	if (trimmed.startsWith(`${MEDIA_FOLDER}/`)) {
		return `/files/${trimmed.slice(MEDIA_FOLDER.length + 1)}`;
	}
	if (trimmed.startsWith('avatars/')) return `/files/${trimmed}`;

	return trimmed ? (trimmed.endsWith('.svg') ? `/${trimmed}` : `/files/${trimmed}`) : DEFAULT_AVATAR;
}

/**
 * Cookie management helper
 */
function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
	return null;
}

function setCookie(name: string, value: string) {
	if (typeof document === 'undefined' || !value) return;
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

// --- CORE APP STORE ---

export class AppStore {
	// Granular Reactive State
	translationProgress = $state({ show: false }) as TranslationProgress;
	validationErrorsMap = new SvelteMap<string, string | null>();

	// Core UI State
	tabSetState = $state(0);
	drawerExpandedState = $state(true);
	listboxValueState = $state('create');
	avatarSrc = $state('/Default_User.svg');

	// Status & Completion
	translationStatus = $state<Record<string, unknown>>({});
	completionStatus = $state(0);
	translationStatusOpen = $state(false);

	// Language Management (with persistence)
	_systemLanguage = $state<Locale>('en' as Locale);
	_contentLanguage = $state<Locale>('en' as Locale);

	// Rendering & UI Elements
	headerActionButton = $state<any>(undefined);
	headerActionButton2 = $state<any>(undefined);
	pkgBgColor = $state('preset-filled-primary-500');
	file = $state<File | null>(null);
	saveEditedImage = $state(false);
	saveFunction = $state<SaveFunction>({ fn: () => {}, reset: () => {} });

	// App Lifecycle
	saveLayerStore = $state<() => Promise<void>>(async () => {});
	shouldShowNextButton = $state(false);

	constructor() {
		this.init();
	}

	private init() {
		// 1. Initialize Languages from Cookies/Env
		try {
			this._systemLanguage = (getCookie('systemLanguage') as Locale) ?? (publicEnv.BASE_LOCALE as Locale) ?? 'en';
			this._contentLanguage = (getCookie('contentLanguage') as Locale) ?? (publicEnv.DEFAULT_CONTENT_LANGUAGE as Locale) ?? 'en';
		} catch {
			this._systemLanguage = 'en' as Locale;
			this._contentLanguage = 'en' as Locale;
		}

		// 2. Initialize Translation Progress Maps
		const langs = (publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) || [];
		for (const lang of langs) {
			this.translationProgress[lang] = {
				total: new SvelteSet<string>(),
				translated: new SvelteSet<string>()
			};
		}
	}

	// Dynamic Getters/Setters for Language (Auto-sync with cookies)
	get systemLanguage() {
		return this._systemLanguage;
	}
	set systemLanguage(v: Locale) {
		this._systemLanguage = v;
		setCookie('systemLanguage', v);
	}

	get contentLanguage() {
		return this._contentLanguage;
	}
	set contentLanguage(v: Locale) {
		this._contentLanguage = v;
		setCookie('contentLanguage', v);
	}

	// Methods
	setAvatarSrc(v: string) {
		this.avatarSrc = normalizeAvatarUrl(v);
	}

	updateTranslationStatus(value: Record<string, unknown>) {
		Object.assign(this.translationStatus, value);
	}

	setTranslationStatusOpen(v: boolean) {
		this.translationStatusOpen = v;
	}

	setCompletionStatus(v: number) {
		this.completionStatus = v;
	}
}

export const app = new AppStore();

// --- ENTERPRISE VALIDATION STORE ---

export const validationStore = {
	get errors() {
		return Object.fromEntries(app.validationErrorsMap);
	},
	get isValid() {
		for (const error of app.validationErrorsMap.values()) {
			if (error) return false;
		}
		return true;
	},
	setError: (fieldName: string, errorMessage: string | null) => {
		if (app.validationErrorsMap.get(fieldName) !== errorMessage) {
			app.validationErrorsMap.set(fieldName, errorMessage);
		}
	},
	clearError: (fieldName: string) => {
		if (app.validationErrorsMap.has(fieldName)) {
			app.validationErrorsMap.delete(fieldName);
		}
	},
	clearAllErrors: () => app.validationErrorsMap.clear(),
	getError: (fieldName: string) => app.validationErrorsMap.get(fieldName) || null,
	hasError: (fieldName: string) => !!app.validationErrorsMap.get(fieldName)
};

// --- ENTERPRISE DATA CHANGE TRACKING ---

class DataChangeStore {
	hasChanges = $state(false);
	initialDataSnapshot = $state('');

	setHasChanges(v: boolean) {
		this.hasChanges = v;
	}

	setInitialSnapshot(data: Record<string, unknown>) {
		this.initialDataSnapshot = JSON.stringify(data);
		this.hasChanges = false;
	}

	compareWithCurrent(currentData: Record<string, unknown>): boolean {
		if (!this.initialDataSnapshot) return false;
		const currentSnapshot = JSON.stringify(currentData);
		const changed = currentSnapshot !== this.initialDataSnapshot;
		if (this.hasChanges !== changed) this.hasChanges = changed;
		return changed;
	}

	reset() {
		this.hasChanges = false;
		this.initialDataSnapshot = '';
	}
}

export const dataChangeStore = new DataChangeStore();

// Skeleton Toaster Singleton
const baseToaster = createToaster();
export const toaster = {
	...baseToaster,
	success: (t: any) => baseToaster.success({ duration: 5000, ...t }),
	error: (t: any) => baseToaster.error({ duration: 5000, ...t }),
	warning: (t: any) => baseToaster.warning({ duration: 5000, ...t }),
	info: (t: any) => baseToaster.info({ duration: 5000, ...t })
};

// Static Constants
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;
export const indexer = undefined;

// --- Language Store Wrappers (Compatibility with theme branch API) ---
// These provide .value getter and .set() method that delegate to app store

export const systemLanguage = {
	get value() {
		return app.systemLanguage;
	},
	set value(newValue: Locale) {
		app.systemLanguage = newValue;
	},
	set(newValue: Locale) {
		app.systemLanguage = newValue;
	},
	update(fn: (value: Locale) => Locale) {
		app.systemLanguage = fn(app.systemLanguage);
	}
};

export const contentLanguage = {
	get value() {
		return app.contentLanguage;
	},
	set value(newValue: Locale) {
		app.contentLanguage = newValue;
	},
	set(newValue: Locale) {
		app.contentLanguage = newValue;
	},
	update(fn: (value: Locale) => Locale) {
		app.contentLanguage = fn(app.contentLanguage);
	}
};

// --- Compatibility Exports for theme branch components ---

// translationProgress - direct reference to app.translationProgress
export const translationProgress = {
	get value() {
		return app.translationProgress;
	},
	set value(newValue: TranslationProgress) {
		Object.assign(app.translationProgress, newValue);
	},
	subscribe(fn: (value: TranslationProgress) => void) {
		fn(app.translationProgress);
		return () => {};
	}
};

// avatarSrc - provides .value getter and setter
export const avatarSrc = {
	get value() {
		return app.avatarSrc;
	},
	set value(newValue: string) {
		app.avatarSrc = newValue;
	},
	set(newValue: string) {
		app.avatarSrc = newValue;
	}
};

export const storeListboxValue = {
	get value() {
		return app.listboxValueState;
	},
	set value(newValue: string) {
		app.listboxValueState = newValue;
	},
	set(newValue: string) {
		app.listboxValueState = newValue;
	},
	subscribe(fn: (value: string) => void) {
		fn(app.listboxValueState);
		return () => {};
	}
};

// tabSet - direct reference to app.tabSetState
export const tabSet = {
	get value() {
		return app.tabSetState;
	},
	set value(newValue: number) {
		app.tabSetState = newValue;
	},
	set(newValue: number) {
		app.tabSetState = newValue;
	},
	subscribe(fn: (value: number) => void) {
		fn(app.tabSetState);
		return () => {};
	},
	update(fn: (value: number) => number) {
		app.tabSetState = fn(app.tabSetState);
	}
};
