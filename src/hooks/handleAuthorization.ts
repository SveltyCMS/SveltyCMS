/**
 * @file src/hooks/handleAuthorization.ts
 * @description Handles authorization, role management, and admin data caching
 *
 * Features:
 * - Tenant-aware user count caching
 * - Admin data caching (roles, users, tokens)
 * - Distributed cache integration (Redis)
 * - In-memory cache fallback for performance
 * - Request deduplication for expensive operations
 * - Circuit breaker pattern for reliability
 * - Cache invalidation helpers
 * - Multi-layer caching strategy
 */

import { privateEnv } from '@root/config/private';
import { initializeRoles, roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/auth/permissions';
import type { User } from '@src/auth/types';
import { cacheService } from '@src/databases/CacheService';
import { auth, authAdapter } from '@src/databases/db';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

// --- Caches and TTLs (centralized) ---
import { USER_COUNT_CACHE_TTL_MS, USER_COUNT_CACHE_TTL_S, USER_PERM_CACHE_TTL_MS, USER_PERM_CACHE_TTL_S } from '@src/databases/CacheService';

// Performance Caches - Consider moving to WeakMap for better memory management
let userCountCache: { count: number; timestamp: number } | null = null;
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

// Health metrics for monitoring (if kept here, otherwise import from utils)
// const healthMetrics = { /* ... */ }; // Assuming it's in a shared place

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

// Optimized user count getter with caching and deduplication (now tenant-aware)
const getCachedUserCount = async (authServiceReady: boolean, tenantId?: string): Promise<number> => {
	const now = Date.now();
	const cacheKeyBase = 'userCount';
	// Try distributed cache first
	try {
		const cached = await cacheService.get<{ count: number; timestamp: number }>(cacheKeyBase, tenantId);
		if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
			// Also update local cache for very fast subsequent access on the same instance
			userCountCache = cached;
			return cached.count;
		}
	} catch (err) {
		logger.warn(`Failed to read user count from distributed cache: ${err.message}`);
	} // Return local cached value if still valid (fallback)
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS) {
		return userCountCache.count;
	} // Use deduplication for expensive database operations
	return deduplicate(`getUserCount:${authServiceReady}:${tenantId}`, async () => {
		let userCount = -1;
		const filter = privateEnv.MULTI_TENANT && tenantId ? { tenantId } : {};
		if (authServiceReady && auth) {
			try {
				userCount = await auth.getUserCount(filter);
			} catch (err) {
				logger.warn(`Failed to get user count from auth service: ${err.message}`);
			}
		} else if (authAdapter && typeof authAdapter.getUserCount === 'function') {
			try {
				userCount = await authAdapter.getUserCount(filter);
			} catch (err) {
				logger.warn(`Failed to get user count from adapter: ${err.message}`);
			}
		}
		// Cache the result in both distributed and local cache
		if (userCount >= 0) {
			const dataToCache = { count: userCount, timestamp: now };
			try {
				await cacheService.set(cacheKeyBase, dataToCache, USER_COUNT_CACHE_TTL_S, tenantId);
			} catch (err) {
				logger.error(`Failed to write user count to distributed cache: ${err.message}`);
			}
			// Also update local cache for very fast subsequent access on the same instance
			userCountCache = dataToCache;
		}
		return userCount;
	});
};

