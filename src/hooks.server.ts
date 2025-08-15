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
import { privateConfig, isSetupComplete } from '@src/lib/env.server';
import { config } from '@src/lib/config.server';
import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Core authentication and database
import { initializeRoles, roles } from '@root/config/roles';
import { SESSION_COOKIE_NAME } from '@src/auth/constants';
import { hasPermissionByAction } from '@src/auth/permissions';
import type { User } from '@src/auth/types';

// Dynamically import db stuff only when not building and not in setup mode
let dbModule, dbInitPromise;
let isSetupMode = typeof globalThis.setupMode !== 'undefined' ? globalThis.setupMode : false;

if (!building) {
	// Initialize configuration service
	try {
		await config.initialize();
	} catch (error) {
		console.warn('Failed to initialize configuration service:', error);
	}

	// Check if setup is complete by checking environment variables
	try {
		const envConfigured = isSetupComplete();
		if (!envConfigured) {
			isSetupMode = true;
		} else {
			isSetupMode = false;
		}
	} catch (error) {
		isSetupMode = true;
	}

	if (!isSetupMode) {
		dbModule = await import('@src/databases/db');
		dbInitPromise = dbModule.dbInitPromise;
	} else {
		dbInitPromise = Promise.resolve();
	}
} else {
	dbInitPromise = Promise.resolve();
}

// Stores (removed unused imports)

// Cache
import { cacheService } from '@src/databases/CacheService';
import { sessionCache, sessionMetrics, getUserFromSessionId as sharedGetUserFromSessionId } from '@src/hooks/utils/session';
import { getTenantIdFromHostname } from '@src/hooks/utils/tenant';

// System Logger
import { logger } from '@utils/logger.svelte';

// Import middleware modules
import { addSecurityHeaders } from './hooks/addSecurityHeaders';
import { handleApiRequests } from './hooks/handleApiRequests';
import { handleLocale } from './hooks/handleLocale';
import { handleRateLimit } from './hooks/handleRateLimit';
import { handleStaticAssetCaching } from './hooks/handleStaticAssetCaching';

// Cache TTLs (centralized)
import {
	SESSION_CACHE_TTL_MS as CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_S,
	USER_PERM_CACHE_TTL_MS,
	USER_PERM_CACHE_TTL_S
} from '@src/databases/CacheService';
const SESSION_TTL = CACHE_TTL_MS;

// Performance Caches - Optimized for memory management
let userCountCache: { count: number; timestamp: number } | null = null;
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

// Session metrics and cache imported from shared session utils

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

// Circuit breaker logic is handled where needed; not used directly here after refactor

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
	const multiTenant = privateConfig?.MULTI_TENANT;
	const cacheKey = multiTenant && tenantId ? `tenant:${tenantId}:userCount` : 'global:userCount';
	// Try distributed cache first
	try {
		const cached = await cacheService.get<{ count: number; timestamp: number }>(cacheKey, tenantId);
		if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
			userCountCache = cached;
			return cached.count;
		}
	} catch (err) {
		logger.warn(`Failed to read user count from distributed cache: ${err.message}`);
	}

	// Return local cached value if still valid (fallback)
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS) {
		return userCountCache.count;
	}

	// Use deduplication for expensive database operations
	return deduplicate(`getUserCount:${authServiceReady}:${tenantId}`, async () => {
		let userCount = -1;
		const filter = multiTenant && tenantId ? { tenantId } : {};

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

			try {
				await cacheService.set(cacheKey, dataToCache, USER_COUNT_CACHE_TTL_S, tenantId);
			} catch (err) {
				logger.error(`Failed to write user count to distributed cache: ${err.message}`);
			}

			userCountCache = dataToCache;
		}

		return userCount;
	});
};

// Get user from session ID with optimized caching (now tenant-aware)
const getUserFromSessionId = (session_id: string | undefined, authServiceReady: boolean = false, tenantId?: string) =>
	sharedGetUserFromSessionId(session_id, authServiceReady, tenantId, dbModule.auth);

