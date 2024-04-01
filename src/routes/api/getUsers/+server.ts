import type { RequestHandler } from './$types';
import { tableHeaders } from '@src/stores/store';

// Auth
import { auth } from '@src/routes/api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate the session.
	const user = await auth.validateSession(session_id);
	if (!user || user.role != 'admin') {
		return new Response('', { status: 403 });
	}
	const docs = await auth.getAllUsers();
	const users = docs.map((doc) => {
		const result = {};
		for (const header of tableHeaders) {
			result[header] = doc[header];
		}
		return result;
	});
	return new Response(JSON.stringify(users), { status: 200 });
};
