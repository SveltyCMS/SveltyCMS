import { error, json } from '@sveltejs/kit';
import { a as auth, d as dbAdapter } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
const GET = async ({ url, locals }) => {
	const { user, tenantId, hasManageUsersPermission } = locals;
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
		const filter = {};
		if (getPrivateSettingSync('MULTI_TENANT') && tenantId) {
			filter.tenantId = tenantId;
		}
		if (search) {
			filter.$or = [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
		}
		const options = {
			filter,
			limit,
			offset: (page - 1) * limit,
			sort: { [sort]: order === 1 ? 'asc' : 'desc' }
		};
		const usersResult = await dbAdapter.auth.getAllUsers(options);
		const totalUsersResult = await dbAdapter.auth.getUserCount(filter);
		if (!usersResult.success || !usersResult.data) {
			throw error(500, 'Failed to fetch users from database');
		}
		if (!totalUsersResult.success || totalUsersResult.data === void 0) {
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
	} catch (err) {
		logger.error('Error fetching users for admin area:', err);
		const errorMessage = err instanceof Error ? err.message : 'An internal server error occurred.';
		throw error(500, errorMessage);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
