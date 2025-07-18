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
// Auth (Database Agnostic)
import { auth } from '@src/databases/db';
// TODO: Remove once blockTokens/unblockTokens are added to database-agnostic interface
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { checkApiPermission } from '@api/permissions';

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

		// Check permissions for token batch operations
		const permissionResult = await checkApiPermission(locals.user, {
			resource: 'system',
			action: action === 'delete' ? 'delete' : 'write'
		});

		if (!permissionResult.hasPermission) {
			logger.warn(`Unauthorized attempt to '${action}' tokens`, {
				userId: locals.user?._id,
				error: permissionResult.error
			});
			return json(
				{
					error: permissionResult.error || `Forbidden: You do not have permission to ${action} tokens.`
				},
				{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
			);
		}

		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}
		let successMessage = '';

		switch (action) {
			case 'delete': {
				// TODO: Add deleteTokens to database-agnostic interface
				const tokenAdapter = new TokenAdapter();
				await tokenAdapter.deleteTokens(tokenIds);
				successMessage = 'Tokens deleted successfully.';
				break;
			}
			case 'block': {
				// TODO: Add blockTokens to database-agnostic interface
				const tokenAdapter = new TokenAdapter();
				await tokenAdapter.blockTokens(tokenIds);
				successMessage = 'Tokens blocked successfully.';
				break;
			}
			case 'unblock': {
				// TODO: Add unblockTokens to database-agnostic interface
				const tokenAdapter = new TokenAdapter();
				await tokenAdapter.unblockTokens(tokenIds);
				successMessage = 'Tokens unblocked successfully.';
				break;
			}
		}

		// Invalidate the tokens cache so changes appear immediately in admin area
		invalidateAdminCache('tokens');

		logger.info(`Batch token action '${action}' completed.`, {
			affectedIds: tokenIds,
			executedBy: locals.user?._id
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
		logger.error('Error in token batch API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
