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

import { json, error, type RequestHandler } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { user_id, newUserData } = await request.json();
		logger.info(`Received data: user_id=${user_id}, newUserData=${JSON.stringify(newUserData)}`);

		// Validate that user_id and newUserData are provided
		if (!user_id || !newUserData) {
			logger.warn('Edit user attempt with missing data');
			throw error(400, 'User ID and new user data are required');
		}

		// Update the user attributes using your auth adapter
		const updatedUser = await auth.updateUserAttributes(user_id, newUserData);

		logger.info(`User edited successfully with user ID: ${user_id}`);

		// Return the updated user data or a success message
		return json({ success: true, message: 'User updated successfully', user: updatedUser });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Failed to edit user: ${errorMessage}`);
		throw error(500, 'Failed to edit user');
	}
};
