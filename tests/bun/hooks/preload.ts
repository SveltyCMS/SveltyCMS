/**
 * @file tests/bun/hooks/preload.ts
 * @description Preload script that mocks SvelteKit modules for hooks tests
 */

import { mock, spyOn } from 'bun:test';

// ============================================================================
// Controllable mock state for system-state tests
// ============================================================================

// These can be modified by tests using globalThis
declare global {
	var __mockSystemState: { overallState: string; services: Record<string, any>; performanceMetrics: { stateTransitions: any[] } };
	var __mockIsSystemReady: boolean;
	var __mockIsSetupComplete: boolean;
}

globalThis.__mockSystemState = { overallState: 'READY', services: {}, performanceMetrics: { stateTransitions: [] } };
globalThis.__mockIsSystemReady = true;
globalThis.__mockIsSetupComplete = true;

// Mock @src/stores/system/state
mock.module('@src/stores/system/state', () => ({
	getSystemState: () => globalThis.__mockSystemState,
	isSystemReady: () => globalThis.__mockIsSystemReady
}));

// Mock @src/databases/db - prevent actual DB initialization
mock.module('@src/databases/db', () => ({
	dbInitPromise: Promise.resolve(),
	dbAdapter: {},
	auth: {}
}));

// Mock @utils/setupCheck
mock.module('@utils/setupCheck', () => ({
	isSetupComplete: () => globalThis.__mockIsSetupComplete
}));

// Mock @utils/logger.server to prevent console noise
mock.module('@utils/logger.server', () => ({
	logger: {
		debug: () => {},
		trace: () => {},
		info: () => {},
		warn: () => {},
		fatal: () => {},
		error: () => {}
	}
}));

// ============================================================================
// Mock API permissions for api-requests tests
// ============================================================================

// Controllable permissions mock
declare global {
	var __mockHasApiPermission: (role: string, endpoint: string) => boolean;
}

// Default: admin and developer have all permissions, viewer has limited
globalThis.__mockHasApiPermission = (role: string, _endpoint: string) => {
	return role === 'admin' || role === 'developer';
};

// Mock @src/databases/auth/apiPermissions
mock.module('@src/databases/auth/apiPermissions', () => ({
	hasApiPermission: (role: string, endpoint: string) => globalThis.__mockHasApiPermission(role, endpoint),
	API_PERMISSIONS: {
		'api:collections': ['admin', 'developer', 'editor'],
		'api:graphql': ['admin', 'developer', 'editor', 'viewer'],
		'api:user': ['admin', 'developer', 'editor', 'viewer'],
		'api:system': ['admin', 'developer'],
		'api:admin': ['admin'],
		'api:settings': ['admin', 'developer'],
		'api:media': ['admin', 'developer', 'editor'],
		'api:data': ['admin', 'developer', 'editor', 'viewer'],
		'api:test': ['admin', 'developer', 'editor', 'viewer'],
		'api:cached': ['admin', 'developer', 'editor', 'viewer'],
		'api:uncached': ['admin', 'developer', 'editor', 'viewer'],
		'api:large-data': ['admin', 'developer', 'editor', 'viewer'],
		'api:download': ['admin', 'developer', 'editor', 'viewer'],
		'api:error': ['admin', 'developer', 'editor', 'viewer']
	}
}));

// ============================================================================
// Mock CacheService for API caching tests
// ============================================================================

const mockCache = new Map<string, unknown>();

mock.module('@src/databases/CacheService', () => ({
	cacheService: {
		get: async (key: string, _tenantId?: string) => mockCache.get(key),
		set: async (key: string, value: unknown, _ttl?: number, _tenantId?: string) => {
			mockCache.set(key, value);
		},
		delete: async (key: string, _tenantId?: string) => {
			mockCache.delete(key);
		},
		clearByPattern: async (pattern: string, _tenantId?: string) => {
			const prefix = pattern.replace('*', '');
			for (const key of mockCache.keys()) {
				if (key.startsWith(prefix)) {
					mockCache.delete(key);
				}
			}
		}
	},
	// All cache TTL constants
	SESSION_CACHE_TTL_MS: 86400000, // 24 hours
	SESSION_CACHE_TTL_S: 86400,
	USER_PERM_CACHE_TTL_MS: 60000, // 1 minute
	USER_PERM_CACHE_TTL_S: 60,
	USER_COUNT_CACHE_TTL_MS: 300000, // 5 minutes
	USER_COUNT_CACHE_TTL_S: 300,
	API_CACHE_TTL_MS: 300000, // 5 minutes
	API_CACHE_TTL_S: 300,
	REDIS_TTL_S: 300
}));

// ============================================================================
// Mock MetricsService for metrics tracking tests
// ============================================================================

mock.module('@src/services/MetricsService', () => ({
	metricsService: {
		incrementApiRequests: () => {},
		incrementApiErrors: () => {},
		recordApiCacheHit: () => {},
		recordApiCacheMiss: () => {},
		incrementRateLimitViolations: () => {},
		incrementAuthValidations: () => {},
		incrementAuthFailures: () => {},
		incrementFirewallBlocks: () => {},
		recordLatency: () => {},
		getReport: () => ({
			api: {
				cacheHits: 0,
				cacheMisses: 0,
				cacheHitRate: 0,
				requests: 0,
				errors: 0
			},
			auth: {
				validations: 0,
				failures: 0
			},
			rateLimit: {
				violations: 0
			}
		})
	}
}));

// Mock $app/environment
mock.module('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false,
	version: 'test'
}));

// Mock $app/stores
mock.module('$app/stores', () => ({
	page: { subscribe: () => () => {} },
	navigating: { subscribe: () => () => {} },
	updated: { subscribe: () => () => {}, check: () => Promise.resolve(false) }
}));

// Mock $app/navigation
mock.module('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	invalidate: () => Promise.resolve(),
	invalidateAll: () => Promise.resolve(),
	preloadData: () => Promise.resolve(),
	preloadCode: () => Promise.resolve(),
	beforeNavigate: () => {},
	afterNavigate: () => {},
	onNavigate: () => {},
	pushState: () => {},
	replaceState: () => {}
}));

// Mock sveltekit-rate-limiter/server
// isLimited() should return false (not limited) by default
mock.module('sveltekit-rate-limiter/server', () => ({
	RateLimiter: class MockRateLimiter {
		constructor() {}
		async isLimited() {
			return false; // Not limited
		}
		cookieLimiter() {
			return this;
		}
	},
	RetryAfterRateLimiter: class MockRetryAfterRateLimiter {
		constructor() {}
		async isLimited() {
			return false; // Not limited
		}
	}
}));

// Mock @sveltejs/kit error and redirect (matching SvelteKit's HttpError structure)
mock.module('@sveltejs/kit', () => ({
	error: (status: number, message: string | { message: string }) => {
		const body = typeof message === 'string' ? { message } : message;
		const err = {
			status,
			body,
			message: body.message
		};
		throw err;
	},
	redirect: (status: number, location: string) => {
		const err = {
			status,
			location,
			message: `Redirect to ${location}`
		};
		throw err;
	},
	json: (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers }
	}),
	text: (data: string, init?: ResponseInit) => new Response(data, init)
}));

console.log('✅ SvelteKit modules mocked for hooks tests');
