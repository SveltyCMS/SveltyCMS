/**
 * @file src/routes/api/token/[tokenId]/+server.ts
 * @description API endpoint for updating an existing token.
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

// Cache invalidation
import { cacheService } from '@src/databases/cache-service';
// Auth
import { auth } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
// System logger
import { logger } from '@utils/logger.server';
// Validation
import { any, object, parse } from 'valibot';

// Minimal shared result type guards (kept local to avoid broad dependencies)
interface DatabaseResultLike<T> {
	data?: T;
	deletedCount?: number;
	success: boolean;
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

/**
 * GET /api/token/[tokenID]
 * Validates an invitation token - public endpoint for registration flow
 */
export const GET = apiHandler(async ({ params }) => {
	const tokenValue = params.tokenID;
	if (!tokenValue) {
		throw new AppError('Token ID is required in the URL path.', 400, 'MISSING_TOKEN_ID');
	}

	if (!auth) {
		logger.error('Database authentication adapter not initialized');
		throw new AppError('Database authentication not available', 500, 'DB_AUTH_ERROR');
	}

	// Get token by value (invite tokens use the value, not _id)
	const token = await auth.getTokenByValue(tokenValue);

	if (!token) {
		throw new AppError('Token not found', 404, 'TOKEN_NOT_FOUND');
	}

	// Check if token is expired
	const isExpired = token.expires ? new Date(token.expires) < new Date() : false;

	return json({
		success: true,
		data: {
			valid: !isExpired,
			email: token.email,
			expires: token.expires,
			type: token.type
		}
	});
});

export const PUT = apiHandler(async ({ request, params, locals }) => {
	const { user, tenantId } = locals;
	const tokenId = params.tokenID;
	if (!tokenId) {
		throw new AppError('Token ID is required in the URL path.', 400, 'MISSING_TOKEN_ID');
	}
	// Authentication is handled by hooks.server.ts - user presence confirms access

	const body = await request.json().catch(() => {
		throw new AppError('Invalid JSON in request body', 400, 'INVALID_JSON');
	});
	const { newTokenData } = parse(editTokenSchema, body);

	if (!auth) {
		logger.error('Database authentication adapter not initialized');
		throw new AppError('Database authentication not available', 500, 'DB_AUTH_ERROR');
	}

	// --- MULTI-TENANCY SECURITY CHECK ---
	if (getPrivateSettingSync('MULTI_TENANT')) {
		if (!tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 500, 'TENANT_REQUIRED');
		}
		const tokenToUpdate = await auth.getTokenByValue(tokenId);
		if (!tokenToUpdate || tokenToUpdate.tenantId !== tenantId) {
			logger.warn('Attempt to edit a token belonging to another tenant.', {
				adminId: user?._id,
				adminTenantId: tenantId,
				targetTokenId: tokenId,
				targetTenantId: tokenToUpdate?.tenantId
			});
			throw new AppError('Forbidden: You can only edit tokens within your own tenant.', 403, 'FORBIDDEN_TENANT');
		}
	}

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
		const { TokenAdapter } = await import('@src/databases/mongodb/models/auth-token');
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
		throw new AppError('Token not found or not modified', 404, 'TOKEN_UPDATE_FAILED');
	}

	logger.info('Token updated successfully', {
		tokenId,
		updateData: newTokenData,
		tenantId
	});

	// Invalidate the tokens cache so the UI updates immediately
	cacheService.delete('tokens', tenantId).catch((err) => {
		logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
	});

	return json({ success: true, message: 'Token updated successfully.' });
});

export const DELETE = apiHandler(async ({ params, locals }) => {
	const { user, tenantId } = locals;
	const tokenId = params.tokenID;
	if (!tokenId) {
		throw new AppError('Token ID is required in the URL path.', 400, 'MISSING_TOKEN_ID');
	}
	// Authentication is handled by hooks.server.ts - user presence confirms access

	// --- MULTI-TENANCY SECURITY CHECK ---
	if (getPrivateSettingSync('MULTI_TENANT')) {
		if (!tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 500, 'TENANT_REQUIRED');
		}
		if (!auth) {
			throw new AppError('Auth service is not initialized', 500, 'AUTH_INIT_ERROR');
		}
		const tokenToDelete = await auth.getTokenByValue(tokenId);
		if (!tokenToDelete) {
			logger.warn('Attempt to delete a non-existent token.', {
				adminId: user?._id,
				adminTenantId: tenantId,
				targetTokenId: tokenId
			});
			throw new AppError('Token not found.', 404, 'TOKEN_NOT_FOUND');
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
		const { TokenAdapter } = await import('@src/databases/mongodb/models/auth-token');
		const tokenAdapter = new TokenAdapter();
		const result = await tokenAdapter.deleteTokens([tokenId]);
		if (result.success && result.data) {
			deletedCount = result.data.deletedCount;
		}
	}
	if (!deletedCount) {
		throw new AppError('Token not found', 404, 'TOKEN_NOT_FOUND');
	}

	// Invalidate the tokens cache so the deleted token disappears immediately from admin area
	cacheService.delete('tokens', tenantId).catch((err) => {
		logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
	});

	logger.info(`Token ${tokenId} deleted successfully`, {
		executedBy: user?._id,
		tenantId
	});

	return json({ success: true, message: 'Token deleted successfully.' });
});
