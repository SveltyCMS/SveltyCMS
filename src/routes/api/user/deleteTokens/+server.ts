/**
 * @file src/routes/api/user/deleteTokens/+server.ts
 * @description API endpoint for deleting all session tokens for a user (force logout).
 *
 * This module provides functionality to:
 * - Invalidate all active sessions for a specific user.
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for session invalidation.
 * - User-specific session invalidation.
 * - Input validation using Valibot.
 * - Error handling and logging.
 *
 * Usage:
 * DELETE /api/user/deleteTokens
 * Body: JSON object with 'user_id' property
 */

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, parse, type ValiError, minLength } from 'valibot';

// Define the expected shape of the request body for validation.
const deleteTokensSchema = object({
	user_id: string([minLength(1, 'A user_id must be provided.')])
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		// **SECURITY**: This endpoint now checks for a specific permission.
		const hasPermission = hasPermissionByAction(
			locals.user,
			'update', // The action being performed
			'user',   // The context type
			'any',    // The scope
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to delete user sessions', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to delete user sessions.');
		}

		const body = await request.json();

		// Validate the request body against the schema.
		const { user_id } = parse(deleteTokensSchema, body);

		// Prevent an admin from deleting their own sessions via this endpoint
		if (locals.user?._id === user_id) {
			throw error(400, 'Cannot delete your own sessions via this endpoint. Please log out normally.');
		}

		const tokenAdapter = new TokenAdapter();

		// Delete all session tokens for the specified user
		await tokenAdapter.deleteAllUserTokens(user_id);

		logger.info('All session tokens deleted successfully for user.', {
			user_id: user_id,
			deletedBy: locals.user?._id
		});

		return json({
			success: true,
			message: 'All user sessions have been invalidated successfully.'
		});
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for deleteTokens API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while deleting user sessions.';

		logger.error('Error in deleteTokens API:', {
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
