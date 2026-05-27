/**
 * @file src/routes/api/token/+server.ts
 * @description Consolidated API endpoint for listing and managing registration tokens.
 *
 * This module is responsible for:
 * - Retrieving all tokens for the current tenant with pagination, sorting, and filtering.
 * - Requires 'manage:users' permission (handled via locals).
 *
 * @usage
 * GET /api/token?page=1&limit=10&sort=expires&order=asc&search=test@example.com
 */

// Auth (Database Agnostic)
import { auth, dbAdapter } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
// System logger
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ url, locals }) => {
	const { user, tenantId, hasManageUsersPermission } = locals;

	// Security: Ensure the user is authenticated and has admin-level permissions.
	if (!(user && hasManageUsersPermission)) {
		throw new AppError('Forbidden: You do not have permission to access tokens.', 403, 'FORBIDDEN');
	}

	if (!(auth && dbAdapter)) {
		logger.error('Database authentication adapter not initialized');
		throw new AppError('Database authentication not available', 500, 'DB_AUTH_ERROR');
	}

	try {
		const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
		const limit = Number.parseInt(url.searchParams.get('limit') || '10', 10);
		const sort = url.searchParams.get('sort') || 'createdAt';
		const order = url.searchParams.get('order') === 'asc' ? 1 : -1;
		const search = url.searchParams.get('search') || '';

		// Build filter for database query
		const filter: Record<string, unknown> = {};

		// Apply tenant ID if in multi-tenant mode
		if (getPrivateSettingSync('MULTI_TENANT') && tenantId) {
			filter.tenantId = tenantId;
		}

		// Add search query if provided (MongoDB-style query)
		if (search) {
			filter.$or = [{ email: { $regex: search, $options: 'i' } }, { token: { $regex: search, $options: 'i' } }];
		}

		// Get all tokens using the database adapter directly
		const tokensResult = await dbAdapter.auth.getAllTokens(filter);

		if (!(tokensResult.success && tokensResult.data)) {
			throw new AppError('Failed to fetch tokens from database', 500, 'DB_FETCH_ERROR');
		}

		const allTokens = tokensResult.data;

		// Apply sorting
		allTokens.sort((a, b) => {
			const aVal = a[sort as keyof typeof a];
			const bVal = b[sort as keyof typeof b];

			if (aVal == null) {
				return 1;
			}
			if (bVal == null) {
				return -1;
			}

			if (aVal < bVal) {
				return order === 1 ? -1 : 1;
			}
			if (aVal > bVal) {
				return order === 1 ? 1 : -1;
			}
			return 0;
		});

		// Apply pagination
		const totalTokens = allTokens.length;
		const startIndex = (page - 1) * limit;
		const tokens = allTokens.slice(startIndex, startIndex + limit);

		logger.info('Tokens retrieved successfully', {
			count: tokens.length,
			total: totalTokens,
			requestedBy: user._id,
			tenantId
		});

		return json({
			success: true,
			data: tokens,
			pagination: {
				page,
				limit,
				totalItems: totalTokens,
				totalPages: Math.ceil(totalTokens / limit)
			}
		});
	} catch (err: unknown) {
		if (err instanceof AppError) {
			throw err;
		}
		const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
		logger.error('Error retrieving tokens:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: user._id
		});

		throw new AppError('Internal Server Error', 500, 'INTERNAL_SERVER_ERROR', {
			originalError: message
		});
	}
});
