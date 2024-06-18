import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load({ cookies }) {
	// Get session cookie value as string
	const sessionId = cookies.get(SESSION_COOKIE_NAME);

	// Redirect if no session ID is found, indicating no current session
	if (!sessionId) {
		throw redirect(302, '/login');
	}

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Validate the session and retrieve the associated user
	const user = await auth.validateSession({ sessionId });

	// Redirect to login if no user is found (session is invalid or expired)
	if (!user) {
		throw redirect(302, '/login');
	}

	// Check user access level; redirect if insufficient permissions
	if (user.role !== 'admin') {
		throw error(403, "You don't have access to this page");
	}

	// Return user data for the page if validation is successful
	return {
		user
	};
}
