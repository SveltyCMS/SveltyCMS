/**
 * @file src/routes/api/automations/[id]/+server.ts
 * @description REST API for single automation flow operations.
 *
 * Features:
 * - GET: Get a single automation flow
 * - PATCH: Update an automation flow
 * - DELETE: Delete an automation flow
 */

import { automationService } from '@src/services/automation/automationService';
import type { AutomationFlow } from '@src/services/automation/types';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/automations/:id — Get a single flow */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const flow = await automationService.getFlow(params.id);
		if (!flow) {
			return json({ success: false, error: 'Automation not found' }, { status: 404 });
		}
		return json({ success: true, data: flow });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to load automation';
		return json({ success: false, error: message }, { status: 500 });
	}
};

/** PATCH /api/automations/:id — Update a flow */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const existing = await automationService.getFlow(params.id);
		if (!existing) {
			return json({ success: false, error: 'Automation not found' }, { status: 404 });
		}

		const body = (await request.json()) as Partial<AutomationFlow>;
		const flow = await automationService.saveFlow({ ...body, id: params.id });
		return json({ success: true, data: flow });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to update automation';
		return json({ success: false, error: message }, { status: 500 });
	}
};

/** DELETE /api/automations/:id — Delete a flow */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await automationService.deleteFlow(params.id);
		return json({ success: true, message: 'Automation deleted' });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to delete automation';
		return json({ success: false, error: message }, { status: 500 });
	}
};
