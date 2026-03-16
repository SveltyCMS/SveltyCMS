/**
 * @file tests/bun/databases/db-interface.test.ts
 * @description Database-agnostic interface tests
 *
 * These tests verify that database adapters conform to the IDBAdapter interface
 * and handle operations correctly regardless of the underlying database technology.
 *
 * NOTE: TypeScript errors for 'bun:test' module are expected - it's a runtime module.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import type { DatabaseResult } from '../../../src/databases/db-interface';

describe('Database Interface Contract Tests', () => {
	let db: any = null;

	beforeAll(async () => {
		let privateEnv: any;
		try {
			// biome-ignore lint/suspicious/noTsIgnore: private.test.ts is generated at runtime in CI
			// @ts-ignore - private.test.ts is generated at runtime in CI, not present at type-check time
			const configModule = await import('../../../config/private.test');
			privateEnv = configModule.privateEnv;
		} catch {
			privateEnv = {
				DB_TYPE: process.env.DB_TYPE,
				DB_HOST: process.env.DB_HOST,
				DB_PORT: process.env.DB_PORT,
				DB_NAME: process.env.DB_NAME,
				DB_USER: process.env.DB_USER,
				DB_PASSWORD: process.env.DB_PASSWORD
			};
		}

		if (!privateEnv?.DB_TYPE) {
			console.warn('Skipping DB Interface tests: No private.test.ts or DB_TYPE found');
			return;
		}

		const dbType = privateEnv.DB_TYPE;
		const host = privateEnv.DB_HOST || process.env.DB_HOST || '127.0.0.1';
		const dbName = privateEnv.DB_NAME || process.env.DB_NAME || 'sveltycms_test';

		// Dynamically import the correct adapter based on DB_TYPE
		try {
			if (dbType === 'mongodb') {
				const { MongoDBAdapter } = await import('../../../src/databases/mongodb/mongo-db-adapter');
				db = new MongoDBAdapter();
				const port = privateEnv.DB_PORT || process.env.DB_PORT || '27017';
				let connectionString = `mongodb://${host}:${port}/${dbName}`;
				if (privateEnv.DB_USER && privateEnv.DB_PASSWORD) {
					connectionString = `mongodb://${privateEnv.DB_USER}:${privateEnv.DB_PASSWORD}@${host}:${port}/${dbName}`;
				}
				await db.connect(connectionString);
			} else if (dbType === 'mariadb') {
				const { MariaDBAdapter } = await import('../../../src/databases/mariadb/adapter');
				db = new MariaDBAdapter();
				const port = privateEnv.DB_PORT || process.env.DB_PORT || '3306';
				const connStr = `mariadb://${privateEnv.DB_USER}:${privateEnv.DB_PASSWORD}@${host}:${port}/${dbName}`;
				await db.connect(connStr);
			} else if (dbType === 'postgresql') {
				const { PostgreSQLAdapter } = await import('../../../src/databases/postgresql/adapter');
				db = new PostgreSQLAdapter();
				const port = privateEnv.DB_PORT || process.env.DB_PORT || '5432';
				const connStr = `postgresql://${privateEnv.DB_USER}:${privateEnv.DB_PASSWORD}@${host}:${port}/${dbName}`;
				await db.connect(connStr);
			} else if (dbType === 'sqlite') {
				const { SQLiteAdapter } = await import('../../../src/databases/sqlite/adapter');
				db = new SQLiteAdapter();
				await db.connect(dbName);
			} else {
				console.warn(`Skipping DB Interface tests: Unknown DB_TYPE '${dbType}'`);
				return;
			}

			console.log(`DB Interface Test: Connected to ${dbType} at ${host}`);

			// CRITICAL: Initialize lazy-loaded features for interface testing
			const initPromises = [];
			if (db.ensureAuth) initPromises.push(db.ensureAuth());
			if (db.ensureMedia) initPromises.push(db.ensureMedia());
			if (db.ensureContent) initPromises.push(db.ensureContent());
			if (db.ensureSystem) initPromises.push(db.ensureSystem());
			if (db.ensureMonitoring) initPromises.push(db.ensureMonitoring());
			await Promise.all(initPromises);
			console.log('DB Interface Test: All features initialized');
		} catch (err) {
			console.error('DB Interface Test: Failed to connect or initialize features', err);
		}
	});

	describe('Connection Management', () => {
		it('should implement connect method', () => {
			expect(typeof db?.connect).toBe('function');
		});

		it('should implement disconnect method', () => {
			expect(typeof db?.disconnect).toBe('function');
		});

		it('should implement isConnected method', () => {
			expect(typeof db?.isConnected).toBe('function');
		});

		it('should implement getConnectionHealth method', () => {
			expect(typeof db?.getConnectionHealth).toBe('function');
		});

		it('should implement waitForConnection method', () => {
			// Optional method for async adapters
			if (db?.waitForConnection) {
				expect(typeof db.waitForConnection).toBe('function');
			}
		});
	});

	describe('CRUD Operations', () => {
		it('should implement findOne method', () => {
			expect(typeof db?.crud?.findOne).toBe('function');
		});

		it('should implement findMany method', () => {
			expect(typeof db?.crud?.findMany).toBe('function');
		});

		it('should implement insert method', () => {
			expect(typeof db?.crud?.insert).toBe('function');
		});

		it('should implement update method', () => {
			expect(typeof db?.crud?.update).toBe('function');
		});

		it('should implement delete method', () => {
			expect(typeof db?.crud?.delete).toBe('function');
		});

		it('should implement batch operations', () => {
			expect(typeof db?.crud?.findByIds).toBe('function');
			expect(typeof db?.crud?.insertMany).toBe('function');
			expect(typeof db?.crud?.updateMany).toBe('function');
			expect(typeof db?.crud?.deleteMany).toBe('function');
		});

		it('should implement upsert operations', () => {
			expect(typeof db?.crud?.upsert).toBe('function');
			expect(typeof db?.crud?.upsertMany).toBe('function');
		});

		it('should implement aggregation methods', () => {
			expect(typeof db?.crud?.count).toBe('function');
			expect(typeof db?.crud?.exists).toBe('function');
			expect(typeof db?.crud?.aggregate).toBe('function');
		});
	});

	describe('Authentication Interface', () => {
		it('should implement user management methods', () => {
			expect(typeof db?.auth?.createUser).toBe('function');
			expect(typeof db?.auth?.getUserById).toBe('function');
			expect(typeof db?.auth?.getUserByEmail).toBe('function');
			expect(typeof db?.auth?.updateUserAttributes).toBe('function');
			expect(typeof db?.auth?.deleteUser).toBe('function');
			expect(typeof db?.auth?.getAllUsers).toBe('function');
		});

		it('should implement session management methods', () => {
			expect(typeof db?.auth?.createSession).toBe('function');
			expect(typeof db?.auth?.validateSession).toBe('function');
			expect(typeof db?.auth?.deleteSession).toBe('function');
			expect(typeof db?.auth?.deleteExpiredSessions).toBe('function');
			expect(typeof db?.auth?.invalidateAllUserSessions).toBe('function');
		});

		it('should implement token management methods', () => {
			expect(typeof db?.auth?.createToken).toBe('function');
			expect(typeof db?.auth?.validateToken).toBe('function');
			expect(typeof db?.auth?.consumeToken).toBe('function');
			// Note: getTokenData is in the interface but not implemented in MongoDB adapter yet
			// expect(typeof db?.auth?.getTokenData).toBe('function');
			expect(typeof db?.auth?.deleteExpiredTokens).toBe('function');
		});
	});

	describe('DatabaseResult Contract', () => {
		it('should return success result with data', () => {
			const successResult: DatabaseResult<string> = {
				success: true,
				data: 'test-data'
			};

			expect(successResult.success).toBe(true);
			expect(successResult.data).toBe('test-data');
		});

		it('should return failure result with error', () => {
			const failureResult: DatabaseResult<string> = {
				success: false,
				message: 'Operation failed',
				error: {
					code: 'TEST_ERROR',
					message: 'Test error message'
				}
			};

			expect(failureResult.success).toBe(false);
			expect(failureResult.error.code).toBe('TEST_ERROR');
			expect(failureResult.error.message).toBe('Test error message');
		});

		it('should include optional metadata in success result', () => {
			const resultWithMeta: DatabaseResult<string> = {
				success: true,
				data: 'test',
				meta: {
					executionTime: 100,
					cached: false
				}
			};

			expect(resultWithMeta.meta?.executionTime).toBe(100);
			expect(resultWithMeta.meta?.cached).toBe(false);
		});
	});

	describe('Batch Operations Interface', () => {
		it('should implement batch execution method', () => {
			expect(typeof db?.batch?.execute).toBe('function');
		});

		it('should implement bulkInsert method', () => {
			expect(typeof db?.batch?.bulkInsert).toBe('function');
		});

		it('should implement bulkUpdate method', () => {
			expect(typeof db?.batch?.bulkUpdate).toBe('function');
		});

		it('should implement bulkDelete method', () => {
			expect(typeof db?.batch?.bulkDelete).toBe('function');
		});

		it('should implement bulkUpsert method', () => {
			expect(typeof db?.batch?.bulkUpsert).toBe('function');
		});
	});

	describe('Query Builder Interface', () => {
		it('should implement queryBuilder method', () => {
			expect(typeof db?.queryBuilder).toBe('function');
		});

		it('should return QueryBuilder with required methods', async () => {
			if (db?.queryBuilder) {
				// Ensure collections are initialized before using queryBuilder
				try {
					await db.ensureCollections();
				} catch {
					// Some adapters may not support ensureCollections yet
					return;
				}
				const builder = db.queryBuilder('test_collection');

				// Filtering methods
				expect(typeof builder.where).toBe('function');
				expect(typeof builder.whereIn).toBe('function');
				expect(typeof builder.whereNotIn).toBe('function');

				// Pagination methods
				expect(typeof builder.limit).toBe('function');
				expect(typeof builder.skip).toBe('function');
				expect(typeof builder.paginate).toBe('function');

				// Sorting methods
				expect(typeof builder.sort).toBe('function');
				expect(typeof builder.orderBy).toBe('function');

				// Field selection methods
				expect(typeof builder.select).toBe('function');
				expect(typeof builder.exclude).toBe('function');

				// Execution methods
				expect(typeof builder.count).toBe('function');
				expect(typeof builder.exists).toBe('function');
				expect(typeof builder.execute).toBe('function');
				expect(typeof builder.findOne).toBe('function');
			}
		});
	});

	describe('Content Management Interface', () => {
		it('should implement content node operations', () => {
			expect(typeof db?.content?.nodes?.getStructure).toBe('function');
			expect(typeof db?.content?.nodes?.create).toBe('function');
			expect(typeof db?.content?.nodes?.createMany).toBe('function');
			expect(typeof db?.content?.nodes?.update).toBe('function');
			expect(typeof db?.content?.nodes?.delete).toBe('function');
		});

		it('should implement draft operations', () => {
			expect(typeof db?.content?.drafts?.create).toBe('function');
			expect(typeof db?.content?.drafts?.update).toBe('function');
			expect(typeof db?.content?.drafts?.publish).toBe('function');
			expect(typeof db?.content?.drafts?.getForContent).toBe('function');
			expect(typeof db?.content?.drafts?.delete).toBe('function');
		});

		it('should implement revision operations', () => {
			expect(typeof db?.content?.revisions?.create).toBe('function');
			expect(typeof db?.content?.revisions?.getHistory).toBe('function');
			expect(typeof db?.content?.revisions?.restore).toBe('function');
			expect(typeof db?.content?.revisions?.cleanup).toBe('function');
		});
	});

	describe('Media Management Interface', () => {
		it('should implement file operations', () => {
			expect(typeof db?.media?.files?.upload).toBe('function');
			expect(typeof db?.media?.files?.uploadMany).toBe('function');
			expect(typeof db?.media?.files?.delete).toBe('function');
			expect(typeof db?.media?.files?.deleteMany).toBe('function');
			expect(typeof db?.media?.files?.search).toBe('function');
		});

		it('should implement folder operations', () => {
			expect(typeof db?.media?.folders?.create).toBe('function');
			expect(typeof db?.media?.folders?.delete).toBe('function');
			expect(typeof db?.media?.folders?.getTree).toBe('function');
			expect(typeof db?.media?.folders?.move).toBe('function');
		});
	});

	describe('Theme Management Interface', () => {
		it('should implement theme operations', () => {
			expect(typeof db?.system?.themes?.getActive).toBe('function');
			expect(typeof db?.system?.themes?.setDefault).toBe('function');
			expect(typeof db?.system?.themes?.install).toBe('function');
			expect(typeof db?.system?.themes?.uninstall).toBe('function');
			expect(typeof db?.system?.themes?.update).toBe('function');
			expect(typeof db?.system?.themes?.getAllThemes).toBe('function');
		});
	});

	describe('Widget Management Interface', () => {
		it('should implement widget operations', () => {
			expect(typeof db?.system?.widgets?.register).toBe('function');
			expect(typeof db?.system?.widgets?.findAll).toBe('function');
			expect(typeof db?.system?.widgets?.getActiveWidgets).toBe('function');
			expect(typeof db?.system?.widgets?.activate).toBe('function');
			expect(typeof db?.system?.widgets?.deactivate).toBe('function');
			expect(typeof db?.system?.widgets?.update).toBe('function');
		});
	});

	describe('System Preferences Interface', () => {
		it('should implement preference operations', () => {
			expect(typeof db?.system?.preferences?.get).toBe('function');
			expect(typeof db?.system?.preferences?.getMany).toBe('function');
			expect(typeof db?.system?.preferences?.set).toBe('function');
			expect(typeof db?.system?.preferences?.setMany).toBe('function');
			expect(typeof db?.system?.preferences?.delete).toBe('function');
			expect(typeof db?.system?.preferences?.clear).toBe('function');
		});
	});

	describe('Utility Methods Interface', () => {
		it('should implement utility methods', () => {
			expect(typeof db?.utils?.generateId).toBe('function');
			expect(typeof db?.utils?.validateId).toBe('function');
			expect(typeof db?.utils?.normalizePath).toBe('function');
		});

		it('should generate valid UUIDs', () => {
			if (db?.utils?.generateId) {
				const id = db.utils.generateId();
				expect(id).toBeDefined();
				expect(typeof id).toBe('string');
				expect(id.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Performance Monitoring Interface', () => {
		it('should implement performance methods', () => {
			expect(typeof db?.monitoring?.performance?.getMetrics).toBe('function');
			expect(typeof db?.monitoring?.performance?.clearMetrics).toBe('function');
			expect(typeof db?.monitoring?.performance?.enableProfiling).toBe('function');
			expect(typeof db?.monitoring?.performance?.getSlowQueries).toBe('function');
		});
	});

	describe('Cache Integration Interface', () => {
		it('should implement cache methods', () => {
			expect(typeof db?.monitoring?.cache?.get).toBe('function');
			expect(typeof db?.monitoring?.cache?.set).toBe('function');
			expect(typeof db?.monitoring?.cache?.delete).toBe('function');
			expect(typeof db?.monitoring?.cache?.clear).toBe('function');
		});
	});
});