// Optimized admin data loading with caching (now tenant-aware)
const getAdminDataCached = async (user: User, cacheKey: string, tenantId?: string): Promise<unknown> => {
	const now = Date.now();
	const distributedCacheKeyBase = `adminData:${cacheKey}`;
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`; // Separate key for in-memory cache
	// 1. Try in-memory cache first (fastest)
	const memCached = adminDataCache.get(inMemoryCacheKey);
	if (memCached && now - memCached.timestamp < USER_PERM_CACHE_TTL_MS) {
		return memCached.data;
	}
	// 2. Try distributed cache (e.g., Redis)
	if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
		// Only cache specific keys in Redis
		try {
			const redisCached = await cacheService.get<{ data: unknown; timestamp: number }>(distributedCacheKeyBase, tenantId);
			if (redisCached && now - redisCached.timestamp < USER_PERM_CACHE_TTL_MS) {
				adminDataCache.set(inMemoryCacheKey, redisCached); // Populate in-memory cache
				return redisCached.data;
			}
		} catch (err) {
			logger.warn(`Failed to read admin data (${cacheKey}) from distributed cache: ${err.message}`);
		}
	}
	let data = null;
	const filter = privateEnv.MULTI_TENANT && tenantId ? { filter: { tenantId } } : {};
	if (auth) {
		try {
			if (cacheKey === 'roles') {
				// First try to get roles from the database
				data = await auth.getAllRoles(); // If no roles in database, initialize and use the config roles
				if (!data || data.length === 0) {
					await initializeRoles();
					data = roles;
				}
			} else if (cacheKey === 'users') {
				data = await auth.getAllUsers(filter);
			} else if (cacheKey === 'tokens') {
				data = await auth.getAllTokens(filter.filter);
			}
			if (data) {
				// Cache in-memory
				adminDataCache.set(inMemoryCacheKey, { data, timestamp: now }); // Cache in distributed store
				if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
					try {
						await cacheService.set(distributedCacheKeyBase, { data, timestamp: now }, USER_PERM_CACHE_TTL_S, tenantId);
					} catch (err) {
						logger.error(`Failed to write admin data (${cacheKey}) to distributed cache: ${err.message}`);
					}
				}
			}
		} catch (err) {
			logger.warn(`Failed to load admin data from DB (${cacheKey}): ${err.message}`); // Specific fallback for roles if DB fetch fails
			if (cacheKey === 'roles') {
				try {
					await initializeRoles();
					data = roles; // Use config roles as last resort
				} catch (roleErr) {
					logger.warn(`Failed to initialize config roles fallback: ${roleErr.message}`);
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
				logger.warn(`Failed to initialize config roles: ${roleErr.message}`);
			}
		}
	}
	return data || [];
};

// Check if a route is an OAuth route
const isOAuthRoute = (pathname: string): boolean => pathname.startsWith('/login') && pathname.includes('OAuth');

// Check if the route is public or an OAuth route
const isPublicOrOAuthRoute = (pathname: string): boolean => {
	const publicRoutes = ['/login', '/register', '/forgot-password', '/api/sendMail'];
	return publicRoutes.some((route) => pathname.startsWith(route)) || isOAuthRoute(pathname);
};

export const handleAuthorization: Handle = async ({ event, resolve }) => {
	const { url, locals } = event;

	// Optimized first user check with caching
	const userCount = await getCachedUserCount(auth !== null, locals.tenantId);
	const isFirstUser = userCount === 0;
	locals.isFirstUser = isFirstUser;

	// Load roles and other admin data conditionally and with caching
	if (auth !== null && typeof auth.validateSession === 'function') {
		// First, load roles for everyone (guests might need to see public roles)
		locals.roles = (await getAdminDataCached(locals.user, 'roles', locals.tenantId)) as unknown[];
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
			// Set safe defaults for non-authenticated users
			locals.isAdmin = false;
			locals.hasManageUsersPermission = false;
			locals.allUsers = [];
			locals.allTokens = [];
		}
	} else {
		// If auth service not ready, set safe defaults and fall back to config roles
		await initializeRoles(); // Ensure config roles are loaded
		locals.roles = roles;
		locals.isAdmin = false;
		locals.hasManageUsersPermission = false;
		locals.allUsers = [];
		locals.allTokens = [];
	}

	// Authorization checks
	const isPublic = isPublicOrOAuthRoute(url.pathname);
	const isApi = url.pathname.startsWith('/api/');

	if (isOAuthRoute(url.pathname)) {
		return resolve(event);
	}

	if (auth !== null && typeof auth.validateSession === 'function') {
		if (!locals.user && !isPublic && !isFirstUser) {
			if (isApi) throw error(401, 'Unauthorized');
			throw redirect(302, '/login');
		}
		if (locals.user && isPublic && !isOAuthRoute(url.pathname) && !isApi) {
			throw redirect(302, '/');
		}
		// Note: API handling is moved to handleApiRequests
	} else {
		logger.warn(`Auth service not ready, bypassing authentication for \x1b[34m${url.pathname}\x1b[0m`);
	}

	return resolve(event);
};

// Helper function to invalidate admin data cache - exported for use in API endpoints
export const invalidateAdminCache = (cacheKey?: 'roles' | 'users' | 'tokens', tenantId?: string): void => {
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;
	const distributedCacheKey = `adminData:${cacheKey}`;
	if (cacheKey) {
		adminDataCache.delete(inMemoryCacheKey);
		cacheService
			.delete(distributedCacheKey, tenantId)
			.catch((err) => logger.error(`Failed to delete distributed admin cache for \x1b[31m${cacheKey}\x1b[0m: ${err.message}`));
	} else {
		adminDataCache.clear();
		['roles', 'users', 'tokens'].forEach((key) => {
			cacheService
				.delete(`adminData:${key}`, tenantId)
				.catch((err) => logger.error(`Failed to delete distributed admin cache for ${key}: ${err.message}`));
		});
	}
};

// Helper function to invalidate user count cache - exported for use after user creation/deletion
export const invalidateUserCountCache = (tenantId?: string): void => {
	userCountCache = null; // Invalidate local cache
	const cacheKey = 'userCount';
	cacheService.delete(cacheKey, tenantId).catch((err) => logger.error(`Failed to delete distributed user count cache: ${err.message}`));
};
