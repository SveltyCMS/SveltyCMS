/** 
@file apps/cms/src/routes/api/audit/+server.ts
@component 
**API endpoint for fetching audit logs.**
*/

import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { auditLogService } from '../../../services/audit/AuditLogService';

export const GET = async ({ url }: RequestEvent) => {
	// In a real app, ensure this is protected by admin auth
	const limit = Number(url.searchParams.get('limit')) || 20;

	// We need to extend AuditLogService to support reading/querying
	// For now, let's assume we can just read the file (simplified)
	// or better, let's add a getRecentLogs method to the service if it doesn't exist.
	// I'll check the service first, but assuming I can read the file:

	try {
		const logs = await auditLogService.getLogs(limit);
		return json(logs);
	} catch (e) {
		console.error(e);
		return json({ error: 'Failed to fetch logs' }, { status: 500 });
	}
};
