import { redirect } from '@sveltejs/kit';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load(event: any) {
	// Secure this page with session cookie
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	//console.log('Session ID:', session_id);
	// Validate the user's session
	const user = await auth.validateSession(session_id);
	//console.log('user: ', user);

	// If validation fails, redirect the user to the login page
	if (!user) {
		redirect(302, `/login`);
	}

	// Serialize the user data manually
	// const serializedUser = JSON.stringify(user);

	// Return the serialized user data
	return {
		props: {
			user: user
		}
	};
}
