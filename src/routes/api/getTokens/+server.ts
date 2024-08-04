/**
 * @file src/routes/api/getTokens/+server.ts
 * @description API endpoint for retrieving all authentication tokens.
 *
 * This module handles GET requests to fetch all tokens:
 * - Validates the user's session
 * - Checks for admin privileges
 * - Retrieves all tokens from the authentication system
 *
 * Features:
 * - Session-based authentication
 * - Admin-only access
 * - Error handling and logging
 * - JSON response formatting
 *
 * Usage:
 * GET /api/getTokens
 * Requires: Admin authentication via session cookie
 * Returns: JSON array of all authentication tokens
 */

import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logger
import logger from '@src/utils/logger';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session ID found in cookies');
			return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
		}
		logger.debug('Session ID retrieved');

		// Check if the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
		}

		// Validate the session by passing an object with session_id property
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session');
			return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
		}
		logger.debug('User validated');

		// Check if the user has admin role
		if (user.role !== 'admin') {
			logger.warn('Non-admin access attempt');
			return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
		}

		// Get all tokens from the database
		const tokens = await auth.getAllTokens();
		logger.info('Tokens retrieved successfully');

		// Return the tokens as a JSON response
		return new Response(JSON.stringify(tokens), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		// Log and return an error response
		logger.error('Error fetching tokens:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch tokens' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
