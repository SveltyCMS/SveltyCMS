import { json } from '@sveltejs/kit';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const POST = async ({ locals }) => {
	try {
		if (!locals.user?.isAdmin) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}
		await cacheService.invalidateAll();
		logger.info('Cache cleared by admin user', {
			userId: locals.user.id,
			username: locals.user.username
		});
		return json({
			success: true,
			message: 'All cache entries cleared successfully'
		});
	} catch (error) {
		logger.error('Failed to clear cache:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to clear cache'
			},
			{ status: 500 }
		);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
