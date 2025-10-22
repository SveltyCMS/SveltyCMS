/**
 * @file src/routes/api/security/incidents/[id]/resolve/+server.ts
 * @description Individual incident resolution endpoint
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { securityResponseService } from '@src/services/SecurityResponseService';
import { hasApiPermission } from '@src/databases/auth/apiPermissions';
import { logger } from '@utils/logger.svelte';

/**
 * POST /api/security/incidents/[id]/resolve
 * Resolve a specific security incident.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		// Authorization check - admin only
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}

		const incidentId = params.id;
		if (!incidentId) {
			return json({ error: 'Incident ID is required' }, { status: 400 });
		}

		const body = await request.json().catch(() => ({}));
		const notes = body.notes || `Resolved by ${locals.user.email || locals.user._id}`;

		// Resolve the incident
		const success = securityResponseService.resolveIncident(incidentId, notes);

		if (!success) {
			return json({ error: 'Incident not found or already resolved' }, { status: 404 });
		}

		logger.info('Security incident resolved', {
			incidentId,
			resolvedBy: locals.user._id,
			notes
		});

		return json({
			success: true,
			message: 'Incident resolved successfully'
		});
	} catch (error) {
		logger.error('Error resolving security incident:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
