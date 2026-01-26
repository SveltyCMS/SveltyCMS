/**
 * @file src/routes/api/audit/+server.ts
 * @description API endpoint for fetching audit logs.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auditLogService } from '@src/services/audit/AuditLogService';
import { logger } from '@utils/logger.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Security check: Only admins can view audit logs
	// Handle role as string or populated object
	const userRole = locals.user?.role as any;
	const roleName = typeof userRole === 'string' ? userRole : userRole?._id || userRole?.name;
	const isAdmin = roleName === 'admin' || locals.permissions?.includes('admin');

	if (!locals.user || !isAdmin) {
		throw error(403, 'Forbidden: Admin access required');
	}

	const limit = Number(url.searchParams.get('limit')) || 20;

	try {
		const logs = await auditLogService.getLogs(limit);
		return json(logs);
	} catch (e: any) {
		logger.error('Failed to fetch audit logs in API', { error: e });
		return json({ error: 'Failed to fetch logs' }, { status: 500 });
	}
};
