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

import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth (Database Agnostic)
import { auth, dbAdapter } from '@src/databases/db';

// System logger
import { logger } from '@utils/logger.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, tenantId, hasManageUsersPermission } = locals;

	// Security: Ensure the user is authenticated and has admin-level permissions.
	if (!user || !hasManageUsersPermission) {
		throw error(403, 'Forbidden: You do not have permission to access tokens.');
	}

	if (!auth || !dbAdapter) {
		logger.error('Database authentication adapter not initialized');
		throw error(500, 'Database authentication not available');
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

		logger.info('Tokens retrieved successfully', {
			count: tokens.length,
			total: totalTokens,
			requestedBy: user?._id,
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
		const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
		logger.error('Error retrieving tokens:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: user?._id
		});

		return json({ success: false, message: 'Internal Server Error' }, { status: 500 });
	}
};
