/**
 * @file src/routes/api/audit/+server.ts
 * @description API endpoint for fetching audit logs.
 */

import { json } from '@sveltejs/kit';
import { auditLogService } from '@src/services/audit/AuditLogService';
import { logger } from '@utils/logger.server';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ url, locals }) => {
	// Security check: Only admins can view audit logs
	// Handle role as string or populated object
	const userRole = locals.user?.role as string | { _id?: string; name?: string } | undefined;
	const roleName = typeof userRole === 'string' ? userRole : userRole?._id || userRole?.name;
	const isAdmin = roleName === 'admin' || locals.permissions?.includes('admin');

	if (!locals.user || !isAdmin) {
		throw new AppError('Forbidden: Admin access required', 403, 'FORBIDDEN');
	}

	const limit = Number(url.searchParams.get('limit')) || 20;

	try {
		const logs = await auditLogService.getLogs(limit);
		return json(logs);
	} catch (e) {
		logger.error('Failed to fetch audit logs in API', { error: e });
		throw new AppError('Failed to fetch logs', 500, 'AUDIT_LOG_ERROR');
	}
});
