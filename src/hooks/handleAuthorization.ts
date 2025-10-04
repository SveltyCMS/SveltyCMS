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
import { privateEnv } from '@src/stores/globalSettings';
import { error, redirect, type Handle } from '@sveltejs/kit';

import { cacheService } from '@src/databases/CacheService';
// Auth
import { initializeRoles, roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import type { Role, User } from '@src/databases/auth/types';
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Deduplicate noisy "auth service not ready" warnings
const authNotReadyLogCache = new Map<string, number>();
const AUTH_NOT_READY_SUPPRESS_MS = 5000; // suppress repeats for 5s per path

// --- Caches and TTLs (centralized) ---
import { USER_COUNT_CACHE_TTL_MS, USER_COUNT_CACHE_TTL_S, USER_PERM_CACHE_TTL_MS, USER_PERM_CACHE_TTL_S } from '@src/databases/CacheService';

// Performance Caches - lightweight in-memory layer (process scoped)
let userCountCache: { count: number; timestamp: number } | null = null;
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

// Deduplication map for expensive concurrent operations
const pendingOperations = new Map<string, Promise<unknown>>();
function deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
	if (pendingOperations.has(key)) return pendingOperations.get(key) as Promise<T>;
	const p = operation().finally(() => pendingOperations.delete(key));
	pendingOperations.set(key, p);
	return p;
}

// Health metrics for monitoring (if kept here, otherwise import from utils)
// const healthMetrics = { /* ... */ }; // Assuming it's in a shared place

// Request deduplication for expensive operations (if kept here, otherwise import)
// const pendingOperations = new Map<string, Promise<unknown>>(); // Assuming it's in a shared place

// Helper function to deduplicate expensive async operations (if kept here, otherwise import)
// async function deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> { /* ... */ } // Assuming it's in a shared place

// Optimized user count getter with caching and deduplication (now tenant-aware)
interface AuthServiceLike {
	getUserCount?: (filter?: Record<string, unknown>) => Promise<number>;
	getAllRoles?: () => Promise<Role[]>;
	getAllUsers?: (filter?: Record<string, unknown>) => Promise<User[]>;
	getAllTokens?: (filter?: Record<string, unknown>) => Promise<Array<{ _id: string; [key: string]: unknown }>>;
	validateSession?: (id: string) => Promise<User | null>;
}

