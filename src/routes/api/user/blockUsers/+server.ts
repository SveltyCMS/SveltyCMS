/**
 * @file src/routes/api/user/blockUsers/+server.ts
 * @description API endpoint for blocking multiple users.
 *
 * This module provides functionality to:
 * - Block multiple users simultaneously
 * - Invalidate all sessions for blocked users
 * - Prevent blocking all admin users
 *
 * Features:
 * - Bulk user blocking
 * - Session invalidation for blocked users
 * - Admin count check to ensure at least one admin remains
 * - Permission checking
 * - Input validation using Zod
 * - Error handling and logging
 *
 * Usage:
 * POST /api/user/blockUsers
 * Body: JSON array of user objects with 'id' and 'role' properties
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System logger
import { logger } from '@utils/logger';

// Input validation
import { z } from 'zod';

const blockUsersSchema = z.array(
	z.object({
		id: z.string(),
		role: z.string()
	})
);

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to block users
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'config/userManagement',
			name: 'Block Users',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to block users');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const body = await request.json();

		// Validate input
		const users = blockUsersSchema.parse(body);

		const allUsers = await auth.getAllUsers();
		const adminCount = allUsers.filter((user) => user.isAdmin).length;
		let remainingAdminCount = adminCount;

		for (const user of users) {
			if (user.role === 'admin') {
				remainingAdminCount--;
				if (remainingAdminCount === 0) {
					logger.warn('Attempt to block the last remaining admin.');
					throw error(400, 'Cannot block all admins');
				}
			}

			await auth.invalidateAllUserSessions(user.id);
			await auth.updateUserAttributes(user.id, { blocked: true });
			logger.info('User blocked successfully', { userId: user.id });
		}

		logger.info('Users blocked successfully.', { blockedCount: users.length });
		return json({
			success: true,
			message: `${users.length} users blocked successfully`
		});
	} catch (err) {
		if (err instanceof z.ZodError) {
			logger.warn('Invalid input for blockUsers API:', err.errors);
			throw error(400, 'Invalid input: ' + err.errors.map((e) => e.message).join(', '));
		}
		logger.error('Error in blockUsers API:', err);
		throw error(500, 'Failed to block users');
	}
};
