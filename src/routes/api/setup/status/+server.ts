/**
 * @file src/routes/api/setup/status/+server.ts
 * @description API endpoint to check if setup is complete
 */

import { getPublicSettings } from '@src/stores/globalSettings';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Check for explicit setup completion marker or proper site name
		const settings = getPublicSettings();
		const setupCompleted = settings.SETUP_COMPLETED;
		const siteName = settings.SITE_NAME;
		const isComplete = setupCompleted || (siteName && siteName !== 'SveltyCMS');

		return json({
			isComplete,
			setupCompleted,
			siteName,
			message: isComplete ? 'Setup is complete' : 'Setup is not complete'
		});
	} catch (error) {
		// If settings are not loaded, setup is not complete
		console.error('Setup status error:', error);
		return json({
			isComplete: false,
			message: 'Setup is not complete',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
};
