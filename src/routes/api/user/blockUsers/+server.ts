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
 * - Input validation using Valibot
 * - Error handling and logging
 *
 * Usage:
 * POST /api/user/blockUsers
 * Body: JSON object with 'user_ids' property (array of user IDs)
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';

// System logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { array, object, string, type ValiError, minLength } from 'valibot';

const blockUsersSchema = object({
	user_ids: array(string(), [minLength(1, 'At least one user ID must be provided')])
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to block users
		const hasPermission = hasPermissionByAction(
			locals.user,
			'manage',
			'system',
			'config/userManagement'
		);

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
		const { user_ids } = blockUsersSchema.parse(body);

		// Get all users to check admin status
		const allUsers = await auth.getAllUsers();
		const adminCount = allUsers.filter((user) => user.isAdmin).length;

		// Check how many admins would be blocked
		const usersToBlock = allUsers.filter(user => user_ids.includes(user._id.toString()));
		const adminsToBeBlocked = usersToBlock.filter(user => user.isAdmin).length;

		if (adminCount - adminsToBeBlocked <= 0) {
			logger.warn('Attempt to block the last remaining admin(s).');
			throw error(400, 'Cannot block all admins');
		}

		const blockedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				await auth.invalidateAllUserSessions(user_id);
				await auth.updateUserAttributes(user_id, { blocked: true });
				logger.info('User blocked successfully', { userId: user_id });
				return user_id;
			})
		);

		logger.info('Users blocked successfully', { blockedCount: blockedUsers.length });
		return json({
			success: true,
			message: `${blockedUsers.length} users blocked successfully`,
			blockedUsers
		});
	} catch (err) {
		if ((err as ValiError).issues) {
			const valiError = err as ValiError;
			logger.warn('Invalid input for blockUsers API:', valiError.issues);
			throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
		}
		logger.error('Error in blockUsers API:', err);
		throw error(500, 'Failed to block users');
	}
};
