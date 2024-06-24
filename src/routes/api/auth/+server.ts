import type { Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Define a POST request handler function
export const POST: RequestHandler = async ({ request, cookies }) => {
	const formData = await request.formData();

	const authType = formData.get('authType') as 'signOut';

	if (authType == 'signOut') {
		return await signOut(cookies);
	} else {
		return new Response('', { status: 404 });
	}
};

// Define an asynchronous function to sign out a user
async function signOut(cookies: Cookies) {
	try {
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		await auth.destroySession(session_id);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/login' });
		return new Response(JSON.stringify({ status: 200 }));
	} catch (e) {
		return new Response(JSON.stringify({ status: 404 }));
	}
}
