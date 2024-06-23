import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load({ cookies }) {
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Get session cookie value as string
	let sessionId = cookies.get(SESSION_COOKIE_NAME);

	// If no session ID is found, create a new session
	if (!sessionId) {
		// console.log('Session ID is missing from cookies, creating a new session.');
		try {
			const newSession = await auth.createSession({ userId: 'guestUserId' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			sessionId = sessionCookie.value;
			// console.log('New session created:', sessionId);
		} catch (e) {
			console.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
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
