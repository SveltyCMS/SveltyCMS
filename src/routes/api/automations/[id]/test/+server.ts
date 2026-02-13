/**
 * @file src/routes/api/automations/[id]/test/+server.ts
 * @description Test endpoint for automation flows.
 * Executes a flow with sample data for verification.
 *
 * Features:
 * - POST: Test-execute a flow with sample payload
 * - Returns per-operation execution results
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { automationService } from '@src/services/automation/automationService';
import type { AutomationEventPayload } from '@src/services/automation/types';

/** POST /api/automations/:id/test — Test a flow */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const flow = await automationService.getFlow(params.id);
		if (!flow) {
			return json({ success: false, error: 'Automation not found' }, { status: 404 });
		}

		// Build a sample payload
		const samplePayload: AutomationEventPayload = {
			event: flow.trigger.events?.[0] || 'entry:create',
			collection: flow.trigger.collections?.[0] || 'TestCollection',
			entryId: 'test-entry-id',
			data: {
				title: 'Sample Entry Title',
				status: 'publish',
				author: 'Test User',
				createdAt: new Date().toISOString()
			},
			user: {
				email: 'test@sveltycms.com',
				username: 'testuser'
			},
			timestamp: new Date().toISOString()
		};

		const result = await automationService.executeFlow(flow, samplePayload);

		return json({
			success: true,
			data: {
				status: result.status,
				duration: result.duration,
				operationResults: result.operationResults
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Test execution failed';
		return json({ success: false, error: message }, { status: 500 });
	}
};
