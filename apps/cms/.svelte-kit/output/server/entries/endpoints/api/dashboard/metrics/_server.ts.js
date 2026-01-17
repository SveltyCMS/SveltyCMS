import { json } from '@sveltejs/kit';
import '../../../../../chunks/crypto.js';
import '../../../../../chunks/logger.js';
import 'mime-types';
import 'path';
import 'sharp';
import '../../../../../chunks/utils.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import '../../../../../chunks/mediaStorage.server.js';
import 'clsx';
import '../../../../../chunks/schemas.js';
import '../../../../../chunks/CacheService.js';
import { m as metricsService } from '../../../../../chunks/MetricsService.js';
import '../../../../../chunks/auditLogService.js';
import '../../../../../chunks/settingsService.js';
const GET = async ({ url }) => {
	try {
		const metrics = metricsService.getReport();
		const detailed = url.searchParams.get('detailed') === 'true';
		if (detailed) {
			const memoryUsage = process.memoryUsage();
			return json({
				...metrics,
				system: {
					memory: {
						used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
						// MB
						total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
						// MB
						external: Math.round(memoryUsage.external / 1024 / 1024),
						// MB
						rss: Math.round(memoryUsage.rss / 1024 / 1024)
						// MB
					},
					uptime: Math.floor(process.uptime()),
					nodeVersion: process.version
				}
			});
		}
		return json(metrics);
	} catch (err) {
		logger.error('Dashboard metrics error:', err);
		return json({ error: 'Failed to fetch dashboard metrics' }, { status: 500 });
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
