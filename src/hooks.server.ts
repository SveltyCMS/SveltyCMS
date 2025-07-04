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

import { privateEnv } from '@root/config/private';
import { redirect, error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';

// Stores
import { systemLanguage, contentLanguage } from '@stores/store.svelte';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { auth, dbInitPromise, authAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

import type { Locale } from '@src/paraglide/runtime';
import type { User, Permission } from '@src/auth';
// Cache
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger.svelte';

// Cache TTLs
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL = CACHE_TTL; // Align session TTL with cache TTL
const USER_PERM_CACHE_TTL = 60 * 1000; // 1 minute for permissions cache
const USER_COUNT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for user count cache

// Performance Caches
let userCountCache: { count: number; timestamp: number } | null = null;
const adminDataCache = new Map<string, { data: unknown; timestamp: number }>();

// Session Metrics
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

// Create an HTML response for rate limiting
const createHtmlResponse = (message: string, status: number): never => {
	const html = `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${message}</title>
                <style>
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        font-family: Arial, sans-serif;
                        background-color: #121212;
                        color: #FFFFFF;
                        margin: 0;
                    }
                    .logo {
                        width: 100px;
                        height: 100px;
                        margin-bottom: 20px;
                        fill: #FFFFFF;
                    }
                    h1 { font-size: 2em; margin-bottom: 10px; }
                    p { font-size: 1.2em; }
                </style>
            </head>
            <body>
                <svg class="logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#FFFFFF" stroke-width="2"/>
                </svg>
                <h1>${message}</h1>
                <p>Please try again later.</p>
            </body>
        </html>`;
	throw error(status, { message: html });
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
const userPermissionCache = new Map<string, { permissions: Permission[]; timestamp: number }>();
const lastRefreshAttempt = new Map<string, number>();

// Optimized user count getter with caching
const getCachedUserCount = async (authServiceReady: boolean): Promise<number> => {
	const now = Date.now();

	// Return cached value if still valid
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL) {
		return userCountCache.count;
	}

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

	// Cache the result
	if (userCount >= 0) {
		userCountCache = { count: userCount, timestamp: now };
	}

	return userCount;
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
		logger.debug(`Session cache hit and extended for \x1b[34m${session_id}\x1b[0m (auth ready: \x1b[34m${authServiceReady}\x1b[0m)`);
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
				logger.debug(`Redis cache hit for session \x1b[34m${session_id}\x1b[0m`);
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
		const user = await auth.validateSession(session_id);
		if (user) {
			const sessionData = { user, timestamp: now };
			sessionCache.set(session_id, sessionData);
			await cacheStore.set(session_id, sessionData, new Date(now + CACHE_TTL));
			logger.debug(`Session validated and cached for \x1b[34m${session_id}\x1b[0m`);
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
	const cached = adminDataCache.get(cacheKey);

	if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL) {
		return cached.data;
	}

	let data = null;
	if (auth) {
		try {
			if (cacheKey === 'roles') {
				data = await auth.getAllRoles();
			} else if (cacheKey === 'users') {
				data = await auth.getAllUsers();
			} else if (cacheKey === 'tokens') {
				data = await auth.getAllTokens();
			}

			if (data) {
				adminDataCache.set(cacheKey, { data, timestamp: now });
			}
		} catch (err) {
			logger.warn(`Failed to load admin data (${cacheKey}): ${err.message}`);
		}
	}

	return data || [];
};

// Helper function to invalidate admin data cache - exported for use in API endpoints
export const invalidateAdminCache = (cacheKey?: 'roles' | 'users' | 'tokens'): void => {
	if (cacheKey) {
		adminDataCache.delete(cacheKey);
		logger.debug(`Admin cache invalidated for: ${cacheKey}`);
	} else {
		adminDataCache.clear();
		logger.debug('All admin cache cleared');
	}
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
		// For API requests, return JSON error. For others, HTML.
		if (event.url.pathname.startsWith('/api/')) {
			throw error(429, 'Too Many Requests');
		}
		createHtmlResponse('Too Many Requests', 429);
	}
	return resolve(event);
};

// Handle authentication, authorization, and API caching
const handleAuth: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const requestStartTime = performance.now();

	// Skip auth entirely for static assets during initialization
	if (isStaticAsset(event.url.pathname)) {
		logger.debug(`Skipping auth for static asset: ${event.url.pathname}`);
		return resolve(event);
	}

	try {
		// Wait for database initialization
		await dbInitPromise;

		// Check if auth service is ready
		const authServiceReady = auth !== null && typeof auth.validateSession === 'function';

		let session_id = event.cookies.get(SESSION_COOKIE_NAME);
		const user = await getUserFromSessionId(session_id, authServiceReady);

		if (user && session_id && authServiceReady) {
			// Check if getSessionTokenData exists
			if (typeof auth.getSessionTokenData !== 'function') {
				logger.error('auth.getSessionTokenData is not a function');
				throw error(500, 'Authentication service misconfigured');
			}

			// Attempt to get session token data for refresh check
			let tokenData: { expiresAt: Date; user_id: string } | null = null;
			try {
				tokenData = await auth.getSessionTokenData(session_id);
			} catch (tokenError) {
				logger.error(`Failed to get session token data for session \x1b[31m${session_id}\x1b[0m: ${tokenError.message}`);
				event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				throw redirect(302, '/login');
			}

			if (tokenData && tokenData.user_id === user._id) {
				const now = Date.now();
				const expiresAtTime = new Date(tokenData.expiresAt).getTime();
				const timeLeft = expiresAtTime - now;
				// Only refresh if less than 1 hour left
				const shouldRefresh = timeLeft > 0 && timeLeft < 60 * 60 * 1000;

				// Debounce refreshes per session (5 minutes)
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
							const newTokenId = await auth.rotateToken(session_id, newExpiryDate);
							if (newTokenId) {
								session_id = newTokenId;
								logger.debug(`Token rotated for user \x1b[34m${user._id}\x1b[0m. New session ID: \x1b[34m${newTokenId}\x1b[0m`);
								sessionMetrics.activeExtensions.set(session_id, now);

								// Update cache with new session ID and invalidate old session cache
								const cacheStore = getCacheStore();
								const sessionData = { user, timestamp: now };

								// Set cache for new session
								sessionCache.set(newTokenId, sessionData);
								await cacheStore.set(newTokenId, sessionData, new Date(now + CACHE_TTL));

								// Clean up old session from cache (but don't delete from DB - that's handled by grace period)
								sessionCache.delete(oldSessionId);
								// Note: We don't delete from Redis cache immediately to allow for race conditions
								// The old session will be cleaned up when it expires naturally

								logger.debug(`Cache updated for token rotation - old: ${oldSessionId}, new: ${newTokenId}`);
							} else {
								logger.warn(`Token rotation failed for user ${user._id}`);
							}
						} catch (rotationError) {
							logger.error(`Token rotation failed for user ${user._id}, session ${session_id}: ${rotationError.message}`);
						}
					}
				}

				event.cookies.set(SESSION_COOKIE_NAME, session_id, {
					path: '/',
					httpOnly: true,
					secure: event.url.protocol === 'https:',
					maxAge: CACHE_TTL / 1000,
					sameSite: 'lax'
				});
			} else if (tokenData && tokenData.user_id !== user._id) {
				logger.error(
					`CRITICAL: Session ID ${session_id} for user ${user._id} resolved to token data for different user ${tokenData.user_id}. Invalidating session.`
				);
				event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				throw redirect(302, '/login');
			} else if (!tokenData && session_id) {
				logger.warn(`Session ${session_id} for user ${user._id} yielded no valid tokenData. Clearing cookie.`);
				event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				event.locals.user = null;
			}
		} else if (!user && session_id) {
			logger.debug(`Clearing invalid session cookie: ${session_id}`);
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}

		event.locals.user = user;
		event.locals.permissions = user?.permissions || [];
		event.locals.session_id = user ? session_id : undefined;

		const isPublic = isPublicOrOAuthRoute(event.url.pathname);
		const isApi = event.url.pathname.startsWith('/api/');

		// Optimized first user check with caching
		const userCount = await getCachedUserCount(authServiceReady);
		const isFirstUser = userCount === 0;
		event.locals.isFirstUser = isFirstUser;

		// Only load admin data when needed and cache it
		if (authServiceReady && event.locals.user) {
			// Load basic permission check efficiently
			const userHasManagePermission = hasPermissionByAction(user, 'manage', 'user', undefined, roles);

			event.locals.hasManageUsersPermission = userHasManagePermission;

			// Only load heavy admin data if user is admin or has permission AND it's needed
			if ((user.isAdmin || userHasManagePermission) && (isApi || event.url.pathname.includes('/admin') || event.url.pathname.includes('/user'))) {
				// Load admin data with caching
				const [roles, users, tokens] = await Promise.all([
					getAdminDataCached(user, 'roles'),
					getAdminDataCached(user, 'users'),
					getAdminDataCached(user, 'tokens')
				]);

				event.locals.roles = roles;
				event.locals.allUsers = users;
				event.locals.allTokens = tokens;
			} else {
				// Set empty defaults to avoid undefined errors
				event.locals.roles = [];
				event.locals.allUsers = [];
				event.locals.allTokens = [];
			}
		} else {
			// Set safe defaults when auth service not ready
			event.locals.roles = [];
			event.locals.hasManageUsersPermission = false;
			event.locals.allUsers = [];
			event.locals.allTokens = [];
		}

		// Update stores from existing cookies if present
		const systemLangCookie = event.cookies.get('systemLanguage');
		const contentLangCookie = event.cookies.get('contentLanguage');

		if (systemLangCookie) {
			try {
				systemLanguage.set(systemLangCookie as Locale);
			} catch {
				logger.warn(`Invalid system language cookie value: ${systemLangCookie}`);
				event.cookies.delete('systemLanguage', { path: '/' });
			}
		}

		if (contentLangCookie) {
			try {
				contentLanguage.set(contentLangCookie as Locale);
			} catch {
				logger.warn(`Invalid content language cookie value: ${contentLangCookie}`);
				event.cookies.delete('contentLanguage', { path: '/' });
			}
		}

		const responseTime = performance.now() - requestStartTime;
		logger.debug(
			`Route \x1b[34m${event.url.pathname}\x1b[0m - \x1b[32m${responseTime.toFixed(2)}ms\x1b[0m ${getPerformanceEmoji(responseTime)} (auth ready: ${authServiceReady})`
		);

		if (isOAuthRoute(event.url.pathname)) {
			logger.debug('OAuth route detected, passing through');
			return resolve(event);
		}

		// Only enforce auth requirements if auth service is ready
		if (authServiceReady) {
			if (!event.locals.user && !isPublic && !isFirstUser) {
				logger.debug(`Unauthenticated access to \x1b[34m${event.url.pathname}\x1b[0m. Redirecting to login.`);
				if (isApi) throw error(401, 'Unauthorized');
				throw redirect(302, '/login');
			}

			if (event.locals.user && isPublic && !isOAuthRoute(event.url.pathname) && !isApi) {
				logger.debug(`Authenticated user on public route \x1b[34m${event.url.pathname}\x1b[0m. Redirecting to home.`);
				throw redirect(302, '/');
			}

			if (isApi && event.locals.user && !isPublic) {
				logger.debug('Handling API request for authenticated user');
				return handleApiRequest(event, resolve, event.locals.user);
			}
		} else {
			// Auth service not ready - allow through but log
			logger.debug(`Auth service not ready, allowing request to \x1b[34m${event.url.pathname}\x1b[0m`);
		}

		return resolve(event);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && 'location' in err) {
			throw err;
		}

		const clientIp = getClientIp(event);
		logger.error(
			`Error in handleAuth for \x1b[34m${event.url.pathname}\x1b[0m (IP: ${clientIp}): ${err instanceof Error ? err.message : JSON.stringify(err)}`,
			{
				stack: err instanceof Error ? err.stack : undefined
			}
		);

		if (event.url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Internal Server Error', message: 'An unexpected error occurred' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		throw error(500, 'Internal Server Error');
	}
};

