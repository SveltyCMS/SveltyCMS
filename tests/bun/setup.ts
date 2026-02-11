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

// =============================================================================
// 1. ENVIRONMENT CONFIGURATION MOCKS
// =============================================================================

(globalThis as any).publicEnv = {
	DEFAULT_CONTENT_LANGUAGE: 'en',
	AVAILABLE_CONTENT_LANGUAGES: ['en', 'de', 'fr'],
	HOST_DEV: 'localhost:5173',
	HOST_PROD: 'example.com',
	SITE_NAME: 'SveltyCMS',
	PASSWORD_LENGTH: 8,
	BASE_LOCALE: 'en',
	LOCALES: ['en', 'de', 'fr']
};

(globalThis as any).privateEnv = {
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'sveltycms_test',
	DB_USER: 'test',
	DB_PASSWORD: 'test',
	JWT_SECRET_KEY: 'test-secret-key-for-testing-only',
	ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!'
};

// =============================================================================
// 2. SVELTEKIT ENVIRONMENT MOCKS
// =============================================================================

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

// Mock universal logger.ts
mock.module('@src/utils/logger', () => ({
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
		}),
		dump: () => {}
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
	URL: globalThis.URL,
	json: (data: any, init?: any) => {
		const headers = new Headers(init?.headers);
		if (!headers.has('content-type')) {
			headers.set('content-type', 'application/json');
		}
		return new Response(JSON.stringify(data), {
			...init,
			headers
		});
	},
	error: (status: number, body: any) => {
		const err = { status, body: typeof body === 'string' ? { message: body } : body };
		throw err;
	},
	redirect: (status: number, location: string) => {
		throw { status, location, __is_redirect: true };
	},
	isRedirect: (err: any) => err && err.__is_redirect === true,
	isHttpError: (err: any) => err && typeof err.status === 'number' && err.body !== undefined
}));

