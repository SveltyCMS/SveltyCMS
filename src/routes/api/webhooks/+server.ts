/**
 * @file src/routes/api/webhooks/+server.ts
 * @description Handles GET (list) and POST (create) requests for webhooks.
 */

import { json } from '@sveltejs/kit';

import { webhookService } from '@src/services/webhookService';
import { logger } from '@utils/logger.server';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// GET: List all webhooks
export const GET = apiHandler(async ({ locals }) => {
	// Only admins should see webhooks
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	try {
		const webhooks = await webhookService.getWebhooks();
		return json({ success: true, data: webhooks });
	} catch (error) {
		logger.error('Failed to list webhooks:', error);
		if (error instanceof AppError) throw error;
		throw new AppError('Internal Server Error', 500, 'WEBHOOK_LIST_FAILED');
	}
});

// POST: Create a new webhook
export const POST = apiHandler(async ({ request, locals }) => {
	// Only admins should see webhooks
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	try {
		const data = await request.json();

		// Basic validation
		if (!data.url || !data.events || !Array.isArray(data.events)) {
			throw new AppError('Invalid webhook data. URL and events array are required.', 400, 'INVALID_DATA');
		}

		const webhook = await webhookService.saveWebhook(data);

		logger.info(`Webhook created: ${webhook.name} (${webhook.id}) by ${locals.user.email}`);

		return json({ success: true, data: webhook });
	} catch (error) {
		logger.error('Failed to create webhook:', error);
		if (error instanceof AppError) throw error;
		throw new AppError('Internal Server Error', 500, 'WEBHOOK_CREATE_FAILED');
	}
});
