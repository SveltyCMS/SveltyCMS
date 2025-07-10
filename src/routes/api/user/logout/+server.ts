/**
 * @file src/routes/api/user/logout/+server.ts
 * @description API endpoint for user logout.
 *
 * This endpoint handles user logout operations by:
 * - Revoking the Google OAuth token if the user signed in with Google.
 * - Destroying the user's active session on the server.
 * - Removing the session from any in-memory stores or caches.
 * - Clearing the session cookie from the client's browser.
 *
 * Features:
 * - Secure Google token revocation on logout.
 * - Secure local session destruction.
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
			// Revoke Google OAuth Token 
			// The `googleRefreshToken` would have been stored during the OAuth login flow.
			if (locals.user.googleRefreshToken) {
				try {
					const refreshToken = locals.user.googleRefreshToken;
					const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
						method: 'POST',
						headers: {
							'Content-type': 'application/x-www-form-urlencoded'
						}
					});

					if (response.ok) {
						logger.info('Successfully revoked Google OAuth token for user', { userId: locals.user._id });
						// Optional: Clear the refresh token from the database so it can't be used again.
						await auth.updateUserAttributes(locals.user._id, { googleRefreshToken: null });
					} else {
						const errorBody = await response.json();
						logger.warn('Failed to revoke Google OAuth token. It may have already been revoked.', {
							userId: locals.user._id,
							error: errorBody
						});
					}
				} catch (revokeError) {
					// Log the error but don't block the local logout process.
					logger.error('Error while trying to revoke Google OAuth token', { userId: locals.user._id, error: revokeError });
				}
			}
			// --- END NEW LOGIC ---

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

