/**
 * @file src/routes/api/admin/users/+server.ts
 * @description API endpoint for fetching users with pagination, sorting, and filtering.
 *
 * This endpoint is designed for the Admin Area to efficiently query user data.
 * It is protected and can only be accessed by users with administrative privileges.
 *
 * @usage
 * GET /api/admin/users?page=1&limit=10&sort=createdAt&order=desc&search=john
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { auth, dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import { getPrivateSettingSync } from '@src/services/settingsService';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, tenantId, hasManageUsersPermission } = locals;

	// Security: Ensure the user is authenticated and has admin-level permissions.
	// This is largely handled by hooks, but we add a redundant check here for safety.
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
			filter.$or = [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
		}

		// Build pagination options for the adapter
		const options = {
			filter,
			limit,
			offset: (page - 1) * limit,
			sort: { [sort]: order === 1 ? 'asc' : 'desc' }
		};

		// Use the database adapter directly for full pagination support
		const usersResult = await dbAdapter.auth.getAllUsers(options);
		const totalUsersResult = await dbAdapter.auth.getUserCount(filter);

		if (!usersResult.success || !usersResult.data) {
			throw error(500, 'Failed to fetch users from database');
		}

		if (!totalUsersResult.success || totalUsersResult.data === undefined) {
			throw error(500, 'Failed to get user count from database');
		}

		const users = usersResult.data;
		const totalUsers = totalUsersResult.data;

		if (!users) {
			throw error(404, 'No users found.');
		}

		return json({
			success: true,
			data: users,
			pagination: {
				page,
				limit,
				totalItems: totalUsers,
				totalPages: Math.ceil(totalUsers / limit)
			}
		});
	} catch (err: unknown) {
		logger.error('Error fetching users for admin area:', err);
		const errorMessage = err instanceof Error ? err.message : 'An internal server error occurred.';
		throw error(500, errorMessage);
	}
};
