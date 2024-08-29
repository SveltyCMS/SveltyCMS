// src/routes/(app)/dashboard/+page.server.ts

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth, initializationPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logger
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ cookies }) => {
	await initializationPromise;
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	let session_id = cookies.get(SESSION_COOKIE_NAME);

	// If no session ID is found, create a new session
	if (!session_id) {
		try {
			const newSession = await auth.createSession({ user_id: 'guestuser_id' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			session_id = sessionCookie.value;
			logger.info(`New session created: ${session_id}`);
		} catch (e) {
			logger.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
	}

	// Validate the user's session
	const user = await auth.validateSession({ session_id });

	// If validation fails, redirect the user to the login page
	if (!user) {
		logger.warn(`Invalid session for session_id: ${session_id}, redirecting to login.`);
		throw redirect(302, '/login');
	}

	const { _id, ...rest } = user;

	// Return user data with proper typing
	return {
		user: {
			id: _id.toString(),
			...rest
		}
	};
};
