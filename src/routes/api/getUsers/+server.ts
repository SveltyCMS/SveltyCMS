/**
 * @file src/routes/api/getUsers/+server.ts
 * @description API endpoint for retrieving all users (admin-only access).
 *
 * This module provides functionality to:
 * - Validate the admin user's session
 * - Retrieve all users from the database
 * - Format user data based on predefined table headers
 *
 * Features:
 * - Session-based authentication
 * - Admin-only access control
 * - User data formatting
 * - Error handling and logging
 *
 * Usage:
 * GET /api/getUsers
 * Requires: Valid admin session cookie
 * Returns: JSON array of formatted user data
 *
 * Note: This endpoint contains sensitive operations and should be properly secured.
 */

import type { RequestHandler } from './$types';

// Stores
import { tableHeaders } from '@src/stores/store';

// Auth
import { SESSION_COOKIE_NAME } from '@src/auth';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';

// System Loggger
import logger from '@src/utils/logger';

const sessionAdapter = new SessionAdapter();
const userAdapter = new UserAdapter();

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session ID provided');
			return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
		}

		// Validate the session by passing an object with the session_id property.
		const user = await sessionAdapter.validateSession(session_id);
		if (!user) {
			logger.warn('Invalid session');
			return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
		}

		if (user.role !== 'admin') {
			logger.warn('Non-admin access attempt', { userId: user.id });
			return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
		}

		// Get all users from the database.
		const allUsers = await userAdapter.getAllUsers();
		logger.info('Users retrieved successfully', { count: allUsers.length });

		const formattedUsers = allUsers.map((user) => tableHeaders.reduce((acc, header) => ({ ...acc, [header]: user[header] }), {}));

		// Return the formatted users as a JSON response.
		return new Response(JSON.stringify(formattedUsers), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		logger.error('Error fetching users:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch users' }), { status: 500 });
	}
};
