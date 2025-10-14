/**
 * @file src/hooks/handleAuthorization.ts
 * @description Authorization middleware with role management and admin data caching
 *
 * ### Responsibilities
 * - Loads user roles and determines admin status
 * - Enforces route protection (redirects unauthenticated users)
 * - Handles first-user detection (for setup completion)
 * - Conditionally loads admin data (users, tokens) with intelligent caching
 * - Manages authenticated user redirects from public pages
 *
 * ### Caching Strategy
 * - **Layer 1**: In-memory cache (fastest, per-instance)
 * - **Layer 2**: Distributed cache like Redis (shared across instances)
 * - **Layer 3**: Database query (source of truth)
 *
 * ### Prerequisites
 * - handleSystemState has confirmed system is READY
 * - handleAuthentication has validated session and set locals.user
 *
 * @prerequisite System state is READY and auth service is available
 */

import { error, redirect, type Handle } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { initializeRoles, roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import type { Role, User } from '@src/databases/auth/types';
import { auth } from '@src/databases/db';
import {
	cacheService,
	USER_COUNT_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_S,
	USER_PERM_CACHE_TTL_MS,
	USER_PERM_CACHE_TTL_S
} from '@src/databases/CacheService';
import { logger } from '@utils/logger.svelte';

// --- IN-MEMORY CACHES ---

/**
 * Local cache for user count to avoid repeated database queries.
 * Invalidated when users are created or deleted.
 */
let userCountCache: { count: number; timestamp: number } | null = null;

/**
 * Local cache for admin data (roles, users, tokens).
 * Key format: "inMemoryAdmin:{tenantId}:{dataType}"
 */
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * Tracks pending operations to prevent duplicate concurrent requests.
 * Ensures only one database query runs at a time for the same operation.
 */
const pendingOperations = new Map<string, Promise<unknown>>();

// --- UTILITY FUNCTIONS ---

/**
 * Deduplicates concurrent expensive operations.
 * If an operation is already in progress, returns the existing promise.
 */
function deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
	const existing = pendingOperations.get(key);
	if (existing) return existing as Promise<T>;

	const promise = operation().finally(() => pendingOperations.delete(key));
	pendingOperations.set(key, promise);
	return promise;
}

/**
 * Checks if a route is public (accessible without authentication).
 */
function isPublicOrOAuthRoute(pathname: string): boolean {
	const publicRoutes = ['/login', '/register', '/forgot-password', '/api/sendMail'];
	return publicRoutes.some((route) => pathname.startsWith(route));
}

/**
 * Checks if a route is an OAuth callback route.
 */
function isOAuthRoute(pathname: string): boolean {
	return pathname.startsWith('/login') && pathname.includes('OAuth');
}

/**
 * Gets the current user count with multi-layer caching and tenant awareness.
 */
