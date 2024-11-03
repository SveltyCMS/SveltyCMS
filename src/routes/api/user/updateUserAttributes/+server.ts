/**
 * @file src/routes/api/user/updateUserAttributes/+server.ts
 * @description API endpoint for editing user attributes.
 *
 * This module provides functionality to:
 * - Update attributes of a specific user
 *
 * Features:
 * - User attribute updates using the agnostic auth interface
 * - Permission checking
 * - Input validation using Valibot
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/updateUserAttributes
 * Body: JSON object with 'user_id' and 'userData' properties
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { object, string, email, optional, minLength, maxLength, pipe, type ValiError } from 'valibot';

const userDataSchema = object(
	{
		email: optional(pipe(string(), email())),
		username: optional(
			pipe(string(), minLength(2, 'Username must be at least 2 characters'), maxLength(50, 'Username must not exceed 50 characters'))
		),
		role: optional(string()),
		password: optional(pipe(string(), minLength(8, 'Password must be at least 8 characters')))
	},
	{ strict: true }
);

const updateUserAttributesSchema = object({
	user_id: string(),
	userData: userDataSchema
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const { user_id, userData } = body;

		// Special handling for password changes - user can only change their own password
		if (userData.password && user_id !== locals.user?._id) {
			const { hasPermission } = await checkUserPermission(locals.user, {
				contextId: 'config/userManagement',
				name: 'Update User Attributes',
				action: 'manage',
				contextType: 'system'
			});

			if (!hasPermission) {
				throw error(403, "Unauthorized to change other user's password");
			}
		}

		// For other attribute changes, check general permission
		if (Object.keys(userData).some((key) => key !== 'password')) {
			const { hasPermission } = await checkUserPermission(locals.user, {
				contextId: 'config/userManagement',
				name: 'Update User Attributes',
				action: 'manage',
				contextType: 'system'
			});

			if (!hasPermission) {
				throw error(403, 'Unauthorized to update user attributes');
			}
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Validate input
		const validatedData = updateUserAttributesSchema.parse(body);

		// Update the user attributes using the agnostic auth interface
		const updatedUser = await auth.updateUserAttributes(validatedData.user_id, validatedData.userData);

		logger.info('User attributes updated successfully', {
			user_id: validatedData.user_id,
			updatedFields: Object.keys(validatedData.userData)
		});

		return json({
			success: true,
			message: 'User updated successfully',
			user: updatedUser
		});
	} catch (err) {
		if ((err as ValiError).issues) {
			const valiError = err as ValiError;
			logger.warn('Invalid input for updateUserAttributes API:', valiError.issues);
			throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
		}
		logger.error('Error in updateUserAttributes API:', err);
		throw error(500, 'Failed to update user attributes');
	}
};
