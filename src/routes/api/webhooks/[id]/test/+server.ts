/**
 * @file src/routes/api/webhooks/[id]/test/+server.ts
 * @description Manual trigger for testing webhook connectivity.
 */

import { json } from '@sveltejs/kit';
import { webhookService } from '@src/services/webhookService';
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const POST = apiHandler(async ({ params, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	const { id } = params;
	if (!id) throw new AppError('Missing ID', 400, 'MISSING_ID');

	try {
		await webhookService.testWebhook(id, locals.user.email);
		return json({ success: true, message: 'Test event dispatched' });
	} catch (error) {
		if (error instanceof Error && error.message === 'Webhook not found') {
			throw new AppError('Webhook not found', 404, 'NOT_FOUND');
		}
		throw new AppError(error instanceof Error ? error.message : 'Webhook test failed', 500, 'WEBHOOK_TEST_FAILED');
	}
});
