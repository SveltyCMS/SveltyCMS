/**
 * @file src/routes/api/user/unblockUsers/+server.ts
 * @description API endpoint for unblocking multiple users.
 *
 * This module provides functionality to:
 * - Unblock multiple users simultaneously
 *
 * Features:
 * - Bulk user unblocking
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/unblockUsers
 * Body: JSON object with 'user_ids' property (array of user IDs)
 *
 * Note: This endpoint performs sensitive operations and should be
 * properly secured with authentication and authorization checks.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// Import logger
import { logger } from '@utils/logger';

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { user_ids } = await request.json();

		if (!Array.isArray(user_ids) || user_ids.length === 0) {
			logger.warn('Unblock users attempt with invalid user_ids');
			return new Response(JSON.stringify({ success: false, message: 'Valid user IDs array is required' }), { status: 400 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const unblockedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				await auth.updateUserAttributes(user_id, { blocked: false });
				logger.info(`User unblocked successfully with user ID: ${user_id}`);
				return user_id;
			})
		);

		return new Response(
			JSON.stringify({
				success: true,
				message: `${unblockedUsers.length} users unblocked successfully`,
				unblockedUsers
			}),
			{ status: 200 }
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Failed to unblock users:', { error: errorMessage });
		return json({ success: false, error: `Failed to unblock users: ${error.message}` }, { status: 500 });
	}
};
