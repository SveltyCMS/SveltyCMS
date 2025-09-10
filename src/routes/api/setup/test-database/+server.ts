/**
 * @file src/routes/api/setup/test-database/+server.ts
 * @description Database-agnostic API endpoint to test database connections during setup
 *
 * Features:
 * - Database-agnostic connection testing
 * - Support for MongoDB (with extensibility for other databases)
 * - Background database initialization after successful connection
 */

import * as m from '@src/paraglide/messages';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { initSystemFromSetup } from '../seed';
import type { RequestHandler } from './$types';

// Database-specific imports (will be dynamic based on DB_TYPE)
import mongoose from 'mongoose';

// Reuse similar timeout constant as in dbconnect.ts
const DB_TIMEOUT = 15000; // 15s server selection

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
			userFriendly: m.api_db_test_auth_failed
		};
	}
	if (/not authorized|unauthorized|permission/i.test(lower)) {
		return {
			classification: 'not_authorized',
			raw,
			userFriendly: m.api_db_test_auth_denied
		};
	}
	if (/ecconnrefused|connection refused/i.test(lower)) {
		return {
			classification: 'connection_refused',
			raw,
			userFriendly: m.api_db_test_conn_refused
		};
	}
	if (/enotfound|getaddrinfo|dns/i.test(lower)) {
		return {
			classification: 'dns_not_found',
			raw,
			userFriendly: m.api_db_test_host_not_found
		};
	}
	if (/timed out|timeout|server selection timed out/i.test(lower)) {
		return {
			classification: 'timeout',
			raw,
			userFriendly: m.api_db_test_timeout
		};
	}
	if (/tls|ssl|certificate/i.test(lower)) {
		return {
			classification: 'tls_error',
			raw,
			userFriendly: m.api_db_test_tls_error
		};
	}
	if (/uri malformed|invalid connection string|must begin with|invalid scheme/i.test(lower)) {
		return {
			classification: 'invalid_uri',
			raw,
			userFriendly: m.api_db_test_invalid_uri
		};
	}
	if (/unable to parse|invalid port|port.*invalid/i.test(lower)) {
		return {
			classification: 'invalid_port',
			raw,
			userFriendly: m.api_db_test_invalid_port
		};
	}
	if (/invalid hostname|hostname.*invalid/i.test(lower)) {
		return {
			classification: 'invalid_hostname',
			raw,
			userFriendly: m.api_db_test_invalid_hostname
		};
	}

	return {
		classification: 'unknown',
		raw,
		userFriendly: m.api_db_test_unexpected_error
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

			let success = false;
			let message = '';

			if (authenticated) {
				success = true;
				message = authProvided ? m.api_db_test_success_authenticated : m.api_db_test_success_implicit_auth;
				if (!authProvided) {
					warnings.push('unexpected_authenticated_without_credentials');
				}
			} else {
				// Not authenticated
				if (authProvided) {
					// Provided credentials, but failed to authenticate
					success = false;
					message = m.api_db_test_auth_failed;
					warnings.push('credentials_not_authenticated');
				} else {
					// No credentials provided, and not authenticated.
					warnings.push('unauthenticated_connection');
					// Check if we have permissions to do anything.
					const canListCollections = !warnings.includes('listCollections_failed');

					if (canListCollections) {
						// Likely a local DB with no auth. This is a success case for setup.
						success = true;
						message = m.api_db_test_success_no_auth;
					} else {
						// Connected but can't do anything. This is a failure.
						success = false;
						message = m.api_db_test_conn_unauthorized;
					}
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
						logger.warn('⚠️  Background database initialization failed, but connection is working:', initError);
					}
				})();

				message += m.api_db_test_init_background;
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
				error: m.api_db_test_unsupported_db
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
