import type { RequestHandler } from './$types';
import { tableHeaders } from '@src/stores/store';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			console.error('Authentication system is not initialized');
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
		}

		// Validate the session.
		const user = await auth.validateSession(session_id);

		if (!user || user.role !== 'admin') {
			return new Response('', { status: 403 });
		}

		// Get all users from the database
		const docs = await auth.getAllUsers();
		const users = docs.map((doc) => {
			const result = {};
			for (const header of tableHeaders) {
				result[header] = doc[header];
			}
			return result;
		});

		return new Response(JSON.stringify(users), { status: 200 });
	} catch (error) {
		console.error('Error fetching users:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch users' }), { status: 500 });
	}
};
