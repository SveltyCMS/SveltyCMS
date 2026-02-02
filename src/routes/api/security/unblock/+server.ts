/**
 * @file src/routes/api/security/unblock/+server.ts
 * @description IP unblocking endpoint for security management
 */

import { json } from '@sveltejs/kit';
import { securityResponseService } from '@src/services/SecurityResponseService';
import { hasApiPermission } from '@src/databases/auth/apiPermissions';
import { logger } from '@utils/logger.server';

/**
 * POST /api/security/unblock
 * Manually unblock an IP address from the security blacklist.
 */
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

/**
 * POST /api/security/unblock
 * Manually unblock an IP address from the security blacklist.
 */
export const POST = apiHandler(async ({ locals, request }) => {
	try {
		// Authorization check - admin only
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			throw new AppError('Unauthorized - Admin access required', 403, 'FORBIDDEN');
		}

		const body = await request.json();
		const { ip } = body;

		if (!ip) {
			throw new AppError('IP address is required', 400, 'IP_REQUIRED');
		}

		// Validate IP format (basic validation)
		const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		if (!ipRegex.test(ip)) {
			throw new AppError('Invalid IP address format', 400, 'INVALID_IP');
		}

		// Attempt to unblock the IP
		const success = securityResponseService.unblockIP(ip);

		if (!success) {
			throw new AppError('IP address not found in blocked list or already unblocked', 404, 'IP_NOT_FOUND');
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
		if (error instanceof AppError) throw error;
		logger.error('Error unblocking IP address:', error);
		throw new AppError('Internal server error', 500, 'UNBLOCK_FAILED');
	}
});
