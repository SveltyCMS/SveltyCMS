import { json } from '@sveltejs/kit';
import { s as securityResponseService } from '../../../../../../../chunks/SecurityResponseService.js';
import { h as hasApiPermission } from '../../../../../../../chunks/apiPermissions.js';
import { l as logger } from '../../../../../../../chunks/logger.server.js';
const POST = async ({ locals, params, request }) => {
	try {
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}
		const incidentId = params.id;
		if (!incidentId) {
			return json({ error: 'Incident ID is required' }, { status: 400 });
		}
		const body = await request.json().catch(() => ({}));
		const notes = body.notes || `Resolved by ${locals.user.email || locals.user._id}`;
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
export { POST };
//# sourceMappingURL=_server.ts.js.map
