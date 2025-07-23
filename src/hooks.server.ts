/**
 * @file src/hooks.server.ts
 * @description Server-side hooks for SvelteKit CMS application
 *
 * This file handles:
 * - Authentication and session management
 * - Rate limiting for API endpoints
 * - Permission checks for protected routes
 * - Static asset caching
 * - API response caching using session store
 * - Security headers
 * - OAuth route handling
 * - Performance logging
 * - Session metrics cleanup
 */

import { building } from '$app/environment';
import { privateEnv } from '@root/config/private';
import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Stores
import { contentLanguage, systemLanguage } from '@stores/store.svelte';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { roles, initializeRoles } from '@root/config/roles';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { hasPermissionByAction } from '@src/auth/permissions';
import { auth, authAdapter, dbInitPromise } from '@src/databases/db';

import type { User } from '@src/auth';
import type { Locale } from '@src/paraglide/runtime';
// Cache
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger.svelte';

// Cache TTLs
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TTL = CACHE_TTL; // Align session TTL with cache TTL
const USER_PERM_CACHE_TTL = 60 * 1000; // 1 minute for permissions cache
const USER_COUNT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for user count cache

// Performance Caches - Consider moving to WeakMap for better memory management
let userCountCache: { count: number; timestamp: number } | null = null;
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

// Session Metrics - WeakMap for automatic cleanup when sessions are garbage collected
const sessionMetrics = {
	lastActivity: new Map<string, number>(),
	activeExtensions: new Map<string, number>(),
	rotationAttempts: new Map<string, number>()
};

// Initialize rate limiters
const limiter = new RateLimiter({
	IP: [300, 'h'], // 300 requests per hour per IP
	IPUA: [150, 'm'], // 150 requests per minute per IP+User-Agent
	cookie: {
		name: 'ratelimit',
		secret: privateEnv.JWT_SECRET_KEY as string,
		rate: [500, 'm'], // 500 requests per minute per cookie
		preflight: true
	}
});

// Stricter rate limiter for token refresh operations
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

// Get a stricter rate limiter for API requests
const apiLimiter = new RateLimiter({
	IP: [500, 'm'], // 500 requests per minute per IP
	IPUA: [200, 'm'] // 200 requests per minute per IP+User-Agent
});

// Check if a given pathname is a static asset
const isStaticAsset = (pathname: string): boolean =>
	pathname.startsWith('/static/') ||
	pathname.startsWith('/_app/') ||
	pathname.endsWith('.js') ||
	pathname.endsWith('.css') ||
	pathname === '/favicon.ico';

// Check if the given IP is localhost
const isLocalhost = (ip: string): boolean => ip === '::1' || ip === '127.0.0.1';

// Check if a route is an OAuth route
const isOAuthRoute = (pathname: string): boolean => pathname.startsWith('/login') && pathname.includes('OAuth');

// Check if the route is public or an OAuth route
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

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 100) return '🚀'; // Super fast
	if (responseTime < 500) return '⚡'; // Fast
	if (responseTime < 1000) return '⏱️'; // Moderate
	if (responseTime < 3000) return '🕰️'; // Slow
	return '🐢'; // Very slow
};

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

// Export health metrics for monitoring endpoints
export const getHealthMetrics = () => ({ ...healthMetrics });

