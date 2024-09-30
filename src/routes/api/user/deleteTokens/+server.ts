/**
 * @file src/routes/api/user/deleteTokens/+server.ts
 * @description API endpoint for deleting all tokens (sessions) for a user.
 *
 * This module provides functionality to:
 * - Invalidate all active sessions for a specific user
 *
 * Features:
 * - User-specific session invalidation
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteTokens
 * Body: JSON object with 'user_id' property
 *
 * Note: This endpoint should be properly secured with authentication and authorization checks.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			logger.warn('Delete tokens attempt without user_id');
			return new Response(JSON.stringify({ message: 'User ID is required' }), { status: 400 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		await auth.invalidateAllUserSessions(user_id);
		logger.info(`All tokens deleted successfully for user ID: ${user_id}`);
		return new Response(JSON.stringify({ success: true, message: 'All tokens deleted successfully' }), { status: 200 });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Failed to delete tokens: ${errorMessage}`);
		return new Response(JSON.stringify({ success: false, message: 'Failed to delete tokens' }), { status: 500 });
	}
};
