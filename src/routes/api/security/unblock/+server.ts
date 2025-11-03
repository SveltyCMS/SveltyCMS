/**
 * @file src/routes/api/security/unblock/+server.ts
 * @description IP unblocking endpoint for security management
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { securityResponseService } from '@src/services/SecurityResponseService';
import { hasApiPermission } from '@src/databases/auth/apiPermissions';
import { logger } from '@utils/logger.server';

/**
 * POST /api/security/unblock
 * Manually unblock an IP address from the security blacklist.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		// Authorization check - admin only
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}

		const body = await request.json();
		const { ip } = body;

		if (!ip) {
			return json({ error: 'IP address is required' }, { status: 400 });
		}

		// Validate IP format (basic validation)
		const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		if (!ipRegex.test(ip)) {
			return json({ error: 'Invalid IP address format' }, { status: 400 });
		}

		// Attempt to unblock the IP
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
