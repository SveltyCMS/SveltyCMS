/**
 * @file src/routes/api/security/incidents/+server.ts
 * @description Security incidents management API endpoints
 *
 * ### Features
 * - List active security incidents
 * - Incident resolution and management
 * - Threat level filtering and sorting
 * - Real-time incident updates
 * - Administrative controls
 *
 * @security Admin-only endpoints with comprehensive logging
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { securityResponseService } from '@src/services/SecurityResponseService';
import { hasApiPermission } from '@src/databases/auth/apiPermissions';
import { logger } from '@utils/logger.svelte';

/**
 * GET /api/security/incidents
 * Returns list of active security incidents with filtering options.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		// Authorization check - admin only
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			logger.warn(`Unauthorized security incidents access attempt`, {
				userId: locals.user?._id,
				role: locals.user?.role
			});
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}

		// Get query parameters for filtering
		const threatLevel = url.searchParams.get('threatLevel');
		const resolved = url.searchParams.get('resolved');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		// Get incidents from security service
		let incidents = securityResponseService.getActiveIncidents();

		// Apply filters
		if (threatLevel && threatLevel !== 'all') {
			incidents = incidents.filter((inc) => inc.threatLevel === threatLevel);
		}

		if (resolved === 'true') {
			// Note: getActiveIncidents() only returns unresolved incidents
			// In a full implementation, you'd have a method to get resolved incidents too
			incidents = [];
		}

		// Sort by timestamp (newest first)
		incidents.sort((a, b) => b.timestamp - a.timestamp);

		// Apply pagination
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

/**
 * POST /api/security/incidents
 * Create a new security incident (for manual reporting).
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		// Authorization check - admin only
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}

		const body = await request.json();
		const { ip, eventType, severity, evidence, metadata } = body;

		// Validate required fields
		if (!ip || !eventType || !severity || !evidence) {
			return json(
				{
					error: 'Missing required fields: ip, eventType, severity, evidence'
				},
				{ status: 400 }
			);
		}

		// Validate severity range
		if (severity < 1 || severity > 10) {
			return json(
				{
					error: 'Severity must be between 1 and 10'
				},
				{ status: 400 }
			);
		}

		// Report the security event
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
