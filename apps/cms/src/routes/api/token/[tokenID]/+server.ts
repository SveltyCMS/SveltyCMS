/**
 * @file src/routes/api/token/[tokenId]/+se		// Authentication is handled by hooks.server.ts - user presence confirms accession API endpoint for updating an existing token.
 *
 * This module is responsible for:
 * - Updating an existing token's data (e.g., email, role, expiration) within the current tenant.
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
import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';

// Validation
import { any, object, parse, type ValiError } from 'valibot';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks/handleAuthorization';

// System logger
import { logger } from '@utils/logger.svelte';

// Minimal shared result type guards (kept local to avoid broad dependencies)
interface DatabaseResultLike<T> {
	success: boolean;
	data?: T;
	deletedCount?: number;
}
interface TokenLike {
	_id?: string;
	token?: string;
}
function isDatabaseResult<T>(val: unknown): val is DatabaseResultLike<T> {
	return !!val && typeof val === 'object' && 'success' in val;
}

const editTokenSchema = object({
	newTokenData: any() // Keep it flexible, specific validation can be added
});

export const PUT: RequestHandler = async ({ request, params, locals }) => {
	const { user, tenantId } = locals;
	try {
		const tokenId = params.tokenID;
		if (!tokenId) {
			throw error(400, 'Token ID is required in the URL path.');
		}
		// Authentication is handled by hooks.server.ts - user presence confirms access

		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { newTokenData } = parse(editTokenSchema, body);

		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}

		// --- MULTI-TENANCY SECURITY CHECK ---
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			const tokenToUpdate = await auth.getTokenByValue(tokenId);
			if (!tokenToUpdate || tokenToUpdate.tenantId !== tenantId) {
				logger.warn('Attempt to edit a token belonging to another tenant.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetTokenId: tokenId,
					targetTenantId: tokenToUpdate?.tenantId
				});
				throw error(403, 'Forbidden: You can only edit tokens within your own tenant.');
			}
		} // TODO: Use database-agnostic interface once updateToken is implemented

		// Use database-agnostic interface if available, with graceful fallback
		let updateResult: unknown = null;
		const possibleAuth: unknown = auth as unknown;
		if (
			possibleAuth &&
			typeof possibleAuth === 'object' &&
			'updateToken' in possibleAuth &&
			typeof (possibleAuth as { updateToken: unknown }).updateToken === 'function'
		) {
			updateResult = await (possibleAuth as { updateToken: (id: string, data: unknown) => unknown }).updateToken(tokenId, newTokenData);
		} else {
			// Fallback (should not normally execute once interface is standardized)
			const { TokenAdapter } = await import('@src/databases/mongodb/models/authToken');
			const tokenAdapter = new TokenAdapter();
			updateResult = await tokenAdapter.updateToken(tokenId, newTokenData);
		}

		// Handle possible return shapes: boolean | Token | DatabaseResult<Token>
		let updated = false;
		if (typeof updateResult === 'boolean') {
			updated = updateResult;
		} else if (isDatabaseResult<TokenLike>(updateResult)) {
			updated = updateResult.success === true;
		} else if (updateResult && typeof updateResult === 'object') {
			updated = true; // Assume object implies success (token object returned)
		}
		if (!updated) {
			throw error(404, 'Token not found or not modified');
		}

		logger.info('Token updated successfully', { tokenId, updateData: newTokenData, tenantId }); // Invalidate the tokens cache so the UI updates immediately

		invalidateAdminCache('tokens', tenantId);

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
		logger.error('Error in edit token API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user, tenantId } = locals;
	try {
		const tokenId = params.tokenID;
		if (!tokenId) {
			throw error(400, 'Token ID is required in the URL path.');
		}
		// Authentication is handled by hooks.server.ts - user presence confirms access

		// --- MULTI-TENANCY SECURITY CHECK ---
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			const tokenToDelete = await auth.getTokenByValue(tokenId);
			if (!tokenToDelete || tokenToDelete.tenantId !== tenantId) {
				logger.warn('Attempt to delete a token belonging to another tenant.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetTokenId: tokenId,
					targetTenantId: tokenToDelete?.tenantId
				});
				throw error(403, 'Forbidden: You can only delete tokens within your own tenant.');
			}
		}

		// Use database-agnostic interface if available, fallback to adapter
		let deletedCount: number | undefined;
		const maybeAuth: unknown = auth as unknown;
		if (
			maybeAuth &&
			typeof maybeAuth === 'object' &&
			'deleteTokens' in maybeAuth &&
			typeof (maybeAuth as { deleteTokens: unknown }).deleteTokens === 'function'
		) {
			const result = await (maybeAuth as { deleteTokens: (ids: string[]) => unknown }).deleteTokens([tokenId]);
			if (typeof result === 'number') {
				deletedCount = result;
			} else if (result && typeof result === 'object' && 'deletedCount' in result) {
				deletedCount = (result as { deletedCount?: number }).deletedCount;
			}
		} else {
			const { TokenAdapter } = await import('@src/databases/mongodb/models/authToken');
			const tokenAdapter = new TokenAdapter();
			deletedCount = await tokenAdapter.deleteTokens([tokenId]);
		}
		if (!deletedCount) {
			throw error(404, 'Token not found');
		} // Invalidate the tokens cache so the deleted token disappears immediately from admin area

		invalidateAdminCache('tokens', tenantId);

		logger.info(`Token ${tokenId} deleted successfully`, { executedBy: user?._id, tenantId });

		return json({ success: true, message: 'Token deleted successfully.' });
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in delete token API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
