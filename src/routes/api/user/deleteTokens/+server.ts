/**
 * @file src/routes/api/user/deleteTokens/+server.ts
 * @description API endpoint for deleting all tokens (sessions) for a user.
 *
 * This module provides functionality to:
 * - Invalidate all active sessions for a specific user
 *
 * Features:
 * - User-specific session invalidation
 * - Permission checking
 * - Input validation
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteTokens
 * Body: JSON object with 'user_id' property
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { object, string, type ValiError } from 'valibot';

const deleteTokensSchema = object({
	user_id: string()
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if user is authenticated
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		// Check if the user has permission to delete tokens
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'config/userManagement',
			name: 'Delete User Tokens',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to delete user tokens');
		}

		const body = await request.json();

		// Validate input
		const validatedData = deleteTokensSchema.parse(body);

		const tokenAdapter = new TokenAdapter();

		// Delete all tokens for the user
		await tokenAdapter.deleteAllUserTokens(validatedData.user_id);

		logger.info('All tokens deleted successfully', {
			user_id: validatedData.user_id
		});

		return json({
			success: true,
			message: 'All tokens deleted successfully'
		});
	} catch (err) {
		if ((err as ValiError).issues) {
			const valiError = err as ValiError;
			logger.warn('Invalid input for deleteTokens API:', valiError.issues);
			throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
		}
		logger.error('Error in deleteTokens API:', err);
		throw error(500, 'Failed to delete tokens');
	}
};