async function getCachedUserCount(tenantId?: string): Promise<number> {
	const now = Date.now();
	const cacheKey = 'userCount';

	// Layer 1: In-memory cache (fastest)
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS) {
		return userCountCache.count;
	}

	// Layer 2: Distributed cache (e.g., Redis)
	try {
		const cached = await cacheService.get<{ count: number; timestamp: number }>(cacheKey, tenantId);
		if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
			userCountCache = cached; // Populate in-memory cache
			return cached.count;
		}
	} catch (err) {
		logger.warn(`Failed to read user count from distributed cache: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Layer 3: Database query (with deduplication)
	return deduplicate(`getUserCount:${tenantId || 'global'}`, async () => {
		try {
			const filter = getPrivateSettingSync('MULTI_TENANT') && tenantId ? { tenantId } : {};
			const count = await auth.getUserCount(filter);

			// Cache the result in both layers
			const dataToCache = { count, timestamp: now };
			userCountCache = dataToCache;

			await cacheService
				.set(cacheKey, dataToCache, USER_COUNT_CACHE_TTL_S, tenantId)
				.catch((err) => logger.warn(`Failed to cache user count: ${err.message}`));

			return count;
		} catch (err) {
			logger.error(`Failed to get user count: ${err instanceof Error ? err.message : String(err)}`);
			return -1; // Return -1 to indicate error (don't treat as "no users")
		}
	});
}

/**
 * Loads admin data (roles, users, tokens) with multi-layer caching.
 */
async function getAdminDataCached(cacheKey: 'roles' | 'users' | 'tokens', tenantId?: string): Promise<unknown> {
	const now = Date.now();
	const distributedCacheKey = `adminData:${cacheKey}`;
	const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;

	// Layer 1: In-memory cache (fastest)
	const memCached = adminDataCache.get(inMemoryCacheKey);
	if (memCached && now - memCached.timestamp < USER_PERM_CACHE_TTL_MS) {
		return memCached.data;
	}

	// Layer 2: Distributed cache (e.g., Redis)
	try {
		const redisCached = await cacheService.get<{ data: unknown; timestamp: number }>(distributedCacheKey, tenantId);
		if (redisCached && now - redisCached.timestamp < USER_PERM_CACHE_TTL_MS) {
			adminDataCache.set(inMemoryCacheKey, redisCached); // Populate in-memory cache
			return redisCached.data;
		}
	} catch (err) {
		logger.warn(`Failed to read ${cacheKey} from distributed cache: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Layer 3: Database query
	let data: unknown = null;
	const filter = getPrivateSettingSync('MULTI_TENANT') && tenantId ? { filter: { tenantId } } : {};

	try {
		if (cacheKey === 'roles') {
			data = await auth.getAllRoles();
			// If no roles in database, initialize from config
			if (!data || (Array.isArray(data) && data.length === 0)) {
				await initializeRoles();
				data = roles;
			}
		} else if (cacheKey === 'users') {
			data = await auth.getAllUsers(filter);
		} else if (cacheKey === 'tokens') {
			data = await auth.getAllTokens(filter.filter);
		}

		// Cache the result in both layers
		if (data) {
			const cacheData = { data, timestamp: now };
			adminDataCache.set(inMemoryCacheKey, cacheData);

			await cacheService
				.set(distributedCacheKey, cacheData, USER_PERM_CACHE_TTL_S, tenantId)
				.catch((err) => logger.warn(`Failed to cache ${cacheKey}: ${err.message}`));
		}
	} catch (err) {
		logger.error(`Failed to load ${cacheKey} from database: ${err instanceof Error ? err.message : String(err)}`);

		// Fallback to config roles if database fails
		if (cacheKey === 'roles') {
			await initializeRoles();
			data = roles;
		}
	}

	return data || [];
}

// --- MAIN HOOK ---

export const handleAuthorization: Handle = async ({ event, resolve }) => {
	const { url, locals } = event;
	const { user } = locals;
	const isApi = url.pathname.startsWith('/api/');
	const isPublic = isPublicOrOAuthRoute(url.pathname);

	// --- SETUP GUARD ---
	// Skip all authorization logic during setup mode
	const { isSetupComplete } = await import('@utils/setupCheck');
	if (!isSetupComplete()) {
		return resolve(event);
	}

	// --- 1. Check First User Status ---
	// This is important for setup completion detection
	const userCount = await getCachedUserCount(locals.tenantId);
	locals.isFirstUser = userCount === 0;

	// --- 2. Load Roles (Required for Everyone) ---
	// Even guests might need to see public role information
	const rolesData = await getAdminDataCached('roles', locals.tenantId);
	locals.roles = Array.isArray(rolesData) ? (rolesData as Role[]) : [];

	// --- 3. Handle Authenticated Users ---
	if (user) {
		// Determine admin status and permissions
		const userRole = locals.roles.find((role) => role._id === user.role);
		const isAdmin = !!userRole?.isAdmin;

		locals.isAdmin = isAdmin;
		locals.hasManageUsersPermission = isAdmin || hasPermissionByAction(user, 'manage', 'user', undefined, locals.roles);

		// Redirect authenticated users away from public pages
		if (isPublic && !isOAuthRoute(url.pathname) && !isApi) {
			logger.trace(`Authenticated user on public route ${url.pathname}. Redirecting to home.`);

			// Try to redirect to first collection
			try {
				const { contentManager } = await import('@src/content/ContentManager');
				const firstCollection = await contentManager.getFirstCollection();

				if (firstCollection?.path) {
					const userLang = (user as User & { systemLanguage?: string }).systemLanguage || 'en';
					const collectionPath = firstCollection.path;
					throw redirect(302, `/${userLang}${collectionPath.startsWith('/') ? collectionPath : '/' + collectionPath}`);
				}
			} catch (err) {
				// If it's a redirect, re-throw it
				if (err && typeof err === 'object' && 'status' in err) throw err;
				logger.warn(`Failed to redirect to first collection: ${err instanceof Error ? err.message : String(err)}`);
			}

			// Fallback redirect
			throw redirect(302, '/');
		}

		// Conditionally load admin data for relevant routes
		if (
			(isAdmin || locals.hasManageUsersPermission) &&
			(isApi || url.pathname.includes('/admin') || url.pathname.includes('/user') || url.pathname.includes('/config'))
		) {
			const [allUsers, allTokens] = await Promise.all([getAdminDataCached('users', locals.tenantId), getAdminDataCached('tokens', locals.tenantId)]);

			locals.allUsers = Array.isArray(allUsers) ? (allUsers as User[]) : [];
			locals.allTokens = Array.isArray(allTokens) ? (allTokens as Array<{ _id: string; [key: string]: unknown }>) : [];
		} else {
			locals.allUsers = [];
			locals.allTokens = [];
		}
	} else {
		// --- 4. Handle Unauthenticated Users (Guests) ---
		locals.isAdmin = false;
		locals.hasManageUsersPermission = false;
		locals.allUsers = [];
		locals.allTokens = [];

		// Block access to protected routes
		if (!isPublic && !locals.isFirstUser) {
			logger.trace(`Unauthenticated access to protected route \x1b[34m${url.pathname}.\x1b[0m Redirecting to \x1b[32m/login\x1b[0m.`);
			if (isApi) throw error(401, 'Unauthorized');
			throw redirect(302, '/login');
		}
	}

	// --- 5. Allow OAuth Routes to Pass Through ---
	if (isOAuthRoute(url.pathname)) {
		logger.trace('OAuth route detected, passing through');
	}

	return resolve(event);
};

// --- CACHE INVALIDATION UTILITIES ---

/**
 * Invalidates admin data cache for a specific data type.
 * Call this when roles, users, or tokens are modified.
 */
export function invalidateAdminCache(cacheKey?: 'roles' | 'users' | 'tokens', tenantId?: string): void {
	if (cacheKey) {
		const inMemoryCacheKey = `inMemoryAdmin:${tenantId || 'global'}:${cacheKey}`;
		const distributedCacheKey = `adminData:${cacheKey}`;

		adminDataCache.delete(inMemoryCacheKey);
		cacheService.delete(distributedCacheKey, tenantId).catch((err) => logger.error(`Failed to invalidate ${cacheKey} cache: ${err.message}`));

		logger.debug(`Admin cache invalidated: ${cacheKey} (tenant: ${tenantId || 'global'})`);
	} else {
		// Clear all admin caches
		adminDataCache.clear();
		['roles', 'users', 'tokens'].forEach((key) => {
			cacheService.delete(`adminData:${key}`, tenantId).catch((err) => logger.error(`Failed to invalidate ${key} cache: ${err.message}`));
		});
		logger.debug('All admin caches cleared');
	}
}

/**
 * Invalidates the user count cache.
 * Call this when users are created or deleted.
 */
export function invalidateUserCountCache(tenantId?: string): void {
	userCountCache = null;
	cacheService.delete('userCount', tenantId).catch((err) => logger.error(`Failed to invalidate user count cache: ${err.message}`));
	logger.debug('User count cache invalidated');
}
