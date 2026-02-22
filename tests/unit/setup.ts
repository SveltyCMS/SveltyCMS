/**
 * @file tests/unit/setup.ts
 * @description Global test setup file for Bun test runner
 */
import { mock } from 'bun:test';

// =============================================================================
// 0. GLOBAL STATE FOR MOCKS
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
	DB_PORT: 27_017,
	DB_NAME: 'sveltycms_test',
	DB_USER: 'test',
	DB_PASSWORD: 'test',
	JWT_SECRET_KEY: 'test-secret-key-for-testing-only',
	ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!'
};

// --- DB ADAPTER MOCK ---
const mockDbAdapter = {
	auth: {
		getUserCount: mock(() => Promise.resolve({ success: true, data: 1 })),
		getAllRoles: mock(() => Promise.resolve([{ _id: 'admin', name: 'Administrator', isAdmin: true, permissions: [] }])),
		getUserById: mock(() =>
			Promise.resolve({
				success: true,
				data: { _id: '123', email: 'test@example.com', username: 'tester' }
			})
		),
		updateUserAttributes: mock(() => Promise.resolve({ success: true }))
	},
	systemPreferences: {
		get: mock(() => Promise.resolve({ success: true, data: [] })),
		set: mock(() => Promise.resolve({ success: true }))
	},
	crud: {
		update: mock(() => Promise.resolve({ success: true }))
	},
	connect: mock(() => Promise.resolve({ success: true })),
	isConnected: mock(() => true)
};
(globalThis as any).mockDbAdapter = mockDbAdapter;

// --- EVENT BUS MOCK ---
const mockEventBus = {
	on: mock(() => {}),
	emit: mock(() => {})
};
(globalThis as any).mockEventBus = mockEventBus;

// --- AUDIT LOG MOCK ---
const mockAuditLog = {
	log: mock(() => Promise.resolve({})),
	getLogs: mock(() => Promise.resolve([]))
};
(globalThis as any).mockAuditLog = mockAuditLog;

// --- SYSTEM STATE ---
const createInitialServiceMetrics = () => ({
	healthCheckCount: 0,
	failureCount: 0,
	restartCount: 0,
	consecutiveFailures: 0,
	uptimePercentage: 100,
	initializationStartedAt: Date.now(),
	initializationCompletedAt: Date.now(),
	initializationDuration: 0,
	stateTimings: {
		startup: { count: 0, trend: 'unknown' },
		shutdown: { count: 0, trend: 'unknown' },
		idle: { count: 0, totalTime: 0 },
		active: { count: 0, totalTime: 0 }
	},
	anomalyThresholds: {
		maxStartupTime: 5000,
		maxShutdownTime: 2000,
		maxConsecutiveFailures: 3,
		minUptimePercentage: 95,
		calibrationCount: 0
	}
});

const createInitialState = () => ({
	overallState: 'IDLE',
	services: {
		database: {
			status: 'initializing',
			message: 'OK',
			metrics: createInitialServiceMetrics()
		},
		auth: {
			status: 'initializing',
			message: 'OK',
			metrics: createInitialServiceMetrics()
		},
		cache: {
			status: 'initializing',
			message: 'OK',
			metrics: createInitialServiceMetrics()
		},
		contentManager: {
			status: 'initializing',
			message: 'OK',
			metrics: createInitialServiceMetrics()
		},
		themeManager: {
			status: 'initializing',
			message: 'OK',
			metrics: createInitialServiceMetrics()
		},
		widgets: {
			status: 'initializing',
			message: 'OK',
			metrics: createInitialServiceMetrics()
		}
	},
	performanceMetrics: {
		stateTransitions: [],
		totalInitializations: 0,
		successfulInitializations: 0,
		failedInitializations: 0
	},
	initializationStartedAt: Date.now()
});

globalThis.__mockSystemState = createInitialState();
globalThis.__mockIsSystemReady = true;

// Shared Mock State for dynamic updates in tests
(globalThis as any).__mockUserCount = 1;
(globalThis as any).__mockRoles = [{ _id: 'admin', name: 'Administrator', isAdmin: true, permissions: [] }];

// =============================================================================
// 1. MODULE MOCKS
// =============================================================================

// Mock $app/environment
mock.module('$app/environment', () => ({
	browser: true,
	building: false,
	dev: true,
	version: 'test'
}));

