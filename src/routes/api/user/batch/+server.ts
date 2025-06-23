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

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';
import { logger } from '@utils/logger.svelte';
import { object, array, string, picklist, parse, type ValiError, minLength } from 'valibot';

const batchUserActionSchema = object({
	userIds: array(string([minLength(1, 'User ID cannot be empty.')])),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { userIds, action } = parse(batchUserActionSchema, body);

		const hasPermission = hasPermissionByAction(
			locals.user,
			action,
			'user',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn(`Unauthorized attempt to '${action}' users.`, { userId: locals.user?._id });
			throw error(403, `Forbidden: You do not have permission to ${action} users.`);
		}

		if (userIds.some(id => id === locals.user?._id)) {
			throw error(400, "You cannot perform batch actions on your own account.");
		}

		const userAdapter = new UserAdapter();
		let successMessage = '';

		switch (action) {
			case 'delete':
				await userAdapter.deleteUsers(userIds);
				successMessage = 'Users deleted successfully.';
				break;
			case 'block':
				await userAdapter.blockUsers(userIds);
				successMessage = 'Users blocked successfully.';
				break;
			case 'unblock':
				await userAdapter.unblockUsers(userIds);
				successMessage = 'Users unblocked successfully.';
				break;
		}

		logger.info(`Batch user action '${action}' completed.`, {
			affectedIds: userIds,
			executedBy: locals.user?._id,
		});

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
		logger.error('Error in user batch API:', { error: message, stack: err instanceof Error ? err.stack : undefined, userId: locals.user?._id, status });
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};

