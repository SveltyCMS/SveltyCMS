/**
 * @file src/routes/api/setup/clear-users/+server.ts
 * @description Debug endpoint to completely clear user data from database during setup troubleshooting
 */

import { getDb, initConnection } from '@src/databases/db';
import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = await request.json();

		// Initialize temporary connection for clearing
		await initConnection(dbConfig);
		const dbAdapter = getDb();

		if (!dbAdapter) {
			throw new Error('Database adapter not initialized');
		}

		const results: Record<string, unknown> = {};

		// Clear users collection/table
		try {
			if (dbAdapter.user?.deleteMany) {
				// Try to delete all users using the adapter interface
				const deletedCount = await dbAdapter.user.deleteMany({});
				results.usersDeleted = deletedCount;
				logger.info('Users cleared via adapter', { deletedCount });
			} else if (dbAdapter.raw) {
				// Fallback to raw database operations for MongoDB
				if (typeof dbAdapter.raw.db === 'function') {
					const db = dbAdapter.raw.db();
					const userCollection = db.collection('users');
					const deleteResult = await userCollection.deleteMany({});
					results.usersDeleted = deleteResult.deletedCount;
					logger.info('Users cleared via raw MongoDB', { deletedCount: deleteResult.deletedCount });
				}
			}
		} catch (error) {
			results.userDeletionError = error.message;
			logger.error('Failed to clear users', { error: error.message });
		}

		// Clear any user sessions
		try {
			if (dbAdapter.raw && typeof dbAdapter.raw.db === 'function') {
				const db = dbAdapter.raw.db();
				const sessionsCollection = db.collection('sessions');
				const sessionResult = await sessionsCollection.deleteMany({});
				results.sessionsDeleted = sessionResult.deletedCount;
				logger.info('Sessions cleared', { deletedCount: sessionResult.deletedCount });
			}
		} catch (error) {
			results.sessionDeletionError = error.message;
		}

		// Clear any auth tokens
		try {
			if (dbAdapter.raw && typeof dbAdapter.raw.db === 'function') {
				const db = dbAdapter.raw.db();
				const tokensCollection = db.collection('tokens');
				const tokenResult = await tokensCollection.deleteMany({});
				results.tokensDeleted = tokenResult.deletedCount;
				logger.info('Tokens cleared', { deletedCount: tokenResult.deletedCount });
			}
		} catch (error) {
			results.tokenDeletionError = error.message;
		}

		logger.info('Database user clearing completed', { results });

		return json({
			success: true,
			timestamp: new Date().toISOString(),
			database: dbConfig.name,
			message: 'User data clearing attempted',
			results
		});
	} catch (error) {
		logger.error('Database user clearing failed', { error: error.message });
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
