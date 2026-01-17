/**
 * @file apps/cms/src/routes/api/admin/tokens/+server.ts
 * @description API endpoint for fetching registration tokens with pagination, sorting, and filtering.
 *
 * This endpoint is for the Admin Area to query token data efficiently.
 * It is protected and only accessible by users with administrative privileges.
 *
 * @usage
 * GET /api/admin/tokens?page=1&limit=10&sort=expires&order=asc&search=test@example.com
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { auth, dbAdapter } from '@shared/database/db';
import { logger } from '@shared/utils/logger.server';
import { getPrivateSettingSync } from '@shared/services/settingsService';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, tenantId, hasManageUsersPermission } = locals;

	// Security: Ensure the user is authenticated and has admin-level permissions.
	if (!user || !hasManageUsersPermission) {
		throw error(403, 'Forbidden: You do not have permission to access this resource.');
	}

	if (!auth || !dbAdapter) {
		throw error(500, 'Authentication system is not initialized');
	}

	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '10');
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

		if (!tokensResult.success || !tokensResult.data) {
			throw error(500, 'Failed to fetch tokens from database');
		}

		const allTokens = tokensResult.data;

		// Apply sorting
		allTokens.sort((a, b) => {
			const aVal = a[sort as keyof typeof a];
			const bVal = b[sort as keyof typeof b];

			if (aVal == null) return 1;
			if (bVal == null) return -1;

			if (aVal < bVal) return order === 1 ? -1 : 1;
			if (aVal > bVal) return order === 1 ? 1 : -1;
			return 0;
		});

		// Apply pagination
		const totalTokens = allTokens.length;
		const startIndex = (page - 1) * limit;
		const tokens = allTokens.slice(startIndex, startIndex + limit);

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
		logger.error('Error fetching tokens for admin area:', err);
		const errorMessage = err instanceof Error ? err.message : 'An internal server error occurred.';
		throw error(500, errorMessage);
	}
};
