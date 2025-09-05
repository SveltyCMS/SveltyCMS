/**
 * @file src/routes/api/setup/test-database/+server.ts
 * @description Database-agnostic API endpoint to test database connections during setup
 *
 * Features:
 * - Database-agnostic connection testing
 * - Support for MongoDB (with extensibility for other databases)
 * - Background database initialization after successful connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { initSystemFromSetup } from '../seed';
import { logger } from '@utils/logger.svelte';

// Database-specific imports (will be dynamic based on DB_TYPE)
import mongoose from 'mongoose';

// Reuse similar timeout constant as in dbconnect.ts
const DB_TIMEOUT = 15000; // 15s server selection

/**
 * Database-agnostic connection testing
 * Currently supports MongoDB with extensibility for other database types
 */
async function testDatabaseConnection(dbConfig: any): Promise<{
	success: boolean;
	message: string;
	error?: string;
	userFriendly?: string;
	classification?: string;
	atlas?: boolean;
	usedUri?: string;
	authenticated?: boolean;
	warnings?: string[];
	latencyMs?: number;
	collectionsSample?: string[];
	stats?: any;
	authenticatedUsers?: any[];
}> {
	const dbType = dbConfig.type || 'mongodb'; // Default to MongoDB for backward compatibility

	switch (dbType) {
		case 'mongodb':
			return await testMongoDBConnection(dbConfig);
		case 'postgresql':
		case 'mariadb':
			throw new Error(`Database type ${dbType} testing not yet implemented`);
		default:
			throw new Error(`Unsupported database type: ${dbType}`);
	}
}

/**
 * Test MongoDB connection with detailed validation
 */
async function testMongoDBConnection(dbConfig: any) {
	// Placeholder implementation - MongoDB connection testing logic would go here
	// For now, return a basic success response
	return {
		success: true,
		message: 'MongoDB connection test placeholder',
		latencyMs: 100
	};
}

/**
 * Classify a Mongo connection error into a stable code we can translate client‑side.
 */
