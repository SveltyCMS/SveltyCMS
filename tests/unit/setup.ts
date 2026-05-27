/**
 * @file tests/unit/setup.ts
 * @description Master global test setup for Bun.
 * Provides external environment and root gatekeepers.
 * Allows internal project logic to run for 100% pass rate.
 */
import { mock } from 'bun:test';

// =============================================================================
// 1. RUNES & BROWSER EMULATION
// =============================================================================
(globalThis as any).$state = (v: any) => v;
(globalThis as any).$state.snapshot = (v: any) => v;
(globalThis as any).$derived = (fn: any) => {
	if (typeof fn !== 'function') return fn;
	const obj = {};
	return new Proxy(obj, {
		get: (_target, _prop) => (_prop === Symbol.toPrimitive ? () => fn() : typeof fn() === 'object' && fn() !== null ? fn()[_prop] : fn())
	});
};
(globalThis as any).$derived.by = (globalThis as any).$derived;
(globalThis as any).$effect = (_fn: any) => {};
(globalThis as any).$effect.root = (fn: any) => fn();
(globalThis as any).$props = () => ({});

const createStorage = () => {
	let data: Record<string, string> = {};
	return {
		getItem: mock((k: string) => data[k] || null),
		setItem: mock((k: string, v: string) => {
			data[k] = String(v);
		}),
		removeItem: mock((k: string) => {
			delete data[k];
		}),
		clear: mock(() => {
			data = {};
		}),
		get length() {
			return Object.keys(data).length;
		},
		key: mock((i: number) => Object.keys(data)[i] || null)
	};
};
(globalThis as any).sessionStorage = createStorage();
(globalThis as any).localStorage = createStorage();
(globalThis as any).window = {
	setTimeout,
	clearTimeout,
	setInterval,
	clearInterval,
	addEventListener: mock(() => {}),
	removeEventListener: mock(() => {}),
	matchMedia: mock(() => ({ matches: false, addEventListener: mock(() => {}), removeEventListener: mock(() => {}) })),
	location: new URL('http://localhost')
};

// =============================================================================
// 2. ROOT GATEKEEPER MOCKS (External dependencies)
// =============================================================================

// Logger
const mockLogger = {
	fatal: mock(() => {}),
	error: mock(() => {}),
	warn: mock(() => {}),
	info: mock(() => {}),
	debug: mock(() => {}),
	trace: mock(() => {}),
	channel: mock(() => mockLogger),
	dump: mock(() => {})
};
(globalThis as any).logger = mockLogger;
mock.module('@utils/logger', () => ({ logger: mockLogger, default: mockLogger }));
mock.module('@utils/logger.server', () => ({ logger: mockLogger, default: mockLogger }));

// Metrics Service
const mockMetrics = {
	incrementRequests: mock(() => {}),
	incrementErrors: mock(() => {}),
	recordResponseTime: mock(() => {}),
	incrementAuthValidations: mock(() => {}),
	incrementAuthFailures: mock(() => {}),
	recordAuthCacheHit: mock(() => {}),
	recordAuthCacheMiss: mock(() => {}),
	incrementApiRequests: mock(() => {}),
	incrementApiErrors: mock(() => {}),
	recordApiCacheHit: mock(() => {}),
	recordApiCacheMiss: mock(() => {}),
	incrementRateLimitViolations: mock(() => {}),
	incrementCSPViolations: mock(() => {}),
	recordHookExecutionTime: mock(() => {}),
	incrementFirewallBlocks: mock(() => {}),
	recordLatency: mock(() => {}),
	incrementSecurityViolations: mock(() => {}),
	getReport: mock(() => ({ api: { requests: 0, errors: 0 }, authentication: { validations: 0 }, requests: { total: 0 } })),
	reset: mock(() => {}),
	startTimer: mock(() => () => 10)
};
(globalThis as any).metricsService = mockMetrics;
mock.module('@src/services/metrics-service', () => ({ metricsService: mockMetrics }));

