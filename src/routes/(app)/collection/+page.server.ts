import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Load function that handles authentication and user validation
export async function load(event) {
	// Get session cookie value as string
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;

	if (!session_id) {
		throw redirect(302, `/login`);
	}

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Validate user using auth and session value
	const user = await auth.validateSession(session_id);

	// If user status is 200, return user object
	if (!user) {
		throw redirect(302, `/login`);
	}

	if (user.role !== 'admin') {
		throw error(404, "You don't have access to this page");
	}

	// Return user data
	return {
		user
	};
}
