/**
 * @file src/routes/api/user/login/+server.ts
 * @description API endpoint for user login
 *
 * This endpoint handles user authentication:
 * - Validates user credentials (email and password)
 * - Creates a new session for authenticated users
 * - Sets a session cookie for persistent authentication
 *
 * The endpoint integrates with the SvelteKit error handling system
 * and respects the authentication flow established in hooks.server.ts.
 *
 * @throws {error} 401 - Invalid credentials
 * @throws {error} 400 - Already authenticated
 * @throws {error} 500 - Internal server error or authentication system unavailable
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '@src/databases/db';
import { logger } from '@utils/logger';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Check if user is already authenticated
	if (locals.user) {
		logger.warn('Already authenticated user attempting to log in');
		throw error(400, 'Already authenticated');
	}

	const { email, password } = await request.json();

	try {
		const user = await auth.getUserByEmail(email);
		if (!user || !user.password) {
			logger.warn(`Login attempt failed: User not found or password not set for email: ${email}`);
			throw error(401, 'Invalid credentials');
		}

		const argon2 = await import('argon2');
		const isValidPassword = await argon2.verify(user.password, password);

		if (!isValidPassword) {
			logger.warn(`Login attempt failed: Invalid password for user: ${email}`);
			throw error(401, 'Invalid credentials');
		}

		const session = await auth.createSession({ user_id: user._id, expires: new Date(Date.now() + 3600 * 1000) });
		const sessionCookie = auth.createSessionCookie(session);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

		logger.info(`User logged in successfully: ${user._id}`);
		return json({ success: true, message: 'Login successful' });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Login error:', { error: errorMessage });
		return json({ success: false, error: `An error occurred during login: ${error.message}` }, { status: 500 });
	}
};
