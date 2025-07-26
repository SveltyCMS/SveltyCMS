/**
 * @file src/routes/api/dashboard/metrics/+server.ts
 * @description Dashboard metrics API endpoint for performance monitoring
 */

import { json } from '@sveltejs/kit';
import { getHealthMetrics } from '@src/hooks.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const metrics = getHealthMetrics();

		// Add additional system metrics if requested
		const detailed = url.searchParams.get('detailed') === 'true';

		if (detailed) {
			// Add memory usage and other Node.js metrics
			const memoryUsage = process.memoryUsage();
			return json({
				...metrics,
				system: {
					memory: {
						used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
						total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
						external: Math.round(memoryUsage.external / 1024 / 1024), // MB
						rss: Math.round(memoryUsage.rss / 1024 / 1024) // MB
					},
					uptime: Math.floor(process.uptime()),
					nodeVersion: process.version
				}
			});
		}

		return json(metrics);
	} catch (error) {
		console.error('Dashboard metrics error:', error);
		return json({ error: 'Failed to fetch dashboard metrics' }, { status: 500 });
	}
};