// Settings Service
const mockPrivateEnv = { DB_TYPE: 'postgresql', JWT_SECRET_KEY: 'secret', ENCRYPTION_KEY: 'secret' };
const mockSettingsService = {
	getPrivateSetting: mock(async (k: any) => mockPrivateEnv[k as keyof typeof mockPrivateEnv]),
	getPrivateSettingSync: mock((k: any) => mockPrivateEnv[k as keyof typeof mockPrivateEnv]),
	getPublicSetting: mock(async () => ({ siteName: 'Test' })),
	getPublicSettingSync: mock(() => ({ siteName: 'Test' })),
	isCacheLoaded: mock(() => true),
	loadSettingsCache: mock(async () => ({ private: mockPrivateEnv, public: {} })),
	invalidateSettingsCache: mock(async () => {}),
	setSettingsCache: mock(async () => {})
};
mock.module('@src/services/settings-service', () => mockSettingsService);

// Database Adapter
const mockDbAdapter = {
	connect: mock(async () => ({ success: true })),
	isConnected: mock(() => true),
	auth: {
		getUserById: mock(async (id: any) => ({ success: true, data: { _id: id || '123', email: 'test@test.com', username: 'test', role: 'admin' } })),
		updateUserAttributes: mock(async () => ({ success: true })),
		validateSession: mock(async (id: string) => (id === 'valid' ? { _id: '123', role: 'admin' } : null)),
		createSession: mock(async () => ({ _id: 'new-id' })),
		destroySession: mock(async () => {}),
		getUserCount: mock(async () => ((globalThis as any).__mockUserCount !== undefined ? (globalThis as any).__mockUserCount : 1)),
		getAllRoles: mock(async () => [{ _id: 'admin', isAdmin: true, permissions: [] }])
	},
	system: {
		preferences: {
			get: mock(async () => ({ success: true, data: [] })),
			set: mock(async () => ({ success: true })),
			getMany: mock(async () => ({ success: true, data: {} })),
			setMany: mock(async () => ({ success: true }))
		}
	},
	crud: {
		findMany: mock(async () => []),
		findOne: mock(async () => null),
		insertOne: mock(async () => ({ success: true })),
		updateOne: mock(async () => ({ success: true })),
		deleteOne: mock(async () => ({ success: true })),
		update: mock(async () => ({ success: true }))
	}
};
(globalThis as any).mockDbAdapter = mockDbAdapter;
(globalThis as any).dbAdapter = mockDbAdapter;
mock.module('@src/databases/db', () => ({
	dbAdapter: mockDbAdapter,
	auth: mockDbAdapter.auth,
	getPrivateEnv: () => mockPrivateEnv,
	dbInitPromise: Promise.resolve(),
	getDbInitPromise: () => Promise.resolve(),
	isConnected: true,
	getDb: () => mockDbAdapter,
	getAuth: () => mockDbAdapter.auth,
	reinitializeSystem: mock(async () => ({}))
}));

// CacheService (Full mock with constants and enums)
const CacheCategory = {
	SCHEMA: 'schema',
	WIDGET: 'widget',
	THEME: 'theme',
	CONTENT: 'content',
	MEDIA: 'media',
	SESSION: 'session',
	USER: 'user',
	API: 'api',
	COLLECTION: 'collection',
	ENTRY: 'entry',
	SETTING: 'setting'
};

const mockCacheService = {
	get: mock(async () => null),
	set: mock(async () => {}),
	delete: mock(async () => {}),
	clear: mock(async () => {}),
	clearByPattern: mock(async () => {}),
	clearByTags: mock(async () => {}),
	finalizeTags: mock((tags: any) => tags),
	generateKey: mock((...args: any[]) => args.join(':')),
	initialize: mock(async () => {}),
	reconfigure: mock(async () => {}),
	setBootstrapping: mock(() => {})
};

const cacheServiceModule = {
	cacheService: mockCacheService,
	CacheCategory,
	SESSION_CACHE_TTL_MS: 86400000,
	SESSION_CACHE_TTL_S: 86400,
	USER_PERM_CACHE_TTL_MS: 60000,
	USER_PERM_CACHE_TTL_S: 60,
	USER_COUNT_CACHE_TTL_MS: 300000,
	USER_COUNT_CACHE_TTL_S: 300,
	API_CACHE_TTL_MS: 300000,
	API_CACHE_TTL_S: 300,
	REDIS_TTL_S: 300,
	getSessionCacheTTL: () => 86400,
	getUserPermCacheTTL: () => 60,
	getApiCacheTTL: () => 300
};

(globalThis as any).mockCacheService = mockCacheService;
(globalThis as any).cacheService = mockCacheService;
mock.module('@src/databases/cache-service', () => cacheServiceModule);

