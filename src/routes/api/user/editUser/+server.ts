/**
 * @file src/routes/api/user/editUser/+server.ts
 * @description API endpoint for editing user attributes.
 *
 * This module provides functionality to:
 * - Update attributes of a specific user
 *
 * Features:
 * - User data modification
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/editUser
 * Body: JSON object with 'user_id' and 'newUserData' properties
 *
 * Note: Ensure proper validation of newUserData before applying changes.
 * This endpoint should be secured with appropriate authentication and authorization.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
// Auth
import { auth } from '@src/databases/db';
// System Logger
import logger from '@src/utils/logger';

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { user_id, newUserData } = await request.json();

		if (!user_id || !newUserData) {
			logger.warn('Edit user attempt with missing data');
			return new Response(JSON.stringify({ success: false, message: 'User ID and new user data are required' }), { status: 400 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		await auth.updateUserAttributes(user_id, newUserData);
		logger.info(`User edited successfully with user ID: ${user_id}`);
		return new Response(JSON.stringify({ success: true, message: 'User updated successfully' }), { status: 200 });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Failed to edit user: ${errorMessage}`);
		return new Response(JSON.stringify({ success: false, message: 'Failed to edit user' }), { status: 500 });
	}
};
