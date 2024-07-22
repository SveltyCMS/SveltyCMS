import type { Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logs
import {logger} from '@src/utils/logger';

// Define a POST request handler function
export const POST: RequestHandler = async ({ request, cookies }) => {
	const formData = await request.formData();

	const authType = formData.get('authType') as 'signOut';

	if (authType == 'signOut') {
		logger.debug('Sign out request received');
		return await signOut(cookies);
	} else {
		logger.warn('Invalid authType received', { authType });
		return new Response('', { status: 404 });
	}
};

// Define an asynchronous function to sign out a user
async function signOut(cookies: Cookies) {
	try {
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		await auth.destroySession(session_id);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/login' });
		logger.debug('User signed out successfully', { session_id });
		return new Response(JSON.stringify({ status: 200 }));
	} catch (err) {
		logger.error('Error signing out user', err);
		return new Response(JSON.stringify({ status: 404 }));
	}
}