// Optimized user count getter with caching and deduplication
const getCachedUserCount = async (authServiceReady: boolean): Promise<number> => {
	const now = Date.now();
	const cacheKey = 'global:userCount';
	const cacheStore = getCacheStore(); // Get distributed cache instance

	// Try distributed cache first
	try {
		const cached = await cacheStore.get<{ count: number; timestamp: number }>(cacheKey);
		if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL) {
			// Also update local cache for very fast subsequent access on the same instance
			userCountCache = cached;
			return cached.count;
		}
	} catch (err) {
		logger.warn(`Failed to read user count from distributed cache: ${err.message}`);
	}

	// Return local cached value if still valid (fallback)
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL) {
		return userCountCache.count;
	}

	// Use deduplication for expensive database operations
	return deduplicate(`getUserCount:${authServiceReady}`, async () => {
		let userCount = -1;

		if (authServiceReady && auth) {
			try {
				userCount = await auth.getUserCount();
			} catch (err) {
				logger.warn(`Failed to get user count from auth service: ${err.message}`);
			}
		} else if (authAdapter && typeof authAdapter.getUserCount === 'function') {
			try {
				userCount = await authAdapter.getUserCount();
			} catch (err) {
				logger.warn(`Failed to get user count from adapter: ${err.message}`);
			}
		}

		// Cache the result in both distributed and local cache
		if (userCount >= 0) {
			const dataToCache = { count: userCount, timestamp: now };
			try {
				await cacheStore.set(cacheKey, dataToCache, new Date(now + USER_COUNT_CACHE_TTL));
			} catch (err) {
				logger.error(`Failed to write user count to distributed cache: ${err.message}`);
			}
			// Also update local cache for very fast subsequent access on the same instance
			userCountCache = dataToCache;
		}

		return userCount;
	});
};

