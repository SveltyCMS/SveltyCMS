/**
 * @file src/hooks/handleSessionAuth.ts
 * @description Handles session authentication, token rotation, and user validation
 *
 * Features:
 * - Multi-layer session caching (memory + distributed)
 * - Tenant-aware session validation
 * - Automatic token rotation for security
 * - Circuit breaker pattern for database operations
 * - Session metrics and monitoring
 * - Rate limiting for token refresh operations
 * - Request deduplication for expensive operations
 * - Graceful fallback handling
 */

import { building } from '$app/environment';
import { privateEnv } from '@root/config/private';

import { SESSION_COOKIE_NAME } from '@src/auth/constants';
import type { User } from '@src/auth/types';
import { auth, dbAdapter, dbInitPromise } from '@src/databases/db';
import { type Handle, type RequestEvent } from '@sveltejs/kit';

import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Shared session utilities
import {
	sessionMetrics,
	getUserFromSessionId as sharedGetUserFromSessionId,
	handleSessionRotation as sharedHandleSessionRotation
} from '@src/hooks/utils/session';

// System Logger
import { logger } from '@utils/logger.svelte';

// --- Caches and TTLs (centralized) ---
import { SESSION_CACHE_TTL_MS as CACHE_TTL_MS } from '@src/databases/CacheService';
const SESSION_TTL = CACHE_TTL_MS; // Align session TTL with cache TTL
// No direct cache writes here; handled in shared utils

// No local deduplication needed; handled in shared utils

// Circuit breaker/dedup handled in shared utils as appropriate

// Metrics imported from shared utils

// --- Rate Limiter for Refresh (could be moved to its own file if used elsewhere) ---
const refreshLimiter = new RateLimiter({
	IP: [10, 'm'], // 10 requests per minute per IP
	IPUA: [10, 'm'], // 10 requests per minute per IP+User-Agent
	cookie: {
		name: 'refreshlimit',
		secret: privateEnv.JWT_SECRET_KEY,
		rate: [10, 'm'], // 10 requests per minute per cookie
		preflight: true
	}
});

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

// Delegate to shared util
const getUserFromSessionId = (session_id: string | undefined, authServiceReady: boolean = false, tenantId?: string): Promise<User | null> =>
	sharedGetUserFromSessionId(session_id, authServiceReady, tenantId, auth);

// Helper function for session rotation logic
// Delegate to shared util
const handleSessionRotation = sharedHandleSessionRotation;

// Check if a given pathname is a static asset
const isStaticAsset = (pathname: string): boolean =>
	pathname.startsWith('/static/') ||
	pathname.startsWith('/_app/') ||
	pathname.endsWith('.js') ||
	pathname.endsWith('.css') ||
	pathname === '/favicon.ico';

export const handleSessionAuth: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	// Skip auth entirely for static assets during initialization
	if (isStaticAsset(event.url.pathname)) {
		logger.debug(`Skipping session auth for static asset: ${event.url.pathname}`);
		return resolve(event);
	}

	// Skip database initialization for setup routes
	const isSetupRoute = event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup');
	if (isSetupRoute) {
		logger.info(`[SETUP_MODE] Bypassing authentication for setup route: ${event.url.pathname}`);
		// For setup routes, we still want to have the dbAdapter available if it exists
		if (!event.locals.dbAdapter && dbAdapter) {
			event.locals.dbAdapter = dbAdapter;
		}
		return resolve(event);
	}

	try {
		// Wait for database initialization
		await dbInitPromise;
		const authServiceReady = auth !== null && typeof auth.validateSession === 'function';
		// Expose dbAdapter early (adapter-agnostic)
		if (!event.locals.dbAdapter && dbAdapter) {
			event.locals.dbAdapter = dbAdapter;
		}
		let session_id = event.cookies.get(SESSION_COOKIE_NAME);
		const user: User | null = session_id ? await getUserFromSessionId(session_id, authServiceReady, event.locals.tenantId) : null;
		event.locals.user = user;
		event.locals.permissions = user?.permissions || [];
		event.locals.session_id = user ? session_id : undefined;

		if (user && session_id && authServiceReady) {
			// Session management and token rotation logic
			session_id = await handleSessionRotation(event, user, session_id, auth, refreshLimiter, SESSION_COOKIE_NAME);
		} else if (!user && session_id) {
			logger.debug(`Clearing invalid session cookie: ${session_id}`);
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
		// Note: isFirstUser logic is moved to handleAuthorization
		// Note: Role loading is moved to handleAuthorization
		// Note: Admin data loading is moved to handleAuthorization
		// Note: Locale handling is moved to handleLocale
		// Note: Route protection is moved to handleAuthorization
		// Note: API handling is moved to handleApiRequests

		return resolve(event);
	} catch (err) {
		// Basic error handling for session auth itself
		const clientIp = getClientIp(event);
		logger.error(
			`Unhandled error in handleSessionAuth for \x1b[34m${event.url.pathname}\x1b[0m (IP: ${clientIp}): ${err instanceof Error ? err.message : JSON.stringify(err)}`,
			{
				stack: err instanceof Error ? err.stack : undefined
			}
		);
		// Let the main error handler deal with throwing errors/redirects
		throw err;
	}
};

// Export cleanup function if needed elsewhere
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
		logger.info(`Cleaned up metrics for ${cleanedCount} stale sessions.`);
	}
};
