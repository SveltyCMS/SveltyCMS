/**
 * @file src/routes/api/automations/[id]/logs/+server.ts
 * @description Execution log endpoint for automation flows.
 *
 * Features:
 * - GET: Get execution history for a specific flow
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { automationService } from '@src/services/automation/automationService';

/** GET /api/automations/:id/logs — Get execution logs */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const logs = automationService.getLogs(params.id);
		return json({ success: true, data: logs });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to load logs';
		return json({ success: false, error: message }, { status: 500 });
	}
};
