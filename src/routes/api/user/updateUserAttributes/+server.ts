/**
 * @file src/routes/api/user/updateUserAttributes/+server.ts
 * @description API endpoint for editing user attributes.
 *
 * This module provides functionality to:
 * - Update attributes of a specific user
 *
 * Features:
 * - User attribute updates using the agnostic auth interface
 * - Input validation and error handling
 * - Comprehensive logging for monitoring and debugging
 * - Secure error responses to prevent information leakage
 *
 * Usage:
 * PUT /api/user/updateUserAttributes
 * Body: JSON object with 'user_id' and 'newUserData' properties
 *
 * Note: Ensure proper validation of newUserData before applying changes.
 * This endpoint should be secured with appropriate authentication and authorization.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger';

export const PUT: RequestHandler = async ({ request }) => {
	try {
		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Parse the request body to get user data
		const { user_id, userData } = await request.json();
		logger.info(`Received data: user_id=${user_id}, userData=${JSON.stringify(userData)}`);

		// Validate that user_id and userData are provided
		if (!user_id || !userData) {
			logger.warn('Update user attributes attempt with missing data');
			throw error(400, 'User ID and new user data are required');
		}

		// Update the user attributes using the agnostic auth interface
		const updatedUser = await auth.updateUserAttributes(user_id, userData);

		logger.info(`User attributes updated successfully for user ID: ${user_id}`);

		// Return the updated user data
		return json({ success: true, message: 'User updated successfully', user: updatedUser });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Failed to update user attributes:', { error: errorMessage });
		return json({ success: false, error: `Failed to update user attributes: ${error.message}` }, { status: 500 });
	}
};