// Handle API requests with optimized caching
const handleApiRequest = async (event: RequestEvent, resolve: (event: RequestEvent) => Promise<Response>, user: User): Promise<Response> => {
	const apiEndpoint = event.url.pathname.split('/api/')[1]?.split('/')[0];

	if (!apiEndpoint) {
		logger.warn(`Could not determine API endpoint from path: ${event.url.pathname}`);
		throw error(400, 'Invalid API path');
	}
	const cacheStore = getCacheStore();
	const now = Date.now();

	let userPerms = userPermissionCache.get(user._id)?.permissions;
	if (!userPerms || now - (userPermissionCache.get(user._id)?.timestamp || 0) > USER_PERM_CACHE_TTL) {
		try {
			userPerms = user.permissions;
			userPermissionCache.set(user._id, { permissions: userPerms, timestamp: now });
		} catch (permError) {
			logger.error(`Failed to get user permissions for API check: ${permError.message}`);
			throw error(500, 'Failed to verify API permissions');
		}
	}

	// Check if user has required permission for this endpoint
	const requiredPermissionName = `api:${apiEndpoint}`;

	// ADMIN OVERRIDE: Admins have access to all API endpoints
	const userRole = roles.find((role) => role._id === user.role);
	const isAdmin = userRole?.isAdmin === true;

	if (!isAdmin) {
		const permissionExists = userPerms.some((p) => p === requiredPermissionName);
		if (!permissionExists) {
			// If the user *lacks* the specific API permission
			logger.warn(`User \x1b[34m${user._id}\x1b[0m denied access to API /api/${apiEndpoint} due to missing permission: ${requiredPermissionName}`);
			throw error(403, `Forbidden: You do not have the required permission ('${requiredPermissionName}') to access this API endpoint.`);
		}
	} else {
		logger.debug(`Admin user granted access to API`, { email: user.email || user._id, apiEndpoint: `/api/${apiEndpoint}` });
	}

	// Handle GET requests with caching
	if (event.request.method === 'GET') {
		const cacheKey = `api:${apiEndpoint}:${user._id}:${event.url.search}`; // Include query params in cache key
		try {
			const cached = await cacheStore.get<{
				data: unknown;
				timestamp: number;
				headers: Record<string, string>;
			}>(cacheKey);
			if (cached && now - cached.timestamp < API_CACHE_TTL) {
				// Check cache TTL
				logger.debug(`Cache hit for API GET \x1b[34m${cacheKey}\x1b[0m`);
				return new Response(JSON.stringify(cached.data), {
					status: 200,
					headers: { ...cached.headers, 'Content-Type': 'application/json', 'X-Cache': 'hit' }
				});
			}
		} catch (cacheGetError) {
			logger.warn(`Error fetching from API cache for \x1b[31m${cacheKey}\x1b[0m: ${cacheGetError.message}`);
		}

		const response = await resolve(event);

		// GraphQL might have its own complex caching
		if (apiEndpoint === 'graphql') {
			response.headers.append('X-Cache', 'miss');
			return response;
		}

		if (response.ok) {
			try {
				const responseBody = await response.json();
				await cacheStore.set(
					cacheKey,
					{
						data: responseBody,
						timestamp: now,
						headers: Object.fromEntries(response.headers)
					},
					new Date(now + API_CACHE_TTL)
				);
				// Return a new Response with the updated headers
				return new Response(JSON.stringify(responseBody), {
					status: response.status,
					headers: {
						...Object.fromEntries(response.headers),
						'Content-Type': 'application/json',
						'X-Cache': 'miss'
					}
				});
			} catch (processingError) {
				logger.error(
					`Error processing API GET response for \x1b[34m/api/${apiEndpoint}\x1b[0m (user: \x1b[31m${user._id}\x1b[0m): ${processingError.message}`
				);
				return new Response(
					JSON.stringify({
						error: 'Failed to process API response',
						message: processingError.message,
						endpoint: `/api/${apiEndpoint}`
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}
		}
		return response;
	}

	// Handle non-GET requests (POST, PUT, DELETE etc.) with cache invalidation
	const response = await resolve(event);

	if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.request.method) && response.ok) {
		const baseCacheKey = `api:${apiEndpoint}:${user._id}`;
		try {
			await cacheStore.deletePattern(`${baseCacheKey}:*`);
			logger.debug(
				`Invalidated API cache for keys starting with \x1b[34m${baseCacheKey}\x1b[0m after \x1b[32m${event.request.method}\x1b[0m request`
			);
		} catch (err) {
			logger.error(`Failed to invalidate API cache for ${baseCacheKey}: ${err.message}`);
		}
	}
	return response;
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
	logger.debug(`Attempting to invalidate API cache for pattern ${basePattern}:* and exact key ${basePattern}`);
	try {
		await cacheStore.deletePattern(`${basePattern}:*`);
		await cacheStore.delete(basePattern);
	} catch (e) {
		logger.error(`Error during explicit API cache invalidation for ${basePattern}: ${e.message}`);
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
