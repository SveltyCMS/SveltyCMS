/**
 * @file src/hooks.server.ts
 * @description Server-side logic for the SvelteKit app, including session handling, authentication, and theme management.
 */
console.log('hooks.server.ts loaded');

import { privateEnv } from '@root/config/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { auth, initializationPromise, dbAdapter, authAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Cache
import { InMemorySessionStore } from '@src/auth/InMemoryCacheStore';
import { RedisCacheStore } from '@src/auth/RedisCacheStore';

// System Logger
import logger from '@src/utils/logger';

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

// Initialize the rate limiter
const limiter = new RateLimiter({
	IP: [100, 'h'],
	IPUA: [50, 'm'],
	cookie: {
		name: 'sveltycms_ratelimit',
		secret: privateEnv.JWT_SECRET_KEY,
		rate: [250, 'm'],
		preflight: true
	}
});

// Initialize session store
const sessionStore = privateEnv.USE_REDIS ? new RedisCacheStore() : new InMemorySessionStore();

// Handle authentication and session management
const handleAuth: Handle = async ({ event, resolve }) => {
	// Ensure initialization is complete
	await initializationPromise;

	// Skip session check for login page
	const unauthenticatedRoutes = ['/login', '/register', '/forgot-password']; // Add other routes if needed
	if (unauthenticatedRoutes.includes(event.url.pathname)) {
		// Allow unauthenticated access to login and other public routes
		return resolve(event);
	}

	const session_id = event.cookies.get(SESSION_COOKIE_NAME);
	let user = null;

	if (session_id) {
		try {
			user = (await sessionStore.get(session_id)) || (await auth.validateSession({ session_id }));

			if (user) {
				await sessionStore.set(session_id, user, 3600); // Cache the session
			}
		} catch (error) {
			logger.error(`Error during session retrieval: ${error}`);
			throw redirect(302, '/login'); // Redirect if session retrieval fails
		}
	}

	// If no valid user session is found, redirect to login
	if (!user) {
		logger.warn('No valid user session found, redirecting to login.');
		throw redirect(302, '/login');
	}

	// Set the user in locals
	event.locals.user = user;

	// Fetch permissions and set them in locals using authAdapter
	const fullUser = await authAdapter.getUserById(user._id); // Correct adapter for authentication
	event.locals.permissions = fullUser ? fullUser.permissions || [] : [];

	// Set theme using dbAdapter
	const theme = await dbAdapter.getDefaultTheme();
	event.locals.theme = theme || DEFAULT_THEME;

	return resolve(event);
};

// Rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	if (await limiter.isLimited(event)) {
		return new Response(
			`<html><body style="display: flex; align-items: center; justify-content: center; height: 100vh;">
                <h1 style="text-align: center;">Too many requests</h1>
            </body></html>`,
			{ status: 429, headers: { 'Content-Type': 'text/html' } }
		);
	}

	return resolve(event);
};

// Combine all hooks
export const handle: Handle = sequence(
	handleAuth, // Ensure session validation and redirect unauthenticated users
	handleRateLimit // Then apply rate limiting or other logic
);
