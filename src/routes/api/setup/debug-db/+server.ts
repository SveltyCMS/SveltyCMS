/**
 * @file src/routes/api/setup/debug-db/+server.ts
 * @description Debug endpoint to check database state during setup troubleshooting
 */

import { getDb, initConnection } from '@src/databases/db';
import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = await request.json();

		// Initialize temporary connection for debugging
		await initConnection(dbConfig);
		const dbAdapter = getDb();

		if (!dbAdapter) {
			throw new Error('Database adapter not initialized');
		}

		const results: Record<string, unknown> = {};

		// Check users collection
		try {
			if (dbAdapter.user?.findMany) {
				const users = await dbAdapter.user.findMany();
				results.users = {
					count: users.length,
					data: users.map((u) => ({
						id: u.id,
						email: u.email,
						username: u.username,
						role: u.role
					}))
				};
			}
		} catch (error) {
			results.users = { error: error.message };
		}

		// Check system settings
		try {
			if (dbAdapter.systemPreferences?.getMany) {
				const settings = await dbAdapter.systemPreferences.getMany(['HOST_DEV', 'DATABASE_URL'], 'system');
				results.systemSettings = { count: Object.keys(settings).length, keys: Object.keys(settings) };
			}
		} catch (error) {
			results.systemSettings = { error: error.message };
		}

		// Check if we can list collections/tables
		try {
			// For MongoDB, try to list collections
			if (dbAdapter.raw && typeof dbAdapter.raw.db === 'function') {
				const db = dbAdapter.raw.db();
				const collections = await db.listCollections().toArray();
				results.collections = collections.map((c) => c.name);
			}
		} catch (error) {
			results.collections = { error: error.message };
		}

		logger.info('Database debug check completed', { results });

		return json({
			success: true,
			timestamp: new Date().toISOString(),
			database: dbConfig.name,
			results
		});
	} catch (error) {
		logger.error('Database debug check failed', { error: error.message });
		return json(
			{
				success: false,
				error: error.message,
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
