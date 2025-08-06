/**
 * @file src/hooks.server.ts
 * @description Optimized server-side hooks for SvelteKit CMS application
 *
 * This file handles:
 * - Modular middleware architecture for performance
 * - Conditional loading based on environment settings
 * - Multi-tenant support (configurable)
 * - Redis caching (configurable)
 * - Static asset optimization
 * - Rate limiting
 * - Session authentication and management
 * - Authorization and role management
 * - API request handling with caching
 * - Locale management
 * - Security headers
 * - Performance monitoring
 */

import { building } from '$app/environment';
import { privateEnv } from '@root/config/private';
import { redirect, error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Core authentication and database
import { roles, initializeRoles } from '@root/config/roles';
import { SESSION_COOKIE_NAME } from '@src/auth/constants';
import { hasPermissionByAction } from '@src/auth/permissions';
import type { User } from '@src/auth/types';

// Dynamically import db stuff only when not building
let dbModule, dbInitPromise;
if (!building) {
	dbModule = await import('@src/databases/db');
	dbInitPromise = dbModule.dbInitPromise;
} else {
	dbInitPromise = Promise.resolve();
}

// Stores (removed unused imports)

// Cache
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger.svelte';

// Import middleware modules
import { handleStaticAssetCaching } from './hooks/handleStaticAssetCaching';
import { handleRateLimit } from './hooks/handleRateLimit';
import { addSecurityHeaders } from './hooks/addSecurityHeaders';
import { handleLocale } from './hooks/handleLocale';
import { handleApiRequests } from './hooks/handleApiRequests';

// Cache TTLs
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TTL = CACHE_TTL; // Align session TTL with cache TTL
const USER_PERM_CACHE_TTL = 60 * 1000; // 1 minute for permissions cache
const USER_COUNT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for user count cache

// Performance Caches - Optimized for memory management
let userCountCache: { count: number; timestamp: number } | null = null;
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

// Session Metrics - WeakMap for automatic cleanup when sessions are garbage collected
const sessionMetrics = {
	lastActivity: new Map<string, number>(),
	activeExtensions: new Map<string, number>(),
	rotationAttempts: new Map<string, number>()
};

// Session and Permission Caches
const sessionCache = new Map<string, { user: User; timestamp: number }>();

// Request deduplication for expensive operations
const pendingOperations = new Map<string, Promise<unknown>>();

// Helper function to deduplicate expensive async operations
async function deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
	if (pendingOperations.has(key)) {
		return pendingOperations.get(key) as Promise<T>;
	}

	const promise = operation().finally(() => {
		pendingOperations.delete(key);
	});

	pendingOperations.set(key, promise);
	return promise;
}

// Simple circuit breaker for database operations
class CircuitBreaker {
	private failures = 0;
	private lastFailTime = 0;
	private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

	constructor(
		private maxFailures = 5,
		private timeout = 60000 // 1 minute
	) {}

	async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
		if (this.state === 'OPEN') {
			if (Date.now() - this.lastFailTime > this.timeout) {
				this.state = 'HALF_OPEN';
			} else {
				if (fallback) return fallback();
				throw new Error('Circuit breaker is OPEN');
			}
		}

		try {
			const result = await operation();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			if (fallback) return fallback();
			throw error;
		}
	}

	private onSuccess() {
		this.failures = 0;
		this.state = 'CLOSED';
	}

	private onFailure() {
		this.failures++;
		this.lastFailTime = Date.now();
		if (this.failures >= this.maxFailures) {
			this.state = 'OPEN';
		}
	}
}

// Circuit breakers for different operations
const authCircuitBreaker = new CircuitBreaker(3, 30000); // 3 failures, 30 second timeout
const cacheCircuitBreaker = new CircuitBreaker(5, 10000); // 5 failures, 10 second timeout

// Health metrics for monitoring
const healthMetrics = {
	requests: { total: 0, errors: 0 },
	auth: { validations: 0, failures: 0 },
	cache: { hits: 0, misses: 0 },
	sessions: { active: 0, rotations: 0 },
	lastReset: Date.now()
};

