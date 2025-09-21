/**
 * @file src/routes/api/setup/migrate-users/+server.ts
 * @description Migration endpoint to move user data from 'users' collection to 'auth_users' collection
 */

import { getDb, initConnection } from '@src/databases/db';
import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = await request.json();

		// Initialize temporary connection for migration
		await initConnection(dbConfig);
		const dbAdapter = getDb();

		if (!dbAdapter) {
			throw new Error('Database adapter not initialized');
		}

		const results: Record<string, unknown> = {};

		// Check if we have raw MongoDB access
		if (dbAdapter.raw && typeof dbAdapter.raw.db === 'function') {
			const db = dbAdapter.raw.db();

			// Check if 'users' collection exists and has data
			const usersCollection = db.collection('users');
			const authUsersCollection = db.collection('auth_users');

			const usersCount = await usersCollection.countDocuments();
			const authUsersCount = await authUsersCollection.countDocuments();

			results.beforeMigration = {
				usersCount,
				authUsersCount
			};

			if (usersCount > 0) {
				logger.info('Starting user migration', { usersCount, authUsersCount });

				// Get all users from 'users' collection
				const usersData = await usersCollection.find({}).toArray();

				// Insert into 'auth_users' collection (only if not already present)
				if (usersData.length > 0) {
					// Check for existing users in auth_users to avoid duplicates
					const existingEmails = await authUsersCollection.distinct('email');
					const newUsers = usersData.filter((user) => !existingEmails.includes(user.email));

					if (newUsers.length > 0) {
						await authUsersCollection.insertMany(newUsers);
						results.usersInserted = newUsers.length;
						logger.info('Users inserted into auth_users collection', { count: newUsers.length });
					} else {
						results.usersInserted = 0;
						logger.info('No new users to insert - all users already exist in auth_users');
					}

					// Remove users from old 'users' collection
					await usersCollection.deleteMany({});
					results.usersRemovedFromOldCollection = usersCount;
					logger.info('Users removed from old users collection', { count: usersCount });
				}
			} else {
				results.message = 'No users found in users collection to migrate';
				logger.info('No users to migrate');
			}

			// Final counts
			const finalUsersCount = await usersCollection.countDocuments();
			const finalAuthUsersCount = await authUsersCollection.countDocuments();

			results.afterMigration = {
				usersCount: finalUsersCount,
				authUsersCount: finalAuthUsersCount
			};
		} else {
			throw new Error('Raw database access not available for migration');
		}

		logger.info('User migration completed', { results });

		return json({
			success: true,
			timestamp: new Date().toISOString(),
			database: dbConfig.name,
			message: 'User migration completed successfully',
			results
		});
	} catch (error) {
		logger.error('User migration failed', { error: error.message });
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
