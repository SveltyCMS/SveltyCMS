/**
 * @file src/routes/api/user/deleteUsers/+server.ts
 * @description API endpoint for deleting multiple users.
 *
 * This is a highly sensitive and destructive endpoint. It should only be
 * accessible to top-level administrators.
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for user deletion.
 * - **Critical Safeguard**: Prevents deletion of the requesting admin or the last admin.
 * - Bulk user deletion.
 * - Input validation and robust error handling.
 *
 * Usage:
 * DELETE /api/user/deleteUsers
 * Body: JSON object with 'user_ids' (array of user IDs)
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { array, object, string, parse, type ValiError, minLength } from 'valibot';

// Define the expected shape of the request body for validation.
const deleteUsersSchema = object({
	user_ids: array(string(), [minLength(1, 'At least one user ID must be provided.')])
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		// Specific permission check
		const hasPermission = hasPermissionByAction(
			locals.user,
			'delete', // The action being performed
			'user',   // The context type
			'any',    // The scope
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to delete users', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to delete users.');
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const body = await request.json();

		// Validate the request body against the schema.
		const { user_ids } = parse(deleteUsersSchema, body);

		// **CRITICAL SAFEGUARD #1**: Prevent an admin from deleting their own account.
		if (user_ids.includes(locals.user._id)) {
			logger.warn('An administrator attempted to delete their own account.', { adminId: locals.user._id });
			throw error(400, 'Cannot delete your own user account.');
		}

		// Prevent deletion of the last admin.
		const allUsers = await auth.getAllUsers();
		const adminCount = allUsers.filter(u => u.isAdmin).length;
		const adminsToBeDeleted = allUsers.filter(u => user_ids.includes(u._id.toString()) && u.isAdmin).length;

		if (adminCount > 0 && adminCount - adminsToBeDeleted <= 0) {
			logger.warn('Attempt to delete the last remaining admin(s) was prevented.', {
				requestedBy: locals.user?._id,
				adminCount,
				adminsToBeDeleted
			});
			throw error(400, 'Cannot delete all administrators. At least one must remain.');
		}

		// Process the deletion request for each user ID.
		const deletedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				await auth.deleteUser(user_id);
				logger.info('User deleted successfully', { deletedUserId: user_id, deletedBy: locals.user?._id });
				return user_id;
			})
		);

		return json({
			success: true,
			message: `${deletedUsers.length} users deleted successfully.`,
			deletedUsers
		});
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for deleteUsers API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while deleting users.';

		logger.error('Error in deleteUsers API:', {
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
