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

// Directly import privateEnv from config/private
import { privateEnv } from '@root/config/private';

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

	// Normalize host to ensure scheme present (users might enter just 'localhost' or 'mongo')
	const hasScheme = dbConfig.host.startsWith('mongodb://') || dbConfig.host.startsWith('mongodb+srv://');
	const normalizedHost = hasScheme ? dbConfig.host : `mongodb://${dbConfig.host}`;
	const isAtlas = normalizedHost.startsWith('mongodb+srv://');
	const connectionString = isAtlas
		? `${normalizedHost}/${dbConfig.name}`
		: `${normalizedHost}${dbConfig.port ? `:${dbConfig.port}` : ''}/${dbConfig.name}`;
	logger.info(`Using MongoDB connection string: ${connectionString.replace(/:(.*?)@/, ':****@')}`);

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
	if (!privateEnv) {
		logger.error('MongoDB connection failed: privateEnv is null. The database is not configured.');
		logger.error('Please run the setup wizard to configure your database connection.');
		throw new Error('Database configuration missing. Run setup before starting the server.');
	}

	const hasScheme = privateEnv.DB_HOST.startsWith('mongodb://') || privateEnv.DB_HOST.startsWith('mongodb+srv://');
	const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv://');
	const hostWithScheme = hasScheme ? privateEnv.DB_HOST : `mongodb://${privateEnv.DB_HOST}`;
	const connectionString = isAtlas
		? `${hostWithScheme}/${privateEnv.DB_NAME}`
		: `${hostWithScheme}${privateEnv.DB_PORT ? `:${privateEnv.DB_PORT}` : ''}/${privateEnv.DB_NAME}`;

	const options: ConnectOptions = {
		authSource: isAtlas ? undefined : 'admin',
		user: privateEnv.DB_USER,
		pass: privateEnv.DB_PASSWORD,
		dbName: privateEnv.DB_NAME,
		maxPoolSize: privateEnv.DB_POOL_SIZE || 5,
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
