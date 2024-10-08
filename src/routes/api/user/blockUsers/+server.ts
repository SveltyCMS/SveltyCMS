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
 * - Error handling and logging
 *
 * Usage:
 * POST /api/user/blockUsers
 * Body: JSON array of user objects with 'id' and 'role' properties
 *
 * Note: This endpoint performs sensitive operations and should be
 * properly secured with authentication and authorization checks.
 */

import type { RequestHandler } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// System logger
import { logger } from '@utils/logger';

interface UserToBlock {
	id: string;
	role: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const users: UserToBlock[] = await request.json();
		logger.info('Received request to block users', { userIds: users.map((user) => user.id) });

		if (!auth) {
			logger.error('Auth is not initialized');
			return new Response(JSON.stringify({ success: false, message: 'Auth is not initialized' }), { status: 500 });
		}

		const allUsers = await auth.getAllUsers();
		const adminCount = allUsers.filter((user) => user.isAdmin).length;
		let remainingAdminCount = adminCount;

		for (const user of users) {
			if (user.isAdmin) {
				remainingAdminCount--;
				if (remainingAdminCount === 0) {
					logger.warn('Attempt to block the last remaining admin.');
					return new Response(JSON.stringify({ success: false, message: 'Cannot block all admins' }), { status: 400 });
				}
			}

			await auth.invalidateAllUserSessions(user.id);
			await auth.updateUserAttributes(user.id, { blocked: true });
			logger.info('User blocked successfully', { userId: user.id });
		}

		logger.info('Users blocked successfully.', { blockedCount: users.length });
		return new Response(JSON.stringify({ success: true, message: `${users.length} users blocked successfully` }), { status: 200 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error blocking user:', { error: errorMessage });
		return json({ success: false, error: `An error occurred for blocking the user: ${error.message}` }, { status: 500 });
	}
};
