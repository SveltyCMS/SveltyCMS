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
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth/auth';
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		return json({ success: false, message: 'Internal Server Error' }, { status: 500 });
	}

	const rawSessionId = cookies.get(SESSION_COOKIE_NAME);
	const session_id = rawSessionId;

	try {
		if (session_id) {
			// Destroy the session in the database and any in-memory stores
			await auth.destroySession(session_id);
			logger.info(`Session destroyed: ${session_id}`);
		} else {
			logger.warn('No active session found during logout attempt');
		}

		// Always clear the session cookie, even if there wasn't an active session
		try {
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			logger.debug(`Session cookie deleted: ${SESSION_COOKIE_NAME}`);
		} catch (cookieError) {
			logger.error(`Failed to delete session cookie: ${cookieError instanceof Error ? cookieError.message : String(cookieError)}`);
			// Try alternative deletion method
			try {
				cookies.set(SESSION_COOKIE_NAME, '', {
					path: '/',
					expires: new Date(0),
					maxAge: 0
				});
				logger.debug('Session cookie cleared using alternative method');
			} catch (altError) {
				logger.error(`Failed to clear session cookie with alternative method: ${altError instanceof Error ? altError.message : String(altError)}`);
			}
		}

		// Clear the user from locals
		locals.user = null;

		logger.info('User logged out successfully');
		return json({ success: true, message: 'Logged out successfully' });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Logout error:', { error: errorMessage });
		return json({ success: false, message: 'An error occurred during logout' }, { status: 500 });
	}
};
