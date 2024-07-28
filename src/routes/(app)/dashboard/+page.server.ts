import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth, initializationPromise } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Logger
import logger from '@src/utils/logger';

// Optional Redis imports
import { getCachedSession, setCachedSession, clearCachedSession, initializeRedis } from '@src/routes/api/databases/redis';

export async function load({ cookies }) {
	await initializationPromise;
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	let session_id = cookies.get(SESSION_COOKIE_NAME);

	// Initialize Redis (if applicable) before using it
	const isRedisEnabled = process.env.USE_REDIS === 'true'; // Check if Redis is enabled in environment variables
	if (isRedisEnabled) {
		await initializeRedis();
	}

	// If no session ID is found, create a new session
	if (!session_id) {
		try {
			const newSession = await auth.createSession({ user_id: 'guestuser_id' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			session_id = sessionCookie.value;

			// Cache the new session in Redis if Redis is enabled
			if (isRedisEnabled) {
				await setCachedSession(session_id, { user_id: 'guestuser_id' });
			}
		} catch (e) {
			logger.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
	}

	// Check if `auth` is initialized
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Attempt to retrieve the session from Redis cache if Redis is enabled
	let user;
	if (isRedisEnabled) {
		user = await getCachedSession(session_id);
	}

	if (!user) {
		// If not found in cache, validate the user's session
		user = await auth.validateSession({ session_id });

		// If validation fails, redirect the user to the login page
		if (!user) {
			// Clear the cached session if validation fails and Redis is enabled
			if (isRedisEnabled) {
				await clearCachedSession(session_id);
			}
			throw redirect(302, `/login`);
		}

		// Cache the validated user session in Redis if Redis is enabled
		if (isRedisEnabled) {
			await setCachedSession(session_id, user);
		}
	}

	const { _id, ...rest } = user;
	logger.debug(rest);
	// Return user data
	return {
		_id: _id.toString(),
		...rest
	};
}
