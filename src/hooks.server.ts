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
 */

import { privateEnv } from '@root/config/private';
import { redirect, error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';
// Auth and Database Adapters
import { auth, initializationPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
// Cache
import { InMemorySessionStore } from '@src/auth/InMemoryCacheStore';
import { RedisCacheStore } from '@src/auth/RedisCacheStore';
import { checkUserPermission, getAllPermissions } from '@src/auth/permissionManager';
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

// Initialize session store (also used for API caching)
const cacheStore = privateEnv.USE_REDIS ? new RedisCacheStore() : new InMemorySessionStore();

// Handle static asset caching
const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	// Check if the request is for a static asset
	if (pathname.startsWith('/static/') || pathname.startsWith('/_app/') || pathname.endsWith('.js') || pathname.endsWith('.css')) {
		const response = await resolve(event);
		// Set cache headers for static assets
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		return response;
	}
	return resolve(event);
};

// Handle rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	// Skip rate limiting for static assets
	if (pathname.startsWith('/static/') || pathname.startsWith('/_app/') || pathname.includes('.')) {
		return resolve(event);
	}

	const clientIP = event.getClientAddress();
	// Whitelist localhost
	if (clientIP === '::1' || clientIP === '127.0.0.1') {
		return resolve(event);
	}

	// Apply stricter rate limits for API endpoints
	const isApiRequest = pathname.startsWith('/api/');

	if (isApiRequest) {
		const apiLimiter = new RateLimiter({
			IP: [100, 'm'], // 100 requests per minute for API
			IPUA: [50, 'm'] // 50 requests per minute per IP+User-Agent for API
		});

		if (await apiLimiter.isLimited(event)) {
			logger.warn(`API rate limit exceeded for IP: ${clientIP}, endpoint: ${pathname}`);
			return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	} else if (await limiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: ${clientIP}`);
		return new Response(
			`<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="X-UA-Compatible" content="IE=edge">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Too Many Requests</title>
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
                        h1 {
                            font-size: 2em;
                            margin-bottom: 10px;
                        }
                        p {
                            font-size: 1.2em;
                        }
                    </style>
                </head>
                <body>
                    <svg class="logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#FFFFFF" stroke-width="2"/>
                    </svg>
                    <h1>Too Many Requests</h1>
                    <p>Please try again later.</p>
                </body>
            </html>`,
			{ status: 429, headers: { 'Content-Type': 'text/html' } }
		);
	}

	return resolve(event);
};

// Handle authentication, authorization, and API caching
const handleAuth: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	// Skip authentication for static assets
	if (pathname.startsWith('/static/') || pathname.startsWith('/_app/') || pathname.includes('.')) {
		return resolve(event);
	}

	logger.debug('Starting handleAuth function');

	// Ensure database initialization
	await initializationPromise;
	logger.debug('Database initialization complete');

	if (!auth) {
		logger.error('Authentication system is not available');
		throw error(500, 'Authentication system is not available');
	}

	const session_id = event.cookies.get(SESSION_COOKIE_NAME);
	logger.debug(`Session ID from cookie: ${session_id ? 'Present' : 'Not present'}`);

	let user = null;

	if (session_id) {
		// Try to get user from cache
		user = await cacheStore.get(session_id);
		if (!user) {
			try {
				// Validate session if not in cache
				user = await auth.validateSession({ session_id });
				if (user) {
					await cacheStore.set(session_id, user, 3600); // Cache for 1 hour
				} else {
					event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				}
			} catch (error) {
				logger.error(`Session validation error: ${error}`);
			}
		} else {
			// Refresh cache expiration
			await cacheStore.set(session_id, user, 3600);
		}
	}

	event.locals.user = user;
	event.locals.permissions = user ? user.permissions : [];

	const publicRoutes = ['/login', '/register', '/forgot-password'];
	const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
	const isApiRequest = pathname.startsWith('/api/');

	// Handle unauthenticated users
	if (!user && !isPublicRoute) {
		if (isApiRequest) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return redirect(302, '/login');
	}

	// Redirect authenticated users away from public routes
	if (user && isPublicRoute) {
		return redirect(302, '/');
	}

	// Handle API requests
	if (isApiRequest && user) {
		const apiEndpoint = pathname.split('/')[2];
		const permissionId = `api:${apiEndpoint}`;
		const allPermissions = await getAllPermissions();
		const requiredPermission = allPermissions.find((p) => p.contextId === permissionId);

		// Check permissions for API access
		if (requiredPermission) {
			const { hasPermission } = await checkUserPermission(user, requiredPermission);
			if (!hasPermission) {
				logger.warn(`User ${user._id} attempted to access ${apiEndpoint} API without permission`);
				return new Response(JSON.stringify({ error: 'Forbidden' }), {
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// API caching for GET requests
		if (event.request.method === 'GET') {
			const cacheKey = `api:${apiEndpoint}:${user._id}`;
			const cachedResponse = await cacheStore.get(cacheKey);

			if (cachedResponse) {
				return new Response(JSON.stringify(cachedResponse), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			const response = await resolve(event);
			const responseData = await response.json();

			await cacheStore.set(cacheKey, responseData, 300); // Cache for 5 minutes

			return new Response(JSON.stringify(responseData), {
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return resolve(event);
};

// Add security headers
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
export const handle: Handle = sequence(handleStaticAssetCaching, handleRateLimit, handleAuth, addSecurityHeaders);

// Helper function to invalidate API cache
export async function invalidateApiCache(apiEndpoint: string, userId: string): Promise<void> {
	const cacheKey = `api:${apiEndpoint}:${userId}`;
	await cacheStore.delete(cacheKey);
	logger.debug(`Invalidated cache for ${cacheKey}`);
}
