/**
 * @file src/hooks.server.ts
 * @description Server-side logic for the SvelteKit app, including session handling, authentication, theme management, and security enhancements.
 */

import { privateEnv } from '@root/config/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';
// Auth and Database Adapters
import { auth, initializationPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Cache
import { InMemorySessionStore } from '@src/auth/InMemoryCacheStore';
import { RedisCacheStore } from '@src/auth/RedisCacheStore';

// System Logger
import logger from '@src/utils/logger';

// Initialize the rate limiter
const limiter = new RateLimiter({
	IP: [300, 'h'], // 300 requests per hour
	IPUA: [150, 'm'], // 150 requests per minute
	cookie: {
		name: 'sveltycms_ratelimit',
		secret: privateEnv.JWT_SECRET_KEY,
		rate: [500, 'm'], // 500 requests per minute
		preflight: true
	}
});

// Initialize session store
const sessionStore = privateEnv.USE_REDIS ? new RedisCacheStore() : new InMemorySessionStore();

// Add caching for static assets
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

// Handle rate limiting for all routes
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

	if (await limiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: ${clientIP}`);
		return new Response(
			`<!DOCTYPE html>
      <html lang="en">
          <!-- ... HTML content ... -->
      </html>`,
			{ status: 429, headers: { 'Content-Type': 'text/html' } }
		);
	}

	return resolve(event);
};

// Handle authentication, session management, and theme initialization
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
		throw new Error('Authentication system is not available. Please try again later.');
	}

	const session_id = event.cookies.get(SESSION_COOKIE_NAME);
	logger.debug(`Session ID from cookie: ${session_id ? 'Present' : 'Not present'}`);

	let user = null;
	if (session_id) {
		user = await sessionStore.get(session_id);
		logger.debug(`User from session store: ${user ? 'Found' : 'Not found'}`);

		if (!user) {
			try {
				user = await auth.validateSession({ session_id });
				if (user) {
					await sessionStore.set(session_id, user, 3600); // Cache session for 1 hour
					logger.debug(`User session validated and cached: ${user._id}`);
				} else {
					// Session is invalid, delete the cookie
					event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
					logger.warn('Session is invalid or expired.');
				}
			} catch (error) {
				logger.error(`Error validating session: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
			}
		} else {
			// Implement sliding expiration
			await sessionStore.set(session_id, user, 3600); // Refresh session expiration
		}
	} else {
		logger.debug('No session ID found in cookie');
	}

	// Set the user and permissions in locals
	if (user) {
		event.locals.user = user;
		event.locals.permissions = user.permissions || [];
		logger.debug(`User set in locals: ${user._id}`);
		logger.debug(`User permissions set: ${event.locals.permissions.join(', ')}`);
	} else {
		event.locals.user = null;
		event.locals.permissions = [];
		logger.debug('No user, setting empty permissions array');
	}

	// Define public routes
	const publicRoutes = ['/login']; // Only the login page is public

	// Check if the current route is public
	const isPublicRoute = publicRoutes.some((route) => pathname === route);

	// Redirect unauthenticated users trying to access protected routes
	if (!user && !isPublicRoute) {
		logger.warn('User not authenticated, redirecting to login.');
		throw redirect(302, '/login');
	}

	// If user is authenticated and tries to access the login page, redirect them elsewhere
	if (user && pathname === '/login') {
		logger.debug('Authenticated user accessing login page, redirecting to home.');
		throw redirect(302, '/');
	}

	logger.debug('handleAuth function completed successfully');
	return await resolve(event);
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
