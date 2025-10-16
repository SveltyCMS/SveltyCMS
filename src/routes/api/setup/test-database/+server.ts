/**
 * @file src/routes/api/setup/test-database/+server.ts
 * @description An API endpoint to test MongoDB connections during setup with detailed feedback.
 */

import { databaseConfigSchema, type DatabaseConfig } from '@src/databases/schemas';
import { logger } from '@utils/logger.svelte';
import { json, type RequestHandler } from '@sveltejs/kit';
import { exec } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { safeParse } from 'valibot';
// ParaglideJS
import * as m from '@src/paraglide/messages';
// Centralized error classification
import { classifyDatabaseError } from '../errorClassifier';

const execAsync = promisify(exec);

// =================================================================================================
// Package Manager Detection and Driver Installation
// =================================================================================================

// Detects the package manager used in the project
function detectPackageManager(): 'bun' | 'yarn' | 'pnpm' | 'npm' {
	const cwd = process.cwd();

	// Check for lock files in order of preference
	if (existsSync(join(cwd, 'bun.lock'))) {
		return 'bun';
	}
	if (existsSync(join(cwd, 'yarn.lock'))) {
		return 'yarn';
	}
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
		return 'pnpm';
	}
	if (existsSync(join(cwd, 'package-lock.json'))) {
		return 'npm';
	}

	// Default to npm if no lock file is found
	return 'npm';
}

/**
 * Gets the install command for the detected package manager.
 */
function getInstallCommand(packageName: string, packageManager: string): string {
	switch (packageManager) {
		case 'bun':
			return `bun add ${packageName}`;
		case 'yarn':
			return `yarn add ${packageName}`;
		case 'pnpm':
			return `pnpm add ${packageName}`;
		case 'npm':
		default:
			return `npm install ${packageName}`;
	}
}

/**
 * Installs a database driver package using the detected package manager.
 */
