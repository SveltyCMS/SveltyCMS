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
 * - Input validation using Zod
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
import { permissionCheck } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { z } from 'zod';

const updateUserAttributesSchema = z.object({
	user_id: z.string(),
	userData: z
		.object({
			email: z.string().email().optional(),
			username: z.string().min(2).max(50).optional(),
			role: z.string().optional()
			// Add other fields as needed, matching your User type
		})
		.strict()
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to update user attributes
		const hasPermission = await permissionCheck(locals.user, {
			contextId: 'config/userManagement',
			requiredRole: 'admin',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to update user attributes');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const body = await request.json();

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
		if (err instanceof z.ZodError) {
			logger.warn('Invalid input for updateUserAttributes API:', err.errors);
			throw error(400, 'Invalid input: ' + err.errors.map((e) => e.message).join(', '));
		}
		logger.error('Error in updateUserAttributes API:', err);
		throw error(500, 'Failed to update user attributes');
	}
};
