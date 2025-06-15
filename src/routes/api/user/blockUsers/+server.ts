/**
 * @file src/routes/api/user/blockUsers/+server.ts
 * @description API endpoint for blocking multiple users.
 *
 * This module provides functionality to:
 * - Block multiple users simultaneously
 * - Invalidate all sessions for blocked users
 *
 * Features:
 * - **Defense in Depth**: Specific permission check for the block action.
 * - Bulk user blocking with session invalidation.
 * - **Critical Safeguard**: Prevents blocking the last remaining admin user.
 * - Input validation using Valibot.
 * - Error handling and logging.
 *
 * Usage:
 * POST /api/user/blockUsers
 * Body: JSON object with 'user_ids' (array of user IDs)
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

// System logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { array, object, string, type ValiError, minLength, parse } from 'valibot';

// Define the expected shape of the request body for validation.
const blockUsersSchema = object({
	user_ids: array(string(), [minLength(1, 'At least one user ID must be provided.')])
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// TWO-LEVEL PERMISSION SYSTEM: Check if user has admin permissions
		const hasPermission = hasPermissionByAction(
			locals.user,
			'update', // The action being performed
			'user',   // The context type
			'any',    // The scope (any user)
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to block users', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to block users.');
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const body = await request.json();

		// Validate the request body against the schema.
		const { user_ids } = parse(blockUsersSchema, body);

		// CRITICAL SAFEGUARD: Prevent blocking all admin users
		const allUsers = await auth.getAllUsers();
		const adminCount = allUsers.filter((u) => u.isAdmin).length;

		// Check how many of the users being blocked are admins.
		const adminsToBeBlocked = allUsers.filter(u => user_ids.includes(u._id.toString()) && u.isAdmin).length;

		// If the number of remaining admins would be zero or less, block the action.
		if (adminCount > 0 && adminCount - adminsToBeBlocked <= 0) {
			logger.warn('Attempt to block the last remaining admin(s) was prevented.', {
				requestedBy: locals.user?._id,
				adminCount,
				adminsToBeBlocked
			});
			throw error(400, 'Cannot block all administrators. At least one must remain.');
		}

		// Process the blocking request for each user.
		const blockedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				// Immediately invalidate all sessions for the user to log them out everywhere.
				await auth.invalidateAllUserSessions(user_id);
				// Set the 'blocked' flag on the user's record.
				await auth.updateUserAttributes(user_id, { blocked: true });
				logger.info('User blocked successfully', { userId: user_id, blockedBy: locals.user?._id });
				return user_id;
			})
		);

		logger.info(`${blockedUsers.length} users were blocked successfully.`, { blockedBy: locals.user?._id });

		return json({
			success: true,
			message: `${blockedUsers.length} users blocked successfully.`,
			blockedUsers
		});
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for blockUsers API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while trying to block users.';

		logger.error('Error in blockUsers API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});

		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
