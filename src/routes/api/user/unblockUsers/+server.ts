/**
 * @file src/routes/api/user/unblockUsers/+server.ts
 * @description API endpoint for unblocking multiple users.
 *
 * This module provides functionality to:
 * - Unblock multiple users simultaneously.
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for the unblock action.
 * - Bulk user unblocking.
 * - Input validation using Valibot.
 * - Error handling and logging.
 *
 * Usage:
 * PUT /api/user/unblockUsers
 * Body: JSON object with 'user_ids' property (array of user IDs)
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, array, string, minLength, parse, type ValiError } from 'valibot';

// Define the expected shape of the request body for validation.
const unblockUsersSchema = object({
	user_ids: array(string(), [minLength(1, 'At least one user ID must be provided.')])
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// Specific permission check
		const hasPermission = hasPermissionByAction(
			locals.user,
			'update', // The action being performed
			'user',   // The context type
			'any',    // The scope
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to unblock users', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to unblock users.');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const body = await request.json();

		// Validate the incoming request body against the schema.
		const { user_ids } = parse(unblockUsersSchema, body);

		// Process the unblocking request for each user ID.
		const unblockedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				// Set the 'blocked' flag to false for the user.
				await auth.updateUserAttributes(user_id, { blocked: false });
				logger.info('User unblocked successfully', { unblockedUserId: user_id, unblockedBy: locals.user?._id });
				return user_id;
			})
		);

		logger.info(`${unblockedUsers.length} users were unblocked successfully.`, { unblockedBy: locals.user?._id });

		return json({
			success: true,
			message: `${unblockedUsers.length} users unblocked successfully.`,
			unblockedUsers
		});
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for unblockUsers API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while unblocking users.';

		logger.error('Error in unblockUsers API:', {
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
