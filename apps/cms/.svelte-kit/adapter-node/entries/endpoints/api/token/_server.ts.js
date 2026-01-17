import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth } from '../../../../chunks/db.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async ({ locals }) => {
	const { tenantId } = locals;
	try {
		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}
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
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error retrieving tokens:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
