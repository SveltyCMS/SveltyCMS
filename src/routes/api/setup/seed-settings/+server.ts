/**
 * @file src/routes/api/setup/seed-settings/+server.ts
 * @description API endpoint to seed the database with default settings using database-agnostic interface.
 * This is called during initial setup to populate the database with configuration values.
 */

import { getDb, initConnection } from '@src/databases/db';
import { json } from '@sveltejs/kit';
import { initSystemFromSetup } from '../seed';
import type { RequestHandler } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = await request.json();

		// Initialize a temporary connection for seeding
		await initConnection(dbConfig);
		const dbAdapter = getDb();

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
