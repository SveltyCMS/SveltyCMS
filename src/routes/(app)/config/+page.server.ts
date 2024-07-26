import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Logger
import { logger } from '@src/utils/logger';

export async function load({ cookies }) {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	let session_id = cookies.get(SESSION_COOKIE_NAME);

	// If no session ID is found, create a new session
	if (!session_id) {
		logger.debug('Session ID is missing from cookies, creating a new session.');
		try {
			const newSession = await auth.createSession({ user_id: 'guestuser_id' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			session_id = sessionCookie.value;
			logger.debug('New session created:', { session_id });
		} catch (e) {
			logger.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
	}

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
}
