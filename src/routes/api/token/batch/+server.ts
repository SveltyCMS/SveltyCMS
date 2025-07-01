/**
 * @file src/routes/api/token/batch/+server.ts
 * @description Unified API endpoint for performing batch actions on tokens.
 *
 * This module provides a single endpoint to perform the following actions on one or more tokens:
 * - Delete tokens
 * - Block tokens
 * - Unblock tokens
 *
 * Each action is protected by its own specific permission and uses the corresponding
 * batch method defined in the authDBInterface for database-agnostic efficiency.
 *
 * @usage
 * POST /api/token/batch
 * @body {
 * "tokenIds": ["id1", "id2"],
 * "action": "delete"
 * }
 */

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// Validation
import { object, array, string, picklist, parse, type ValiError, minLength } from 'valibot';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks.server';

// System Logger
import { logger } from '@utils/logger.svelte';

const batchTokenActionSchema = object({
	tokenIds: array(string([minLength(1, 'Token ID cannot be empty.')])),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { tokenIds, action } = parse(batchTokenActionSchema, body);

		const hasPermission = hasPermissionByAction(
			locals.user,
			action,
			'token',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn(`Unauthorized attempt to '${action}' tokens.`, { userId: locals.user?._id });
			throw error(403, `Forbidden: You do not have permission to ${action} tokens.`);
		}

		const tokenAdapter = new TokenAdapter();
		let successMessage = '';

		switch (action) {
			case 'delete':
				await tokenAdapter.deleteTokens(tokenIds);
				successMessage = 'Tokens deleted successfully.';
				break;
			case 'block':
				await tokenAdapter.blockTokens(tokenIds);
				successMessage = 'Tokens blocked successfully.';
				break;
			case 'unblock':
				await tokenAdapter.unblockTokens(tokenIds);
				successMessage = 'Tokens unblocked successfully.';
				break;
		}

		// Invalidate the tokens cache so changes appear immediately in admin area
		invalidateAdminCache('tokens');

		logger.info(`Batch token action '${action}' completed.`, {
			affectedIds: tokenIds,
			executedBy: locals.user?._id,
		});

		return json({ success: true, message: successMessage });

	} catch (err) {
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for token batch API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in token batch API:', { error: message, stack: err instanceof Error ? err.stack : undefined, userId: locals.user?._id, status });
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};

