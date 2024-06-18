import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load(event: any) {
	// Secure this page with session cookie
	const sessionId = event.cookies.get(SESSION_COOKIE_NAME);

	if (!sessionId) {
		throw redirect(302, `/login`);
	}

	// Check if `auth` is initialized
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Validate the user's session
	const user = await auth.validateSession({ sessionId });

	// If validation fails, redirect the user to the login page
	if (!user) {
		throw redirect(302, `/login`);
	}

	// Return user data
	return {
		user
	};
}
