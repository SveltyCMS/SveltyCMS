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
import { redirect, error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { auth, dbInitPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission } from '@src/auth/permissionCheck';
import { getAllPermissions } from '@src/auth/permissionManager';
import type { User, Permission } from '@src/auth/types';

// Cache
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger.svelte';

// Types
interface RedirectError {
	status: number;
	location: string;
}

// Cache TTLs
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SESSION_EXTENSION_THRESHOLD = 12 * 60 * 60 * 1000; // 12 hours

// Initialize rate limiter
const limiter = new RateLimiter({
	IP: [300, 'h'], // 300 requests per hour per IP
	IPUA: [150, 'm'], // 150 requests per minute per IP+User-Agent
	cookie: {
		name: 'sveltycms_ratelimit',
		secret: privateEnv.JWT_SECRET_KEY as string,
		rate: [500, 'm'], // 500 requests per minute per cookie
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
	throw error(status, html);
};

// Session and permission caches
const sessionCache = new Map<string, { user: User; timestamp: number }>();
const permissionCache = new Map<string, { permissions: Permission[]; timestamp: number }>();

// Get user from session ID with optimized caching
const getUserFromSessionId = async (session_id: string | undefined): Promise<User | null> => {
	if (!session_id) return null;

	const cacheStore = getCacheStore();
	const now = Date.now();

	// Check in-memory cache first
	const memCached = sessionCache.get(session_id);
	if (memCached && now - memCached.timestamp < CACHE_TTL) {
		// Extend session in background if needed
		if (now - memCached.timestamp > SESSION_EXTENSION_THRESHOLD) {
			cacheStore.set(session_id, memCached, new Date(now + CACHE_TTL)).catch((err) => logger.error('Failed to extend session:', err));
		}
		return memCached.user;
	}

	// Try Redis cache
	const redisCached = await cacheStore.get<{ user: User; timestamp: number }>(session_id);
	if (redisCached) {
		sessionCache.set(session_id, redisCached);
		return redisCached.user;
	}

	// Validate session in database
	try {
		const user = await auth?.validateSession({ session_id });
		if (user) {
			const sessionData = { user, timestamp: now };
			sessionCache.set(session_id, sessionData);
			await cacheStore.set(session_id, sessionData, new Date(now + CACHE_TTL));
			return user;
		}
	} catch (err) {
		logger.error(`Session validation error: ${err}`);
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
			'127.0.0.1'
		);
	} catch {
		return '127.0.0.1';
	}
}

// Handle rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	const clientIp = getClientIp(event);

	if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building) {
		return resolve(event);
	}

	const isApiRequest = event.url.pathname.startsWith('/api/');
	if (await (isApiRequest ? apiLimiter : limiter).isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: ${clientIp}, endpoint: ${event.url.pathname}`);
		throw error(429, isApiRequest ? 'Too Many Requests' : createHtmlResponse('Too Many Requests', 429));
	}

	return resolve(event);
};

// Handle authentication, authorization, and API caching
export const handleAuth: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	// Define event.startTime here
	event.startTime = performance.now();

	try {
		await dbInitPromise;

		const session_id = event.cookies.get(SESSION_COOKIE_NAME);
		const user = await getUserFromSessionId(session_id);

		if (session_id && !user) {
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}

		event.locals.user = user;
		event.locals.permissions = user?.permissions || [];
		event.locals.session_id = session_id;

		const isPublicRoute = isPublicOrOAuthRoute(event.url.pathname);
		const isApiRequest = event.url.pathname.startsWith('/api/');

		// First user check
		if (!auth) throw error(500, 'Auth service not initialized');

		const isFirstUser = await auth
			.getUserCount()
			.then((count) => count === 0)
			.catch(() => false);
		event.locals.isFirstUser = isFirstUser;

		if (user) {
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

		const responseTime = performance.now() - event.startTime;
		logger.debug(
			`Route \x1b[34m${event.url.pathname}\x1b[0m - ${responseTime.toFixed(2)}ms ${getPerformanceEmoji(responseTime)}: isPublicRoute=\x1b[${isPublicRoute ? '32' : '31'}m${isPublicRoute}\x1b[0m, isApiRequest=\x1b[${isApiRequest ? '32' : '31'}m${isApiRequest}\x1b[0m`
		);

		if (isOAuthRoute(event.url.pathname)) {
			logger.debug('OAuth route detected, passing through');
			return resolve(event);
		}

		if (!user && !isPublicRoute && !isFirstUser) {
			logger.debug('User not authenticated and not on public route, redirecting to login');
			if (isApiRequest) {
				throw error(401, 'Unauthorized');
			}
			throw redirect(302, '/login');
		}

		if (user && isPublicRoute && !isOAuthRoute(event.url.pathname)) {
			logger.debug('Authenticated user on public route, redirecting to home');
			throw redirect(302, '/');
		}

		if (isApiRequest && user) {
			logger.debug('Handling API request for authenticated user');
			return handleApiRequest(event, resolve, user);
		}

		return resolve(event);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && 'location' in err) {
			const redirectError = err as RedirectError;
			logger.debug(`Redirecting to \x1b[34m${redirectError.location}\x1b[0m`);
			throw err;
		}

		logger.error(`Error in handleAuth: ${err instanceof Error ? err.message : JSON.stringify(err)}`);

		if (event.url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		throw error(500, 'Internal Server Error');
	}
};

// Handle API requests with optimized caching
const handleApiRequest = async (event: RequestEvent, resolve: (event: RequestEvent) => Promise<Response>, user: User): Promise<Response> => {
	const apiEndpoint = event.url.pathname.split('/')[2];
	const cacheStore = getCacheStore();

	// Check API permissions using cached permissions
	const now = Date.now();
	let permissions = permissionCache.get('all')?.permissions;

	if (!permissions || now - (permissionCache.get('all')?.timestamp || 0) > API_CACHE_TTL) {
		permissions = await getAllPermissions();
		permissionCache.set('all', { permissions, timestamp: now });
	}

	const requiredPermission = permissions.find((p) => p._id === `api:${apiEndpoint}`);
	if (requiredPermission) {
		const { hasPermission } = await checkUserPermission(user, {
			contextId: `api:${apiEndpoint}`,
			name: `Access ${apiEndpoint} API`,
			action: requiredPermission.action,
			contextType: requiredPermission.type
		});

		if (!hasPermission) {
			logger.warn(`User ${user._id} attempted to access ${apiEndpoint} API without permission`);
			throw error(403, 'Forbidden');
		}
	}

	// Handle GET requests with caching
	if (event.request.method === 'GET') {
		const cacheKey = `api:${apiEndpoint}:${user._id}`;
		const cached = await cacheStore.get<{ data: unknown; timestamp: number; headers: Record<string, string> }>(cacheKey);

		if (cached) {
			logger.debug(`Cache hit for ${cacheKey}`);
			return new Response(JSON.stringify(cached.data), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					...cached.headers
				}
			});
		}

		logger.debug(`Cache miss for ${cacheKey}, resolving request`);
		const response = await resolve(event);
		const clonedResponse = response.clone();

		try {
			if (apiEndpoint === 'graphql') return response;

			const data = await response.json();
			if (response.ok) {
				await cacheStore.set(
					cacheKey,
					{
						data,
						timestamp: now,
						headers: Object.fromEntries(response.headers)
					},
					new Date(now + API_CACHE_TTL)
				);
				logger.debug(`Stored ${cacheKey} in cache`);
			}

			return new Response(JSON.stringify(data), {
				status: response.status,
				headers: {
					'Content-Type': 'application/json',
					...Object.fromEntries(response.headers)
				}
			});
		} catch (err) {
			logger.error(`Error processing API response for ${apiEndpoint}: ${err}`);
			return clonedResponse;
		}
	}

	return resolve(event);
};

// Add security headers to the response
const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers = {
		'X-Frame-Options': 'SAMEORIGIN',
		'X-XSS-Protection': '1; mode=block',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'geolocation=(), microphone=()'
	};

	Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

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

// Combine all hooks
export const handle: Handle = sequence(handleStaticAssetCaching, handleRateLimit, handleAuth, addSecurityHeaders);

// Helper function to invalidate API cache
export const invalidateApiCache = async (apiEndpoint: string, userId: string): Promise<void> => {
	const cacheStore = getCacheStore();
	const cacheKey = `api:${apiEndpoint}:${userId}`;
	await cacheStore.delete(cacheKey);
	logger.debug(`Invalidated cache for ${cacheKey}`);
};
