import { json } from '@sveltejs/kit';
import { s as securityResponseService } from '../../../../../chunks/SecurityResponseService.js';
import { h as hasApiPermission } from '../../../../../chunks/apiPermissions.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ locals, url }) => {
	try {
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			logger.warn(`Unauthorized security incidents access attempt`, {
				userId: locals.user?._id,
				role: locals.user?.role
			});
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}
		const threatLevel = url.searchParams.get('threatLevel');
		const resolved = url.searchParams.get('resolved');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		let incidents = securityResponseService.getActiveIncidents();
		if (threatLevel && threatLevel !== 'all') {
			incidents = incidents.filter((inc) => inc.threatLevel === threatLevel);
		}
		if (resolved === 'true') {
			incidents = [];
		}
		incidents.sort((a, b) => b.timestamp - a.timestamp);
		const paginatedIncidents = incidents.slice(offset, offset + limit);
		const response = {
			incidents: paginatedIncidents,
			pagination: {
				total: incidents.length,
				offset,
				limit,
				hasMore: offset + limit < incidents.length
			},
			filters: {
				threatLevel,
				resolved,
				availableThreatLevels: ['all', 'low', 'medium', 'high', 'critical']
			}
		};
		logger.debug('Security incidents requested', {
			userId: locals.user._id,
			resultCount: paginatedIncidents.length,
			filters: { threatLevel, resolved }
		});
		return json(response);
	} catch (error) {
		logger.error('Error fetching security incidents:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
const POST = async ({ locals, request }) => {
	try {
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}
		const body = await request.json();
		const { ip, eventType, severity, evidence, metadata } = body;
		if (!ip || !eventType || !severity || !evidence) {
			return json(
				{
					error: 'Missing required fields: ip, eventType, severity, evidence'
				},
				{ status: 400 }
			);
		}
		if (severity < 1 || severity > 10) {
			return json(
				{
					error: 'Severity must be between 1 and 10'
				},
				{ status: 400 }
			);
		}
		securityResponseService.reportSecurityEvent(ip, eventType, severity, evidence, {
			...metadata,
			reportedBy: locals.user._id,
			manual: true
		});
		logger.info('Manual security incident reported', {
			reportedBy: locals.user._id,
			ip,
			eventType,
			severity,
			evidence: evidence.substring(0, 100)
		});
		return json({
			success: true,
			message: 'Security incident reported successfully'
		});
	} catch (error) {
		logger.error('Error creating security incident:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map
