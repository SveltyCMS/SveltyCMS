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

import { getPrivateSettingSync } from '@src/services/settingsService';

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';

// Validation
import { array, minLength, object, parse, picklist, string, type ValiError } from 'valibot';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks/handleAuthorization';

// System Logger
import { logger } from '@utils/logger.svelte';

const batchTokenActionSchema = object({
	tokenIds: array(string([minLength(1, 'Token ID cannot be empty.')])),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user, tenantId } = locals; // Destructure user and tenantId
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { tokenIds, action } = parse(batchTokenActionSchema, body);
		// Authentication is handled by hooks.server.ts - user presence confirms access

		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}

		// --- MULTI-TENANCY SECURITY CHECK ---
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			// Use auth.getAllTokens if available to verify ownership
			try {
				const filter = { tenantId } as { tenantId?: string };
				const { tokens } = await auth.getAllTokens(filter);
				const tokenSet = new Set(tokens.map((t) => t.token));
				const allOwned = tokenIds.every((id) => tokenSet.has(id));
				if (!allOwned) {
					logger.warn('Attempt to act on tokens outside of tenant', { userId: user?._id, tenantId, requestedTokenIds: tokenIds });
					throw error(403, 'Forbidden: One or more tokens do not belong to your tenant or do not exist.');
				}
			} catch (verifyErr) {
				logger.error('Failed to verify tenant token ownership', { error: verifyErr });
				throw error(500, 'Failed to verify token ownership');
			}
		}

		let successMessage = '';

		// Directly invoke database-agnostic methods (now bound in auth adapter)
		switch (action) {
			case 'delete': {
				await auth.deleteTokens(tokenIds, tenantId);
				successMessage = 'Tokens deleted successfully.';
				break;
			}
			case 'block': {
				await auth.blockTokens(tokenIds, tenantId);
				successMessage = 'Tokens blocked successfully.';
				break;
			}
			case 'unblock': {
				await auth.unblockTokens(tokenIds, tenantId);
				successMessage = 'Tokens unblocked successfully.';
				break;
			}
		}
		// Invalidate the tokens cache so changes appear immediately in admin area
		invalidateAdminCache('tokens', tenantId);

		logger.info(`Batch token action '${action}' completed.`, {
			affectedIds: tokenIds,
			executedBy: user?._id,
			tenantId
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