// Mock universal logger.ts
mock.module('@utils/logger', () => ({
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

// Mock server-only logger.server.ts
mock.module('@utils/logger.server', () => ({
	logger: {
		fatal: () => {},
		error: () => {},
		warn: () => {},
		info: () => {},
		debug: () => {},
		trace: () => {}
	}
}));

// Mock @src/databases/db
mock.module('@src/databases/db', () => ({
	auth: mockDbAdapter.auth,
	dbAdapter: mockDbAdapter,
	getPrivateEnv: () => (globalThis as any).privateEnv,
	loadPrivateConfig: () => Promise.resolve((globalThis as any).privateEnv),
	clearPrivateConfigCache: () => {},
	setPrivateEnv: () => {},
	dbInitPromise: Promise.resolve(),
	getDbInitPromise: () => Promise.resolve(),
	isConnected: true,
	loadSettingsFromDB: () => Promise.resolve(true),
	getSystemStatus: () => Promise.resolve({ initialized: true, connected: true }),
	getAuth: () => null,
	reinitializeSystem: () => Promise.resolve({ status: 'initialized' }),
	initializeWithConfig: () => Promise.resolve({ status: 'success' }),
	initializeWithFreshConfig: () => Promise.resolve({ status: 'initialized' }),
	getDb: () => mockDbAdapter,
	initConnection: () => Promise.resolve(),
	initializeForSetup: () => Promise.resolve({ success: true }),
	initializeOnRequest: () => Promise.resolve()
}));

// Mock settingsService
mock.module('@src/services/settingsService', () => ({
	getPrivateSetting: mock(async () => true),
	getPublicSetting: mock(async () => '')
}));

// Mock @src/widgets/proxy to avoid import.meta.glob scanner issues
mock.module('@src/widgets/proxy', () => ({
	getWidgetsByType: () => [],
	getWidget: () => null,
	getWidgetByField: () => null
}));

// Mock @utils/setup-check
mock.module('@utils/setup-check', () => ({
	isSetupComplete: () => true,
	isSetupCompleteAsync: async () => true,
	invalidateSetupCache: () => {}
}));

// Mock @src/databases/CacheService
mock.module('@src/databases/CacheService', () => ({
	cacheService: {
		get: async () => null,
		set: async () => {},
		delete: async () => {},
		clearByPattern: async () => {},
		setBootstrapping: () => {}
	},
	API_CACHE_TTL_MS: 300_000
}));

// Mock EventBus
mock.module('@src/services/automation/event-bus', () => ({
	eventBus: mockEventBus
}));

// Mock AuditLogService
mock.module('@src/services/audit/audit-log-service', () => ({
	auditLogService: mockAuditLog
}));

// Mock Ollama for AIService
const mockOllamaInst = {
	generate: async () => ({ response: 'tag1, tag2, tag3' }),
	chat: async () => ({ message: { content: 'AI response' } })
};

class MockOllama {
	generate = mockOllamaInst.generate;
	chat = mockOllamaInst.chat;
}

mock.module('ollama', () => ({
	default: mockOllamaInst,
	Ollama: MockOllama
}));

// Mock $app modules
mock.module('$app/stores', () => ({
	page: { subscribe: (fn: any) => fn({ url: new URL('http://localhost') }) },
	navigating: { subscribe: (fn: any) => fn(null) },
	updated: { subscribe: (fn: any) => fn(false) }
}));

mock.module('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	invalidate: () => Promise.resolve(),
	invalidateAll: () => Promise.resolve(),
	beforeNavigate: () => {},
	afterNavigate: () => {}
}));

mock.module('$app/paths', () => ({ base: '', assets: '' }));
mock.module('$app/forms', () => ({
	applyAction: () => Promise.resolve(),
	enhance: () => {},
	deserialize: (v: any) => v
}));
mock.module('$app/state', () => ({
	page: { url: new URL('http://localhost') },
	navigating: null,
	updated: false
}));

// Mock Svelte 5 Runes with Proxy for reactivity in tests
const createReactiveMock = (fn: any) => {
	if (typeof fn !== 'function') {
		return fn;
	}
	return new Proxy(
		{},
		{
			get: (_, prop) => {
				const val = fn();
				if (prop === Symbol.toPrimitive) {
					return () => val;
				}
				if (val === null || val === undefined) {
					return undefined;
				}
				return val[prop];
			}
		}
	);
};

(globalThis as any).$state = (v: any) => v;
(globalThis as any).$state.snapshot = (v: any) => v;
(globalThis as any).$derived = createReactiveMock;
(globalThis as any).$derived.by = createReactiveMock;
(globalThis as any).$effect = (fn: any) => fn();
(globalThis as any).$effect.root = (fn: any) => fn();
(globalThis as any).$props = () => ({});

// Comprehensive Paraglide mock
const mockMsgs = {
	widget_richText_description: () => 'Rich Text',
	widget_richtext_description: () => 'Rich Text',
	widget_richtext_description1: () => 'Rich Text',
	widget_relation_description: () => 'Relation',
	widget_address_description: () => 'Address',
	widget_group_description: () => 'Group'
};

// Mock all possible import paths for paraglide messages
const paraglidePaths = [
	'@src/paraglide/messages',
	'@src/paraglide/messages.js',
	'./src/paraglide/messages.js',
	'../src/paraglide/messages.js',
	'../../src/paraglide/messages.js',
	'/var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS/src/paraglide/messages.js',
	'/var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS/src/paraglide/messages/_index.js'
];

for (const p of paraglidePaths) {
	mock.module(p, () => mockMsgs);
}

// Also mock the runtime
mock.module('@src/paraglide/runtime', () => ({
	getLocale: () => 'en',
	setLocale: () => {},
	locales: ['en'],
	experimentalStaticLocale: 'en'
}));

console.log('✅ Global test environment setup complete');
