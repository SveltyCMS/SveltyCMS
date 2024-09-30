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
 */

import { privateEnv } from '@root/config/private';
import { dev } from '$app/environment';
import { redirect, error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { auth, initializationPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission, getAllPermissions } from '@src/auth/permissionManager';

// Cache
import { InMemorySessionStore } from '@src/auth/InMemoryCacheStore';
import { RedisCacheStore } from '@src/auth/RedisCacheStore';

// System Logger
import logger from '@src/utils/logger';

// Initialize rate limiter
const limiter = new RateLimiter({
	IP: [300, 'h'], // 300 requests per hour per IP
	IPUA: [150, 'm'], // 150 requests per minute per IP+User-Agent
	cookie: {
		name: 'sveltycms_ratelimit',
		secret: privateEnv.JWT_SECRET_KEY,
		rate: [500, 'm'], // 500 requests per minute per cookie
		preflight: true
	}
});

// Color codes
const ORANGE = '\x1b[38;5;208m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Initialize session store (also used for API caching)
const cacheStore = privateEnv.USE_REDIS ? new RedisCacheStore() : new InMemorySessionStore();

// Check if a given pathname is a static asset
const isStaticAsset = (pathname: string): boolean => {
	return pathname.startsWith('/static/') || pathname.startsWith('/_app/') || pathname.endsWith('.js') || pathname.endsWith('.css');
};

// Check if the given IP is localhost
const isLocalhost = (ip: string): boolean => {
	return ip === '::1' || ip === '127.0.0.1';
};

// Check if a route is an OAuth route
const isOAuthRoute = (pathname: string): boolean => {
	return pathname.startsWith('/login') && pathname.includes('OAuth');
};

// Check if the route is public or an OAuth route
const isPublicOrOAuthRoute = (pathname: string): boolean => {
	const publicRoutes = ['/login', '/register', '/forgot-password'];
	return publicRoutes.some((route) => pathname.startsWith(route)) || isOAuthRoute(pathname);
};

// Get a stricter rate limiter for API requests
const getApiLimiter = (): RateLimiter => {
	return new RateLimiter({
		IP: [100, 'm'], // 100 requests per minute for API
		IPUA: [50, 'm'] // 50 requests per minute per IP+User-Agent for API
	});
};

// Create a JSON response
const createJsonResponse = (data: any, status: number): Response => {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
};

// Create an HTML response for rate limiting
const createHtmlResponse = (message: string, status: number): Response => {
	const html = `
        <!DOCTYPE html>
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
        </html>
    `;
	return new Response(html, { status, headers: { 'Content-Type': 'text/html' } });
};

// Get user from session ID, using cache if available
const getUserFromSessionId = async (session_id: string | undefined): Promise<any> => {
	if (!session_id) return null;

	let user = await cacheStore.get(session_id);
	if (!user) {
		try {
			user = await auth.validateSession({ session_id });
			if (user) {
				const expiresAt = new Date(Date.now() + 3600 * 1000); // Cache for 1 hour
				await cacheStore.set(session_id, user, expiresAt);
			}
		} catch (error) {
			logger.error(`Session validation error: ${error}`);
		}
	} else {
		const expiresAt = new Date(Date.now() + 3600 * 1000); // Refresh cache expiration
		await cacheStore.set(session_id, user, expiresAt);
	}
	return user;
};

// Handle static asset caching
const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	if (isStaticAsset(pathname)) {
		const response = await resolve(event);
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		return response;
	}
	return resolve(event);
};

