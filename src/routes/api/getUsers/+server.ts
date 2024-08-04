import type { RequestHandler } from './$types';
import { tableHeaders } from '@src/stores/store';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logs
import logger from '@src/utils/logger';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
const sessionAdapter = new SessionAdapter();
const userAdapter = new UserAdapter();

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		logger.debug(`Session ID retrieved: ${session_id}`);

		// Check if the authentication system is initialized.
		if (!auth) {
			logger.error('Authentication system is not initialized');
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
		}

		// Validate the session by passing an object with the session_id property.
		const user = await sessionAdapter.validateSession(session_id);
		logger.debug(`User validated: ${JSON.stringify(user)}`);

		// Check if the user is authenticated and has admin role.
		if (!user || user.role !== 'admin') {
			logger.warn('Unauthorized access attempt.');
			return new Response('', { status: 403 });
		}

		// Get all users from the database.
		const docs = await userAdapter.getAllUsers();
		logger.info('Users retrieved successfully');

		// Format the users based on table headers.
		const users = docs.map((doc) => {
			const result = {};
			for (const header of tableHeaders) {
				result[header] = doc[header];
			}
			return result;
		});

		// Return the formatted users as a JSON response.
		return new Response(JSON.stringify(users), { status: 200 });
	} catch (error) {
		// Log and return an error response.
		logger.error('Error fetching users:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch users' }), { status: 500 });
	}
};
