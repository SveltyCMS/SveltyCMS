import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load({ cookies }) {
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	let sessionId = cookies.get(SESSION_COOKIE_NAME);

	// If no session ID is found, create a new session
	if (!sessionId) {
		// console.log('Session ID is missing from cookies, creating a new session.');
		try {
			const newSession = await auth.createSession({ userId: 'guestuserId' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			sessionId = sessionCookie.value;
			// console.log('New session created:', sessionId);
		} catch (e) {
			console.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
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