const getCachedUserCount = async (authServiceReady: boolean, tenantId?: string, authService?: AuthServiceLike): Promise<number> => {
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
		logger.warn(`Failed to read user count from distributed cache: ${err instanceof Error ? err.message : String(err)}`);
	} // Return local cached value if still valid (fallback)
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS) {
		return userCountCache.count;
	} // Use deduplication for expensive database operations
	return deduplicate(`getUserCount:${authServiceReady}:${tenantId}`, async () => {
		let userCount = -1;
		const filter = privateEnv.MULTI_TENANT && tenantId ? { tenantId } : {};
		if (authServiceReady && authService && authService.getUserCount) {
			try {
				userCount = await authService.getUserCount(filter);
			} catch (err) {
				logger.warn(`Failed to get user count from auth service: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		// Cache the result in both distributed and local cache
		if (userCount >= 0) {
			const dataToCache = { count: userCount, timestamp: now };
			try {
				await cacheService.set(cacheKeyBase, dataToCache, USER_COUNT_CACHE_TTL_S, tenantId);
			} catch (err) {
				logger.error(`Failed to write user count to distributed cache: ${err instanceof Error ? err.message : String(err)}`);
			}
			// Also update local cache for very fast subsequent access on the same instance
			userCountCache = dataToCache;
		}
		return userCount;
	});
};

// Optimized admin data loading with caching (now tenant-aware)
const getAdminDataCached = async (_user: User | null, cacheKey: string, tenantId?: string, authService?: AuthServiceLike): Promise<unknown> => {
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
			logger.warn(`Failed to read admin data (${cacheKey}) from distributed cache: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	let data = null;
	const filter = privateEnv.MULTI_TENANT && tenantId ? { filter: { tenantId } } : {};
	if (authService) {
		try {
			if (cacheKey === 'roles' && authService.getAllRoles) {
				// First try to get roles from the database
				data = await authService.getAllRoles(); // If no roles in database, initialize and use the config roles
				if (!data || data.length === 0) {
					await initializeRoles();
					data = roles;
				}
			} else if (cacheKey === 'users' && authService.getAllUsers) {
				data = await authService.getAllUsers(filter);
			} else if (cacheKey === 'tokens' && authService.getAllTokens) {
				data = await authService.getAllTokens(filter);
			}
			if (data) {
				// Cache in-memory
				adminDataCache.set(inMemoryCacheKey, { data, timestamp: now }); // Cache in distributed store
				if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
					try {
						await cacheService.set(distributedCacheKeyBase, { data, timestamp: now }, USER_PERM_CACHE_TTL_S, tenantId);
					} catch (err) {
						logger.error(`Failed to write admin data (${cacheKey}) to distributed cache: ${err instanceof Error ? err.message : String(err)}`);
					}
				}
			}
		} catch (err) {
			logger.warn(`Failed to load admin data from DB (${cacheKey}): ${err instanceof Error ? err.message : String(err)}`); // Specific fallback for roles if DB fetch fails
			if (cacheKey === 'roles') {
				try {
					await initializeRoles();
					data = roles; // Use config roles as last resort
				} catch (roleErr) {
					logger.warn(`Failed to initialize config roles fallback: ${roleErr instanceof Error ? roleErr.message : String(roleErr)}`);
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
				logger.warn(`Failed to initialize config roles: ${roleErr instanceof Error ? roleErr.message : String(roleErr)}`);
			}
		}
	}
	return data || [];
};

// Check if a route is an OAuth route
const isOAuthRoute = (pathname: string): boolean => pathname.startsWith('/login') && pathname.includes('OAuth');

// Check if the route is public or an OAuth route
const isPublicOrOAuthRoute = (pathname: string): boolean => {
	const publicRoutes = ['/login', '/register', '/forgot-password', '/api/sendMail', '/setup', '/api/setup/test-database', '/api/setup/complete'];
	return publicRoutes.some((route) => pathname.startsWith(route)) || isOAuthRoute(pathname);
};

export const handleAuthorization: Handle = async ({ event, resolve }) => {
	const { url, locals } = event;

	// Determine the active auth service (adapter agnostic)
	// Prefer imported auth (primary), fall back to any adapter placed on locals
	const authService: AuthServiceLike | undefined = (auth as unknown as AuthServiceLike) || (locals.dbAdapter?.auth as AuthServiceLike);

	const authServiceReady = !!(authService && typeof authService.validateSession === 'function');

	// Only run this for authenticated users on root or public routes
	if (locals.user && (url.pathname === '/' || isPublicOrOAuthRoute(url.pathname))) {
		try {
			// Import contentManager and hasPermissionWithRoles dynamically to avoid circular deps
			const { contentManager } = await import('@src/content/ContentManager');
			const { hasPermissionWithRoles } = await import('@src/databases/auth/permissions');

			const firstCollection = contentManager.getFirstCollection();
			if (firstCollection) {
				// Redirect to first collection as before
				const userLang = (locals.user as User & { systemLanguage?: string }).systemLanguage || 'en';
				const collectionPath = firstCollection.path || '';
				const redirectPath = `/${userLang}${collectionPath.startsWith('/') ? collectionPath : '/' + collectionPath}`;
				throw redirect(302, redirectPath);
			} else {
				// No collections exist, check permission
				const canCreateCollections = hasPermissionWithRoles(locals.user, 'config:collectionbuilder', locals.roles);
				if (canCreateCollections) {
					throw redirect(302, '/config/collectionbuilder');
				} else {
					throw redirect(302, '/user'); // or '/dashboard' as fallback
				}
			}
		} catch (redirectError) {
			// If it's already a redirect, re-throw it
			if (redirectError && typeof redirectError === 'object' && 'status' in redirectError) {
				throw redirectError;
			}
			// Otherwise, log the error and continue
			logger.warn(`Failed to handle no-collection redirect: ${redirectError instanceof Error ? redirectError.message : String(redirectError)}`);
		}
	}

	// Optimized first user check with caching
	const userCount = await getCachedUserCount(authServiceReady, locals.tenantId, authService);
	const isFirstUser = userCount === 0;
	locals.isFirstUser = isFirstUser;

	// Load roles and other admin data conditionally and with caching
	if (authServiceReady) {
		// First, load roles for everyone (guests might need to see public roles)
		const rolesData = await getAdminDataCached(locals.user || null, 'roles', locals.tenantId, authService);
		locals.roles = Array.isArray(rolesData) ? (rolesData as Role[]) : [];
		if (locals.user && locals.roles) {
			// This block now ONLY runs for logged-in users
			const userRole = locals.roles.find((role) => role._id === locals.user!.role);
			const isAdmin = !!userRole?.isAdmin;
			locals.isAdmin = isAdmin;
			locals.hasManageUsersPermission = isAdmin || hasPermissionByAction(locals.user, 'manage', 'user', undefined, locals.roles);
			// Conditionally load other admin data
			if (
				(isAdmin || locals.hasManageUsersPermission) &&
				(url.pathname.startsWith('/api/') || url.pathname.includes('/admin') || url.pathname.includes('/user'))
			) {
				const [allUsers, allTokens] = await Promise.all([
					getAdminDataCached(locals.user, 'users', locals.tenantId, authService),
					getAdminDataCached(locals.user, 'tokens', locals.tenantId, authService)
				]);
				locals.allUsers = Array.isArray(allUsers) ? (allUsers as User[]) : [];
				locals.allTokens = Array.isArray(allTokens) ? (allTokens as Array<{ _id: string; [key: string]: unknown }>) : [];
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
		// Note: API handling is moved to handleApiRequests
	} else {
		const now = Date.now();
		const last = authNotReadyLogCache.get(url.pathname) || 0;
		if (now - last > AUTH_NOT_READY_SUPPRESS_MS) {
			authNotReadyLogCache.set(url.pathname, now);
			// During setup, the auth service is not ready, so we allow the request.
			// This is expected and safe because the setup routes do not grant any privileges.
			logger.debug(`Auth service not ready, allowing setup request to \x1b[34m${url.pathname}\x1b[0m`);
		}
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
			.catch((err) =>
				logger.error(`Failed to delete distributed admin cache for \x1b[31m${cacheKey}\x1b[0m: ${err instanceof Error ? err.message : String(err)}`)
			);
		logger.debug(`Admin cache invalidated for: \x1b[31m${cacheKey}\x1b[0m on tenant \x1b[34m${tenantId || 'global'}\x1b[0m`);
	} else {
		adminDataCache.clear();
		['roles', 'users', 'tokens'].forEach((key) => {
			cacheService
				.delete(`adminData:${key}`, tenantId)
				.catch((err) => logger.error(`Failed to delete distributed admin cache for ${key}: ${err instanceof Error ? err.message : String(err)}`));
		});
		logger.debug('All admin cache cleared');
	}
};

// Helper function to invalidate user count cache - exported for use after user creation/deletion
export const invalidateUserCountCache = (tenantId?: string): void => {
	userCountCache = null; // Invalidate local cache
	const cacheKey = 'userCount';
	cacheService
		.delete(cacheKey, tenantId)
		.catch((err) => logger.error(`Failed to delete distributed user count cache: ${err instanceof Error ? err.message : String(err)}`));
	logger.debug('User count cache invalidated');
};
