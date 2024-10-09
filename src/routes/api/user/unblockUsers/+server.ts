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
 * - Input validation using Zod
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
import { permissionCheck } from '@src/auth/permissionCheck';

// System logger
import { logger } from '@utils/logger';

// Input validation
import { z } from 'zod';

const unblockUsersSchema = z.object({
	user_ids: z.array(z.string()).nonempty()
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to unblock users
		const hasPermission = await permissionCheck(locals.user, {
			contextId: 'config/userManagement',
			requiredRole: 'admin',
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
		if (err instanceof z.ZodError) {
			logger.warn('Invalid input for unblockUsers API:', err.errors);
			throw error(400, 'Invalid input: ' + err.errors.map((e) => e.message).join(', '));
		}
		logger.error('Error in unblockUsers API:', err);
		throw error(500, 'Failed to unblock users');
	}
};
