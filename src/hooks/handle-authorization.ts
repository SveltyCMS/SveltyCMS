/**
 * @file src/hooks/handle-authorization.ts
 * @description Lightweight authorization middleware for user role and route protection
 *
 * ### Improvements
 * - Removed setup guard (redundant)
 * - Removed heavy global data loading (users/tokens)
 * - Simplified redirect logic for authenticated users
 * - Public and static routes skip database access entirely
 */

import { hasPermissionByAction } from '@src/databases/auth/permissions';
import type { Role } from '@src/databases/auth/types';
import {
	cacheService,
	USER_COUNT_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_S,
	USER_PERM_CACHE_TTL_MS,
	USER_PERM_CACHE_TTL_S
} from '@src/databases/cache-service';
import { auth } from '@src/databases/db';
import { error, type Handle, redirect } from '@sveltejs/kit';
import { AppError, handleApiError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

// --- SIMPLE IN-MEMORY CACHE ---

let userCountCache: { count: number; timestamp: number } | null = null;
// In TEST_MODE we use a no-op stub so every request reads fresh from DB.
const rolesCache: Map<string, { data: Role[]; timestamp: number }> =
	process.env.TEST_MODE === 'true'
		? ({
				get: () => undefined,
				set: () => undefined,
				delete: () => false,
				clear: () => undefined
			} as unknown as Map<string, { data: Role[]; timestamp: number }>)
		: new Map<string, { data: Role[]; timestamp: number }>();

// --- UTILITIES ---

function isPublicRoute(pathname: string, method: string | undefined, testMode: string | undefined): boolean {
	const publicRoutes = [
		'/login',
		'/register',
		'/forgot-password',
		'/setup',
		'/api/system/version',
		'/api/user/login',
		'/api/settings/public',
		'/api/preview',
		'/api/system/health'
	];

	if (testMode === 'true') {
		publicRoutes.push('/api/testing');
	}

	// Token validation endpoint is public (GET only) for registration flow
	if (method === 'GET' && pathname.startsWith('/api/token/') && pathname.length > 11) {
		return true;
	}

	return publicRoutes.some((route) => pathname.startsWith(route));
}

function isOAuthRoute(pathname: string): boolean {
	return pathname.startsWith('/login') && pathname.includes('OAuth');
}

/** Get cached user count with fallback */
async function getCachedUserCount(tenantId?: string | null, multiTenant?: boolean): Promise<number> {
	const now = Date.now();
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS) {
		return userCountCache.count;
	}

	try {
		const cached = await cacheService.get<{ count: number; timestamp: number }>('userCount', tenantId);
		if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
			userCountCache = cached;
			return cached.count;
		}
	} catch {
		// ignore cache errors
	}

	try {
		if (!auth) {
			return -1;
		}
		const filter = multiTenant && tenantId ? { tenantId } : {};
		const bypassOpts = !tenantId ? { bypassTenantCheck: true } : undefined;
		const count = await auth.getUserCount(filter, bypassOpts);
		const cacheData = { count, timestamp: now };
		userCountCache = cacheData;
		await cacheService.set('userCount', cacheData, USER_COUNT_CACHE_TTL_S, tenantId);
		return count;
	} catch (err) {
		logger.warn(`User count query failed: ${err instanceof Error ? err.message : String(err)}`);
		return -1;
	}
}

/**
 * Get cached roles for access checks (database-only)
 * Returns empty array if database is unavailable - caller should handle setup redirect
 */
async function getCachedRoles(tenantId?: string | null): Promise<Role[]> {
	const now = Date.now();
	const key = tenantId || 'global';

	// In TEST_MODE, bypass the in-memory TTL so role changes take effect immediately.
	if (process.env.TEST_MODE !== 'true') {
		const cached = rolesCache.get(key);
		if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS) {
			return cached.data;
		}
	}

	try {
		if (!auth) {
			logger.debug('Database adapter not initialized - roles unavailable');
			return [];
		}

		const bypassOpts = !tenantId ? { bypassTenantCheck: true } : undefined;
		const data = await auth.getAllRoles(tenantId, bypassOpts);
		if (!data || data.length === 0) {
			logger.debug('No roles found in database', { tenantId });
			return [];
		}

		const cacheData = { data, timestamp: now };
		rolesCache.set(key, cacheData);
		await cacheService.set(`roles:${key}`, cacheData, USER_PERM_CACHE_TTL_S, tenantId);
		return data;
	} catch (err) {
		logger.error(`Failed to fetch roles from database: ${err instanceof Error ? err.message : String(err)}`);
		return [];
	}
}

// --- MAIN HANDLE ---

