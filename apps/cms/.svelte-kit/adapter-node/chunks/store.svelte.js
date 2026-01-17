import 'clsx';
import { publicEnv } from './globalSettings.svelte.js';
import { createStore } from '@zag-js/toast';
const SvelteSet = globalThis.Set;
const SvelteMap = globalThis.Map;
function normalizeAvatarUrl(url) {
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
function getCookie(name) {
	if (typeof document === 'undefined') return null;
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
	return null;
}
function setCookie(name, value) {
	if (typeof document === 'undefined' || !value) return;
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
class AppStore {
	// Granular Reactive State
	translationProgress = { show: false };
	validationErrorsMap = new SvelteMap();
	// Core UI State
	tabSetState = 0;
	drawerExpandedState = true;
	listboxValueState = 'create';
	avatarSrc = '/Default_User.svg';
	// Status & Completion
	translationStatus = {};
	completionStatus = 0;
	translationStatusOpen = false;
	// Language Management (with persistence)
	_systemLanguage = 'en';
	_contentLanguage = 'en';
	// Rendering & UI Elements
	headerActionButton = void 0;
	headerActionButton2 = void 0;
	pkgBgColor = 'preset-filled-primary-500';
	file = null;
	saveEditedImage = false;
	saveFunction = { fn: () => {}, reset: () => {} };
	// App Lifecycle
	saveLayerStore = async () => {};
	shouldShowNextButton = false;
	constructor() {
		this.init();
	}
	init() {
		try {
			this._systemLanguage = getCookie('systemLanguage') ?? publicEnv.BASE_LOCALE ?? 'en';
			this._contentLanguage = getCookie('contentLanguage') ?? publicEnv.DEFAULT_CONTENT_LANGUAGE ?? 'en';
		} catch {
			this._systemLanguage = 'en';
			this._contentLanguage = 'en';
		}
		const langs = publicEnv.AVAILABLE_CONTENT_LANGUAGES || [];
		for (const lang of langs) {
			this.translationProgress[lang] = { total: new SvelteSet(), translated: new SvelteSet() };
		}
	}
	// Dynamic Getters/Setters for Language (Auto-sync with cookies)
	get systemLanguage() {
		return this._systemLanguage;
	}
	set systemLanguage(v) {
		this._systemLanguage = v;
		setCookie('systemLanguage', v);
	}
	get contentLanguage() {
		return this._contentLanguage;
	}
	set contentLanguage(v) {
		this._contentLanguage = v;
		setCookie('contentLanguage', v);
	}
	// Methods
	setAvatarSrc(v) {
		this.avatarSrc = normalizeAvatarUrl(v);
	}
	updateTranslationStatus(value) {
		Object.assign(this.translationStatus, value);
	}
	setTranslationStatusOpen(v) {
		this.translationStatusOpen = v;
	}
	setCompletionStatus(v) {
		this.completionStatus = v;
	}
}
const app = new AppStore();
const validationStore = {
	get errors() {
		return Object.fromEntries(app.validationErrorsMap);
	},
	get isValid() {
		for (const error of app.validationErrorsMap.values()) {
			if (error) return false;
		}
		return true;
	},
	setError: (fieldName, errorMessage) => {
		if (app.validationErrorsMap.get(fieldName) !== errorMessage) {
			app.validationErrorsMap.set(fieldName, errorMessage);
		}
	},
	clearError: (fieldName) => {
		if (app.validationErrorsMap.has(fieldName)) {
			app.validationErrorsMap.delete(fieldName);
		}
	},
	clearAllErrors: () => app.validationErrorsMap.clear(),
	getError: (fieldName) => app.validationErrorsMap.get(fieldName) || null,
	hasError: (fieldName) => !!app.validationErrorsMap.get(fieldName)
};
const toaster = createStore();
const systemLanguage = {
	get value() {
		return app.systemLanguage;
	},
	set value(newValue) {
		app.systemLanguage = newValue;
	},
	set(newValue) {
		app.systemLanguage = newValue;
	},
	update(fn) {
		app.systemLanguage = fn(app.systemLanguage);
	}
};
const contentLanguage = {
	get value() {
		return app.contentLanguage;
	},
	set value(newValue) {
		app.contentLanguage = newValue;
	},
	set(newValue) {
		app.contentLanguage = newValue;
	},
	update(fn) {
		app.contentLanguage = fn(app.contentLanguage);
	}
};
const translationProgress = {
	get value() {
		return app.translationProgress;
	},
	set value(newValue) {
		Object.assign(app.translationProgress, newValue);
	}
};
const avatarSrc = {
	get value() {
		return app.avatarSrc;
	},
	set value(newValue) {
		app.avatarSrc = newValue;
	}
};
const storeListboxValue = {
	get value() {
		return app.listboxValueState;
	},
	set value(newValue) {
		app.listboxValueState = newValue;
	}
};
const tabSet = {
	get value() {
		return app.tabSetState;
	},
	set value(newValue) {
		app.tabSetState = newValue;
	}
};
export {
	SvelteSet as S,
	app as a,
	SvelteMap as b,
	tabSet as c,
	avatarSrc as d,
	storeListboxValue as e,
	contentLanguage as f,
	translationProgress as g,
	systemLanguage as s,
	toaster as t,
	validationStore as v
};
//# sourceMappingURL=store.svelte.js.map
