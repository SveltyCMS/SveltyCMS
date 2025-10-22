/**
 * @file src/hooks/handleAuthorization.ts
 * @description Lightweight authorization middleware for user role and route protection
 *
 * ### Improvements
 * - Removed setup guard (redundant)
 * - Removed heavy global data loading (users/tokens)
 * - Simplified redirect logic for authenticated users
 * - Public and static routes skip database access entirely
 */

import { error, redirect, type Handle } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { initializeRoles, roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import type { Role } from '@src/databases/auth/types';
import { auth } from '@src/databases/db';
import {
	cacheService,
	USER_COUNT_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_S,
	USER_PERM_CACHE_TTL_MS,
	USER_PERM_CACHE_TTL_S
} from '@src/databases/CacheService';
import { logger } from '@utils/logger.svelte';

// --- SIMPLE IN-MEMORY CACHE ---

let userCountCache: { count: number; timestamp: number } | null = null;
const rolesCache = new Map<string, { data: Role[]; timestamp: number }>();

// --- UTILITIES ---

function isPublicRoute(pathname: string): boolean {
	const publicRoutes = ['/login', '/register', '/forgot-password', '/setup', '/api/sendMail', '/api/setup'];
	return publicRoutes.some((route) => pathname.startsWith(route));
}

function isOAuthRoute(pathname: string): boolean {
	return pathname.startsWith('/login') && pathname.includes('OAuth');
}

/** Get cached user count with fallback */
async function getCachedUserCount(tenantId?: string): Promise<number> {
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
		if (!auth) return -1;
		const filter = getPrivateSettingSync('MULTI_TENANT') && tenantId ? { tenantId } : {};
		const count = await auth.getUserCount(filter);
		const cacheData = { count, timestamp: now };
		userCountCache = cacheData;
		await cacheService.set('userCount', cacheData, USER_COUNT_CACHE_TTL_S, tenantId);
		return count;
	} catch (err) {
		logger.warn(`User count query failed: ${err instanceof Error ? err.message : String(err)}`);
		return -1;
	}
}

/** Get cached roles for access checks */
async function getCachedRoles(tenantId?: string): Promise<Role[]> {
	const now = Date.now();
	const key = tenantId || 'global';

	const cached = rolesCache.get(key);
	if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		if (!auth) {
			await initializeRoles();
			return roles;
		}

		let data = await auth.getAllRoles();
		if (!data || data.length === 0) {
			await initializeRoles();
			data = roles;
		}

		const cacheData = { data, timestamp: now };
		rolesCache.set(key, cacheData);
		await cacheService.set(`roles:${key}`, cacheData, USER_PERM_CACHE_TTL_S, tenantId);
		return data;
	} catch (err) {
		logger.warn(`Failed to fetch roles: ${err instanceof Error ? err.message : String(err)}`);
		await initializeRoles();
		return roles;
	}
}

// --- MAIN HANDLE ---

export const handleAuthorization: Handle = async ({ event, resolve }) => {
	const { url, locals } = event;
	const { user } = locals;

	const pathname = url.pathname;
	const isApi = pathname.startsWith('/api/');
	const isPublic = isPublicRoute(pathname);

	// --- Skip static or internal routes early ---
	if (pathname.startsWith('/.well-known/') || pathname.startsWith('/_')) {
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
	const userCount = await getCachedUserCount(locals.tenantId);
	locals.isFirstUser = userCount === 0;

	// --- Load cached roles ---
	const rolesData = await getCachedRoles(locals.tenantId);
	locals.roles = rolesData;

	// --- Handle authenticated users ---
	if (user) {
		const userRole = rolesData.find((r) => r._id === user.role);
		const isAdmin = !!userRole?.isAdmin;

		locals.isAdmin = isAdmin;
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
		if (!isPublic && !locals.isFirstUser) {
			if (isApi) throw error(401, 'Unauthorized');
			throw redirect(302, '/login');
		}
	}

	// --- Allow OAuth routes to pass through ---
	if (isOAuthRoute(pathname)) {
		logger.trace('OAuth route detected, passing through');
	}

	return resolve(event);
};

// --- CACHE INVALIDATION UTILITIES ---

export function invalidateUserCountCache(tenantId?: string): void {
	userCountCache = null;
	cacheService.delete('userCount', tenantId).catch((err) => logger.error(`Failed to invalidate user count: ${err.message}`));
	logger.debug('User count cache invalidated');
}

export function invalidateRolesCache(tenantId?: string): void {
	const key = tenantId || 'global';
	rolesCache.delete(key);
	cacheService.delete(`roles:${key}`, tenantId).catch((err) => logger.error(`Failed to invalidate roles cache: ${err.message}`));
	logger.debug(`Roles cache invalidated (tenant: ${tenantId || 'global'})`);
}
