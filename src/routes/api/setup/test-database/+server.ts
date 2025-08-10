/**
 * @file src/routes/api/setup/test-database/+server.ts
 * @description API endpoint to test database connections during setup
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import mongoose from 'mongoose';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = await request.json();

		// Test MongoDB connection
		if (dbConfig.type === 'mongodb') {
			const connectionString = dbConfig.host.startsWith('mongodb+srv://')
				? `${dbConfig.host}/${dbConfig.name}`
				: `${dbConfig.host}${dbConfig.port ? `:${dbConfig.port}` : ''}/${dbConfig.name}`;

			const options = {
				user: dbConfig.user || undefined,
				pass: dbConfig.password || undefined,
				maxPoolSize: 1 // Use minimal pool for testing
			};

			// Test connection
			const testConnection = await mongoose.createConnection(connectionString, options);
			await testConnection.asPromise();
			await testConnection.close();

			return json({
				success: true,
				message: 'Database connection successful'
			});
		} else {
			// For other database types, you would implement similar connection testing
			return json({
				success: false,
				error: 'Database type not yet supported for testing'
			});
		}
	} catch (error) {
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown database error'
		}, { status: 500 });
	}
};