// Optimized admin data loading with caching (now tenant-aware)
const getAdminDataCached = async (user: User | null, cacheKey: string, tenantId?: string): Promise<unknown> => {
	const now = Date.now();
	const distributedCacheKey = privateConfig.MULTI_TENANT && tenantId ? `tenant:${tenantId}:adminData:${cacheKey}` : `adminData:${cacheKey}`;
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;

	// 1. Try in-memory cache first (fastest)
	const memCached = adminDataCache.get(inMemoryCacheKey);
	if (memCached && now - memCached.timestamp < USER_PERM_CACHE_TTL_MS) {
		return memCached.data;
	}

	// 2. Try distributed cache (e.g., Redis) if enabled
	if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
		try {
			const redisCached = await cacheService.get<{ data: unknown; timestamp: number }>(distributedCacheKey);
			if (redisCached && now - redisCached.timestamp < USER_PERM_CACHE_TTL_MS) {
				adminDataCache.set(inMemoryCacheKey, redisCached);
				return redisCached.data;
			}
		} catch (err) {
			logger.warn(`Failed to read admin data (\x1b[34m${cacheKey}\x1b[0m) from distributed cache: ${err.message}`);
		}
	}

	let data = null;
	const filter = privateConfig.MULTI_TENANT && tenantId ? { filter: { tenantId } } : {};

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
				if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
					try {
						await cacheService.set(distributedCacheKey, { data, timestamp: now }, USER_PERM_CACHE_TTL_S);
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
		return resolve(event);
	}

	try {
		// Multi-tenancy logic (only if enabled)
		if (privateConfig.MULTI_TENANT) {
			// Process multi-tenancy within the main auth handler to avoid duplication
			const tenantId = getTenantIdFromHostname(url.hostname);
			if (!tenantId) {
				throw error(404, `Tenant not found for hostname: \x1b[34m${url.hostname}\x1b[0m`);
			}
			locals.tenantId = tenantId;
		}

		// Wait for database initialization
		await dbInitPromise;

		// Only run DB-dependent logic if dbModule is defined (not in setup mode)
		if (typeof dbModule !== 'undefined' && dbModule) {
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

			// Check if auth service is ready (Mongoose connection must be fully established)
			let authServiceReady = false;
			try {
				const mongoose = dbModule.mongoose || (await import('mongoose')).default;
				const isDbConnected = mongoose.connection.readyState === 1; // 1 = connected
				authServiceReady = isDbConnected && dbModule.auth !== null && typeof dbModule.auth.validateSession === 'function';
			} catch (err) {
				logger.warn('Could not check Mongoose connection state:', err);
				authServiceReady = false;
			}

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

			// Authorization checks
			const isPublic = isPublicOrOAuthRoute(url.pathname);
			const isApi = url.pathname.startsWith('/api/');

			if (isOAuthRoute(url.pathname)) {
				return resolve(event);
			}

			if (authServiceReady) {
				if (!locals.user && !isPublic && !isFirstUser) {
					if (isApi) throw error(401, 'Unauthorized');
					throw redirect(302, '/login');
				}

				if (locals.user && isPublic && !isOAuthRoute(url.pathname) && !isApi) {
					// Redirect authenticated users away from public routes (including setup)
					throw redirect(302, '/');
				}
			} else {
				logger.warn(`Auth service not ready, bypassing authentication for ${url.pathname}`);
				if (!isPublic) {
					throw error(503, 'Service Unavailable: Authentication service is initializing. Please try again shortly.');
				}
			}

			return resolve(event);
		}
		// If dbModule is undefined (setup mode), set safe defaults and allow setup routes
		else {
			await initializeRoles();
			locals.roles = roles;
			locals.isAdmin = false;
			locals.hasManageUsersPermission = false;
			locals.allUsers = [];
			locals.allTokens = [];

			// Allow access to setup routes and public routes
			const isPublic = isPublicOrOAuthRoute(url.pathname);
			const isSetupRoute = url.pathname.startsWith('/setup');
			const isTestDbRoute = url.pathname === '/api/setup/test-database' || url.pathname === '/api/setup/test-database/';
			const isSetupCompleteRoute = url.pathname === '/api/setup/complete' || url.pathname === '/api/setup/complete/';

			if (isSetupRoute || isPublic || isTestDbRoute || isSetupCompleteRoute) {
				return resolve(event);
			} else {
				throw redirect(302, '/setup');
			}
		}
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
			return new Response(
				JSON.stringify({
					error: 'Internal Server Error',
					message: err instanceof Error ? err.message : 'An unexpected server error occurred.',
					details: err instanceof Error ? err.stack : undefined
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
		throw error(500, err instanceof Error ? err.message : 'An unexpected error occurred. Please try again later.');
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
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;
	const distributedCacheKey = privateConfig.MULTI_TENANT && tenantId ? `tenant:${tenantId}:adminData:${cacheKey}` : `adminData:${cacheKey}`;

	if (cacheKey) {
		adminDataCache.delete(inMemoryCacheKey);
		cacheService
			.delete(distributedCacheKey)
			.catch((err) => logger.error(`Failed to delete distributed admin cache for \x1b[34m${cacheKey}\x1b[0m: ${err.message}`));
	} else {
		adminDataCache.clear();
		['roles', 'users', 'tokens'].forEach((key) => {
			const distKey = privateConfig.MULTI_TENANT && tenantId ? `tenant:${tenantId}:adminData:${key}` : `adminData:${key}`;
			cacheService.delete(distKey).catch((err) => logger.error(`Failed to delete distributed admin cache for ${key}: ${err.message}`));
		});
	}
};

export const invalidateUserCountCache = (tenantId?: string): void => {
	userCountCache = null;
	const cacheKey = privateConfig.MULTI_TENANT && tenantId ? `tenant:${tenantId}:userCount` : 'global:userCount';
	cacheService.delete(cacheKey).catch((err) => logger.error(`Failed to delete distributed user count cache: ${err.message}`));
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

// Load settings from database at server startup
if (!building) {
	try {
		// Settings are already loaded in the initialization block above
		// Just check if we need to seed default settings
		const { getPublicSetting } = await import('@src/lib/settings.server');
		const siteName = getPublicSetting('SITE_NAME');

		if (!siteName) {
			try {
				const { seedDefaultSettings } = await import('@src/databases/seedSettings');
				await seedDefaultSettings();
				await loadSettings(); // Reload settings after seeding
			} catch (error) {
				console.error('Failed to seed default settings:', error);
			}
		}
	} catch (error) {
		// Continue in setup mode if there's an issue checking settings
	}
}
