/**
 * @file src/databases/mongodb/dbconnect.ts
 * @description MongoDB connection logic for the CMS.
 *
 * This module provides robust MongoDB connection handling with retry logic,
 * structured logging, and environment-based configuration.
 */

import { privateEnv } from '@root/config/private';
import mongoose from 'mongoose';

import type { ConnectOptions } from 'mongoose';

// System Logger
import { logger } from '@utils/logger.svelte';

// Configuration Constants
const MAX_RETRIES = privateEnv.DB_RETRY_ATTEMPTS || 5; // Default: 5 attempts
const RETRY_DELAY = privateEnv.DB_RETRY_DELAY || 5000; // Default: 5 seconds
const DB_TIMEOUT = 5000; // 5 seconds timeout for server selection

/**
 * Connect to the MongoDB database with retry logic.
 */
export async function connectToMongoDB(): Promise<void> {
	const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv://');
	const connectionString = isAtlas
		? `${privateEnv.DB_HOST}/${privateEnv.DB_NAME}`
		: `${privateEnv.DB_HOST}${privateEnv.DB_PORT ? `:${privateEnv.DB_PORT}` : ''}/${privateEnv.DB_NAME}`;

	const options: ConnectOptions = {
		authSource: isAtlas ? undefined : 'admin',
		user: privateEnv.DB_USER,
		pass: privateEnv.DB_PASSWORD,
		dbName: privateEnv.DB_NAME,
		maxPoolSize: privateEnv.DB_POOL_SIZE || 5,
		retryWrites: true,
		serverSelectionTimeoutMS: DB_TIMEOUT
		// Additional options for optimization and stability (consider enabling as needed):
		// autoIndex: false, // Disable auto-indexing in production, manage indexes manually
		// bufferCommands: false, // Disable command buffering if immediate execution is critical
		// serverApi: { // Enable stable API if using MongoDB Atlas (adjust version as needed)
		//     version: '1',
		//     strict: true,
		//     deprecationErrors: true
		// }

		// 		const optimizedConfig = {
		// maxPoolSize: 10, // Maintain up to 10 socket connections
		// serverSelectionTimeoutMS: 5000, // Keep trying for 5 seconds
		// socketTimeoutMS: 45000, // Close connections after 45 seconds inactivity
		// family: 4, // Use IPv4, skip IPv6
		// bufferMaxEntries: 0, // Disable mongoose buffering
		// bufferCommands: false, // Disable mongoose buffering
		// maxIdleTimeMS: 30000, // Close connections after 30 seconds inactivity
		// minPoolSize: 2, // Maintain at least 2 socket connections
		// };
		// 	};
	};

	// Mongoose Connection Event Handlers
	mongoose.connection.on('connected', () => logger.info('MongoDB connection established successfully.'));
	mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection lost. Attempting to reconnect...'));
	mongoose.connection.on('error', (err) => logger.error(`MongoDB connection error: ${err.message}`));

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			logger.info(`\x1b[33mAttempting to connect to MongoDB (Attempt ${attempt}/${MAX_RETRIES})...\x1b[0m`);
			await mongoose.connect(connectionString, options);
			logger.info(`\x1b[32mSuccessfully connected to MongoDB database: \x1b[34m${privateEnv.DB_NAME}\x1b[0m`);
			return;
		} catch (error) {
			logger.error(`MongoDB connection attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
			if (attempt === MAX_RETRIES) {
				logger.error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts.`);
				throw new Error('MongoDB connection failed.');
			}
			const delay = attempt * RETRY_DELAY;
			logger.info(`Retrying in ${delay / 1000} seconds...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}
