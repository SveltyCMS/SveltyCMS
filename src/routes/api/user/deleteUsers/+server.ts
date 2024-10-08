/**
 * @file src/routes/api/user/deleteUsers/+server.ts
 * @description API endpoint for deleting multiple users.
 *
 * This module provides functionality to:
 * - Delete multiple users in a single request
 *
 * Features:
 * - Bulk user deletion
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteUsers
 * Body: JSON object with 'user_ids' property (array of user IDs)
 *
 * Note: This endpoint performs sensitive operations and should be
 * properly secured with authentication and authorization checks.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger';

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { user_ids } = await request.json();

		if (!Array.isArray(user_ids) || user_ids.length === 0) {
			logger.warn('Delete users attempt with invalid user_ids');
			return new Response(JSON.stringify({ message: 'Valid user IDs array is required' }), { status: 400 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const deletedUsers = await Promise.all(
			user_ids.map(async (user_id) => {
				await auth.deleteUser(user_id);
				logger.info(`User deleted successfully with user ID: ${user_id}`);
				return user_id;
			})
		);

		return new Response(JSON.stringify({ success: true, message: `${deletedUsers.length} users deleted successfully`, deletedUsers }), {
			status: 200
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Failed to delete users:', { error: errorMessage });
		return json({ success: false, error: `Failed to delete users: ${error.message}` }, { status: 500 });
	}
};
