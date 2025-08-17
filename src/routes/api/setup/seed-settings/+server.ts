/**
 * @file src/routes/api/setup/seed-settings/+server.ts
 * @description API endpoint to seed the database with default settings.
 * This is called during initial setup to populate the database with configuration values.
 */

import { seedDefaultSettings } from '@src/databases/seedSettings';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async () => {
	try {
		logger.info('🚀 Starting settings seeding process...');

		// Seed the database with default settings
		await seedDefaultSettings();

		// Invalidate the settings cache to force a reload
		invalidateSettingsCache();

		return json({
			success: true,
			message: 'Settings seeded successfully',
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		logger.error('❌ Failed to seed settings:', error);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
