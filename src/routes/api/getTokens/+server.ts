import type { RequestHandler } from './$types';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie
		const sessionId = cookies.get(SESSION_COOKIE_NAME) as string;

		// Check if the authentication system is initialized
		if (!auth) {
			console.error('Authentication system is not initialized');
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
		}

		// Validate the session by passing an object with sessionId property
		const user = await auth.validateSession({ sessionId });

		// Check if the user is authenticated and has admin role
		if (!user || user.role !== 'admin') {
			return new Response('', { status: 403 });
		}

		// Get all tokens from the database
		const tokens = await auth.getAllTokens();

		// Return the tokens as a JSON response
		return new Response(JSON.stringify(tokens), { status: 200 });
	} catch (error) {
		// Log and return an error response
		console.error('Error fetching tokens:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch tokens' }), { status: 500 });
	}
};