export const handleAuthorization: Handle = async ({ event, resolve }) => {
	const { url, locals, request } = event;
	const { user } = locals;

	// Dynamic imports for settings to avoid circular dependencies in hooks
	const { getPrivateSettingSync } = await import('@src/services/settings-service');

	const pathname = url.pathname;
	const isApi = pathname.startsWith('/api/');
	const isPublic = isPublicRoute(pathname, request.method, process.env.TEST_MODE);

	// --- Skip static or internal routes early ---
	const ASSET_REGEX =
		/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;
	if (pathname.startsWith('/.well-known/') || pathname.startsWith('/_') || ASSET_REGEX.test(pathname)) {
		return resolve(event);
	}

	// --- Public routes require no auth ---
	if (isPublic) {
		locals.isAdmin = false;
		locals.hasManageUsersPermission = false;
		locals.isFirstUser = false;
		return resolve(event);
	}

	// --- Check if first user (for setup flow) ---
	const multiTenant = getPrivateSettingSync('MULTI_TENANT');
	const userCount = await getCachedUserCount(locals.tenantId, !!multiTenant);
	locals.isFirstUser = userCount === 0;

	// --- Load cached roles (database-only) ---
	const rolesData = await getCachedRoles(locals.tenantId);
	locals.roles = rolesData;

	// --- Redirect to setup if database not initialized (no roles found) ---
	const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
	if (
		rolesData.length === 0 &&
		!pathname.startsWith('/setup') &&
		!isLocalizedSetup &&
		!pathname.startsWith('/api/system') &&
		!pathname.startsWith('/api/setup')
	) {
		// If handleSetup already declared setup complete, don't redirect
		// back to /setup — use fallback roles instead to prevent a redirect loop
		if (locals.__setupConfigExists === true) {
			logger.warn('No roles in DB but setup marked complete — using fallback roles to prevent redirect loop');
			const { getDefaultRoles } = await import('@src/databases/auth/default-roles');
			locals.roles = getDefaultRoles();
		} else {
			logger.warn('No roles found in database - redirecting to setup', {
				pathname,
				tenantId: locals.tenantId
			});
			if (isApi) {
				const errorMsg = 'Service Unavailable: System not initialized. Please run setup.';
				throw new AppError(errorMsg, 503, 'SYSTEM_NOT_INITIALIZED');
			}
			throw redirect(302, '/setup');
		}
	}

	// --- Handle authenticated users ---
	try {
		if (user) {
			const userRole = rolesData.find((r) => r._id === user.role);
			// Derive isAdmin ONLY from fresh DB role data — never from a cached user mutation.
			// The (user as any).isAdmin fallback can propagate stale true values across requests.
			const isAdmin = !!userRole?.isAdmin;

			// Make isAdmin available on user object for downstream code that expects it.
			(user as any).isAdmin = isAdmin;
			locals.isAdmin = isAdmin;
			locals.hasAdminPermission = isAdmin;
			locals.hasManageUsersPermission = isAdmin || hasPermissionByAction(user, 'manage', 'user', undefined, rolesData);

			// Redirect authenticated users away from public routes
			if (isPublic && !isOAuthRoute(pathname) && !isApi) {
				throw redirect(302, '/');
			}
		} else {
			// --- Handle unauthenticated users ---
			locals.isAdmin = false;
			locals.hasManageUsersPermission = false;

			// Block access to protected pages
			if (!(isPublic || locals.isFirstUser)) {
				if (isApi) {
					throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
				}
				throw redirect(302, '/login');
			}
		}

		// --- Allow OAuth routes to pass through ---
		if (isOAuthRoute(pathname)) {
			logger.trace('OAuth route detected, passing through');
		}

		return await resolve(event);
	} catch (err) {
		if (isApi) {
			return handleApiError(err, event);
		}

		if (err instanceof AppError) {
			throw error(err.status, err.message);
		}

		throw err;
	}
};

// --- CACHE INVALIDATION UTILITIES ---

export function invalidateUserCountCache(tenantId?: string | null): void {
	userCountCache = null;
	cacheService.delete('userCount', tenantId).catch((err) => logger.error(`Failed to invalidate user count: ${err.message}`));
	logger.debug('User count cache invalidated');
}

export function invalidateRolesCache(tenantId?: string | null): void {
	const key = tenantId || 'global';
	rolesCache.delete(key);
	cacheService.delete(`roles:${key}`, tenantId).catch((err) => logger.error(`Failed to invalidate roles cache: ${err.message}`));
	logger.debug(`Roles cache invalidated (tenant: ${tenantId || 'global'})`);
}
