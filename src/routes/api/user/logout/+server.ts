/**
 * @file src/routes/api/user/logout/+server.ts
 * @description API endpoint for user logout.
 *
 * This endpoint handles user logout operations by:
 * - Destroying the user's active session on the server.
 * - Removing the session from any in-memory stores or caches.
 * - Clearing the session cookie from the client's browser.
 *
 * Features:
 * - Secure session destruction.
 * - Reliable cookie invalidation.
 * - Robust error handling and logging.
 */

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@root/src/auth';
// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized.');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// Use the session ID from `locals` which is reliably populated by the hook.
		const session_id = locals.session_id;

		// Check if a user session actually exists for this request.
		if (session_id && locals.user) {
			// Destroy the session on the server-side (database, cache, etc.).
			await auth.destroySession(session_id);
			logger.info('Session destroyed for user', {
				email: locals.user.email,
				sessionId: session_id
			});
		} else {
			// If there's no session, there's nothing to destroy, but we can still log it.
			logger.warn('Logout endpoint was called, but no active session was found.');
		}

		// Clear the session cookie from the client's browser.
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		logger.debug(`Session cookie deleted from client: ${SESSION_COOKIE_NAME}`);

		// Clear the user from `locals` for the remainder of the current request lifecycle.
		locals.user = null;
		locals.session_id = undefined;

		return json({ success: true, message: 'You have been logged out successfully.' });
	} catch (err) {
		// This block catches unexpected errors during session destruction.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred during logout.';

		logger.error('Error during logout process:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});

		// Even if an error occurs, we still try to clear the cookie as a failsafe.
		try {
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		} catch (cookieError) {
			logger.error('Failed to clear cookie during logout error handling.', { cookieError });
		}

		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