async function installDriver(packageName: string): Promise<{ success: boolean; error?: string; output?: string }> {
	try {
		logger.info(`Installing database driver: ${packageName}`);

		// Detect the package manager and get the appropriate install command
		const packageManager = detectPackageManager();
		const installCommand = getInstallCommand(packageName, packageManager);

		logger.info(`Using package manager: ${packageManager} with command: ${installCommand}`);

		// Execute the install command
		const { stdout, stderr } = await execAsync(installCommand, {
			cwd: process.cwd(),
			timeout: 120000 // 2 minute timeout
		});

		const output = stdout + stderr;
		logger.info(`Driver installation completed: ${packageName}`, { output });

		return { success: true, output };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Driver installation failed: ${packageName}`, { error: errorMessage });

		return {
			success: false,
			error: errorMessage,
			output: error instanceof Error && 'stdout' in error ? (error.stdout as string) + (error.stderr as string) : undefined
		};
	}
}

const DB_TIMEOUT = 15000; // 15s server selection timeout

// Checks if MongoDB driver (mongoose) is available
async function checkMongoDBDriver(): Promise<{ available: boolean; error?: string }> {
	try {
		// Try to import mongoose to check if it's installed
		// Use a static string literal to help bundlers
		await import('mongoose');
		logger.info('MongoDB driver (mongoose) is available');
		return { available: true };
	} catch (error) {
		logger.warn('MongoDB driver (mongoose) is not installed:', error);
		return {
			available: false,
			error: 'MongoDB driver not installed. It will be installed automatically.'
		};
	}
}

// =================================================================================================
// MongoDB Connection Tester
// =================================================================================================

// Tests a MongoDB connection with detailed validation and error classification.
async function testMongoDbConnection(dbConfig: DatabaseConfig) {
	let mongoose: typeof import('mongoose');
	// Defensive dynamic import and check
	const importedUtils = await import('../utils');
	if (!importedUtils || typeof importedUtils.buildDatabaseConnectionString !== 'function') {
		logger.error('buildDatabaseConnectionString is missing or not a function after import:', importedUtils);
		throw new Error('Internal error: buildDatabaseConnectionString is not available. Check for circular dependencies or build issues.');
	}
	const { buildDatabaseConnectionString } = importedUtils;
	const connectionString = buildDatabaseConnectionString(dbConfig);
	const isAtlas = connectionString.startsWith('mongodb+srv://');
	const options = {
		user: dbConfig.user || undefined,
		pass: dbConfig.password || undefined,
		dbName: dbConfig.name,
		authSource: isAtlas ? 'admin' : 'admin',
		retryWrites: true,
		serverSelectionTimeoutMS: DB_TIMEOUT,
		maxPoolSize: 1,
		...(isAtlas && {
			tls: true,
			tlsAllowInvalidCertificates: false
		})
	};
	let conn;
	const warnings: string[] = [];
	let authenticatedUsers: Array<{ user: string; db: string }> = [];
	let dbStats: Record<string, unknown> | null = null;
	let collectionsSample: string[] = [];
	const start = Date.now();
	let resultPayload: object | null = null;
	try {
		const driverCheck = await checkMongoDBDriver();
		if (!driverCheck.available) {
			logger.warn('MongoDB driver not available. Attempting automatic installation...');
			try {
				const installResult = await installDriver('mongoose');
				if (installResult.success) {
					logger.info('MongoDB driver installed successfully, retrying import...');
					mongoose = (await import('mongoose')).default;
				} else {
					const errorMsg = installResult?.error || 'Unknown installation error';
					logger.error('Failed to install MongoDB driver automatically:', errorMsg);
					return json(
						{
							success: false,
							error: 'MongoDB driver not installed and automatic installation failed',
							details: `Please install manually: ${errorMsg}`,
							installOutput: installResult?.output
						},
						{ status: 500 }
					);
				}
			} catch (installError) {
				logger.error('Error during automatic driver installation:', installError);
				return json(
					{
						success: false,
						error: 'MongoDB driver not installed',
						details: 'To test MongoDB connections, install the mongoose package: bun add mongoose'
					},
					{ status: 500 }
				);
			}
		} else {
			try {
				mongoose = (await import('mongoose')).default;
				logger.info('Successfully imported mongoose');
			} catch (importError) {
				logger.error('Failed to import mongoose:', importError);
				return json(
					{
						success: false,
						error: 'MongoDB driver import failed',
						details: 'Failed to import mongoose after confirming it was available.'
					},
					{ status: 500 }
				);
			}
		}
		if (!mongoose) {
			logger.error('Failed to import mongoose after driver check');
			return json(
				{
					success: false,
					error: 'MongoDB driver not available',
					details: 'Failed to import mongoose. Please check your installation.'
				},
				{ status: 500 }
			);
		}
		logger.info('🔌 Attempting MongoDB connection...', {
			host: dbConfig.host,
			port: dbConfig.port,
			database: dbConfig.name,
			hasCredentials: Boolean(dbConfig.user || dbConfig.password),
			hasUser: Boolean(dbConfig.user),
			hasPassword: Boolean(dbConfig.password),
			isAtlas,
			connectionString: connectionString.replace(/:([^:]+)@/, ':****@'),
			options: { ...options, pass: options.pass ? '****' : undefined }
		});
		if (isAtlas && !dbConfig.user && !dbConfig.password) {
			logger.warn('❌ Atlas connection attempted without credentials');
			const durationMs = Date.now() - start;
			return json(
				{
					success: false,
					error: 'MongoDB Atlas requires authentication',
					userFriendly: 'MongoDB Atlas requires a username and password. Please provide your database credentials.',
					classification: 'credentials_required',
					latencyMs: durationMs,
					details: 'Atlas clusters always require authentication. Please provide your database username and password.'
				},
				{ status: 400 }
			);
		}
		conn = await mongoose.createConnection(connectionString, options).asPromise();
		const nativeDb = conn.getClient().db(dbConfig.name);
		try {
			await nativeDb.command({ ping: 1 });
			logger.info('✅ Ping command successful');
		} catch (pingError) {
			logger.warn('❌ Ping command failed:', pingError);
			throw pingError;
		}
		try {
			dbStats = await nativeDb.command({ dbStats: 1, scale: 1 });
		} catch {
			warnings.push('dbStats_not_authorized');
		}
		try {
			const cols = await nativeDb.listCollections({}, { nameOnly: true }).toArray();
			collectionsSample = cols.slice(0, 3).map((c) => c.name);
		} catch {
			warnings.push('listCollections_failed');
		}
		try {
			const status = await nativeDb.admin().command({ connectionStatus: 1 });
			if (status?.authInfo?.authenticatedUsers) authenticatedUsers = status.authInfo.authenticatedUsers;
			logger.info('Auth status check result:', { authenticatedUsers: authenticatedUsers.length, status });
		} catch (authError) {
			logger.warn('Auth status check failed:', authError);
			warnings.push('auth_status_unavailable');
		}

		const durationMs = Date.now() - start;
		const authProvided = Boolean(dbConfig.user || dbConfig.password);
		const authenticated = authenticatedUsers.length > 0;
		logger.info('Authentication analysis:', {
			authProvided,
			authenticated,
			authenticatedUsersCount: authenticatedUsers.length,
			warnings
		});
		let success = false;
		let message = '';
		let classification: string | undefined;
		let userFriendly: string | undefined;

		// Simple success criteria: connection works and authentication succeeded if credentials provided
		if (authProvided && !warnings.includes('ping_failed')) {
			success = true;
			message = m.api_db_test_success_authenticated();
			logger.info('✅ Connection successful with credentials provided');
		} else if (authenticated) {
			success = true;
			message = authProvided ? m.api_db_test_success_authenticated() : m.api_db_test_success_implicit_auth();
			if (!authProvided) {
				warnings.push('unexpected_authenticated_without_credentials');
			}
		} else {
			if (authProvided) {
				success = false;
				message = m.api_db_test_auth_failed();
				classification = 'authentication_failed';
				userFriendly = 'Authentication failed. Please check your username and password.';
				warnings.push('credentials_not_authenticated');
				logger.warn('Authentication failed despite providing credentials');
			} else {
				warnings.push('unauthenticated_connection');
				const canListCollections = !warnings.includes('listCollections_failed');
				if (canListCollections) {
					success = true;
					message = m.api_db_test_success_no_auth();
				} else {
					success = false;
					message = m.api_db_test_conn_unauthorized();
					classification = 'credentials_required';
					userFriendly = 'Authentication required. Please provide your username and password.';
				}
			}
		}

		// ============================================================================
		// AFTER SUCCESSFUL TEST: Write private.ts AND seed database
		// ============================================================================
		if (success) {
			// Test passed - user can proceed to next step
			// Note: private.ts and database seeding happens when user clicks "Next" button
			logger.info('✅ Connection test passed! User can proceed to next step');
			message = 'Database connected successfully! ✨';
		}

		// Compile final result payload
		resultPayload = {
			success,
			message,
			atlas: isAtlas,
			usedUri: connectionString.replace(/:([^:]+)@/, ':****@'),
			authenticated,
			warnings,
			latencyMs: durationMs,
			collectionsSample,
			stats: dbStats ? { collections: dbStats.collections, objects: dbStats.objects, dataSize: dbStats.dataSize } : null,
			authenticatedUsers,
			classification,
			userFriendly
		};
	} catch (error) {
		// If connection fails, classify the error and return details
		const errorDetails = {
			message: error instanceof Error ? error.message : String(error),
			name: error instanceof Error ? error.name : 'UnknownError',
			code: (error as { code?: string | number })?.code,
			codeName: (error as { codeName?: string })?.codeName,
			errno: (error as { errno?: string | number })?.errno
		};

		// Close connection if it was established
		if (conn) {
			await conn.close().catch((closeError) => logger.warn('Failed to close connection after error:', closeError));
		}

		if (!error) {
			logger.error('❌ Error parameter is undefined in catch block');
			return json(
				{
					success: false,
					error: 'Unknown error occurred',
					userFriendly: 'An unexpected error occurred during database connection',
					classification: 'unknown',
					latencyMs: Date.now() - start,
					details: { message: 'Error parameter was undefined' }
				},
				{ status: 500 }
			);
		}

		// Classify the error to get user-friendly message
		const classified = classifyDatabaseError(error, 'mongodb', dbConfig);

		if (!classified || typeof classified !== 'object') {
			logger.error('❌ Error classifier returned invalid result:', classified);
			return json(
				{
					success: false,
					error: String(error),
					userFriendly: 'Database connection failed. Please check your configuration.',
					classification: 'unknown',
					latencyMs: Date.now() - start,
					details: errorDetails
				},
				{ status: 500 }
			);
		}

		const { classification, raw, userFriendly } = classified;

		// Log comprehensive error information
		logger.error('❌ MongoDB connection test failed', {
			classification,
			errorCode: errorDetails.code,
			codeName: errorDetails.codeName,
			technicalMessage: errorDetails.message,
			host: dbConfig.host,
			port: dbConfig.port,
			database: dbConfig.name,
			hasCredentials: !!(dbConfig.user && dbConfig.password),
			isAtlas
		});

		logger.info('💡 User-friendly error:', userFriendly);
		logger.debug('🔍 Technical details:', {
			fullError: errorDetails.message,
			rawClassification: raw,
			suggestion: classification
		});
		const durationMs = Date.now() - start;
		return json(
			{
				success: false,
				error: raw,
				userFriendly,
				classification,
				latencyMs: durationMs,
				details: errorDetails,
				atlas: isAtlas,
				usedUri: connectionString.replace(/:([^:]+)@/, ':****@'),
				debug: {
					errorMessage: errorDetails.message,
					connectionString: connectionString.replace(/:([^:]+)@/, ':****@'),
					options: { ...options, pass: options.pass ? '****' : undefined }
				}
			},
			{ status: 500 }
		);
	} finally {
		if (conn) {
			await conn.close().catch((closeError) => logger.warn('Failed to close connection:', closeError));
		}
	}
	return json(resultPayload);
}

// =================================================================================================
// Drizzle (SQL) Connection Testers
// =================================================================================================

// Tests a PostgreSQL connection using Drizzle
async function testPostgresConnection(dbConfig: DatabaseConfig) {
	const start = Date.now();
	let client;
	try {
		let postgres;
		try {
			postgres = (await import('postgres')).default;
		} catch {
			logger.error('PostgreSQL driver not available. Install with: npm install postgres');
			return json(
				{
					success: false,
					error: 'PostgreSQL driver not installed',
					details: 'To test PostgreSQL connections, install the postgres package: npm install postgres'
				},
				{ status: 400 }
			);
		}
		// Defensive dynamic import and check
		const importedUtils = await import('../utils');
		if (!importedUtils || typeof importedUtils.buildDatabaseConnectionString !== 'function') {
			logger.error('buildDatabaseConnectionString is missing or not a function after import:', importedUtils);
			throw new Error('Internal error: buildDatabaseConnectionString is not available. Check for circular dependencies or build issues.');
		}
		const { buildDatabaseConnectionString } = importedUtils;
		const connectionString = buildDatabaseConnectionString(dbConfig);

		client = postgres(connectionString, {
			max: 1,
			connect_timeout: DB_TIMEOUT / 1000 // postgres uses seconds
		});

		// Only test the connection with a simple query
		await client`SELECT 1`;

		const durationMs = Date.now() - start;
		logger.info('✅ PostgreSQL connection test successful.');

		return json({
			success: true,
			message: m.api_db_test_success_authenticated(),
			latencyMs: durationMs
		});
	} catch (error) {
		logger.error('❌ PostgreSQL connection test failed:', { error });
		const { classification, raw, userFriendly } = classifyDatabaseError(error, 'postgres', dbConfig);
		const durationMs = Date.now() - start;
		return json(
			{
				success: false,
				error: raw,
				userFriendly,
				classification,
				latencyMs: durationMs
			},
			{ status: 500 }
		);
	} finally {
		if (client) {
			await client.end();
		}
	}
}

// Tests a MySQL/MariaDB connection using Drizzle
async function testMySqlConnection(dbConfig: DatabaseConfig) {
	const start = Date.now();
	let connection;
	try {
		let mysql;
		try {
			mysql = (await import('mysql2/promise')).default;
		} catch {
			logger.error('MySQL/MariaDB driver not available. Install with: npm install mysql2 mariadb');
			return json(
				{
					success: false,
					error: 'MySQL/MariaDB driver not installed',
					details: 'To test MySQL/MariaDB connections, install the required packages: npm install mysql2 mariadb'
				},
				{ status: 400 }
			);
		}
		// Defensive dynamic import and check
		const importedUtils = await import('../utils');
		if (!importedUtils || typeof importedUtils.buildDatabaseConnectionString !== 'function') {
			logger.error('buildDatabaseConnectionString is missing or not a function after import:', importedUtils);
			throw new Error('Internal error: buildDatabaseConnectionString is not available. Check for circular dependencies or build issues.');
		}
		const { buildDatabaseConnectionString } = importedUtils;
		const uri = buildDatabaseConnectionString(dbConfig);

		connection = await mysql.createConnection({
			uri,
			connectTimeout: DB_TIMEOUT
		});

		// Only test the connection with a simple query
		await connection.query('SELECT 1');

		const durationMs = Date.now() - start;
		logger.info('✅ MySQL/MariaDB connection test successful.');

		return json({
			success: true,
			message: m.api_db_test_success_authenticated(),
			latencyMs: durationMs
		});
	} catch (error) {
		logger.error('❌ MySQL/MariaDB connection test failed:', { error });
		const { classification, raw, userFriendly } = classifyDatabaseError(error, 'mysql', dbConfig);
		const durationMs = Date.now() - start;
		return json(
			{
				success: false,
				error: raw,
				userFriendly,
				classification,
				latencyMs: durationMs
			},
			{ status: 500 }
		);
	} finally {
		if (connection) {
			await connection.end();
		}
	}
}

// =================================================================================================
// Main API Endpoint
// =================================================================================================

/**
 * Main API endpoint to test MongoDB connections.
 * Simplified to focus on MongoDB as the primary database.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		logger.info('🚀 Starting database test request processing...');
		const raw = await request.json();
		logger.info('🔍 Raw request body received:', raw, typeof raw, Array.isArray(raw));
		// IMPORTANT: All dbConfig validation is performed server-side only using databaseConfigSchema.
		// The frontend should send the raw config object; only the server validates and normalizes it.

		// Convert port to number, handling empty strings for Atlas connections
		let port: number | undefined;
		if (typeof raw?.port === 'string') {
			const portNum = Number(raw.port);
			// For Atlas (mongodb+srv), port should be undefined if it's 0 or empty
			port = raw.type === 'mongodb+srv' && (portNum === 0 || raw.port === '') ? undefined : portNum;
		} else {
			port = raw?.port;
		}

		const body = {
			...raw,
			port,
			user: raw?.user ?? '',
			password: raw?.password ?? ''
		};
		logger.info('📝 Request body parsed successfully');

		// Validate the incoming configuration object
		const { success: validationSuccess, issues, output: dbConfig } = safeParse(databaseConfigSchema, body);
		if (!validationSuccess || !dbConfig) {
			logger.error('Invalid database configuration received for testing.', { issues });
			return json({ success: false, error: 'Invalid database configuration.', details: issues }, { status: 400 });
		}

		logger.info(`🎯 Database type ${dbConfig.type} is supported, proceeding with test...`);

		// Dispatch to the correct test function based on db type
		switch (dbConfig.type) {
			case 'mongodb':
			case 'mongodb+srv':
				return await testMongoDbConnection(dbConfig);
			case 'postgresql':
				return await testPostgresConnection(dbConfig);
			case 'mysql':
			case 'mariadb':
				return await testMySqlConnection(dbConfig);
			default:
				logger.warn(`Unsupported database type requested: ${dbConfig.type}`);
				return json(
					{
						success: false,
						error: `Database type '${dbConfig.type}' is not supported for testing.`
					},
					{ status: 400 }
				);
		}
	} catch (error) {
		// Simple, robust error logging to avoid recursive issues
		logger.error('🚨 Critical error in POST handler');
		// Try to log error details safely
		try {
			if (error) {
				logger.error('Error details:', String(error));
				// Log the full error object with JSON.stringify fallback
				try {
					logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
				} catch {
					logger.error('Error object (toString fallback):', String(error));
				}
			} else {
				logger.error('Error is undefined or null');
			}
		} catch (logError) {
			logger.error('❌ Error while logging error details:', logError);
		}

		// Defensive programming: handle cases where error might be undefined
		let errorMessage = 'Unknown error occurred';
		try {
			if (error instanceof Error) {
				errorMessage = error.message;
			} else if (typeof error === 'string') {
				errorMessage = error;
			} else if (error) {
				errorMessage = String(error);
			}
		} catch (debugError) {
			logger.error('❌ Error while processing error message:', debugError);
			errorMessage = 'Error processing failed';
		}

		return json(
			{
				success: false,
				error: 'Internal server error',
				userFriendly: 'An unexpected error occurred. Please try again.',
				details: errorMessage
			},
			{ status: 500 }
		);
	}
};
