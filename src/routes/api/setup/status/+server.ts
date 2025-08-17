/**
 * @file src/routes/api/setup/status/+server.ts
 * @description API endpoint to check if setup is complete
 */

import { config } from '@src/lib/config.server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Check if configuration service is initialized
		if (!config.isInitialized()) {
			await config.initialize();
		} else {
			// Force reinitialization to pick up any changes to config files
			await config.forceReinitialize();
		}

		// Check if we're in setup mode
		if (config.isSetupMode()) {
			return json({
				isComplete: false,
				setupCompleted: false,
				siteName: 'SveltyCMS',
				message: 'Setup is not complete - in setup mode'
			});
		}

		// Get setup completion status from database
		const setupCompleted = await config.getPublic('SETUP_COMPLETED');
		const siteName = await config.getPublic('SITE_NAME');
		const isComplete = setupCompleted || (siteName && siteName !== 'SveltyCMS');

		return json({
			isComplete,
			setupCompleted,
			siteName,
			message: isComplete ? 'Setup is complete' : 'Setup is not complete'
		});
	} catch (error) {
		// If configuration service fails, assume setup is not complete
		console.error('Setup status error:', error);
		return json({
			isComplete: false,
			setupCompleted: false,
			siteName: 'SveltyCMS',
			message: 'Setup is not complete - configuration error',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
};
