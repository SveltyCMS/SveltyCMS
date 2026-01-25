/**
 * @file src/routes/api/webhooks/+server.ts
 * @description Handles GET (list) and POST (create) requests for webhooks.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { webhookService } from '@src/services/webhookService';
import { logger } from '@utils/logger.server';

// GET: List all webhooks
export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Only admins should see webhooks
		if (!locals.user || locals.user.role !== 'admin') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const webhooks = await webhookService.getWebhooks();
		return json({ success: true, data: webhooks });
	} catch (error) {
		logger.error('Failed to list webhooks:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};

// POST: Create a new webhook
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user || locals.user.role !== 'admin') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const data = await request.json();

		// Basic validation
		if (!data.url || !data.events || !Array.isArray(data.events)) {
			return json({ error: 'Invalid webhook data. URL and events array are required.' }, { status: 400 });
		}

		const webhook = await webhookService.saveWebhook(data);

		logger.info(`Webhook created: ${webhook.name} (${webhook.id}) by ${locals.user.email}`);

		return json({ success: true, data: webhook });
	} catch (error) {
		logger.error('Failed to create webhook:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
