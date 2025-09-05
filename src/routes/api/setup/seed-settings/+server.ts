/**
 * @file src/routes/api/setup/seed-settings/+server.ts
 * @description API endpoint to seed the database with default settings using database-agnostic interface.
 * This is called during initial setup to populate the database with configuration values.
 */

import { json } from '@sveltejs/kit';
import { initSystemFromSetup } from '../seed';
import type { RequestHandler } from './$types';
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async () => {
	try {
		// Ensure database is connected before seeding
		if (!dbAdapter) {
			throw new Error('Database adapter not initialized. Please check database connection.');
		}

		await initSystemFromSetup(dbAdapter);

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
