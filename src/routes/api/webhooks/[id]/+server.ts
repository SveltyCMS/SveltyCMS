/**
 * @file src/routes/api/webhooks/[id]/+server.ts
 * @description Handles DELETE and PATCH requests for a specific webhook.
 */

import { webhookService } from '@src/services/webhook-service';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

// DELETE: Remove a webhook
export const DELETE = apiHandler(async ({ params, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	try {
		const { id } = params;
		if (!id) {
			throw new AppError('Missing ID', 400, 'MISSING_ID');
		}

		await webhookService.deleteWebhook(id);
		logger.info(`Webhook deleted: ${id} by ${locals.user.email}`);

		return json({ success: true });
	} catch (error) {
		logger.error('Failed to delete webhook:', error);
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError('Internal Server Error', 500, 'WEBHOOK_DELETE_FAILED');
	}
});

// PATCH: Update a webhook
export const PATCH = apiHandler(async ({ params, request, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	try {
		const { id } = params;
		if (!id) {
			throw new AppError('Missing ID', 400, 'MISSING_ID');
		}

		const updates = await request.json();

		// Ensure we don't accidentally create a new one with a different ID via updates
		const webhook = await webhookService.saveWebhook({ ...updates, id });

		logger.info(`Webhook updated: ${webhook.name} (${id}) by ${locals.user.email}`);

		return json({ success: true, data: webhook });
	} catch (error) {
		logger.error('Failed to update webhook:', error);
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError('Internal Server Error', 500, 'WEBHOOK_UPDATE_FAILED');
	}
});
