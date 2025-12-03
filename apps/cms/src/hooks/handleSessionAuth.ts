/**
 * @file src/hooks/handleSessionAuth.ts
 * @description Middleware for validating the user's session and handling security token rotation.
 *
 * @summary This hook runs after the system is confirmed to be ready. It reads the session
 * cookie, validates it against the database to identify the user, and attaches the
 * user object to `event.locals`. It also implements a token rotation strategy for
 * enhanced security.
 */

import type { Handle } from '@sveltekit';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import { auth } from '@src/databases/db';
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Shared session utilities
import { getUserFromSessionId as sharedGetUserFromSessionId, handleSessionRotation as sharedHandleSessionRotation } from '@src/hooks/utils/session';
import { logger } from '@utils/logger.svelte';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Rate limiter for the refresh action
const refreshLimiter = new RateLimiter({
	// Your limiter config...
	IP: [100, 'm'],
	cookie: {
		name: 'refreshlimit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY'),
		rate: [100, 'm'],
		preflight: true
	}
});

export const handleSessionAuth: Handle = async ({ event, resolve }) => {
	// No need for __skipSystemHooks or isServiceHealthy checks.
	// The handleSystemState hook guarantees this only runs for valid, non-setup requests
	// and that the auth service is ready.

	const { locals, cookies } = event;
	const sessionId = cookies.get(SESSION_COOKIE_NAME);

	if (sessionId) {
		// We can safely assume 'auth' is available and the DB is connected.
		const user = await sharedGetUserFromSessionId(sessionId, true, locals.tenantId, auth);

		if (user) {
			locals.user = user;
			locals.permissions = user.permissions || [];
			locals.session_id = sessionId;

			// Attempt to rotate the session token for active users
			try {
				await sharedHandleSessionRotation(event, user, sessionId, auth, refreshLimiter, SESSION_COOKIE_NAME);
			} catch (rotationError) {
				// If rotation fails due to an invalid session, log the user out.
				if (rotationError instanceof Error && rotationError.message === 'invalid-session') {
					logger.warn(`Session rotation failed for user ${user._id}. Clearing session cookie.`);
					cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
					locals.user = null;
					locals.permissions = [];
					locals.session_id = undefined;
				} else {
					// For other rotation errors, log it but don't kill the session.
					logger.error('An unexpected error occurred during session rotation:', rotationError);
				}
			}
		} else {
			// If a session ID was provided but it's invalid, clear the cookie.
			logger.trace(`Clearing invalid session cookie: ${sessionId}`);
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
	}

	// Continue to the next hook (handleAuthorization).
	return resolve(event);
};
