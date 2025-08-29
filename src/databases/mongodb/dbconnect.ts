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

import { privateEnv } from '@root/config/private';
import { config } from '@src/lib/config.server';

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
	// Check if we're in setup mode by checking database credentials directly
	const dbHost = privateEnv.DB_HOST;
	const dbUser = privateEnv.DB_USER;
	const dbPassword = privateEnv.DB_PASSWORD;

	// If database host is not configured, we're in setup mode
	if (!dbHost || String(dbHost).trim().length === 0) {
		logger.info('Skipping MongoDB connection: DB_HOST not configured (setup mode).');
		throw new Error('SETUP_MODE_DB_HOST_MISSING');
	}

	// Get database credentials from private config file (NOT from database)
	const dbPort = privateEnv.DB_PORT;
	const dbName = privateEnv.DB_NAME;
	const dbPoolSize = privateEnv.DB_POOL_SIZE || 5;

	// Check if database configuration is complete
	if (!dbHost || String(dbHost).trim().length === 0) {
		logger.info('Skipping MongoDB connection: DB_HOST not set (setup mode).');
		throw new Error('SETUP_MODE_DB_HOST_MISSING');
	}

	// Check if we already have an active connection to avoid multiple connections
	if (mongoose.connection.readyState === 1) {
		logger.info('MongoDB already connected, skipping connection attempt');
		return;
	}

	const hasScheme = dbHost.startsWith('mongodb://') || dbHost.startsWith('mongodb+srv://');
	const isAtlas = dbHost.startsWith('mongodb+srv://');
	const hostWithScheme = hasScheme ? dbHost : `mongodb://${dbHost}`;
	const connectionString = isAtlas ? `${hostWithScheme}/${dbName}` : `${hostWithScheme}${dbPort ? `:${dbPort}` : ''}/${dbName}`;

	const options: ConnectOptions = {
		authSource: isAtlas ? undefined : 'admin',
		user: dbUser,
		pass: dbPassword,
		dbName: dbName,
		maxPoolSize: dbPoolSize,
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
			logger.info(`\x1b[32mSuccessfully connected to MongoDB database: \x1b[34m${dbName}\x1b[0m`);
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
