/**
 * @file tests/bun/setup.ts
 * @description Global test setup file for Bun test runner
 *
 * This file is automatically loaded before running Bun tests via the --preload flag.
 * It mocks SvelteKit's built-in modules ($app/*) to allow testing server-side code
 * without requiring a full SvelteKit runtime environment.
 *
 * Mocked modules:
 * - $app/environment: Provides environment flags (browser, dev, etc.)
 * - $app/stores: Provides SvelteKit stores (page, navigating, updated)
 * - $app/navigation: Provides navigation functions (goto, invalidate, etc.)
 * - $app/paths: Provides base and assets paths
 *
 * Usage: Automatically loaded via package.json test scripts with --preload flag
 */
import { mock } from 'bun:test';

// Mock $app/environment
mock.module('$app/environment', () => ({
	browser: true,
	building: false,
	dev: true,
	version: 'test'
}));

// Mock logger.server.ts to prevent "cannot be imported in browser" error
mock.module('@src/utils/logger.server', () => ({
	logger: {
		fatal: () => {},
		error: () => {},
		warn: () => {},
		info: () => {},
		debug: () => {},
		trace: () => {},
		channel: () => ({
			fatal: () => {},
			error: () => {},
			warn: () => {},
			info: () => {},
			debug: () => {},
			trace: () => {}
		})
	}
}));

// Mock $app/stores
mock.module('$app/stores', () => ({
	getStores: () => ({}),
	page: { subscribe: (fn: any) => fn({}) },
	navigating: { subscribe: (fn: any) => fn(null) },
	updated: { subscribe: (fn: any) => fn(false) }
}));

// Mock $app/navigation
mock.module('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	invalidate: () => Promise.resolve(),
	invalidateAll: () => Promise.resolve(),
	preloadData: () => Promise.resolve(),
	preloadCode: () => Promise.resolve(),
	beforeNavigate: () => {},
	afterNavigate: () => {}
}));

// Mock $app/state
mock.module('$app/state', () => ({
	page: {
		url: new URL('http://localhost/'),
		params: {},
		route: { id: null },
		status: 200,
		error: null,
		data: {},
		form: null
	},
	navigating: {
		to: null,
		from: null,
		type: null
	},
	updated: false
}));

// Mock $app/paths
mock.module('$app/paths', () => ({
	base: '',
	assets: ''
}));

// --- Global Web API Mocks ---
// Define MockRequest and MockURL classes
class MockRequest {
	constructor(input: any, init?: any) {
		this.input = input;
		this.init = init;
		this.url = typeof input === 'string' ? input : input && input.url;
		this.method = init?.method || 'GET';
		this.headers = new Headers(init?.headers);
	}
	input: any;
	init: any;
	url: string;
	method: string;
	headers: Headers;
	clone() {
		return new MockRequest(this.input, this.init);
	} // Simplified clone
	// Add other methods/properties as needed by the tests (e.g., text(), json(), formData())
}

class MockURL {
	constructor(url: string, base?: string) {
		this._url = url;
		this._base = base;
		const searchPart = url.includes('?') ? url.split('?')[1] : '';
		this.searchParams = {
			get: (name: string) => {
				const param = new URLSearchParams(searchPart).get(name);
				if (param === null && name === 'q') return searchPart;
				return param;
			}
		};
		this.pathname = url.includes('?') ? url.split('?')[0] : url;
		this.search = searchPart ? `?${searchPart}` : '';
		this.protocol = 'http:'; // Default mock protocol
	}
	_url: string;
	_base?: string;
	searchParams: { get: (name: string) => string | null };
	pathname: string;
	search: string;
	protocol: string;
	toString() {
		return this._url;
	}
}

// Assign them to globalThis
globalThis.Request = MockRequest as any;
globalThis.URL = MockURL as any;

// Mock @sveltejs/kit to expose global Request/URL using our mocks
mock.module('@sveltejs/kit', () => ({
	Request: globalThis.Request,
	URL: globalThis.URL
	// Add other exports from @sveltejs/kit that might be used by tests if needed
}));

// --- Svelte 5 Runes Mocks ---
// Mock Svelte 5 Runes for testing Svelte stores directly
globalThis.$state = (initial: any) => {
	let value = initial;
	return {
		get value() {
			return value;
		},
		set value(newValue: any) {
			value = newValue;
		}
	};
};
globalThis.$derived = (fn: any) => {
	let value = fn();
	return {
		get value() {
			return value;
		}
	};
};
globalThis.$effect = (fn: any) => {
	fn();
};
globalThis.$effect.root = (fn: any) => {
	fn();
};
globalThis.$props = () => ({});

// Mock loadingStore.svelte.ts to prevent $state error
mock.module('@src/stores/loadingStore.svelte', () => {
	const loadingOps = {
		navigation: 'navigation',
		dataFetch: 'data-fetch',
		authentication: 'authentication',
		initialization: 'initialization',
		imageUpload: 'image-upload',
		formSubmission: 'form-submission',
		configSave: 'config-save',
		roleManagement: 'role-management',
		permissionUpdate: 'permission-update',
		tokenGeneration: 'token-generation',
		collectionLoad: 'collection-load',
		widgetInit: 'widget-init'
	};

	class MockLoadingStore {
		isLoading = false;
		loadingReason: string | null = null;
		loadingStack = new Set<string>();

		startLoading(reason: string, context?: string) {
			this.loadingStack.add(reason);
			this.isLoading = true;
			this.loadingReason = reason;
		}
		stopLoading(reason: string) {
			this.loadingStack.delete(reason);
			if (this.loadingStack.size === 0) {
				this.isLoading = false;
				this.loadingReason = null;
			} else {
				this.loadingReason = Array.from(this.loadingStack).pop() || null;
			}
		}
		clearLoading() {
			this.loadingStack.clear();
			this.isLoading = false;
			this.loadingReason = null;
		}
		isLoadingReason(reason: string) {
			return this.loadingStack.has(reason);
		}
		async withLoading<T>(reason: string, operation: () => Promise<T>, context?: string): Promise<T> {
			this.startLoading(reason, context);
			try {
				const result = await operation();
				return result;
			} finally {
				this.stopLoading(reason);
			}
		}
		getStats() {
			return { activeCount: this.loadingStack.size, reasons: Array.from(this.loadingStack) };
		}
	}

	return {
		loadingOperations: loadingOps,
		LoadingStore: MockLoadingStore,
		globalLoadingStore: new MockLoadingStore() // for any direct consumers
	};
});

// Mock screenSizeStore.svelte.ts to prevent $state error
mock.module('@src/stores/screenSizeStore.svelte', () => {
	const ScreenSize = { XS: 'XS', SM: 'SM', MD: 'MD', LG: 'LG', XL: 'XL', XXL: '2XL' };
	const getScreenSizeName = (width: number): string => {
		if (width < 640) return ScreenSize.XS;
		if (width < 768) return ScreenSize.SM;
		if (width < 1024) return ScreenSize.MD;
		if (width < 1280) return ScreenSize.LG;
		if (width < 1536) return ScreenSize.XL;
		return ScreenSize.XXL;
	};

	return {
		ScreenSize,
		screenWidth: { value: 1024 },
		screenHeight: { value: 768 },
		screenSize: { value: 'LG' },
		isMobile: { value: false },
		isTablet: { value: false },
		isDesktop: { value: true },
		isLargeScreen: { value: false },
		setupScreenSizeListener: () => () => {},
		getScreenSizeName
	};
});