// Reset metrics every hour to prevent memory growth
setInterval(
	() => {
		Object.assign(healthMetrics, {
			requests: { total: 0, errors: 0 },
			auth: { validations: 0, failures: 0 },
			cache: { hits: 0, misses: 0 },
			sessions: { active: sessionCache.size, rotations: 0 },
			lastReset: Date.now()
		});
	},
	60 * 60 * 1000
);

// Utility functions
const isStaticAsset = (pathname: string): boolean =>
	pathname.startsWith('/static/') ||
	pathname.startsWith('/_app/') ||
	pathname.endsWith('.js') ||
	pathname.endsWith('.css') ||
	pathname === '/favicon.ico';

const isOAuthRoute = (pathname: string): boolean => pathname.startsWith('/login') && pathname.includes('OAuth');

const isPublicOrOAuthRoute = (pathname: string): boolean => {
	const publicRoutes = ['/login', '/register', '/forgot-password', '/api/sendMail'];
	return publicRoutes.some((route) => pathname.startsWith(route)) || isOAuthRoute(pathname);
};

const getClientIp = (event: RequestEvent): string => {
	try {
		return (
			event.getClientAddress() ||
			event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
			event.request.headers.get('x-real-ip') ||
			'127.0.0.1'
		);
	} catch {
		return '127.0.0.1';
	}
};

/**
 * Identifies a tenant based on the request hostname.
 * In a real-world application, this would query a database of tenants.
 * This placeholder assumes a subdomain-based tenancy model (e.g., `my-tenant.example.com`).
 */
const getTenantIdFromHostname = (hostname: string): string | null => {
	if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
		return 'default'; // A default tenant for local development
	}
	const parts = hostname.split('.');
	// Assuming a structure like `tenant-name.your-domain.com`
	if (parts.length > 2 && !['www', 'app', 'api'].includes(parts[0])) {
		return parts[0];
	}
	// This could return a default tenant ID for the main domain if desired
	return null;
};

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 100) return '🚀'; // Super fast
	if (responseTime < 500) return '⚡'; // Fast
	if (responseTime < 1000) return '⏱️'; // Moderate
	if (responseTime < 3000) return '🕰️'; // Slow
	return '🐢'; // Very slow
};

// Optimized user count getter with caching and deduplication (now tenant-aware)
const getCachedUserCount = async (authServiceReady: boolean, tenantId?: string): Promise<number> => {
	const now = Date.now();
	const cacheKey = privateEnv.MULTI_TENANT && tenantId ? `tenant:${tenantId}:userCount` : 'global:userCount';
	const cacheStore = getCacheStore();

	// Try distributed cache first (if Redis is enabled)
	if (privateEnv.USE_REDIS) {
		try {
			const cached = await cacheStore.get<{ count: number; timestamp: number }>(cacheKey);
			if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL) {
				userCountCache = cached;
				return cached.count;
			}
		} catch (err) {
			logger.warn(`Failed to read user count from distributed cache: ${err.message}`);
		}
	}

	// Return local cached value if still valid (fallback)
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL) {
		return userCountCache.count;
	}

	// Use deduplication for expensive database operations
	return deduplicate(`getUserCount:${authServiceReady}:${tenantId}`, async () => {
		let userCount = -1;
		const filter = privateEnv.MULTI_TENANT && tenantId ? { tenantId } : {};

		if (authServiceReady && dbModule.auth) {
			try {
				userCount = await dbModule.auth.getUserCount(filter);
			} catch (err) {
				logger.warn(`Failed to get user count from auth service: ${err.message}`);
			}
		} else if (dbModule.authAdapter && typeof dbModule.authAdapter.getUserCount === 'function') {
			try {
				userCount = await dbModule.authAdapter.getUserCount(filter);
			} catch (err) {
				logger.warn(`Failed to get user count from adapter: ${err.message}`);
			}
		}

		// Cache the result in both distributed and local cache
		if (userCount >= 0) {
			const dataToCache = { count: userCount, timestamp: now };

			if (privateEnv.USE_REDIS) {
				try {
					await cacheStore.set(cacheKey, dataToCache, new Date(now + USER_COUNT_CACHE_TTL));
				} catch (err) {
					logger.error(`Failed to write user count to distributed cache: ${err.message}`);
				}
			}

			userCountCache = dataToCache;
		}

		return userCount;
	});
};

