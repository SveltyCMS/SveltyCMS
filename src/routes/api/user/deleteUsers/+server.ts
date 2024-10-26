/**
 * @file src/routes/api/user/deleteUsers/+server.ts
 * @description API endpoint for deleting multiple users.
 *
 * This module provides functionality to:
 * - Delete multiple users in a single request
 *
 * Features:
 * - Bulk user deletion
 * - Permission checking
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteUsers
 * Body: JSON object with 'user_ids' property (array of user IDs)
 *
 * Note: This endpoint performs sensitive operations and should be
 * properly secured with authentication and authorization checks.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { array, object, string, type ValiError } from 'valibot';

const deleteUsersSchema = object({
	user_ids: array(string())
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if user is authenticated
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		// Check if the user has permission to delete users
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'config/userManagement',
			name: 'Delete Users',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to delete users');
		}

		const body = await request.json();

		// Validate input
		const validatedData = deleteUsersSchema.parse(body);
		const { user_ids } = validatedData;

		if (user_ids.length === 0) {
			logger.warn('Delete users attempt with empty user_ids array');
			throw error(400, 'At least one user ID is required');
		}

		// Check if auth system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Store auth in a const to ensure TypeScript knows it's not null in the callback
		const authInstance = auth;
		const deletedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				await authInstance.deleteUser(user_id);
				logger.info(`User deleted successfully with user ID: ${user_id}`);
				return user_id;
			})
		);

		return json({
			success: true,
			message: `${deletedUsers.length} users deleted successfully`,
			deletedUsers
		});
	} catch (err) {
		if ((err as ValiError).issues) {
			const valiError = err as ValiError;
			logger.warn('Invalid input for deleteUsers API:', valiError.issues);
			throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
		}

		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to delete users:', { error: errorMessage });
		throw error(500, 'Failed to delete users');
	}
};
