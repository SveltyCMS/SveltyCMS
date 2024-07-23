import type { RequestHandler } from './$types';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logs
import { logger } from '@src/utils/logger';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		logger.debug(`Session ID retrieved: ${session_id}`);

		// Check if the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
		}

		// Validate the session by passing an object with session_id property
		const user = await auth.validateSession({ session_id });
		logger.debug(`User validated: ${JSON.stringify(user)}`);

		// Check if the user is authenticated and has admin role
		if (!user || user.role !== 'admin') {
			logger.warn('Unauthorized access attempt.');
			return new Response('', { status: 403 });
		}

		// Get all tokens from the database
		const tokens = await auth.getAllTokens();
		logger.info('Tokens retrieved successfully');

		// Return the tokens as a JSON response
		return new Response(JSON.stringify(tokens), { status: 200 });
	} catch (error) {
		// Log and return an error response
		logger.error('Error fetching tokens:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch tokens' }), { status: 500 });
	}
};
