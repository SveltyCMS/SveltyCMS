import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Load function that handles authentication and user validation
export async function load(event) {
	// Get session cookie value as string
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate user using auth and session value
	const user = await auth.validateSession(session_id);
	// If user status is 200, return user object
	if (user) {
		if (user.role != 'admin') {
			throw error(404, {
				message: "You don't have any access to this page"
			});
		}
	} else {
		redirect(302, `/login`);
	}
}
