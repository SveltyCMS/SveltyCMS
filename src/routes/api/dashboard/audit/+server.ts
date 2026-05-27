/**
 * @file src/routes/api/dashboard/audit/+server.ts
 * @description API endpoint for fetching audit logs from the database.
 */

import { queryAuditLogs } from '@src/services/audit-log-service';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ url, locals }) => {
	const { isAdmin } = locals;

	// Security check: Only admins can view audit logs
	if (!isAdmin) {
		throw new AppError('Forbidden: Admin access required', 403, 'FORBIDDEN');
	}

	const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10);

	try {
		// Fetch logs using the advanced service
		// The service currently doesn't strictly filter by tenant in queryLogs
		// but we can pass actorId or other filters if needed.
		const result = await queryAuditLogs({
			limit
			// For multi-tenant, we might want to filter by actorId belonging to this tenant
			// but for now we'll return the most recent logs as the hook already verified isAdmin
		});

		if (!result.success) {
			throw new AppError(result.message || 'Failed to fetch audit logs', 500, 'AUDIT_LOG_ERROR');
		}

		return json(result.data);
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		logger.error('Failed to fetch audit logs in API', { error: e });
		throw new AppError('Failed to fetch logs', 500, 'AUDIT_LOG_ERROR');
	}
});