function classifyMongoError(err: unknown): { classification: string; raw: string; userFriendly: string } {
	const raw = err instanceof Error ? err.message : String(err);
	const lower = raw.toLowerCase();

	// Check for specific error patterns and provide user-friendly messages
	if (/auth/i.test(lower) && /fail|bad|auth/i.test(lower)) {
		return {
			classification: 'authentication_failed',
			raw,
			userFriendly: 'Authentication failed. Please check your username and password.'
		};
	}
	if (/not authorized|unauthorized|permission/i.test(lower)) {
		return {
			classification: 'not_authorized',
			raw,
			userFriendly: 'Access denied. The user does not have permission to access this database.'
		};
	}
	if (/ecconnrefused|connection refused/i.test(lower)) {
		return {
			classification: 'connection_refused',
			raw,
			userFriendly: 'Connection refused. Please check if the database server is running and the port is correct.'
		};
	}
	if (/enotfound|getaddrinfo|dns/i.test(lower)) {
		return {
			classification: 'dns_not_found',
			raw,
			userFriendly: 'Host not found. Please check the hostname or IP address.'
		};
	}
	if (/timed out|timeout|server selection timed out/i.test(lower)) {
		return {
			classification: 'timeout',
			raw,
			userFriendly: 'Connection timed out. Please check if the database server is reachable.'
		};
	}
	if (/tls|ssl|certificate/i.test(lower)) {
		return {
			classification: 'tls_error',
			raw,
			userFriendly: 'TLS/SSL connection error. Please check your security settings.'
		};
	}
	if (/uri malformed|invalid connection string|must begin with|invalid scheme/i.test(lower)) {
		return {
			classification: 'invalid_uri',
			raw,
			userFriendly: 'Invalid connection string. Please check your host and port configuration.'
		};
	}
	if (/unable to parse|invalid port|port.*invalid/i.test(lower)) {
		return {
			classification: 'invalid_port',
			raw,
			userFriendly: 'Invalid port number. Please enter a valid port (e.g., 27017 for MongoDB).'
		};
	}
	if (/invalid hostname|hostname.*invalid/i.test(lower)) {
		return {
			classification: 'invalid_hostname',
			raw,
			userFriendly: 'Invalid hostname. Please check the hostname or IP address format.'
		};
	}

	return {
		classification: 'unknown',
		raw,
		userFriendly: 'An unexpected error occurred. Please check your configuration and try again.'
	};
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = await request.json();

		// Test MongoDB connection with deeper validation
		if (dbConfig.type === 'mongodb') {
			// Accept either hostnames (localhost, mongo) or full URIs (mongodb:// / mongodb+srv://)
			const hasScheme = typeof dbConfig.host === 'string' && (dbConfig.host.startsWith('mongodb://') || dbConfig.host.startsWith('mongodb+srv://'));
			const isAtlas = hasScheme && dbConfig.host.startsWith('mongodb+srv://');
			const baseHost = hasScheme ? dbConfig.host : `mongodb://${dbConfig.host}`;

			// Append port only if: not Atlas, a port provided, and baseHost does not already include an explicit port
			let hostWithPort = baseHost;
			if (!isAtlas && dbConfig.port) {
				// Extract host portion after scheme before any slash or query
				const hostPortPart = baseHost.replace(/^mongodb(?:\+srv)?:\/\//, '').split('/')[0];
				const alreadyHasPort = /:[0-9]+$/.test(hostPortPart);
				if (!alreadyHasPort) hostWithPort = `${baseHost}:${dbConfig.port}`;
			}

			const connectionString = isAtlas ? `${baseHost}/${dbConfig.name}` : `${hostWithPort}/${dbConfig.name}`;

			const options = {
				user: dbConfig.user || undefined,
				pass: dbConfig.password || undefined,
				dbName: dbConfig.name,
				authSource: isAtlas ? undefined : 'admin',
				retryWrites: true,
				serverSelectionTimeoutMS: DB_TIMEOUT,
				maxPoolSize: 1 // minimal pool for a probe
			};

			let conn;
			const warnings: string[] = [];
			let authenticatedUsers: Array<{ user: string; db: string }> = [];
			let dbStats: Record<string, unknown> | null = null;
			let collectionsSample: string[] = [];
			const start = Date.now();

			try {
				conn = await mongoose.createConnection(connectionString, options).asPromise();
				const nativeDb = conn.getClient().db(dbConfig.name);
				// Force server selection + auth
				await nativeDb.command({ ping: 1 });
				// Gather lightweight stats (ignore if unauthorized)
				try {
					dbStats = await nativeDb.command({ dbStats: 1, scale: 1 });
				} catch {
					warnings.push('dbStats_not_authorized');
				}
				// List up to 3 collection names to prove namespace access
				try {
					const cols = await nativeDb.listCollections({}, { nameOnly: true }).toArray();
					collectionsSample = cols.slice(0, 3).map((c) => c.name);
				} catch {
					warnings.push('listCollections_failed');
				}
				// Connection / auth status (admin command requires role; ignore failures)
				try {
					const status = await nativeDb.admin().command({ connectionStatus: 1 });
					if (status?.authInfo?.authenticatedUsers) authenticatedUsers = status.authInfo.authenticatedUsers;
				} catch {
					warnings.push('auth_status_unavailable');
				}
			} catch (error) {
				const { classification, raw, userFriendly } = classifyMongoError(error);
				return json(
					{
						success: false,
						error: raw,
						userFriendly,
						classification,
						atlas: isAtlas,
						usedUri: connectionString
					},
					{ status: 500 }
				);
			}

			const durationMs = Date.now() - start;
			const authProvided = Boolean(dbConfig.user || dbConfig.password);
			const authenticated = authenticatedUsers.length > 0;
			if (!authProvided && authenticated) {
				warnings.push('unexpected_authenticated_without_credentials');
			}
			if (!authProvided && !authenticated) {
				warnings.push('unauthenticated_connection');
			}
			if (authProvided && !authenticated) {
				warnings.push('credentials_not_authenticated');
			}

			// Determine success & messaging
			let success = authenticated;
			let message = authenticated ? 'Database connection (authenticated) successful' : 'Database connection successful (no authentication required)';
			if (!authProvided) {
				// If no credentials supplied, we still may want to warn rather than succeed silently
				if (authenticated) {
					// Edge case: server auto-auth (X509 / mechanism) – treat as success
					success = true;
					message = 'Database connection successful (implicit authentication)';
				} else {
					// For local Docker MongoDB, unauthenticated connections are normal and expected
					success = true;
					message = 'Database connection successful (no authentication required)';
				}
			}

			// If connection is successful, initialize the database structure and seed data in background
			if (success) {
				// Start seeding in background without awaiting it
				// This allows the user to proceed to the next step while seeding continues
				(async () => {
					try {
						// Close the test connection first
						if (conn) {
							await conn.close().catch(() => {});
						}

						// Create a temporary database adapter for seeding
						const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
						const tempAdapter = new MongoDBAdapter();

						// Connect the adapter using the same connection string
						const connectResult = await tempAdapter.connect(connectionString, options);
						if (!connectResult.success) {
							throw new Error(`Temporary adapter connection failed: ${connectResult.error?.message}`);
						}

						// Clear the database to ensure clean setup
						logger.info('🧹 Clearing existing database collections for clean setup...');
						const db = mongoose.connection.db;
						if (db) {
							const collections = await db.listCollections().toArray();
							for (const collection of collections) {
								await db
									.collection(collection.name)
									.drop()
									.catch(() => {
										// Ignore errors if collection doesn't exist
									});
							}
							logger.info(`🗑️ Cleared ${collections.length} collections`);
						}

						// Initialize auth models
						await tempAdapter.auth.setupAuthModels();

						// Now seed with the proper adapter
						await initSystemFromSetup(tempAdapter);

						logger.info('✅ Background database initialization completed');

						// Disconnect the temporary adapter
						await tempAdapter.disconnect();
					} catch (initError) {
						logger.warn('⚠️ Background database initialization failed, but connection is working:', initError);
					}
				})();

				message += ' - Database initialization started in background';
			} else {
				// If connection failed, close immediately
				if (conn) {
					await conn.close().catch(() => {});
				}
			}

			return json({
				success,
				message,
				atlas: isAtlas,
				usedUri: connectionString,
				authenticated,
				warnings,
				latencyMs: durationMs,
				collectionsSample,
				stats: dbStats ? { collections: dbStats.collections, objects: dbStats.objects, dataSize: dbStats.dataSize } : null,
				authenticatedUsers
			});
		} else {
			// Placeholder for future database engines
			return json({
				success: false,
				error: 'Database type not yet supported for testing'
			});
		}
	} catch (error) {
		const { classification, raw, userFriendly } = classifyMongoError(error);
		return json(
			{
				success: false,
				error: raw,
				userFriendly,
				classification
			},
			{ status: 500 }
		);
	}
};
