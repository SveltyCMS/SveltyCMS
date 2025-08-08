/**
 * @file src/routes/api/widgets/active/+server.ts
 * @description API endpoint for getting active widgets
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const start = performance.now();
	const { tenantId } = locals; // User is guaranteed to exist due to hooks protection

	try {
		if (!locals.dbAdapter?.widgets?.getActiveWidgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}

		const result = await locals.dbAdapter.widgets.getActiveWidgets();

		let widgets: string[] = [];
		if (Array.isArray(result)) {
			widgets = result;
		} else if (result && typeof result === 'object' && 'success' in result && result.success) {
			widgets = (result as { data: string[] }).data || [];
		}

		const duration = performance.now() - start;
		logger.debug('Retrieved active widgets', {
			tenantId,
			count: widgets.length,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			widgets,
			tenantId
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get active widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });
		throw error(500, message);
	}
};