// Handle rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	if (isStaticAsset(pathname)) {
		return resolve(event);
	}

	const clientIP = event.getClientAddress();
	if (isLocalhost(clientIP)) {
		return resolve(event);
	}

	const isApiRequest = pathname.startsWith('/api/');
	const currentLimiter = isApiRequest ? getApiLimiter() : limiter;

	if (await currentLimiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: ${clientIP}, endpoint: ${pathname}`);
		return isApiRequest ? createJsonResponse({ error: 'Too Many Requests' }, 429) : createHtmlResponse('Too Many Requests', 429);
	}

	return resolve(event);
};

// Performance logging handler
const handlePerformanceLogging: Handle = async ({ event, resolve }) => {
	if (!dev) {
		return resolve(event);
	}

	const start = performance.now();
	const response = await resolve(event);
	const end = performance.now();

	const responseTime = end - start;
	const route = event.url.pathname;

	let emoji, timeColor;
	if (responseTime > 2000) {
		emoji = '🐢';
		timeColor = RED;
	} else if (responseTime < 1000) {
		emoji = '🚀';
		timeColor = GREEN;
	} else {
		emoji = '⏱️';
		timeColor = YELLOW;
	}

	logger.debug(`${ORANGE}${route}${RESET} - ${timeColor}${responseTime.toFixed(2)} ms${RESET} ${emoji}`);

	return response;
};

// Handle authentication, authorization, and API caching
const handleAuth: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	if (isStaticAsset(pathname)) {
		return resolve(event);
	}

	logger.debug('Starting handleAuth function');
	await initializationPromise;
	logger.debug('Database initialization complete');

	if (!auth) {
		logger.error('Authentication system is not available');
		throw error(500, 'Authentication system is not available');
	}

	const session_id = event.cookies.get(SESSION_COOKIE_NAME);
	logger.debug(`Session ID from cookie: ${session_id ? session_id : 'Not present'}`);

	if (session_id) {
		logger.debug(`Session cookie value: ${session_id}`);
		logger.debug(`Session cookie attributes: ${JSON.stringify(event.cookies.get(SESSION_COOKIE_NAME, { decode: (value) => value }))}`);
	}

	const user = await getUserFromSessionId(session_id);
	logger.debug(`User from session: ${user ? JSON.stringify(user) : 'Not found'}`);

	event.locals.user = user;
	event.locals.permissions = user ? user.permissions : [];

	const isPublicRoute = isPublicOrOAuthRoute(pathname);
	const isApiRequest = pathname.startsWith('/api/');

	logger.debug(`Route info: isPublicRoute=${isPublicRoute}, isApiRequest=${isApiRequest}, pathname=${pathname}`);

	// Allow OAuth routes to pass through without redirection
	if (isOAuthRoute(pathname)) {
		logger.debug('OAuth route detected, passing through');
		return resolve(event);
	}

	// Redirect unauthenticated users away from public routes
	if (!user && !isPublicRoute) {
		logger.debug('User not authenticated and not on public route, redirecting to login');
		return isApiRequest ? createJsonResponse({ error: 'Unauthorized' }, 401) : redirect(302, '/login');
	}

	// Redirect authenticated users away from public routes
	if (user && isPublicRoute && !isOAuthRoute(pathname)) {
		logger.debug('Authenticated user on public route, redirecting to home');
		return redirect(302, '/');
	}

	// Handle API requests
	if (isApiRequest && user) {
		logger.debug('Handling API request for authenticated user');
		return handleApiRequest(event, resolve, user);
	}

	logger.debug('Proceeding with normal request handling');
	return resolve(event);
};

// Handle API requests, including permission checks and caching
const handleApiRequest = async (event: any, resolve: any, user: any): Promise<Response> => {
	const pathname = event.url.pathname;
	const apiEndpoint = pathname.split('/')[2];
	const permissionId = `api:${apiEndpoint}`;

	const allPermissions = await getAllPermissions();
	const requiredPermission = allPermissions.find((p) => p.contextId === permissionId);

	// Check permissions for API access
	if (requiredPermission) {
		const { hasPermission } = await checkUserPermission(user, requiredPermission);
		if (!hasPermission) {
			logger.warn(`User ${user._id} attempted to access ${apiEndpoint} API without permission`);
			return createJsonResponse({ error: 'Forbidden' }, 403);
		}
	}

	// API caching for GET requests
	if (event.request.method === 'GET') {
		return handleCachedApiRequest(event, resolve, apiEndpoint, user._id);
	}

	return resolve(event);
};

// Handle cached API requests
const handleCachedApiRequest = async (event: any, resolve: any, apiEndpoint: string, userId: string): Promise<Response> => {
	const cacheKey = `api:${apiEndpoint}:${userId}`;
	const cachedResponse = await cacheStore.get(cacheKey);

	if (cachedResponse) {
		return createJsonResponse(cachedResponse, 200);
	}

	const response = await resolve(event);
	const responseData = await response.json();

	const expiresAt = new Date(Date.now() + 300 * 1000); // Cache for 5 minutes
	await cacheStore.set(cacheKey, responseData, expiresAt);

	return createJsonResponse(responseData, 200);
};

// Add security headers to the response
const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	response.headers.set('X-XSS-Protection', '1; mode=block');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(), microphone=()');

	// Only set HSTS header on HTTPS connections
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};

// Combine all hooks
export const handle: Handle = sequence(handleStaticAssetCaching, handleRateLimit, handleAuth, addSecurityHeaders, handlePerformanceLogging);

// Helper function to invalidate API cache
export async function invalidateApiCache(apiEndpoint: string, userId: string): Promise<void> {
	const cacheKey = `api:${apiEndpoint}:${userId}`;
	await cacheStore.delete(cacheKey);
	logger.debug(`Invalidated cache for ${cacheKey}`);
}
