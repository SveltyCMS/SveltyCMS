/**
 * @file src/routes/api/user/batch/+server.ts
 * @description Unified API endpoint for performing batch actions on users.
 *
 * This module provides a single endpoint to perform the following actions on one or more users:
 * - Delete users
 * - Block users
 * - Unblock users
 *
 * Each action is protected by its own specific permission and uses the corresponding
 * batch method defined in the authDBInterface for database-agnostic efficiency.
 *
 * @usage
 * POST /api/user/batch
 * @body {
 * "userIds": ["id1", "id2"],
 * "action": "block"
 * }
 */

import type { User } from '@src/databases/auth/types';
// Auth and permission helpers
import { auth } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

// System Logger
import { logger } from '@utils/logger.server';
// Validation
import { array, minLength, object, parse, picklist, pipe, string } from 'valibot';
import type { RequestHandler } from './$types';

const batchUserActionSchema = object({
	userIds: array(pipe(string(), minLength(1, 'User ID cannot be empty.'))),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});

export const POST: RequestHandler = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals; // Destructure tenantId from locals
	const body = await request.json().catch(() => {
		throw new AppError('Invalid JSON in request body', 400, 'INVALID_JSON');
	});
	const { userIds, action } = parse(batchUserActionSchema, body);

	// Authentication is handled by hooks.server.ts - user presence confirms access

	if (userIds.some((id) => id === user?._id)) {
		throw new AppError('You cannot perform batch actions on your own account.', 400, 'SELF_ACTION_DENIED');
	}

	if (!auth) {
		throw new AppError('Authentication system is not initialized', 500, 'AUTH_SYS_ERROR');
	}

	// --- MULTI-TENANCY SECURITY CHECK ---
	// Before performing any action, verify all target users belong to the current tenant.
	if (getPrivateSettingSync('MULTI_TENANT')) {
		if (!tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 500, 'TENANT_ERROR');
		}
		// Check if all users exist and belong to the tenant
		const userChecks = await Promise.all(
			userIds.map(async (userId) => {
				return await auth?.getUserById(userId, tenantId);
			})
		);
		if (userChecks.some((u: User | null) => u === null)) {
			logger.warn('Attempt to act on users outside of tenant or non-existent users', {
				userId: user?._id,
				tenantId,
				requestedUserIds: userIds
			});
			throw new AppError('Forbidden: One or more user IDs do not belong to your tenant or do not exist.', 403, 'FORBIDDEN_TENANT');
		}
	}

	let successMessage = '';

	switch (action) {
		case 'delete': {
			// Use optimized deleteUserAndSessions for each user to ensure sessions are cleaned up
			let totalDeleted = 0;
			let totalSessionsDeleted = 0;

			for (const userId of userIds) {
				const result = await auth.deleteUserAndSessions(userId, tenantId);
				if (result.success && result.data) {
					totalDeleted++;
					totalSessionsDeleted += result.data.deletedSessionCount || 0;
				} else {
					const errorMsg = !result.success && 'error' in result ? result.error?.message : 'Unknown error';
					logger.warn('Failed to delete user or sessions', {
						userId,
						error: errorMsg,
						tenantId
					});
				}
			}
			if (totalDeleted === 0) {
				throw new AppError('Failed to delete any users', 500, 'DELETE_FAILED');
			}

			successMessage =
				totalDeleted === userIds.length
					? `${totalDeleted} user(s) and ${totalSessionsDeleted} session(s) deleted successfully.`
					: `${totalDeleted} of ${userIds.length} user(s) deleted (${totalSessionsDeleted} sessions cleaned up). Some deletions failed.`;

			logger.info('User deletion completed', {
				requested: userIds.length,
				deleted: totalDeleted,
				sessionsDeleted: totalSessionsDeleted,
				tenantId
			});
			break;
		}
		case 'block': {
			const result = await auth.blockUsers(userIds, tenantId);
			if (!result.success) {
				throw new AppError(`Failed to block users: ${result.error}`, 500, 'BLOCK_FAILED');
			}
			successMessage = 'Users blocked successfully.';
			break;
		}
		case 'unblock': {
			const result = await auth.unblockUsers(userIds, tenantId);
			if (!result.success) {
				throw new AppError(`Failed to unblock users: ${result.error}`, 500, 'UNBLOCK_FAILED');
			}
			successMessage = 'Users unblocked successfully.';
			break;
		}
	}
	logger.info(`Batch user action '${action}' completed.`, {
		affectedIds: userIds,
		executedBy: user?._id,
		tenantId
	});
	// Invalidate user count cache since users were deleted
	const { invalidateUserCountCache } = await import('@src/hooks/handle-authorization');
	invalidateUserCountCache(tenantId);

	return json({ success: true, message: successMessage });
});
