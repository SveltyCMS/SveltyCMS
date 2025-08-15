/**
 * @file src/databases/mongodb/dbconnect.ts
 * @description MongoDB connection logic for the CMS.
 *
 * This module provides robust MongoDB connection handling with retry logic,
 * structured logging, and environment-based configuration.
 */

// Shared connection retry constants
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

// Import private configuration from new secure approach
import { privateConfig } from '@src/lib/env.server';

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
	if (!privateConfig.DB_HOST || !privateConfig.DB_NAME) {
		logger.error('MongoDB connection failed: Database configuration is missing.');
		logger.error('Please run the setup wizard to configure your database connection.');
		throw new Error('Database configuration missing. Run setup before starting the server.');
	}

	const hasScheme = privateConfig.DB_HOST.startsWith('mongodb://') || privateConfig.DB_HOST.startsWith('mongodb+srv://');
	const isAtlas = privateConfig.DB_HOST.startsWith('mongodb+srv://');
	const hostWithScheme = hasScheme ? privateConfig.DB_HOST : `mongodb://${privateConfig.DB_HOST}`;
	const connectionString = isAtlas
		? `${hostWithScheme}/${privateConfig.DB_NAME}`
		: `${hostWithScheme}${privateConfig.DB_PORT ? `:${privateConfig.DB_PORT}` : ''}/${privateConfig.DB_NAME}`;

	const options: ConnectOptions = {
		authSource: isAtlas ? undefined : 'admin',
		user: privateConfig.DB_USER,
		pass: privateConfig.DB_PASSWORD,
		dbName: privateConfig.DB_NAME,
		maxPoolSize: 5, // Default pool size
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
			logger.info(`\x1b[32mSuccessfully connected to MongoDB database: \x1b[34m${privateConfig.DB_NAME}\x1b[0m`);
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
