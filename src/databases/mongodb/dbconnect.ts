/**
 * @file src/databases/mongodb/dbconnect.ts
 * @description MongoDB connection logic for the CMS.
 *
 * This module provides robust MongoDB connection handling with retry logic,
 * structured logging, and environment-based configuration.
 */

// Handle private config that might not exist during setup
let privateEnv: any = null;

// Function to load private config when needed
async function loadPrivateConfig() {
	if (privateEnv) return privateEnv;

	try {
		const module = await import('@root/config/private');
		privateEnv = module.privateEnv;
		return privateEnv;
	} catch (error) {
		return null;
	}
}

import mongoose from 'mongoose';

import type { ConnectOptions } from 'mongoose';

// System Logger
import { logger } from '@utils/logger.svelte';

const DB_TIMEOUT = 15000; // 15 seconds timeout for server selection

/**
 * Connect to MongoDB with explicit database configuration (used during setup)
 */
export async function connectToMongoDBWithConfig(dbConfig: {
	host: string;
	port: number;
	name: string;
	user: string;
	password: string;
}): Promise<void> {
	// Check if already connected to avoid multiple connections
	if (mongoose.connection.readyState === 1) {
		logger.info('MongoDB already connected, skipping connection attempt');
		return;
	}

	// Default configuration constants for setup
	const MAX_RETRIES = 5;
	const RETRY_DELAY = 5000;

	const isAtlas = dbConfig.host.startsWith('mongodb+srv://');
	const connectionString = isAtlas
		? `${dbConfig.host}/${dbConfig.name}`
		: `${dbConfig.host}${dbConfig.port ? `:${dbConfig.port}` : ''}/${dbConfig.name}`;

	const options: ConnectOptions = {
		authSource: isAtlas ? undefined : 'admin',
		user: dbConfig.user,
		pass: dbConfig.password,
		dbName: dbConfig.name,
		maxPoolSize: 5,
		retryWrites: true,
		serverSelectionTimeoutMS: DB_TIMEOUT
	};

	// Only add event handlers if not already added
	if (mongoose.connection.listenerCount('connected') === 0) {
		mongoose.connection.on('connected', () => logger.info('MongoDB connection established successfully.'));
		mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection lost. Attempting to reconnect...'));
		mongoose.connection.on('error', (err) => logger.error(`MongoDB connection error: ${err.message}`));
	}

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			logger.info(`\x1b[33mAttempting to connect to MongoDB (Attempt ${attempt}/${MAX_RETRIES})...\x1b[0m`);
			await mongoose.connect(connectionString, options);
			logger.info(`\x1b[32mSuccessfully connected to MongoDB database: \x1b[34m${dbConfig.name}\x1b[0m`);
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

/**
 * Connect to the MongoDB database with retry logic.
 */
export async function connectToMongoDB(): Promise<void> {
	// Check if already connected to avoid multiple connections
	if (mongoose.connection.readyState === 1) {
		logger.info('MongoDB already connected, skipping connection attempt');
		return;
	}

	// Load private config dynamically
	const config = await loadPrivateConfig();
	if (!config) {
		logger.debug('Private config not available - skipping MongoDB connection during setup');
		return;
	}

	// Configuration constants loaded from config
	const MAX_RETRIES = config.DB_RETRY_ATTEMPTS || 5;
	const RETRY_DELAY = config.DB_RETRY_DELAY || 5000;

	const isAtlas = config.DB_HOST?.startsWith('mongodb+srv://');
	const connectionString = isAtlas
		? `${config.DB_HOST}/${config.DB_NAME}`
		: `${config.DB_HOST}${config.DB_PORT ? `:${config.DB_PORT}` : ''}/${config.DB_NAME}`;

	const options: ConnectOptions = {
		authSource: isAtlas ? undefined : 'admin',
		user: config.DB_USER,
		pass: config.DB_PASSWORD,
		dbName: config.DB_NAME,
		maxPoolSize: config.DB_POOL_SIZE || 5,
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

	// Only add event handlers if not already added
	if (mongoose.connection.listenerCount('connected') === 0) {
		mongoose.connection.on('connected', () => logger.info('MongoDB connection established successfully.'));
		mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection lost. Attempting to reconnect...'));
		mongoose.connection.on('error', (err) => logger.error(`MongoDB connection error: ${err.message}`));
	}

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			logger.info(`\x1b[33mAttempting to connect to MongoDB (Attempt ${attempt}/${MAX_RETRIES})...\x1b[0m`);
			await mongoose.connect(connectionString, options);
			logger.info(`\x1b[32mSuccessfully connected to MongoDB database: \x1b[34m${config.DB_NAME}\x1b[0m`);
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
