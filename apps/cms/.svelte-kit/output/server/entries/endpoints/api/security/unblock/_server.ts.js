import { json } from '@sveltejs/kit';
import { s as securityResponseService } from '../../../../../chunks/SecurityResponseService.js';
import { h as hasApiPermission } from '../../../../../chunks/apiPermissions.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const POST = async ({ locals, request }) => {
	try {
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}
		const body = await request.json();
		const { ip } = body;
		if (!ip) {
			return json({ error: 'IP address is required' }, { status: 400 });
		}
		const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		if (!ipRegex.test(ip)) {
			return json({ error: 'Invalid IP address format' }, { status: 400 });
		}
		const success = securityResponseService.unblockIP(ip);
		if (!success) {
			return json(
				{
					error: 'IP address not found in blocked list or already unblocked'
				},
				{ status: 404 }
			);
		}
		logger.info('IP address manually unblocked', {
			ip,
			unblockedBy: locals.user._id,
			timestamp: Date.now()
		});
		return json({
			success: true,
			message: `IP address ${ip} has been unblocked successfully`
		});
	} catch (error) {
		logger.error('Error unblocking IP address:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