// --- Svelte 5 Runes Mocks ---
// Mock Svelte 5 Runes for testing Svelte stores directly
(globalThis as any).$state = (initial: any) => {
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
(globalThis as any).$derived = (fn: any) => {
	const value = typeof fn === 'function' ? fn() : fn;
	return {
		get value() {
			return value;
		}
	};
};
(globalThis as any).$effect = (fn: any) => {
	fn();
};
(globalThis as any).$effect.root = (fn: any) => {
	fn();
};
(globalThis as any).$props = () => ({});

// Mock loadingStore.svelte.ts to prevent $state error
mock.module('@src/stores/loadingStore.svelte.ts', () => {
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

		startLoading(reason: string) {
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
		async withLoading<T>(reason: string, operation: () => Promise<T>): Promise<T> {
			this.startLoading(reason);
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
mock.module('@src/stores/screenSizeStore.svelte.ts', () => {
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

// =============================================================================
// 7. STORE & SETTINGS MOCKS
// =============================================================================

mock.module('@src/stores/globalSettings', () => ({
	publicEnv: (globalThis as any).publicEnv,
	privateEnv: (globalThis as any).privateEnv
}));

mock.module('@src/stores/globalSettings.svelte.ts', () => ({
	publicEnv: (globalThis as any).publicEnv,
	privateEnv: (globalThis as any).privateEnv,
	initPublicEnv: () => {},
	initPrivateEnv: () => {}
}));

mock.module('@src/stores/store.svelte.ts', () => {
	const mockApp = {
		systemLanguage: 'en',
		contentLanguage: 'en',
		setAvatarSrc: () => {}
	};

	const mockDataChangeStore = {
		hasChanges: false,
		initialDataSnapshot: '',
		setHasChanges: (v: boolean) => {
			mockDataChangeStore.hasChanges = v;
		},
		setInitialSnapshot: (data: any) => {
			mockDataChangeStore.initialDataSnapshot = JSON.stringify(data);
			mockDataChangeStore.hasChanges = false;
		},
		compareWithCurrent: () => false,
		reset: () => {
			mockDataChangeStore.hasChanges = false;
			mockDataChangeStore.initialDataSnapshot = '';
		}
	};

	return {
		app: mockApp,
		dataChangeStore: mockDataChangeStore,
		systemLanguage: {
			value: 'en',
			set: (_lang: string) => {}
		}
	};
});

// =============================================================================
// 8. PARAGLIDE i18n MOCKS
// =============================================================================

mock.module('@src/paraglide/messages', () => ({
	widgets_nodata: () => 'No Data',
	widget_richText_description: () => 'Rich text widget description',
	setup_step_database: () => 'Database Configuration',
	setup_step_database_desc: () => 'Configure your database connection',
	setup_step_admin: () => 'Admin Account',
	setup_step_admin_desc: () => 'Create your admin user',
	setup_step_system: () => 'System Settings',
	setup_step_system_desc: () => 'Configure system preferences',
	setup_step_email: () => 'Email Settings',
	setup_step_email_desc: () => 'Configure SMTP (optional)',
	setup_step_complete: () => 'Review & Complete',
	setup_step_complete_desc: () => 'Review and finalize setup',
	setup_heading_badge: () => 'Setup Wizard',
	setup_heading_subtitle: (params: any) => `Welcome to ${params.siteName} Setup`,
	setup_search_placeholder: () => 'Search languages...',
	setup_legend_completed: () => 'Completed',
	setup_legend_current: () => 'Current',
	setup_legend_pending: () => 'Pending',
	setup_db_test_details_hide: () => 'Hide Details',
	setup_db_test_details_show: () => 'Show Details',
	setup_db_test_latency: () => 'Latency',
	setup_db_test_engine: () => 'Engine',
	setup_db_test_user: () => 'User',
	label_host: () => 'Host',
	label_port: () => 'Port',
	label_database: () => 'Database',
	label_user: () => 'User',
	button_previous: () => 'Previous',
	button_next: () => 'Next',
	button_complete: () => 'Complete Setup',
	setup_progress_step_of: (params: any) => `Step ${params.current} of ${params.total}`
}));

mock.module('@src/paraglide/runtime', () => ({
	getLocale: () => 'en',
	setLocale: (_locale: string) => {},
	locales: ['en', 'de', 'fr', 'es', 'it', 'pt']
}));

// =============================================================================
// 9. OTHER UTILITY MOCKS
// =============================================================================

mock.module('@src/paraglide/runtime', () => ({
	getLocale: () => 'en',
	setLocale: (_locale: string) => {},
	locales: ['en', 'de', 'fr', 'es', 'it', 'pt']
}));

mock.module('@utils/languageUtils', () => ({
	getLanguageName: (code: string, _displayLang?: string) => {
		const names: Record<string, string> = {
			en: 'English',
			de: 'German',
			fr: 'French',
			es: 'Spanish',
			it: 'Italian',
			pt: 'Portuguese'
		};
		return names[code] || code.toUpperCase();
	}
}));

mock.module('@utils/toast', () => ({
	setGlobalToastStore: (_store: any) => {},
	showToast: (message: string, type?: string, _duration?: number) => {
		console.log(`[TOAST ${type || 'info'}]`, message);
	}
}));

// =============================================================================
// 10. WIDGET FACTORY & DATABASE MOCKS
// =============================================================================

mock.module('@src/widgets/widgetFactory', () => ({
	createWidget: (config: any) => {
		const widgetDefinition = {
			widgetId: config.Name,
			Name: config.Name,
			Icon: config.Icon,
			Description: config.Description,
			inputComponentPath: config.inputComponentPath || '',
			displayComponentPath: config.displayComponentPath || '',
			validationSchema: config.validationSchema,
			defaults: config.defaults,
			GuiFields: config.GuiSchema || {}
		};

		const factory = (fieldConfig: any) => {
			const fieldInstance = {
				widget: widgetDefinition,
				label: fieldConfig.label,
				db_fieldName: '',
				required: false,
				translated: false,
				width: undefined,
				helper: undefined,
				permissions: undefined
			};

			// Apply defaults
			if (config.defaults) {
				for (const key in config.defaults) {
					(fieldInstance as any)[key] = config.defaults[key];
				}
			}

			// Apply fieldConfig
			for (const key in fieldConfig) {
				if (fieldConfig[key] !== undefined) {
					(fieldInstance as any)[key] = fieldConfig[key];
				}
			}

			// Handle db_fieldName
			if (!fieldInstance.db_fieldName && fieldInstance.label) {
				fieldInstance.db_fieldName = fieldInstance.label
					.toLowerCase()
					.replace(/\s+/g, '_')
					.replace(/[^a-z0-9_]/g, '');
			} else if (!fieldInstance.db_fieldName) {
				fieldInstance.db_fieldName = 'unnamed_field';
			}

			return fieldInstance;
		};

		factory.Name = config.Name;
		factory.Icon = config.Icon;
		factory.Description = config.Description;
		factory.GuiSchema = config.GuiSchema;
		factory.GraphqlSchema = config.GraphqlSchema;
		factory.aggregations = config.aggregations;
		factory.__inputComponentPath = config.inputComponentPath || '';
		factory.__displayComponentPath = config.displayComponentPath || '';
		factory.toString = () => '';

		return factory;
	}
}));

// Mock Widget Proxy to bypass module scanner (import.meta.glob)
mock.module('@src/widgets/proxy', () => ({
	getWidgetsByType: () => [],
	getWidget: () => null,
	getWidgetByField: () => null
}));

mock.module('@src/databases/db', () => ({
	auth: {
		getUserCount: () => Promise.resolve(1),
		getAllRoles: () =>
			Promise.resolve([
				{ _id: 'admin', name: 'Administrator', isAdmin: true, permissions: [] },
				{ _id: 'editor', name: 'Editor', isAdmin: false, permissions: [] }
			]),
		getUserById: () => Promise.resolve(null)
	},
	dbAdapter: {
		auth: {
			getUserCount: () => Promise.resolve(1),
			getAllRoles: () =>
				Promise.resolve([
					{ _id: 'admin', name: 'Administrator', isAdmin: true, permissions: [] },
					{ _id: 'editor', name: 'Editor', isAdmin: false, permissions: [] }
				])
		}
	},
	getPrivateEnv: () => ({})
}));

console.log('✅ Global test environment setup complete');
