/**
 * @file src/routes/api/user/logout/+server.ts
 * @description API endpoint for user logout
 *
 * This endpoint handles user logout operations:
 * - Destroys the user's active session in the database
 * - Removes the session from any in-memory stores
 * - Clears the session cookie from the client
 *
 * The endpoint ensures complete cleanup of session data both server-side and client-side.
 * It integrates with the SvelteKit error handling system and respects the authentication
 * flow established in hooks.server.ts.
 *
 * @throws {error} 401 - Not authenticated
 * @throws {error} 400 - No active session
 * @throws {error} 500 - Internal server error or authentication system unavailable
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { logger } from '@src/utils/logger';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	if (!locals.user) {
		logger.warn('Unauthenticated user attempting to log out');
		throw error(401, 'Not authenticated');
	}

	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.warn('No active session found during logout attempt');
		throw error(400, 'No active session');
	}

	try {
		// Destroy the session in the database and any in-memory stores
		await auth.destroySession(session_id);

		// Clear the session cookie
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });

		logger.info(`User logged out successfully: ${session_id}`);
		return json({ success: true, message: 'Logged out successfully' });
	} catch (err) {
		logger.error(`Logout error: ${err.message}`);
		throw error(500, 'An error occurred during logout');
	}
};
