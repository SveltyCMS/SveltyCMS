/**
 * @file src/hooks.server.ts
 * @description Server-side hooks for SvelteKit application
 *
 * This file handles:
 * - Authentication and session management
 * - Rate limiting for API endpoints
 * - Permission checks for protected routes
 * - Static asset caching
 * - API response caching using existing session store
 * - Security headers
 * - OAuth route handling
 * - Performance logging
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
import { auth, dbInitPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission } from '@src/auth/permissionCheck';

// Cache
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { AvailableLanguageTag } from '@src/paraglide/runtime';


// Cache TTLs
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
	pathname.startsWith('/static/') || pathname.startsWith('/_app/') || pathname.endsWith('.js') || pathname.endsWith('.css');

// Check if the given IP is localhost
const isLocalhost = (ip: string): boolean => ip === '::1' || ip === '127.0.0.1';

// Check if a route is an OAuth route
const isOAuthRoute = (pathname: string): boolean => pathname.startsWith('/login') && pathname.includes('OAuth');

// Check if the route is public or an OAuth route
const isPublicOrOAuthRoute = (pathname: string): boolean => {
	const publicRoutes = ['/login', '/register', '/forgot-password'];
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

// Session and permission caches
const sessionCache = new Map<string, { user: User; timestamp: number }>();
const userPermissionCache = new Map<string, { permissions: Permission[]; timestamp: number }>();
const lastRefreshAttempt = new Map<string, number>();

// Get user from session ID with optimized caching 
const getUserFromSessionId = async (session_id: string | undefined): Promise<User | null> => {
	if (!session_id) return null;

	const cacheStore = getCacheStore();
	const now = Date.now();

	// Check in-memory cache first
	const memCached = sessionCache.get(session_id);
	if (memCached && now - memCached.timestamp < CACHE_TTL) {
		// Extend session in cache proactively on every hit
		const sessionData = { user: memCached.user, timestamp: now };
		sessionCache.set(session_id, sessionData); // Update in-memory timestamp
		cacheStore
			.set(session_id, sessionData, new Date(now + CACHE_TTL))
			.catch((err) => logger.error(`Failed to extend session cache for ${session_id}: ${err.message}`));
		logger.debug(`Session cache hit and extended for ${session_id}`); // Can be noisy
		return memCached.user;
	}

	// Try Redis cache 
	try {
		const redisCached = await cacheStore.get<{ user: User; timestamp: number }>(session_id);
		if (redisCached && now - redisCached.timestamp < CACHE_TTL) { // Ensure redis cache isn't stale if TTLs differ
			sessionCache.set(session_id, redisCached); // Populate in-memory cache
			logger.debug(`Redis cache hit for session ${session_id}`);
			return redisCached.user;
		}
	} catch (cacheError) {
		logger.error(`Error reading from session cache store for ${session_id}: ${cacheError.message}`);
		// Potentially proceed to DB if cache is just unavailable, or handle as error if cache is critical
	}


	// Validate session in database
	try {
		if (!auth) {
			logger.error('Auth service not initialized during session validation');
			throw error(500, 'Authentication service unavailable');
		}
		const user = await auth.validateSession({ session_id }); // Assumes this validates expiry too
		if (user) {
			const sessionData = { user, timestamp: now };
			sessionCache.set(session_id, sessionData);
			await cacheStore.set(session_id, sessionData, new Date(now + CACHE_TTL));
			logger.debug(`Session validated and cached for ${session_id}`);
			return user;
		}
		logger.warn(`Session validation returned no user for ${session_id}`);
	} catch (dbError) {
		// Handle specific db errors vs generic ones if needed
		logger.error(`Session validation DB error for ${session_id}: ${dbError.message}`);
		// Depending on policy, might throw an error or return null
		// For robustness, if DB is temporarily down, returning null might be better than 500 error for all users
	}
	return null;
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

// Get client IP with fallbacks
function getClientIp(event: RequestEvent): string {
	try {
		return (
			event.getClientAddress() ||
			event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
			event.request.headers.get('x-real-ip') ||
			'127.0.0.1' // Default fallback
		);
	} catch {
		return '127.0.0.1'; // In case getClientAddress() or headers access fails unexpectedly
	}
}

// Handle rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	const clientIp = getClientIp(event);

	if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building) {
		return resolve(event);
	}

	const currentLimiter = event.url.pathname.startsWith('/api/') ? apiLimiter : limiter;
	if (await currentLimiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: ${clientIp}, endpoint: ${event.url.pathname}`);
		// For API requests, return JSON error. For others, HTML.
		if (event.url.pathname.startsWith('/api/')) {
			throw error(429, 'Too Many Requests');
		} else {
			// createHtmlResponse already throws SvelteKit's error
			createHtmlResponse('Too Many Requests', 429);
		}
	}
	return resolve(event);
};

// Handle authentication, authorization, and API caching
export const handleAuth: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const requestStartTime = performance.now(); // Define event.startTime here

	try {
		await dbInitPromise;

		let session_id = event.cookies.get(SESSION_COOKIE_NAME);
		const user = await getUserFromSessionId(session_id);

		if (user && session_id) {
			if (!auth) {
				logger.error('Auth service not initialized when trying to get token data');
				throw error(500, 'Authentication service unavailable');
			}

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
				logger.error(`Failed to get session token data for session ${session_id}: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
				event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				throw redirect(302, '/login');
			}

			if (tokenData && tokenData.user_id === user._id) {
				const now = Date.now();
				const expiresAtTime = new Date(tokenData.expiresAt).getTime();
				const timeLeft = expiresAtTime - now;
				const shouldRefresh = timeLeft > 0 && timeLeft < CACHE_TTL * 0.2;

				// Debounce refreshs per session (e.g., 30s)
				const REFRESH_DEBOUNCE_MS = 30 * 1000;
				const lastAttempt = lastRefreshAttempt.get(session_id) || 0;

				if (shouldRefresh && now - lastAttempt > REFRESH_DEBOUNCE_MS) {
					lastRefreshAttempt.set(session_id, now);
					if (await refreshLimiter.isLimited(event)) {
						logger.warn(`Refresh rate limit exceeded for user ${user._id}, IP: ${getClientIp(event)}`);
					} else {
						try {
							const newExpiryDate = new Date(now + CACHE_TTL);
							const newTokenId = await auth.rotateToken(session_id, newExpiryDate);
							if (newTokenId) {
								session_id = newTokenId;
								logger.debug(`Token rotated for user ${user._id}. New session ID: ${newTokenId}`);
							} else {
								logger.warn(`Token rotation failed for user ${user._id}`);
							}
						} catch (rotationError) {
							logger.error(`Token rotation failed for user ${user._id}, session ${session_id}: ${rotationError instanceof Error ? rotationError.message : String(rotationError)}`);
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
				logger.error(`CRITICAL: Session ID ${session_id} for user ${user._id} resolved to token data for different user ${tokenData.user_id}. Invalidating session.`);
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

		event.locals.user = event.locals.user === null ? null : user;
		event.locals.permissions = event.locals.user?.permissions || [];
		event.locals.session_id = event.locals.user ? session_id : undefined;

		const isPublic = isPublicOrOAuthRoute(event.url.pathname);
		const isApi = event.url.pathname.startsWith('/api/');

		// First user check
		if (!auth) throw error(500, 'Auth service not initialized post user check');
		const userCount = await auth.getUserCount().catch(() => -1);
		const isFirstUser = userCount === 0;
		event.locals.isFirstUser = isFirstUser;

		if (event.locals.user) {
			// Load user data efficiently
			const [roles, { hasPermission }] = await Promise.all([
				auth.getAllRoles(),
				checkUserPermission(user, {
					contextId: 'config/userManagement',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'system'
				})
			]);

			event.locals.roles = roles;
			event.locals.hasManageUsersPermission = hasPermission;

			// Load admin data if needed
			if (user.isAdmin || hasPermission) {
				const [users, tokens] = await Promise.all([auth.getAllUsers(), auth.getAllTokens()]);

				event.locals.allUsers = users;
				event.locals.allTokens = tokens;
			}
		}

		// Update stores from existing cookies if present
		const systemLangCookie = event.cookies.get('systemLanguage');
		const contentLangCookie = event.cookies.get('contentLanguage');

		if (systemLangCookie) {
			try {
				systemLanguage.set(systemLangCookie as AvailableLanguageTag);
			} catch {
				logger.warn(`Invalid system language cookie value: ${systemLangCookie}`);
				event.cookies.delete('systemLanguage', { path: '/' });
			}
		}

		if (contentLangCookie) {
			try {
				contentLanguage.set(contentLangCookie as AvailableLanguageTag);
			} catch {
				logger.warn(`Invalid content language cookie value: ${contentLangCookie}`);
				event.cookies.delete('contentLanguage', { path: '/' });
			}
		}

		const responseTime = performance.now() - requestStartTime;
		logger.debug(
			`Route \x1b[34m${event.url.pathname}\x1b[0m - \x1b[32m${responseTime.toFixed(2)}ms\x1b[0m ${getPerformanceEmoji(responseTime)}`
		);

		if (isOAuthRoute(event.url.pathname)) {
			logger.debug('OAuth route detected, passing through');
			return resolve(event);
		}

		if (!event.locals.user && !isPublic && !isFirstUser) {
			logger.debug(`Unauthenticated access to ${event.url.pathname}. Redirecting to login.`);
			if (isApi) throw error(401, 'Unauthorized');
			throw redirect(302, '/login');
		}

		if (event.locals.user && isPublic && !isOAuthRoute(event.url.pathname)) {
			logger.debug(`Authenticated user on public route ${event.url.pathname}. Redirecting to home.`);
			throw redirect(302, '/');
		}

		if (isApi && event.locals.user) {
			logger.debug('Handling API request for authenticated user');
			return handleApiRequest(event, resolve, event.locals.user);
		}

		return resolve(event);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && 'location' in err) {
			throw err;
		}

		const clientIp = getClientIp(event);
		logger.error(`Error in handleAuth for ${event.url.pathname} (IP: ${clientIp}): ${err instanceof Error ? err.message : JSON.stringify(err)}`, { stack: err instanceof Error ? err.stack : undefined });

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
	const apiEndpoint = event.url.pathname.split('/api/')[1]?.split('/')[0]; // More robust split
	if (!apiEndpoint) {
		logger.warn(`Could not determine API endpoint from path: ${event.url.pathname}`);
		throw error(400, 'Invalid API path');
	}
	const cacheStore = getCacheStore();
	const now = Date.now();

	// Cache user permissions for 1 minute
	const USER_PERM_CACHE_TTL = 60 * 1000;
	let userPerms = userPermissionCache.get(user._id)?.permissions;
	if (!userPerms || now - (userPermissionCache.get(user._id)?.timestamp || 0) > USER_PERM_CACHE_TTL) {
		try {
			userPerms = user.permissions; // Assuming user.permissions is up-to-date
			userPermissionCache.set(user._id, { permissions: userPerms, timestamp: now });
		} catch (permError) {
			logger.error(`Failed to get user permissions for API check: ${permError.message}`);
			throw error(500, 'Failed to verify API permissions');
		}
	}

	// Check if user has required permission for this endpoint
	const requiredPermissionName = `api:${apiEndpoint}`;
	const permissionExists = userPerms.some((p) => p._id === requiredPermissionName || p.name === requiredPermissionName);

	if (permissionExists) {
		if (!permissionExists) {
			logger.warn(`User ${user._id} denied access to API /api/${apiEndpoint}`);
			throw error(403, 'Forbidden: You do not have permission to access this API endpoint.');
		}
	}

	// Handle GET requests with caching
	if (event.request.method === 'GET') {
		const cacheKey = `api:${apiEndpoint}:${user._id}:${event.url.search}`; // Include query params in cache key
		try {
			const cached = await cacheStore.get<{ data: unknown; timestamp: number; headers: Record<string, string> }>(cacheKey);
			if (cached && now - cached.timestamp < API_CACHE_TTL) { // Check cache TTL
				logger.debug(`Cache hit for API GET \x1b[34m${cacheKey}\x1b[0m`);
				return new Response(JSON.stringify(cached.data), {
					status: 200,
					headers: { ...cached.headers, 'Content-Type': 'application/json', 'X-Cache': 'hit' }
				});
			}
		} catch (cacheGetError) {
			logger.warn(`Error fetching from API cache for ${cacheKey}: ${cacheGetError.message}`);
			// Proceed to resolve request if cache read fails
		}


		const response = await resolve(event);

		try {
			if (apiEndpoint === 'graphql') { // GraphQL might have its own complex caching, pass through
				// add 'X-Cache': 'miss' header
				response.headers.append('X-Cache', 'miss');
				return response;
			}

			if (response.ok) {
				const responseBody = await response.json(); // Assuming JSON response for caching
				try {
					await cacheStore.set(
						cacheKey,
						{
							data: responseBody,
							timestamp: now,
							headers: Object.fromEntries(response.headers) // Store relevant headers
						},
						new Date(now + API_CACHE_TTL)
					);
					// logger.debug(`Stored API GET ${cacheKey} in cache`);
				} catch (cacheSetError) {
					logger.warn(`Error setting API cache for ${cacheKey}: ${cacheSetError.message}`);
				}
				// Return a new Response 
				return new Response(JSON.stringify(responseBody), {
					status: response.status,
					headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'application/json', 'X-Cache': 'miss' }
				});
			} else {
				// Handle non-ok responses from resolve(event)
				return response;
			}
		} catch (processingError) {
			// This catch handles errors from response.json() if body isn't JSON, or cacheStore.set
			logger.error(`Error processing API GET response for \x1b[34m/api/${apiEndpoint}\x1b[31m (user: ${user._id}): ${processingError.message}`);
			const errorPayload = JSON.stringify({
				error: 'Failed to process API response',
				message: processingError.message,
				endpoint: `/api/${apiEndpoint}`
			});
			return new Response(errorPayload, {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	// Handle non-GET requests (POST, PUT, DELETE etc.) with cache invalidation
	const response = await resolve(event); // Get response from actual endpoint

	if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.request.method) && response.ok) {

		const baseCacheKey = `api:${apiEndpoint}:${user._id}`;
		try {
			// Invalidate specific list/item caches. 
			await cacheStore.deletePattern(`${baseCacheKey}:*`); // Delete all keys starting with base 
			logger.debug(`Invalidated API cache for keys starting with \x1b[34m${baseCacheKey}\x1b[0m after ${event.request.method} request`);
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
		'Permissions-Policy': "geolocation=(), microphone=(), camera=(), display-capture=()" // Added camera, display-capture as common secure defaults
	};

	Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}
	// Add CSP if not already handled by SvelteKit's CSP directives or another mechanism
	// response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';");


	return response;
};

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 100) return '🚀'; // Super fast
	if (responseTime < 500) return '⚡'; // Fast
	if (responseTime < 1000) return '⏱️'; // Moderate
	if (responseTime < 3000) return '🕰️'; // Slow
	return '🐢'; // Very slow
};

// Debug hook to log request details - keep this for debugging if needed
// const logRequestHook: Handle = async ({ event, resolve }) => {
// 	console.log(`HOOKS: Processing ${event.request.method} ${event.url.pathname} - Cookies: ${event.request.headers.get('cookie') || 'none'}`);
// 	const response = await resolve(event);
// 	console.log(`HOOKS: Responding to ${event.request.method} ${event.url.pathname} with status ${response.status}`);
// 	return response;
// };

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
	const cacheKey = `api:${apiEndpoint}:${userId}`; // This is too generic, need to match cache keys used in handleApiRequest
	// To be effective, this function needs to know the exact cache keys or patterns used.
	// For example, if query parameters are part of the key:
	// await cacheStore.deletePattern(`${cacheKey}:*`); // If store supports patterns
	// Or delete a specific known key if that's what's being invalidated.
	logger.debug(`Attempting to invalidate API cache for keys related to ${cacheKey}`);
	// Placeholder for more specific invalidation:
	try {
		await cacheStore.delete(cacheKey); // Assuming a simple key for now
		// Consider deleting keys with common query patterns if applicable
		// e.g. await cacheStore.delete(`${cacheKey}:?param=value`);
	} catch (e) {
		logger.error(`Error during explicit cache invalidation for ${cacheKey}: ${e.message}`);
	}
};