// Get user from session ID with optimized caching (now tenant-aware)
const getUserFromSessionId = async (session_id: string | undefined, authServiceReady: boolean = false, tenantId?: string): Promise<User | null> => {
	if (!session_id) return null;

	const cacheStore = getCacheStore();
	const now = Date.now();
	const canUseCache = authServiceReady || dbModule.auth !== null;

	const validateUserTenant = (user: User): User | null => {
		if (privateEnv.MULTI_TENANT && user.tenantId !== tenantId) {
			logger.warn(
				`Session user's tenant ('\x1b[34m${user.tenantId}\x1b[0m') does not match request tenant ('\x1b[34m${tenantId}\x1b[0m'). Access denied.`
			);
			return null;
		}
		return user;
	};

	// Check in-memory cache first
	const memCached = sessionCache.get(session_id);
	if (memCached && now - memCached.timestamp < CACHE_TTL && canUseCache) {
		const validUser = validateUserTenant(memCached.user);
		if (!validUser) return null;

		// Extend session in cache proactively on every hit
		const sessionData = { user: memCached.user, timestamp: now };
		sessionCache.set(session_id, sessionData);

		if (privateEnv.USE_REDIS) {
			cacheStore
				.set(session_id, sessionData, new Date(now + CACHE_TTL))
				.catch((err) => logger.error(`Failed to extend session cache for \x1b[34m${session_id}\x1b[0m: ${err.message}`));
		}

		sessionMetrics.lastActivity.set(session_id, now);
		return memCached.user;
	}

	// Try Redis cache only if enabled and auth service is ready
	if (canUseCache && privateEnv.USE_REDIS) {
		try {
			const redisCached = await cacheStore.get<{ user: User; timestamp: number }>(session_id);
			if (redisCached && now - redisCached.timestamp < CACHE_TTL) {
				const validUser = validateUserTenant(redisCached.user);
				if (!validUser) return null;

				sessionCache.set(session_id, redisCached);
				sessionMetrics.lastActivity.set(session_id, now);
				return redisCached.user;
			}
		} catch (cacheError) {
			logger.error(`Error reading from session cache store for \x1b[34m${session_id}\x1b[0m: ${cacheError.message}`);
		}
	}

	// Validate session in database only if auth service is ready
	if (!authServiceReady || !dbModule.auth) {
		logger.debug(`Auth service not ready, skipping session validation for \x1b[34m${session_id}\x1b[0m`);
		return null;
	}

	try {
		// Use circuit breaker for database auth operations
		let user = await authCircuitBreaker.execute(
			() => dbModule.auth.validateSession(session_id),
			() => null
		);

		if (user) {
			user = validateUserTenant(user);
		}

		if (user) {
			const sessionData = { user, timestamp: now };
			sessionCache.set(session_id, sessionData);

			// Use circuit breaker for cache operations too
			if (privateEnv.USE_REDIS) {
				await cacheCircuitBreaker.execute(
					() => cacheStore.set(session_id, sessionData, new Date(now + CACHE_TTL)),
					() => {} // Fallback to no-op if cache circuit is open
				);
			}

			sessionMetrics.lastActivity.set(session_id, now);
			return user;
		}
		logger.warn(`Session validation returned no user for \x1b[34m${session_id}\x1b[0m`);
	} catch (dbError) {
		logger.error(`Session validation DB error for \x1b[34m${session_id}\x1b[0m: ${dbError.message}`);
	}
	return null;
};

