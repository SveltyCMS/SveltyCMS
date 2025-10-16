/**
 * @file src/hooks/handleAuthentication.ts
 * @description Consolidated middleware for session validation, user identification, and multi-tenancy.
 *
 * @summary This hook runs after handleSystemState confirms the system is ready. It:
 * - Attaches the database adapter to event.locals
 * - Identifies the tenant from the hostname (if multi-tenancy is enabled)
 * - Validates the session cookie and attaches the user object
 * - Uses multi-layer caching (in-memory → Redis → database) for performance
 * - Enforces tenant isolation for security
 *
 * @prerequisite handleSystemState has already confirmed the system is READY or DEGRADED
 */

import type { Handle } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { getPrivateSetting, getPrivateSettingSync } from '@src/services/settingsService';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import type { User } from '@src/databases/auth/types';
import { auth, dbAdapter } from '@src/databases/db';
import { cacheService, SESSION_CACHE_TTL_MS } from '@src/databases/CacheService';
import { logger } from '@utils/logger.svelte';

// --- IN-MEMORY SESSION CACHE ---

/**
 * In-memory cache for session validation results.
 * This is the fastest cache layer but only exists per-instance.
 */
const sessionCache = new Map<string, { user: User; timestamp: number }>();

/**
 * Tracks when we last attempted to refresh a session from the database.
 * Prevents excessive DB queries for invalid sessions.
 */
const lastRefreshAttempt = new Map<string, number>();

// Clean up expired sessions periodically (every 5 minutes)
if (typeof setInterval !== 'undefined') {
	setInterval(
		() => {
			const now = Date.now();
			for (const [sessionId, data] of sessionCache.entries()) {
				if (now - data.timestamp > SESSION_CACHE_TTL_MS) {
					sessionCache.delete(sessionId);
					lastRefreshAttempt.delete(sessionId);
				}
			}
		},
		5 * 60 * 1000
	);
}

// --- UTILITY FUNCTIONS ---

/**
 * Extracts the tenant ID from the request hostname
 *
 * @param hostname - The hostname from the request
 * @returns The tenant ID, or null if multi-tenancy is disabled or no tenant found
 *
 * @example
 * getTenantIdFromHostname('acme.myapp.com') // 'acme'
 * getTenantIdFromHostname('localhost') // 'default'
 * getTenantIdFromHostname('www.myapp.com') // null (www is not a tenant)
 */
function getTenantIdFromHostname(hostname: string): string | null {
	if (!getPrivateSettingSync('MULTI_TENANT')) return null;

	// Local development always uses default tenant
	if (hostname === 'localhost' || hostname.startsWith('127.0.0.1') || hostname.startsWith('192.168.')) {
		return 'default';
	}

	const parts = hostname.split('.');

	// If hostname has subdomain and it's not a reserved word, use it as tenant ID
	if (parts.length > 2 && !['www', 'app', 'api', 'cdn', 'static'].includes(parts[0])) {
		return parts[0];
	}

	return null;
}

/**
 * Retrieves a user from a session ID using a multi-layer cache strategy:
 * 1. In-memory cache (fastest, per-instance)
 * 2. Distributed cache like Redis (fast, shared across instances)
 * 3. Database validation (slowest, source of truth)
 *
 * @param sessionId - The session ID from the cookie
 * @param tenantId - The tenant ID (optional, for multi-tenant systems)
 * @returns The user object, or null if session is invalid
 */
