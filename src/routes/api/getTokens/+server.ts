import type { RequestHandler } from './$types';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie
		const sessionId = cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			console.error('Authentication system is not initialized');
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
		}

		// Validate the session
		const user = await auth.validateSession(sessionId);

		if (!user || user.role !== 'admin') {
			return new Response('', { status: 403 });
		}

		// Get all tokens from the database
		const tokens = await auth.getAllTokens();

		return new Response(JSON.stringify(tokens), { status: 200 });
	} catch (error) {
		console.error('Error fetching tokens:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch tokens' }), { status: 500 });
	}
};
