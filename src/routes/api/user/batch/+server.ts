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

import { privateEnv } from '@root/config/private';

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { auth } from '@src/databases/db';

// Validation
import { array, minLength, object, parse, picklist, string, type ValiError } from 'valibot';

// System Logger
import { logger } from '@utils/logger.svelte';

const batchUserActionSchema = object({
	userIds: array(string([minLength(1, 'User ID cannot be empty.')])),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user, tenantId } = locals; // Destructure tenantId from locals
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { userIds, action } = parse(batchUserActionSchema, body);

		// Authentication is handled by hooks.server.ts - user presence confirms access

		if (userIds.some((id) => id === user?._id)) {
			throw error(400, 'You cannot perform batch actions on your own account.');
		}

		if (!auth) {
			throw error(500, 'Authentication system is not initialized');
		}

		// --- MULTI-TENANCY SECURITY CHECK ---
		// Before performing any action, verify all target users belong to the current tenant.
		if (privateEnv.MULTI_TENANT) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			// Check if all users exist and belong to the tenant
			const userChecks = await Promise.all(
				userIds.map(async (userId) => {
					const userResult = await auth.db.getUserById(userId, tenantId);
					return userResult.success ? userResult.data : null;
				})
			);
			
			if (userChecks.some(user => user === null)) {
				logger.warn(`Attempt to act on users outside of tenant or non-existent users`, {
					userId: user?._id,
					tenantId,
					requestedUserIds: userIds
				});
				throw error(403, 'Forbidden: One or more user IDs do not belong to your tenant or do not exist.');
			}
		}

		let successMessage = '';

		switch (action) {
			case 'delete': {
				const result = await auth.db.deleteUsers(userIds, tenantId);
				if (!result.success) {
					throw error(500, `Failed to delete users: ${result.error}`);
				}
				successMessage = 'Users deleted successfully.';
				break;
			}
			case 'block': {
				const result = await auth.db.blockUsers(userIds, tenantId);
				if (!result.success) {
					throw error(500, `Failed to block users: ${result.error}`);
				}
				successMessage = 'Users blocked successfully.';
				break;
			}
			case 'unblock': {
				const result = await auth.db.unblockUsers(userIds, tenantId);
				if (!result.success) {
					throw error(500, `Failed to unblock users: ${result.error}`);
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
		// Invalidate admin cache since user data has changed

		const { invalidateAdminCache } = await import('@src/hooks.server');
		invalidateAdminCache('users', tenantId);

		return json({ success: true, message: successMessage });
	} catch (err) {
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for user batch API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in user batch API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
