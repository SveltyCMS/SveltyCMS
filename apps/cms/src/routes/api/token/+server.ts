/**
 * @file src/routes/api/token/+server.ts
 * @description API endpoint for listing all tokens.
 *
 * This module is responsible for:
 * - Retrieving all tokens for the current tenant
 * - Requires admin authentication (handled by hooks)
 *
 * @usage
 * GET /api/token
 * @returns {
 *   "success": true,
 *   "data": {
 *     "tokens": [...],
 *     "count": 10
 *   }
 * }
 *
 * @note Token creation has been moved to /api/token/createToken
 * @note Token editing has been consolidated to /api/token/[tokenID]
 */
import { getPrivateSettingSync } from '@shared/services/settingsService';

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth (Database Agnostic)
import { auth } from '@shared/database/db';

// System logger
import { logger } from '@shared/utils/logger.server';

export const GET: RequestHandler = async ({ locals }) => {
	const { tenantId } = locals; // User and permissions are guaranteed by hooks

	try {
		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}

		// Build filter for multi-tenant scenarios
		const filter = getPrivateSettingSync('MULTI_TENANT') && tenantId ? { tenantId } : {};

		const result = await auth.getAllTokens(filter);

		if (!result.success) {
			throw error(500, 'Failed to retrieve tokens');
		}

		logger.info('Tokens retrieved successfully', {
			count: result.data?.length || 0,
			requestedBy: locals.user?._id,
			tenantId
		});

		return json({
			success: true,
			data: {
				tokens: result.data || [],
				count: result.data?.length || 0
			}
		});
	} catch (err: unknown) {
		const httpError = err as { status?: number; body?: { message?: string } };
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';

		logger.error('Error retrieving tokens:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});

		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
