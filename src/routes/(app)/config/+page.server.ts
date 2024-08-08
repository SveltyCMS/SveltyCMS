import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logs
import logger from '@src/utils/logger';

export async function load({ cookies }) {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.debug('No session ID found, redirecting to login');
		throw redirect(302, `/login`);
	}

	try {
		// Validate the user's session
		const user = await auth.validateSession({ session_id });

		// If validation fails, redirect the user to the login page
		if (!user) {
			logger.warn(`Invalid session for session_id: ${session_id}`);
			throw redirect(302, `/login`);
		}

		// Log successful session validation
		logger.debug(`User session validated successfully for user: ${user._id}`);
		const { _id, ...rest } = user;

		// Return user data
		return {
			user: {
				_id: _id.toString(),
				...rest
			}
		};
	} catch (e) {
		logger.error('Error validating session:', e);
		// Instead of immediately redirecting, you might want to clear the invalid session
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		throw redirect(302, `/login`);
	}
}
