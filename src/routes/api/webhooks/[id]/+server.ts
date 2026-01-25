/**
 * @file src/routes/api/webhooks/[id]/+server.ts
 * @description Handles DELETE and PATCH requests for a specific webhook.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { webhookService } from '@src/services/webhookService';
import { logger } from '@utils/logger.server';

// DELETE: Remove a webhook
export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user || locals.user.role !== 'admin') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const { id } = params;
		if (!id) return json({ error: 'Missing ID' }, { status: 400 });

		await webhookService.deleteWebhook(id);
		logger.info(`Webhook deleted: ${id} by ${locals.user.email}`);

		return json({ success: true });
	} catch (error) {
		logger.error('Failed to delete webhook:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};

// PATCH: Update a webhook
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		if (!locals.user || locals.user.role !== 'admin') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const { id } = params;
		const updates = await request.json();

		if (!id) return json({ error: 'Missing ID' }, { status: 400 });

		// Ensure we don't accidentally create a new one with a different ID via updates
		const webhook = await webhookService.saveWebhook({ ...updates, id });

		logger.info(`Webhook updated: ${webhook.name} (${id}) by ${locals.user.email}`);

		return json({ success: true, data: webhook });
	} catch (error) {
		logger.error('Failed to update webhook:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