// Get user from session ID with optimized caching (initialization-aware)
const getUserFromSessionId = async (session_id: string | undefined, authServiceReady: boolean = false): Promise<User | null> => {
	if (!session_id) return null;

	const cacheStore = getCacheStore();
	const now = Date.now();

	// Only use cached sessions if auth service is ready OR if this is a static asset request
	const canUseCache = authServiceReady || auth !== null;

	const memCached = sessionCache.get(session_id);
	if (memCached && now - memCached.timestamp < CACHE_TTL && canUseCache) {
		// Extend session in cache proactively on every hit
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
				// Ensure redis cache isn't stale if TTLs differ
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
		const user = await authCircuitBreaker.execute(
			() => auth.validateSession(session_id),
			() => null // Fallback to null if circuit is open
		);

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

// Optimized admin data loading with caching
const getAdminDataCached = async (user: User, cacheKey: string): Promise<unknown> => {
	const now = Date.now();
	const distributedCacheStore = getCacheStore(); // Assuming Redis
	const inMemoryCacheKey = `inMemoryAdmin:${cacheKey}`; // Separate key for in-memory cache

	// 1. Try in-memory cache first (fastest)
	const memCached = adminDataCache.get(inMemoryCacheKey);
	if (memCached && now - memCached.timestamp < USER_PERM_CACHE_TTL) {
		return memCached.data;
	}

	// 2. Try distributed cache (e.g., Redis)
	if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
		// Only cache specific keys in Redis
		try {
			const redisCached = await distributedCacheStore.get<{ data: unknown; timestamp: number }>(`adminData:${cacheKey}`);
			if (redisCached && now - redisCached.timestamp < USER_PERM_CACHE_TTL) {
				adminDataCache.set(inMemoryCacheKey, redisCached); // Populate in-memory cache
				return redisCached.data;
			}
		} catch (err) {
			logger.warn(`Failed to read admin data (${cacheKey}) from distributed cache: ${err.message}`);
		}
	}

	let data = null;
	if (auth) {
		try {
			if (cacheKey === 'roles') {
				// First try to get roles from the database
				data = await auth.getAllRoles();
				// If no roles in database, initialize and use the config roles
				if (!data || data.length === 0) {
					await initializeRoles();
					data = roles;
				}
			} else if (cacheKey === 'users') {
				data = await auth.getAllUsers();
			} else if (cacheKey === 'tokens') {
				data = await auth.getAllTokens();
			}

			if (data) {
				// Cache in-memory
				adminDataCache.set(inMemoryCacheKey, { data, timestamp: now });
				// Cache in distributed store
				if (cacheKey === 'roles' || cacheKey === 'users' || cacheKey === 'tokens') {
					try {
						await distributedCacheStore.set(`adminData:${cacheKey}`, { data, timestamp: now }, new Date(now + USER_PERM_CACHE_TTL));
					} catch (err) {
						logger.error(`Failed to write admin data (${cacheKey}) to distributed cache: ${err.message}`);
					}
				}
			}
		} catch (err) {
			logger.warn(`Failed to load admin data from DB (${cacheKey}): ${err.message}`);
			// Specific fallback for roles if DB fetch fails
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

// Helper function to invalidate admin data cache - exported for use in API endpoints
export const invalidateAdminCache = (cacheKey?: 'roles' | 'users' | 'tokens'): void => {
	const distributedCacheStore = getCacheStore();
	if (cacheKey) {
		adminDataCache.delete(`inMemoryAdmin:${cacheKey}`); // Invalidate local cache
		distributedCacheStore
			.delete(`adminData:${cacheKey}`)
			.catch((err) => logger.error(`Failed to delete distributed admin cache for \x1b[31m${cacheKey}\x1b[0m: ${err.message}`));
		logger.debug(`Admin cache invalidated for: \x1b[31m${cacheKey}\x1b[0m`);
	} else {
		adminDataCache.clear(); // Clear all local caches
		// For distributed cache, you'd need a pattern-based deletion or iterate if you have a known set of keys
		// Note: If your cache store supports pattern deletion, use it here
		['roles', 'users', 'tokens'].forEach((key) => {
			distributedCacheStore
				.delete(`adminData:${key}`)
				.catch((err) => logger.error(`Failed to delete distributed admin cache for ${key}: ${err.message}`));
		});
		logger.debug('All admin cache cleared');
	}
};

// Helper function to invalidate user count cache - exported for use after user creation/deletion
export const invalidateUserCountCache = (): void => {
	userCountCache = null; // Invalidate local cache
	const distributedCacheStore = getCacheStore();
	distributedCacheStore.delete('global:userCount').catch((err) => logger.error(`Failed to delete distributed user count cache: ${err.message}`));
	logger.debug('User count cache invalidated');
};

// Handle static asset caching
const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
	if (isStaticAsset(event.url.pathname)) {
		const response = await resolve(event);
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		return response;
	}
	return resolve(event);
};

// Handle rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	const clientIp = getClientIp(event);

	if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building) {
		return resolve(event);
	}

	const currentLimiter = event.url.pathname.startsWith('/api/') ? apiLimiter : limiter;
	if (await currentLimiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: \x1b[34m${clientIp}\x1b[0m, endpoint: \x1b[34m${event.url.pathname}\x1b[0m`);
		// Throw a SvelteKit error that can be caught by +error.svelte
		throw error(429, 'Too Many Requests. Please try again later.');
	}
	return resolve(event);
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
						const sessionData = { user, timestamp: now };

						// Update distributed cache with new session ID
						sessionCache.set(newTokenId, sessionData);
						await cacheStore.set(newTokenId, sessionData, new Date(now + CACHE_TTL));

						// Clean up old session from cache
						sessionCache.delete(oldSessionId);
						cacheStore
							.delete(oldSessionId)
							.catch((err) => logger.warn(`Failed to delete old session \x1b[31m${oldSessionId}\x1b[0m from cache: ${err.message}`));

						// Update the cookie to the new session ID
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
		event.locals.user = null; // Ensure locals.user is nullified
	}

	return session_id;
}

// Handle authentication, authorization, and API caching
const handleAuth: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const requestStartTime = performance.now();
	const { url, cookies, locals } = event; // Destructure for cleaner access

	// Track request metrics
	healthMetrics.requests.total++;

	// Skip auth entirely for static assets during initialization
	if (isStaticAsset(url.pathname)) {
		logger.debug(`Skipping auth for static asset: ${url.pathname}`);
		return resolve(event);
	}

	try {
		// Wait for database initialization
		await dbInitPromise;

		// Check if auth service is ready
		const authServiceReady = auth !== null && typeof auth.validateSession === 'function';

		let session_id = cookies.get(SESSION_COOKIE_NAME);
		const user = await getUserFromSessionId(session_id, authServiceReady);

		locals.user = user;
		locals.permissions = user?.permissions || [];
		locals.session_id = user ? session_id : undefined;

		if (user && session_id && authServiceReady) {
			// Session management and token rotation logic
			session_id = await handleSessionRotation(event, user, session_id, auth, refreshLimiter, SESSION_COOKIE_NAME);
		} else if (!user && session_id) {
			logger.debug(`Clearing invalid session cookie: ${session_id}`);
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}

		// Optimized first user check with caching
		const userCount = await getCachedUserCount(authServiceReady);
		const isFirstUser = userCount === 0;
		locals.isFirstUser = isFirstUser;

		// Load roles and other admin data conditionally and with caching
		if (authServiceReady) {
			locals.roles = (await getAdminDataCached(user, 'roles')) as unknown[]; // Type assertion for safety
			const userRole = locals.roles.find((role: unknown) => (role as { _id: string; isAdmin?: boolean })._id === user?.role);
			const isAdmin = (userRole as { isAdmin?: boolean })?.isAdmin === true;
			const userHasManagePermission = isAdmin || hasPermissionByAction(user, 'manage', 'user', undefined, locals.roles); // Pass roles from locals
			locals.hasManageUsersPermission = userHasManagePermission;

			if (
				(isAdmin || userHasManagePermission) &&
				(url.pathname.startsWith('/api/') || url.pathname.includes('/admin') || url.pathname.includes('/user'))
			) {
				const [allUsers, allTokens] = await Promise.all([getAdminDataCached(user, 'users'), getAdminDataCached(user, 'tokens')]);
				locals.allUsers = allUsers as unknown[]; // Type assertion
				locals.allTokens = allTokens;
			} else {
				locals.allUsers = [];
				locals.allTokens = [];
			}
		} else {
			// If auth service not ready, set safe defaults and fall back to config roles
			await initializeRoles(); // Ensure config roles are loaded
			locals.roles = roles;
			locals.hasManageUsersPermission = false;
			locals.allUsers = [];
			locals.allTokens = [];
		}

		// Update stores from existing cookies if present
		const systemLangCookie = cookies.get('systemLanguage');
		const contentLangCookie = cookies.get('contentLanguage');

		if (systemLangCookie) {
			try {
				systemLanguage.set(systemLangCookie as Locale);
			} catch {
				logger.warn(`Invalid system language cookie value: ${systemLangCookie}`);
				cookies.delete('systemLanguage', { path: '/' });
			}
		}

		if (contentLangCookie) {
			try {
				contentLanguage.set(contentLangCookie as Locale);
			} catch {
				logger.warn(`Invalid content language cookie value: ${contentLangCookie}`);
				cookies.delete('contentLanguage', { path: '/' });
			}
		}

		// Performance logging for the request duration
		const responseTime = performance.now() - requestStartTime;
		logger.debug(
			`Route \x1b[34m${url.pathname}\x1b[0m - \x1b[32m${responseTime.toFixed(2)}ms\x1b[0m ${getPerformanceEmoji(responseTime)} (auth ready: ${authServiceReady})`
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
			logger.warn(`Auth service not ready, bypassing authentication for \x1b[34m${url.pathname}\x1b[0m`);
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
			`Unhandled error in handleAuth for \x1b[34m${url.pathname}\x1b[0m (IP: ${clientIp}): ${err instanceof Error ? err.message : JSON.stringify(err)}`,
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

// Add security headers to the response
const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers = {
		'X-Frame-Options': 'SAMEORIGIN',
		'X-XSS-Protection': '1; mode=block',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), display-capture=()'
	};
	Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}
	return response;
};

// Combine all hooks
export const handle: Handle = sequence(
	// logRequestHook, // Uncomment for debugging
	handleStaticAssetCaching,
	handleRateLimit,
	handleAuth,
	addSecurityHeaders
);

// Helper function to invalidate API cache
export const invalidateApiCache = async (apiEndpoint: string, userId: string): Promise<void> => {
	const cacheStore = getCacheStore();
	const basePattern = `api:${apiEndpoint}:${userId}`;
	logger.debug(`Attempting to invalidate API cache for pattern \x1b[33m${basePattern}:*\x1b[0m and exact key \x1b[33m${basePattern}\x1b[0m`);
	try {
		// Try to delete pattern-based cache keys if supported
		if (typeof cacheStore.deletePattern === 'function') {
			await cacheStore.deletePattern(`${basePattern}:*`);
		}
		await cacheStore.delete(basePattern);
	} catch (e) {
		logger.error(`Error during explicit API cache invalidation for \x1b[31m${basePattern}\x1b[0m: ${e.message}`);
	}
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
		logger.info(`Cleaned up metrics for ${cleanedCount} stale sessions.`);
	}
};
