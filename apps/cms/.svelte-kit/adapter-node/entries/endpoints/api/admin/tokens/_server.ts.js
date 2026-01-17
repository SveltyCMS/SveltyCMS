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
			filter.$or = [{ email: { $regex: search, $options: 'i' } }, { token: { $regex: search, $options: 'i' } }];
		}
		const tokensResult = await dbAdapter.auth.getAllTokens(filter);
		if (!tokensResult.success || !tokensResult.data) {
			throw error(500, 'Failed to fetch tokens from database');
		}
		const allTokens = tokensResult.data;
		allTokens.sort((a, b) => {
			const aVal = a[sort];
			const bVal = b[sort];
			if (aVal == null) return 1;
			if (bVal == null) return -1;
			if (aVal < bVal) return order === 1 ? -1 : 1;
			if (aVal > bVal) return order === 1 ? 1 : -1;
			return 0;
		});
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
	} catch (err) {
		logger.error('Error fetching tokens for admin area:', err);
		const errorMessage = err instanceof Error ? err.message : 'An internal server error occurred.';
		throw error(500, errorMessage);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
