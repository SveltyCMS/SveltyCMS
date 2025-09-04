/**
 * @file src/routes/api/setup/seed-settings/+server.ts
 * @description API endpoint to seed the database with default settings using database-agnostic interface.
 * This is called during initial setup to populate the database with configuration values.
 */

import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { json } from '@sveltejs/kit';
import { seedSettings } from '../seed';
import type { RequestHandler } from './$types';
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

/**
 * Initialize system from setup using database-agnostic interface
 * @param adapter Optional database adapter to use (if not provided, uses global dbAdapter)
 */
export async function initSystemFromSetup(adapter?: any): Promise<void> {
	logger.info('🚀 Starting system initialization from setup...');

	// Use provided adapter or global dbAdapter
	const databaseAdapter = adapter || dbAdapter;

	if (!databaseAdapter) {
		throw new Error('Database adapter not available. Database must be initialized first.');
	}

	// Seed the database with default settings using database-agnostic interface
	await seedSettings(databaseAdapter);

	// Invalidate the settings cache to force a reload
	invalidateSettingsCache();

	logger.info('✅ System initialization completed');
}

export const POST: RequestHandler = async () => {
	try {
		// Ensure database is connected before seeding
		if (!dbAdapter) {
			throw new Error('Database adapter not initialized. Please check database connection.');
		}

		await initSystemFromSetup();

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
