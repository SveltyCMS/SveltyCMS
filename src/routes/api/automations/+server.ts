/**
 * @file src/routes/api/automations/+server.ts
 * @description REST API for automation flow CRUD operations.
 *
 * Features:
 * - GET: List all automation flows
 * - POST: Create a new automation flow
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { automationService } from '@src/services/automation/automationService';
import type { AutomationFlow } from '@src/services/automation/types';

/** GET /api/automations — List all automation flows */
export const GET: RequestHandler = async () => {
	try {
		const flows = await automationService.getFlows();
		return json({ success: true, data: flows });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to load automations';
		return json({ success: false, error: message }, { status: 500 });
	}
};

/** POST /api/automations — Create a new automation flow */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Partial<AutomationFlow>;

		if (!body.name) {
			return json({ success: false, error: 'Name is required' }, { status: 400 });
		}

		const flow = await automationService.saveFlow(body);
		return json({ success: true, data: flow }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create automation';
		return json({ success: false, error: message }, { status: 500 });
	}
};