// EventBus
const mockEventBus = { on: mock(() => () => {}), publish: mock(() => {}), clear: mock(() => {}), subscribe: mock(() => () => {}) };
(globalThis as any).mockEventBus = mockEventBus;
mock.module('@src/services/automation/event-bus', () => ({ eventBus: mockEventBus }));

// AuditLog
const mockAuditLog = { log: mock(async () => {}), getLogs: mock(async () => []) };
(globalThis as any).mockAuditLog = mockAuditLog;
mock.module('@src/services/audit/audit-log-service.ts', () => ({ auditLogService: mockAuditLog }));

// Scanner
mock.module('@src/widgets/scanner', () => ({
	coreModules: {},
	customModules: {},
	getCoreWidgets: () => [],
	getCustomWidgets: () => []
}));

// =============================================================================
// 3. INFRASTRUCTURE & SVELTEKIT MOCKS
// =============================================================================
mock.module('$app/environment', () => ({ dev: true, browser: true, building: false, version: '1.0.0' }));
mock.module('$app/navigation', () => ({
	goto: mock(async () => {}),
	invalidate: mock(async () => {}),
	invalidateAll: mock(async () => {}),
	afterNavigate: mock(() => {}),
	beforeNavigate: mock(() => {})
}));
mock.module('$app/stores', () => ({
	page: {
		subscribe: (fn: any) => {
			fn({ url: new URL('http://localhost'), status: 200, params: {}, data: {}, form: null });
			return () => {};
		}
	},
	navigating: {
		subscribe: (fn: any) => {
			fn(null);
			return () => {};
		}
	},
	updated: {
		subscribe: (fn: any) => {
			fn(false);
			return () => {};
		}
	}
}));
mock.module('$app/paths', () => ({ base: '', assets: '' }));
mock.module('$app/forms', () => ({ applyAction: mock(async (v: any) => v), enhance: mock(() => {}), deserialize: mock((v: any) => v) }));

mock.module('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	},
	error: (status: number, message: any) => {
		throw { status, body: typeof message === 'string' ? { message } : message, __isHttpError: true };
	},
	isRedirect: (err: any) => err && err.__isRedirect === true,
	isHttpError: (err: any) => err && err.__isHttpError === true,
	json: (data: any, init?: any) => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json' } })
}));

// External libs
mock.module('@boxyhq/saml-jackson', () => ({
	default: mock(async () => ({
		oauthController: { authorize: mock(async () => ({ redirect_url: 'https://idp.example.com/sso' })) },
		connectionAPIController: { createSAMLConnection: mock(async () => ({ id: 'conn_123' })) },
		spConfig: { getIDPConfig: mock(async () => ({})) },
		checkConfig: mock(() => true)
	}))
}));

mock.module('sveltekit-rate-limiter/server', () => ({
	RateLimiter: class {
		check = mock(async () => ({ success: true }));
		cookieLimiter = mock(async () => ({ success: true }));
		isLimited = mock(async () => false);
	}
}));

// Setup Check
(globalThis as any).__mockSetupComplete = true;
const mockSetupCheck = {
	isSetupComplete: mock(() => (globalThis as any).__mockSetupComplete),
	isSetupCompleteAsync: mock(async () => (globalThis as any).__mockSetupComplete),
	invalidateSetupCache: mock(() => {}),
	setSetupComplete: (v: boolean) => {
		(globalThis as any).__mockSetupComplete = v;
	}
};
(globalThis as any).mockSetupCheck = mockSetupCheck;
mock.module('@utils/setup-check', () => mockSetupCheck);
mock.module('@src/utils/setup-check', () => mockSetupCheck);

// Paraglide
mock.module('@src/paraglide/runtime.js', () => ({
	availableLanguageTags: ['en'],
	locales: ['en'],
	languageTag: () => 'en',
	setLanguageTag: () => {},
	getLocale: () => 'en',
	i18n: { handle: ({ event, resolve }: any) => resolve(event) }
}));
mock.module('@src/paraglide/messages.js', () => ({
	widget_address_description: () => 'Address',
	widget_relation_description: () => 'Relation',
	widget_richText_description: () => 'Rich Text'
}));

// Dynamic Import for AppError
const loadAppError = async () => {
	const { AppError } = await import('../../src/utils/error-handling');
	(globalThis as any).AppError = AppError;
};
loadAppError();

console.log('✅ Master Global Test Setup Complete (Smart Logic Mode)');
