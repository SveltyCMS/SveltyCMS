/**
 * @file src/routes/api/user/unblockUsers/+server.ts
 * @description API endpoint for unblocking multiple users.
 *
 * This module provides functionality to:
 * - Unblock multiple users simultaneously
 *
 * Features:
 * - Bulk user unblocking
 * - Permission checking
 * - Input validation using Valibot
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/unblockUsers
 * Body: JSON object with 'user_ids' property (array of user IDs)
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, array, string, minLength, type ValiError } from 'valibot';

const unblockUsersSchema = object({
	user_ids: array(string(), [minLength(1, 'At least one user ID must be provided')])
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to unblock users
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'config/userManagement',
			name: 'Unblock Users',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to unblock users');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const body = await request.json();

		// Validate input
		const { user_ids } = unblockUsersSchema.parse(body);

		const unblockedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				await auth.updateUserAttributes(user_id, { blocked: false });
				logger.info(`User unblocked successfully`, { userId: user_id });
				return user_id;
			})
		);

		logger.info('Users unblocked successfully', { unblockedCount: unblockedUsers.length });
		return json({
			success: true,
			message: `${unblockedUsers.length} users unblocked successfully`,
			unblockedUsers
		});
	} catch (err) {
		if ((err as ValiError).issues) {
			const valiError = err as ValiError;
			logger.warn('Invalid input for unblockUsers API:', valiError.issues);
			throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
		}
		logger.error('Error in unblockUsers API:', err);
		throw error(500, 'Failed to unblock users');
	}
};
