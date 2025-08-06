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
import { SESSION_COOKIE_NAME } from '@src/auth/constants';
import { auth, dbInitPromise } from '@src/databases/db';
import type { User } from '@src/auth/types';
import { getCacheStore } from '@src/cacheStore/index.server';
import { logger } from '@utils/logger.svelte';
import { RateLimiter } from 'sveltekit-rate-limiter/server';
import { privateEnv } from '@root/config/private';
import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit';

// --- Caches and TTLs (Consider centralizing these) ---
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TTL = CACHE_TTL; // Align session TTL with cache TTL

// Session and Permission Caches
const sessionCache = new Map<string, { user: User; timestamp: number }>();
const lastRefreshAttempt = new Map<string, number>();

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

// Session Metrics - WeakMap for automatic cleanup when sessions are garbage collected
const sessionMetrics = {
	lastActivity: new Map<string, number>(),
	activeExtensions: new Map<string, number>(),
	rotationAttempts: new Map<string, number>()
};

// --- Rate Limiter for Refresh (could be moved to its own file if used elsewhere) ---
const refreshLimiter = new RateLimiter({
	IP: [10, 'm'], // 10 requests per minute per IP
	IPUA: [10, 'm'], // 10 requests per minute per IP+User-Agent
	cookie: {
		name: 'refreshlimit',
		secret: privateEnv.JWT_SECRET_KEY as string,
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

// Get user from session ID with optimized caching (now tenant-aware)
const getUserFromSessionId = async (session_id: string | undefined, authServiceReady: boolean = false, tenantId?: string): Promise<User | null> => {
	if (!session_id) return null;
	const cacheStore = getCacheStore();
	const now = Date.now(); // Only use cached sessions if auth service is ready OR if this is a static asset request
	const canUseCache = authServiceReady || auth !== null;
	const validateUserTenant = (user: User): User | null => {
		if (privateEnv.MULTI_TENANT && user.tenantId !== tenantId) {
			logger.warn(`Session user's tenant ('${user.tenantId}') does not match request tenant ('${tenantId}'). Access denied.`);
			return null;
		}
		return user;
	};
	const memCached = sessionCache.get(session_id);
	if (memCached && now - memCached.timestamp < CACHE_TTL && canUseCache) {
		const validUser = validateUserTenant(memCached.user);
		if (!validUser) return null; // Extend session in cache proactively on every hit
		const sessionData = { user: memCached.user, timestamp: now };
		sessionCache.set(session_id, sessionData); // Update in-memory timestamp
		cacheStore
			.set(session_id, sessionData, new Date(now + CACHE_TTL))
			.catch((err) => logger.error(`Failed to extend session cache for \x1b[34m${session_id}\x1b[0m: ${err.message}`));
		sessionMetrics.lastActivity.set(session_id, now); // Update session metrics
		return memCached.user;
	}
	// Try Redis cache only if auth service is ready
	if (canUseCache) {
		try {
			const redisCached = await cacheStore.get<{ user: User; timestamp: number }>(session_id);
			if (redisCached && now - redisCached.timestamp < CACHE_TTL) {
				const validUser = validateUserTenant(redisCached.user);
				if (!validUser) return null; // Ensure redis cache isn't stale if TTLs differ
				sessionCache.set(session_id, redisCached); // Populate in-memory cache
				sessionMetrics.lastActivity.set(session_id, now);
				return redisCached.user;
			}
		} catch (cacheError) {
			logger.error(`Error reading from session cache store for ${session_id}: ${cacheError.message}`);
		}
	}
	// Validate session in database only if auth service is ready
	if (!authServiceReady || !auth) {
		logger.debug(`Auth service not ready, skipping session validation for ${session_id}`);
		return null;
	}
	try {
		// Use circuit breaker for database auth operations
		let user = await authCircuitBreaker.execute(
			() => auth.validateSession(session_id),
			() => null // Fallback to null if circuit is open
		);
		if (user) {
			user = validateUserTenant(user);
		}
		if (user) {
			const sessionData = { user, timestamp: now };
			sessionCache.set(session_id, sessionData);
			// Use circuit breaker for cache operations too
			await cacheCircuitBreaker.execute(
				() => cacheStore.set(session_id, sessionData, new Date(now + CACHE_TTL)),
				() => {} // Fallback to no-op if cache circuit is open
			);
			sessionMetrics.lastActivity.set(session_id, now);
			return user;
		}
		logger.warn(`Session validation returned no user for ${session_id}`);
	} catch (dbError) {
		logger.error(`Session validation DB error for \x1b[31m${session_id}\x1b[0m: ${dbError.message}`);
	}
	return null;
};

// Helper function for session rotation logic
async function handleSessionRotation(
	event: RequestEvent,
	user: User,
	session_id: string,
	authService: typeof auth,
	refreshLimiter: RateLimiter,
	cookieName: string
): Promise<string> {
	if (typeof authService.getSessionTokenData !== 'function') {
		logger.error('auth.getSessionTokenData is not a function in authService');
		event.cookies.delete(cookieName, { path: '/' });
		throw redirect(302, '/login');
	}
	let tokenData: { expiresAt: Date; user_id: string } | null = null;
	try {
		tokenData = await authService.getSessionTokenData(session_id);
	} catch (tokenError) {
		logger.error(`Failed to get session token data for session \x1b[31m${session_id}\x1b[0m: ${tokenError.message}`);
		event.cookies.delete(cookieName, { path: '/' });
		throw redirect(302, '/login');
	}
	if (tokenData && tokenData.user_id === user._id) {
		const now = Date.now();
		const expiresAtTime = new Date(tokenData.expiresAt).getTime();
		const timeLeft = expiresAtTime - now;
		const shouldRefresh = timeLeft > 0 && timeLeft < 60 * 60 * 1000; // Less than 1 hour left
		const REFRESH_DEBOUNCE_MS = 5 * 60 * 1000;
		const lastAttempt = lastRefreshAttempt.get(session_id) || 0;
		if (shouldRefresh && now - lastAttempt > REFRESH_DEBOUNCE_MS) {
			lastRefreshAttempt.set(session_id, now);
			sessionMetrics.rotationAttempts.set(session_id, (sessionMetrics.rotationAttempts.get(session_id) || 0) + 1);
			if (await refreshLimiter.isLimited(event)) {
				logger.warn(`Refresh rate limit exceeded for user \x1b[34m${user._id}\x1b[0m, IP: \x1b[34m${getClientIp(event)}\x1b[0m`);
			} else {
				try {
					const oldSessionId = session_id;
					const newExpiryDate = new Date(now + CACHE_TTL);
					const newTokenId = await authService.rotateToken(session_id, newExpiryDate);
					if (newTokenId) {
						session_id = newTokenId;
						logger.debug(`Token rotated for user \x1b[34m${user._id}\x1b[0m. New session ID: \x1b[34m${newTokenId}\x1b[0m`);
						sessionMetrics.activeExtensions.set(session_id, now);
						const cacheStore = getCacheStore();
						const sessionData = { user, timestamp: now }; // Update distributed cache with new session ID
						sessionCache.set(newTokenId, sessionData);
						await cacheStore.set(newTokenId, sessionData, new Date(now + CACHE_TTL)); // Clean up old session from cache
						sessionCache.delete(oldSessionId);
						cacheStore
							.delete(oldSessionId)
							.catch((err) => logger.warn(`Failed to delete old session \x1b[31m${oldSessionId}\x1b[0m from cache: ${err.message}`)); // Update the cookie to the new session ID
						event.cookies.set(cookieName, session_id, {
							path: '/',
							httpOnly: true,
							secure: event.url.protocol === 'https:',
							maxAge: CACHE_TTL / 1000,
							sameSite: 'lax'
						});
						logger.debug(`Cache updated for token rotation - old: ${oldSessionId}, new: ${newTokenId}`);
					} else {
						logger.warn(`Token rotation failed for user ${user._id}: newTokenId was null/undefined.`);
					}
				} catch (rotationError) {
					logger.error(`Token rotation failed for user ${user._id}, session ${session_id}: ${rotationError.message}`);
				}
			}
		}
	} else if (tokenData && tokenData.user_id !== user._id) {
		logger.error(
			`CRITICAL: Session ID ${session_id} for user ${user._id} resolved to token data for different user ${tokenData.user_id}. Invalidating session.`
		);
		event.cookies.delete(cookieName, { path: '/' });
		throw redirect(302, '/login');
	} else if (!tokenData && session_id) {
		logger.warn(`Session ${session_id} for user ${user._id} yielded no valid tokenData. Clearing cookie.`);
		event.cookies.delete(cookieName, { path: '/' });
		// event.locals.user = null; // This will be handled by the main hook logic
	}
	return session_id;
}

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

	try {
		// Wait for database initialization
		await dbInitPromise;
		const authServiceReady = auth !== null && typeof auth.validateSession === 'function';
		let session_id = event.cookies.get(SESSION_COOKIE_NAME);
		const user = session_id
			? await deduplicate(`session-${session_id}`, () => getUserFromSessionId(session_id, authServiceReady, event.locals.tenantId))
			: null;
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
