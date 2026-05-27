/**
 * @file src/routes/api/admin/security-stats/+server.ts
 * @description Admin API endpoint for security monitoring statistics
 *
 * Features:
 * - GET: Active incidents, blocked/throttled IPs, threat distribution
 * - Admin-only access
 */

import { securityResponseService } from '@src/services/security-response-service';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const GET = apiHandler(async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Forbidden: Admin access required', 403, 'FORBIDDEN');
	}

	const stats = securityResponseService.getSecurityStats();
	const activeIncidents = securityResponseService.getActiveIncidents();

	return json({
		...stats,
		recentIncidents: activeIncidents.slice(0, 20).map((inc) => ({
			id: inc.id,
			clientIp: inc.clientIp,
			threatLevel: inc.threatLevel,
			indicatorCount: inc.indicators.length,
			timestamp: new Date(inc.timestamp).toISOString(),
			responseActions: inc.responseActions
		}))
	});
});
