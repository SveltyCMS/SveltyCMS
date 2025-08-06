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

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Auth
import { SESSION_COOKIE_NAME } from '@src/auth/constants';
import { getCacheStore } from '@src/cacheStore/index.server';
import { auth } from '@src/databases/db';
// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	const { user, session_id, tenantId } = locals;
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized.');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		} // Check if a user session actually exists for this request.

		if (session_id && user) {
			// Revoke Google OAuth Token
			if (user.googleRefreshToken) {
				try {
					const refreshToken = user.googleRefreshToken;
					const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
						method: 'POST',
						headers: {
							'Content-type': 'application/x-www-form-urlencoded'
						}
					});

					if (response.ok) {
						logger.info('Successfully revoked Google OAuth token for user', { userId: user._id, tenantId }); // Clear the refresh token from the database, scoped by tenant.
						await auth.updateUserAttributes(user._id, { googleRefreshToken: null }, tenantId);
					} else {
						const errorBody = await response.json();
						logger.warn('Failed to revoke Google OAuth token. It may have already been revoked.', {
							userId: user._id,
							tenantId,
							error: errorBody
						});
					}
				} catch (revokeError) {
					// Log the error but don't block the local logout process.
					logger.error('Error while trying to revoke Google OAuth token', { userId: user._id, error: revokeError, tenantId });
				}
			} // Destroy the session on the server-side (database, cache, etc.).

			await auth.destroySession(session_id); // Also clear the session from cache

			try {
				const cacheStore = getCacheStore();
				await cacheStore.delete(session_id);
			} catch (cacheError) {
				logger.warn(`Failed to clear session cache: ${cacheError}`);
			}

			logger.info('Session destroyed for user', {
				email: user.email,
				sessionId: session_id,
				tenantId
			});
		} else {
			// If there's no session, there's nothing to destroy, but we can still log it.
			logger.warn('Logout endpoint was called, but no active session was found.');
		} // Clear the session cookie from the client's browser.

		cookies.delete(SESSION_COOKIE_NAME, {
			path: '/',
			httpOnly: true,
			secure: false, // Set to true in production with HTTPS
			sameSite: 'lax'
		}); // Clear the user from `locals` for the remainder of the current request lifecycle.

		locals.user = null;
		locals.session_id = undefined;
		locals.tenantId = undefined;

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
			tenantId: locals.tenantId,
			status
		}); // Even if an error occurs, we still try to clear the cookie as a failsafe.

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
