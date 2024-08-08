/**
 * @file src/routes/api/auth/+server.ts
 * @description API endpoint for authentication operations.
 *
 * This module handles authentication-related operations:
 * - User sign out
 *
 * Features:
 * - Session management
 * - Cookie handling
 * - Error logging and handling
 *
 * Usage:
 * POST /api/auth
 * Body: FormData with 'authType' field
 * Supported authTypes: 'signOut'
 */

import type { Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logs
import logger from '@src/utils/logger';

// Define a POST request handler function
export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const formData = await request.formData();
		const authType = formData.get('authType');

		if (authType === 'signOut') {
			logger.debug('Sign out request received');
			return await signOut(cookies);
		} else {
			logger.warn('Invalid authType received', { authType });
			return new Response('Invalid auth type', { status: 400 });
		}
	} catch (error) {
		logger.error('Error processing auth request', { error: error.message });
		return new Response('Internal server error', { status: 500 });
	}
};

// Define an asynchronous function to sign out a user
async function signOut(cookies: Cookies): Promise<Response> {
	try {
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session found for sign out');
			return new Response('No session to sign out', { status: 400 });
		}

		await auth.destroySession(session_id);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		logger.info('User signed out successfully', { session_id });

		// Set a flag in the response to indicate successful signout
		return new Response(JSON.stringify({ status: 'success', signedOut: true }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				// Set a header to prevent automatic session creation
				'X-No-Session': 'true'
			}
		});
	} catch (err) {
		logger.error('Error signing out user', { error: err.message });
		return new Response(JSON.stringify({ status: 'error', message: 'Failed to sign out' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}