// Optimized admin data loading with caching (now tenant-aware)
const getAdminDataCached = async (user: User | null, cacheKey: string, tenantId?: string): Promise<unknown> => {
	const now = Date.now();
	const distributedCacheStore = getCacheStore();
	const distributedCacheKey = privateEnv.MULTI_TENANT && tenantId ? `adminData:tenant:${tenantId}:${cacheKey}` : `adminData:${cacheKey}`;
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;

	// 1. Try in-memory cache first (fastest)
	const memCached = adminDataCache.get(inMemoryCacheKey);
	if (memCached && now - memCached.timestamp < USER_PERM_CACHE_TTL) {
		return memCached.data;
	}

	// 2. Try distributed cache (e.g., Redis) if enabled
	if (privateEnv.USE_REDIS && (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens')) {
		try {
			const redisCached = await distributedCacheStore.get<{ data: unknown; timestamp: number }>(distributedCacheKey);
			if (redisCached && now - redisCached.timestamp < USER_PERM_CACHE_TTL) {
				adminDataCache.set(inMemoryCacheKey, redisCached);
				return redisCached.data;
			}
		} catch (err) {
			logger.warn(`Failed to read admin data (\x1b[34m${cacheKey}\x1b[0m) from distributed cache: ${err.message}`);
		}
	}

	let data = null;
	const filter = privateEnv.MULTI_TENANT && tenantId ? { filter: { tenantId } } : {};

	if (dbModule.auth) {
		try {
			if (cacheKey === 'roles') {
				data = await dbModule.auth.getAllRoles();
				if (!data || data.length === 0) {
					await initializeRoles();
					data = roles;
				}
			} else if (cacheKey === 'users') {
				data = await dbModule.auth.getAllUsers(filter);
			} else if (cacheKey === 'tokens') {
				data = await dbModule.auth.getAllTokens(filter.filter);
			}

			if (data) {
				// Cache in-memory
				adminDataCache.set(inMemoryCacheKey, { data, timestamp: now });

				// Cache in distributed store if enabled
				if (privateEnv.USE_REDIS && (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens')) {
					try {
						await distributedCacheStore.set(distributedCacheKey, { data, timestamp: now }, new Date(now + USER_PERM_CACHE_TTL));
					} catch (err) {
						logger.error(`Failed to write admin data (\x1b[34m${cacheKey}\x1b[0m) to distributed cache: ${err.message}`);
					}
				}
			}
		} catch (err) {
			logger.warn(`Failed to load admin data from DB (\x1b[34m${cacheKey}\x1b[0m): ${err.message}`);

			// Specific fallback for roles if DB fetch fails
			if (cacheKey === 'roles') {
				try {
					await initializeRoles();
					data = roles;
				} catch (roleErr) {
					logger.warn(`Failed to initialize config roles fallback: \x1b[34m${roleErr.message}\x1b[0m`);
				}
			}
		}
	} else {
		// Fallback to config roles if auth service is not available
		if (cacheKey === 'roles') {
			try {
				await initializeRoles();
				data = roles;
			} catch (roleErr) {
				logger.warn(`Failed to initialize config roles: \x1b[34m${roleErr.message}\x1b[0m`);
			}
		}
	}

	return data || [];
};

// Main authentication and authorization middleware
const handleAuth: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const requestStartTime = performance.now();
	const { url, cookies, locals } = event;

	// Track request metrics
	healthMetrics.requests.total++;

	// Skip auth entirely for static assets during initialization
	if (isStaticAsset(url.pathname)) {
		logger.debug(`Skipping auth for static asset: \x1b[34m${url.pathname}\x1b[0m`);
		return resolve(event);
	}

	try {
		// Multi-tenancy logic (only if enabled)
		if (privateEnv.MULTI_TENANT) {
			// Process multi-tenancy within the main auth handler to avoid duplication
			const tenantId = getTenantIdFromHostname(url.hostname);
			if (!tenantId) {
				throw error(404, `Tenant not found for hostname: \x1b[34m${url.hostname}\x1b[0m`);
			}
			locals.tenantId = tenantId;
			logger.debug(`Request identified for tenant: \x1b[34m${tenantId}\x1b[0m`);
		}

		// Wait for database initialization
		await dbInitPromise;

		// Get the current dbAdapter from the module (it might have been updated during initialization)
		const currentDbAdapter = dbModule.dbAdapter;

		// Ensure dbAdapter is properly initialized before making it available
		if (!currentDbAdapter) {
			logger.error('Database adapter is null after initialization', {
				dbModuleExists: !!dbModule,
				dbAdapterFromModule: !!dbModule.dbAdapter,
				dbInitPromiseCompleted: true
			});
			throw error(503, 'Service Unavailable: Database service is not properly initialized. Please try again shortly.');
		}

		// Make the dbAdapter available to all subsequent handlers and endpoints
		locals.dbAdapter = currentDbAdapter;

		// Debug: Log dbAdapter status
		logger.debug('Database adapter status in hooks', {
			dbAdapterExists: !!currentDbAdapter,
			dbAdapterType: currentDbAdapter?.constructor?.name || 'null'
		});

		// Check if auth service is ready
		const authServiceReady = dbModule.auth !== null && typeof dbModule.auth.validateSession === 'function';

		const session_id = cookies.get(SESSION_COOKIE_NAME);
		const user = await getUserFromSessionId(session_id, authServiceReady, locals.tenantId);

		locals.user = user;
		locals.permissions = user?.permissions || [];
		locals.session_id = user ? session_id : undefined;

		// Optimized first user check with caching
		const userCount = await getCachedUserCount(authServiceReady, locals.tenantId);
		const isFirstUser = userCount === 0;
		locals.isFirstUser = isFirstUser;

		// Load roles and other admin data conditionally and with caching
		if (authServiceReady) {
			// First, load roles for everyone (guests might need to see public roles)
			locals.roles = (await getAdminDataCached(user, 'roles', locals.tenantId)) as unknown[];

			if (locals.user) {
				// This block now ONLY runs for logged-in users
				const userRole = locals.roles.find((role: unknown) => (role as { _id: string; isAdmin?: boolean })?._id === locals.user.role);
				const isAdmin = !!(userRole as { isAdmin?: boolean })?.isAdmin;

				locals.isAdmin = isAdmin;
				locals.hasManageUsersPermission = isAdmin || hasPermissionByAction(locals.user, 'manage', 'user', undefined, locals.roles);

				// Conditionally load other admin data
				if (
					(isAdmin || locals.hasManageUsersPermission) &&
					(url.pathname.startsWith('/api/') || url.pathname.includes('/admin') || url.pathname.includes('/user'))
				) {
					const [allUsers, allTokens] = await Promise.all([
						getAdminDataCached(locals.user, 'users', locals.tenantId),
						getAdminDataCached(locals.user, 'tokens', locals.tenantId)
					]);
					locals.allUsers = allUsers as unknown[];
					locals.allTokens = allTokens;
				} else {
					locals.allUsers = [];
					locals.allTokens = [];
				}
			} else {
				// This block runs for guests (user is null)
				locals.isAdmin = false;
				locals.hasManageUsersPermission = false;
				locals.allUsers = [];
				locals.allTokens = [];
			}
		} else {
			// If auth service not ready, set safe defaults and fall back to config roles
			await initializeRoles();
			locals.roles = roles;
			locals.isAdmin = false;
			locals.hasManageUsersPermission = false;
			locals.allUsers = [];
			locals.allTokens = [];
		}

		// Performance logging for the request duration
		const responseTime = performance.now() - requestStartTime;
		logger.debug(
			`Route \x1b[34m${url.pathname}\x1b[0m - \x1b[32m${responseTime.toFixed(2)}ms\x1b[0m ${getPerformanceEmoji(responseTime)} (auth ready: \x1b[34m${authServiceReady}\x1b[0m)`
		);

		// Authorization checks
		const isPublic = isPublicOrOAuthRoute(url.pathname);
		const isApi = url.pathname.startsWith('/api/');

		if (isOAuthRoute(url.pathname)) {
			logger.debug('OAuth route detected, passing through');
			return resolve(event);
		}

		if (authServiceReady) {
			if (!locals.user && !isPublic && !isFirstUser) {
				logger.debug(`Unauthenticated access to \x1b[34m${url.pathname}\x1b[0m. Redirecting to login.`);
				if (isApi) throw error(401, 'Unauthorized');
				throw redirect(302, '/login');
			}

			if (locals.user && isPublic && !isOAuthRoute(url.pathname) && !isApi) {
				logger.debug(`Authenticated user on public route \x1b[34m${url.pathname}\x1b[0m. Redirecting to home.`);
				throw redirect(302, '/');
			}
		} else {
			logger.warn(`Auth service not ready, bypassing authentication for ${url.pathname}`);
			if (!isPublic) {
				throw error(503, 'Service Unavailable: Authentication service is initializing. Please try again shortly.');
			}
		}

		return resolve(event);
	} catch (err) {
		// Track error metrics
		healthMetrics.requests.errors++;

		if (err && typeof err === 'object' && 'status' in err) {
			// This is a SvelteKit error or redirect already handled
			throw err;
		}

		const clientIp = getClientIp(event);
		logger.error(
			`Unhandled error in handleAuth for \x1b[34m${url.pathname}\x1b[0m (IP: \x1b[34m${clientIp}\x1b[0m): ${err instanceof Error ? err.message : JSON.stringify(err)}`,
			{
				stack: err instanceof Error ? err.stack : undefined
			}
		);

		// Provide a generic, safe error message to the client
		if (url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Internal Server Error', message: 'An unexpected server error occurred.' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		throw error(500, 'An unexpected error occurred. Please try again later.');
	}
};

// Build the middleware sequence based on configuration
const buildMiddlewareSequence = (): Handle[] => {
	const middleware: Handle[] = [];

	// Always include static asset caching first for performance
	middleware.push(handleStaticAssetCaching);

	// Add rate limiting (always enabled for security)
	middleware.push(handleRateLimit);

	// Add multi-tenancy middleware if enabled (integrated into auth handler for efficiency)
	// No separate middleware needed as it's handled in handleAuth

	// Add authentication and authorization
	middleware.push(handleAuth);

	// Add API request handling
	middleware.push(handleApiRequests);

	// Add locale handling
	middleware.push(handleLocale);

	// Always add security headers last
	middleware.push(addSecurityHeaders);

	return middleware;
};

// Combine all hooks using the optimized sequence
export const handle: Handle = sequence(...buildMiddlewareSequence());

// Export utility functions for external use
export const getHealthMetrics = () => ({ ...healthMetrics });

export const invalidateAdminCache = (cacheKey?: 'roles' | 'users' | 'tokens', tenantId?: string): void => {
	const distributedCacheStore = getCacheStore();
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;
	const distributedCacheKey = `adminData:${privateEnv.MULTI_TENANT && tenantId ? `tenant:${tenantId}:` : ''}${cacheKey}`;

	if (cacheKey) {
		adminDataCache.delete(inMemoryCacheKey);
		if (privateEnv.USE_REDIS) {
			distributedCacheStore
				.delete(distributedCacheKey)
				.catch((err) => logger.error(`Failed to delete distributed admin cache for \x1b[34m${cacheKey}\x1b[0m: ${err.message}`));
		}
		logger.debug(`Admin cache invalidated for: \x1b[34m${cacheKey}\x1b[0m on tenant \x1b[34m${tenantId || 'global'}\x1b[0m`);
	} else {
		adminDataCache.clear();
		if (privateEnv.USE_REDIS) {
			['roles', 'users', 'tokens'].forEach((key) => {
				const distKey = `adminData:${privateEnv.MULTI_TENANT && tenantId ? `tenant:${tenantId}:` : ''}${key}`;
				distributedCacheStore.delete(distKey).catch((err) => logger.error(`Failed to delete distributed admin cache for ${key}: ${err.message}`));
			});
		}
		logger.debug('All admin cache cleared');
	}
};

export const invalidateUserCountCache = (tenantId?: string): void => {
	userCountCache = null;
	if (privateEnv.USE_REDIS) {
		const distributedCacheStore = getCacheStore();
		const cacheKey = privateEnv.MULTI_TENANT && tenantId ? `tenant:${tenantId}:userCount` : 'global:userCount';
		distributedCacheStore.delete(cacheKey).catch((err) => logger.error(`Failed to delete distributed user count cache: ${err.message}`));
	}
	logger.debug('User count cache invalidated');
};

export const cleanupSessionMetrics = (): void => {
	const now = Date.now();
	const METRIC_EXPIRY_THRESHOLD = 2 * SESSION_TTL;

	let cleanedCount = 0;
	for (const [sessionId, timestamp] of sessionMetrics.lastActivity) {
		if (now - timestamp > METRIC_EXPIRY_THRESHOLD) {
			sessionMetrics.lastActivity.delete(sessionId);
			sessionMetrics.activeExtensions.delete(sessionId);
			sessionMetrics.rotationAttempts.delete(sessionId);
			cleanedCount++;
		}
	}
	if (cleanedCount > 0) {
		logger.info(`Cleaned up metrics for \x1b[34m${cleanedCount}\x1b[0m stale sessions.`);
	}
};