async function getUserFromSession(sessionId: string, tenantId?: string): Promise<User | null> {
	const now = Date.now();

	// Layer 1: In-memory cache (fastest)
	const memCached = sessionCache.get(sessionId);
	if (memCached && now - memCached.timestamp < SESSION_CACHE_TTL_MS) {
		logger.trace(`Session cache hit (in-memory): \x1b[33m${sessionId.substring(0, 8)}...\x1b[0m`);
		return memCached.user;
	}

	// Layer 2: Distributed cache (e.g., Redis)
	try {
		const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
		const redisCached = await cacheService.get<{ user: User; timestamp: number }>(cacheKey, tenantId);

		if (redisCached && now - redisCached.timestamp < SESSION_CACHE_TTL_MS) {
			logger.trace(`Session cache hit (distributed): ${sessionId.substring(0, 8)}...`);
			// Populate in-memory cache for future requests
			sessionCache.set(sessionId, redisCached);
			return redisCached.user;
		}
	} catch (err) {
		logger.warn(`Failed to read from distributed session cache: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Layer 3: Database validation (source of truth)
	// Prevent excessive DB queries for invalid sessions
	const lastAttempt = lastRefreshAttempt.get(sessionId);
	if (lastAttempt && now - lastAttempt < 60000) {
		// 1 minute cooldown
		logger.trace(`Skipping DB validation for ${sessionId.substring(0, 8)}... (recent attempt)`);
		return null;
	}

	lastRefreshAttempt.set(sessionId, now);

	try {
		// Add null check for auth service
		if (!auth) {
			logger.error('Auth service not available, cannot validate session.');
			return null;
		}

		// Validate session with the auth service - assuming it returns User | null
		const user = await auth.validateSession(sessionId);

		if (user) {
			const sessionData = { user, timestamp: now };

			// Update both cache layers
			sessionCache.set(sessionId, sessionData);

			const cacheKey = tenantId ? `session:\x1b[34m${tenantId}\x1b[0m:\x1b[33m${sessionId}\x1b[0m` : `session:\x1b[33m${sessionId}\x1b[0m`;
			await cacheService
				.set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), tenantId)
				.catch((err) => logger.warn(`Failed to cache session: ${err.message}`));

			logger.trace(`Session validated from database: \x1b[33m${sessionId.substring(0, 8)}...\x1b[0m`);
			return user;
		}
	} catch (err) {
		logger.error(`Session validation failed for \x1b[33m${sessionId.substring(0, 8)}...\x1b[0m: ${err instanceof Error ? err.message : String(err)}`);
	}

	return null;
}

// --- MAIN HOOK ---

export const handleAuthentication: Handle = async ({ event, resolve }) => {
	const { locals, url, cookies } = event;

	// Skip browser/tool requests that aren't part of the application
	if (url.pathname.startsWith('/.well-known/') || url.pathname.startsWith('/_')) {
		return resolve(event);
	}

	// Skip authentication for public routes (login, register, etc.)
	const publicRoutes = ['/login', '/register', '/forgot-password'];
	const isPublicRoute = publicRoutes.some((route) => url.pathname.startsWith(route));
	if (isPublicRoute) {
		return resolve(event);
	}

	// --- SETUP GUARD ---
	// Skip authentication/session logic if setup is not complete or on setup route
	// This prevents DB errors and allows the setup UI to render
	const { isSetupComplete } = await import('@utils/setupCheck');
	if (!isSetupComplete() || url.pathname.startsWith('/setup')) {
		return resolve(event);
	}

	// Attach the database adapter for universal access in endpoints and subsequent hooks
	locals.dbAdapter = dbAdapter;

	// Check if database is available before proceeding
	if (!dbAdapter) {
		logger.warn('Database adapter not available yet. System may still be initializing.');
		// For protected routes, if no DB is available and no user session exists, redirect to login
		if (!cookies.get(SESSION_COOKIE_NAME)) {
			throw redirect(302, '/login');
		}
		// If they have a session cookie but DB is not available, let them through but they won't be authenticated
		return resolve(event);
	}

	// Step 1: Handle multi-tenancy (if enabled)
	const multiTenant = await getPrivateSetting('MULTI_TENANT');
	if (multiTenant) {
		const tenantId = getTenantIdFromHostname(url.hostname);

		if (!tenantId) {
			logger.error(`Tenant not found for hostname: ${url.hostname}`);
			throw error(404, `Tenant not found for hostname: ${url.hostname}`);
		}

		locals.tenantId = tenantId;
		logger.trace(`Request identified for tenant: ${tenantId}`);
	}

	// Step 2: Validate session and retrieve user
	const sessionId = cookies.get(SESSION_COOKIE_NAME);

	if (sessionId) {
		const user = await getUserFromSession(sessionId, locals.tenantId);

		if (user) {
			// Multi-tenancy security check: ensure user belongs to this tenant
			if (locals.tenantId && user.tenantId && user.tenantId !== locals.tenantId) {
				logger.warn(
					`Tenant isolation violation: User \x1b[34m${user._id}\x1b[0 (tenant: ${user.tenantId}) ` +
						`attempted to access tenant ${locals.tenantId}. Access denied.`
				);

				// Clear the invalid session cookie
				cookies.delete(SESSION_COOKIE_NAME, { path: '/' });

				// Don't set locals.user - treat as unauthenticated
			} else {
				// Valid user for this tenant (or multi-tenancy is disabled)
				locals.user = user;
				locals.session_id = sessionId;
				logger.trace(`User authenticated: \x1b[34m${user._id}\x1b[0m`);
			}
		} else {
			// Session ID exists but is invalid - clean up the cookie
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			logger.trace(`Invalid session cookie cleared: ${sessionId.substring(0, 8)}...`);
		}
	}

	// Step 3: Continue to the next hook (handleAuthorization)
	return resolve(event);
};

// --- UTILITY EXPORTS (for external cache management) ---

/**
 * Invalidates a user's session from all cache layers.
 * Call this when a user logs out or their session is revoked.
 */
export function invalidateSessionCache(sessionId: string, tenantId?: string): void {
	sessionCache.delete(sessionId);
	lastRefreshAttempt.delete(sessionId);

	const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
	cacheService.delete(cacheKey).catch((err) => logger.warn(`Failed to delete session from distributed cache: ${err.message}`));

	logger.debug(`Session cache invalidated: ${sessionId.substring(0, 8)}...`);
}

/**
 * Clears all session caches. Use with caution - typically only needed
 * during maintenance or when forcing all users to re-authenticate.
 */
export function clearAllSessionCaches(): void {
	sessionCache.clear();
	lastRefreshAttempt.clear();
	logger.info('All session caches cleared');
}
