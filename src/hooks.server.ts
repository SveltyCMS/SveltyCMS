/**
 * @file src/hooks.server.ts
 * @description Server-side logic for the SvelteKit app, including session handling, authentication, rate limiting, and theme management.
 */

import { privateEnv } from '@root/config/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Rate Limiter
// import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { auth, initializationPromise, authAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Cache
import { InMemorySessionStore } from '@src/auth/InMemoryCacheStore';
import { RedisCacheStore } from '@src/auth/RedisCacheStore';

// System Logger
import logger from '@src/utils/logger';

// Initialize the rate limiter
// const limiter = new RateLimiter({
// 	IP: [300, 'h'], // 300 requests per hour
// 	IPUA: [150, 'm'], // 150 requests per minute
// 	cookie: {
// 		name: 'sveltycms_ratelimit',
// 		secret: privateEnv.JWT_SECRET_KEY,
// 		rate: [500, 'm'], // 500 requests per minute
// 		preflight: true
// 	}
// });

// Initialize session store
const sessionStore = privateEnv.USE_REDIS ? new RedisCacheStore() : new InMemorySessionStore();

// Handle authentication, session management, and theme initialization
const handleAuth: Handle = async ({ event, resolve }) => {
	// Ensure database initialization
	await initializationPromise;

	if (!authAdapter) {
		logger.error('Authentication adapter is not initialized');
		throw new Error('Authentication system is not available. Please try again later.');
	}

	const session_id = event.cookies.get(SESSION_COOKIE_NAME);

	if (event.locals.user) {
		return resolve(event);
	}

	let user = session_id ? await sessionStore.get(session_id) : null;

	if (!user && session_id) {
		try {
			user = await auth.validateSession({ session_id });
			if (user) {
				await sessionStore.set(session_id, user, 3600); // Cache session for 1 hour
				logger.debug(`User session validated and cached: ${user._id}`);
			}
		} catch (error) {
			logger.error(`Error validating session: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
		}
	}

	if (!user && event.url.pathname !== '/login') {
		logger.warn('User not authenticated, redirecting to login.');
		throw redirect(302, '/login'); // Redirect if session retrieval fails
	}

	// Set the user in locals
	event.locals.user = user;

	// Fetch permissions and set them in locals using authAdapter

	if (user) {
		const fullUser = await authAdapter.getUserById(user._id);
		event.locals.permissions = fullUser ? fullUser.permissions || [] : [];
		logger.debug(`User permissions set: ${event.locals.permissions.join(', ')}`);
	} else {
		logger.error(`Error fetching user permissions: ${error}`);
		event.locals.permissions = [];
	}

	return resolve(event);
};

// Handle rate limiting for all routes
// const handleRateLimit: Handle = async ({ event, resolve }) => {
// 	const clientIP = event.getClientAddress();

// 	// Whitelist localhost
// 	if (clientIP === '::1' || clientIP === '127.0.0.1') {
// 		return resolve(event);
// 	}

// 	if (await limiter.isLimited(event)) {
// 		logger.warn(`Rate limit exceeded for IP: ${event.getClientAddress()}`);
// 		return new Response(
// 			`<!DOCTYPE html>
// 			<html lang="en">
// 				<head>
// 					<meta charset="UTF-8">
// 					<meta http-equiv="X-UA-Compatible" content="IE=edge">
// 					<meta name="viewport" content="width=device-width, initial-scale=1.0">
// 					<title>Too Many Requests</title>
// 					<style>
// 						body {
// 							display: flex;
// 							flex-direction: column;
// 							align-items: center;
// 							justify-content: center;
// 							height: 100vh;
// 							font-family: Arial, sans-serif;
// 							background-color: #121212; /* Dark background */
// 							color: #FFFFFF; /* White text */
// 							margin: 0;
// 						}
// 						.logo {
// 							width: 100px;
// 							height: 100px;
// 							margin-bottom: 20px;
// 							fill: #FFFFFF; /* White logo */
// 						}
// 						h1 {
// 							font-size: 2em;
// 							margin-bottom: 10px;
// 						}
// 						p {
// 							font-size: 1.2em;
// 						}
// 					</style>
// 				</head>
// 				<body>
// 					<svg class="logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
// 						<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#FFFFFF" stroke-width="2"/>
// 					</svg>
// 					<h1>Too Many Requests</h1>
// 					<p>Please try again later.</p>
// 				</body>
// 			</html>`,
// 			{ status: 429, headers: { 'Content-Type': 'text/html' } }
// 		);
// 	}

// 	return resolve(event);
// };

// Combine all hooks
export const handle: Handle = sequence(handleAuth);
