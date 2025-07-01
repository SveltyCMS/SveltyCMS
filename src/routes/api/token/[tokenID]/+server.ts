/**
 * @file src/routes/api/token/[tokenId]/+server.ts
 * @description API endpoint for updating an existing token.
 *
 * This module is responsible for:
 * - Updating an existing token's data (e.g., email, role, expiration).
 * - Requires 'update:token' permission.
 * - Adheres to the authDBInterface for database-agnostic operations.
 *
 * @usage
 * PUT /api/token/{tokenId}
 * @body {
 * "newTokenData": {
 * "email": "new@example.com",
 * "role": "admin"
 * }
 * }
 */
import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// Validation
import { object, any, parse, type ValiError } from 'valibot';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks.server';

// System logger
import { logger } from '@utils/logger.svelte';

const editTokenSchema = object({
	newTokenData: any() // Keep it flexible, specific validation can be added
});

export const PUT: RequestHandler = async ({ request, params, locals }) => {
	try {
		const tokenId = params.tokenID;
		if (!tokenId) {
			throw error(400, 'Token ID is required in the URL path.');
		}

		const hasPermission = hasPermissionByAction(
			locals.user,
			'update',
			'token',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn(`Unauthorized attempt to edit token ${tokenId}.`, { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to edit tokens.');
		}

		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { newTokenData } = parse(editTokenSchema, body);

		const tokenAdapter = new TokenAdapter();

		// FIX: Using the now-defined `updateToken` method from the interface
		await tokenAdapter.updateToken(tokenId, newTokenData);

		logger.info('Token updated successfully', { tokenId, updateData: newTokenData });

		// Invalidate the tokens cache so the UI updates immediately
		invalidateAdminCache('tokens');

		return json({ success: true, message: 'Token updated successfully.' });
	} catch (err) {
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for edit token API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in edit token API:', { error: message, stack: err instanceof Error ? err.stack : undefined, userId: locals.user?._id, status });
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const tokenId = params.tokenID;
		if (!tokenId) {
			throw error(400, 'Token ID is required in the URL path.');
		}

		const hasPermission = hasPermissionByAction(
			locals.user,
			'delete',
			'token',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn(`Unauthorized attempt to delete token ${tokenId}.`, { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to delete tokens.');
		}

		const tokenAdapter = new TokenAdapter();
		await tokenAdapter.deleteTokens([tokenId]);

		// Invalidate the tokens cache so the deleted token disappears immediately from admin area
		invalidateAdminCache('tokens');

		logger.info(`Token ${tokenId} deleted successfully`, { executedBy: locals.user?._id });

		return json({ success: true, message: 'Token deleted successfully.' });

	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in delete token API:', { error: message, stack: err instanceof Error ? err.stack : undefined, userId: locals.user?._id, status });
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};

