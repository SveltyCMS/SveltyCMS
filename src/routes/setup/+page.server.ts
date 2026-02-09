/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side logic for the setup page including Server Functions (Remote Functions).
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import type { PageServerLoad } from './$types';
import type { ISODateString } from '@src/databases/dbInterface';
import { version as pkgVersion } from '../../../package.json';
import { logger } from '@utils/logger.server';
import { databaseConfigSchema } from '@src/databases/schemas';
import { safeParse } from 'valibot';
import nodemailer from 'nodemailer';
import { smtpConfigSchema, setupAdminSchema } from '@utils/formSchemas';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import { checkRedis } from './utils';

const execAsync = promisify(exec);

// Database driver mapping (MongoDB is default, others are optional)
const DRIVER_PACKAGES = {
	mongodb: 'mongoose',
	'mongodb+srv': 'mongoose',
	postgresql: 'postgres',
	mysql: 'mysql2',
	mariadb: 'mysql2',
	sqlite: 'bun:sqlite'
} as const;

type DatabaseType = keyof typeof DRIVER_PACKAGES;

// Import inlang settings directly (TypeScript/SvelteKit handles JSON imports)
import inlangSettings from '../../../project.inlang/settings.json';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// --- SECURITY ---
	// Note: The handleSetup middleware already checks if setup is complete
	// and blocks access to /setup routes if config has valid values.

	// Clear any existing session cookies to ensure fresh start
	// This prevents issues when doing a fresh database setup
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });

	// Get available system languages from inlang settings (direct import, no parsing needed)
	const availableLanguages: string[] = inlangSettings.locales || ['en', 'de'];

	// pass theme data and PKG_VERSION from server to client
	return {
		theme: locals.theme,
		darkMode: locals.darkMode,
		availableLanguages, // Pass the languages from settings.json
		redisAvailable: await checkRedis(),
		settings: {
			PKG_VERSION: pkgVersion
		}
	};
};

/**
 * ACTIONS
 * Standard SvelteKit 5 actions for setup operations
 */
export const actions = {
	/**
	 * Tests the database connection
	 */
	testDatabase: async ({ request }) => {
		logger.info('🚀 Action: VerifyDatabaseConfig starting...');
		try {
			const formData = await request.formData();
			const configRaw = formData.get('config') as string;
			const createIfMissing = formData.get('createIfMissing') === 'true';
			logger.info('📦 Received config raw:', configRaw ? 'Yes (length: ' + configRaw.length + ')' : 'No');
			logger.info('🛠 Create missing DB if needed:', createIfMissing);

			if (!configRaw) {
				logger.error('❌ Action: No config data provided in form');
				return { success: false, error: 'No configuration data provided' };
			}

			const configData = JSON.parse(configRaw);
			logger.info('🔍 Parsed config for type:', configData?.type);

			// Coerce port to number for validation (Frontend sends string "27017" or "")
			if (configData.port === '' || configData.port === null) {
				delete configData.port;
			} else if (configData.port !== undefined) {
				const portNum = Number(configData.port);
				if (!isNaN(portNum)) {
					configData.port = portNum;
				}
			}

			const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
			if (!success || !dbConfig) {
				logger.error('❌ Action: Validation failed', { issues });
				return { success: false, error: 'Invalid configuration', details: issues };
			}

			logger.info('✅ Action: Configuration validated successfully');

			const { buildDatabaseConnectionString } = await import('./utils');
			const connectionString = buildDatabaseConnectionString(dbConfig);
			logger.info('🔗 Built connection string (obfuscated):', connectionString.replace(/:([^:]+)@/, ':****@').replace(/\/\/[^@]*@/, '//****@'));

			const start = performance.now();

			if (dbConfig.type === 'mongodb' || dbConfig.type === 'mongodb+srv') {
				logger.info('🔌 Attempting MongoDB connection...');
				const mongoose = (await import('mongoose')).default;
				// Use minimal options, trusting the connection string (which includes authSource)
				const options = {
					serverSelectionTimeoutMS: 5000,
					maxPoolSize: 1
				};

				const conn = await mongoose.createConnection(connectionString, options).asPromise();
				logger.info('📡 Connection established, sending ping...');
				await conn.getClient().db(dbConfig.name).command({ ping: 1 });
				logger.info('✅ Ping successful!');
				await conn.close();

				const latencyMs = Math.round(performance.now() - start);
				return { success: true, message: 'Database connected successfully! ✨', latencyMs };
			} else if (dbConfig.type === 'mariadb' || (dbConfig.type as string) === 'mysql') {
				const mysql = (await import('mysql2/promise')).default;
				try {
					const conn = await mysql.createConnection({
						uri: connectionString,
						connectTimeout: 5000
					});
					await conn.query('SELECT 1');
					await conn.end();

					const latencyMs = Math.round(performance.now() - start);
					return { success: true, message: 'Database connected successfully! ✨', latencyMs };
				} catch (err: any) {
					// ER_BAD_DB_ERROR: Unknown database
					if (err.code === 'ER_BAD_DB_ERROR') {
						if (createIfMissing) {
							logger.info(`🔨 Attempting to create missing MariaDB database: ${dbConfig.name}`);
							const adminConn = await mysql.createConnection({
								host: dbConfig.host,
								port: dbConfig.port,
								user: dbConfig.user,
								password: dbConfig.password,
								connectTimeout: 5000
							});
							try {
								await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.name}\``);
								await adminConn.end();
								logger.info('✅ Database created successfully!');
								return {
									success: true,
									message: `Database "${dbConfig.name}" created and connected successfully! ✨`,
									latencyMs: Math.round(performance.now() - start)
								};
							} catch (createErr: any) {
								await adminConn.end();
								logger.error('❌ Failed to create database:', createErr);
								return { success: false, error: `Failed to create database: ${createErr.message}` };
							}
						}
						return {
							success: false,
							dbDoesNotExist: true,
							error: `Database "${dbConfig.name}" does not exist. Create it now?`
						};
					}
					throw err;
				}
			} else if (dbConfig.type === 'postgresql') {
				const postgres = (await import('postgres')).default;
				let sql = postgres(connectionString, {
					connect_timeout: 5000,
					max: 1
				});
				try {
					await sql`SELECT 1`;
					await sql.end();
					const latencyMs = Math.round(performance.now() - start);
					return { success: true, message: 'Database connected successfully! ✨', latencyMs };
				} catch (err: any) {
					await sql.end();
					// Handle specific "database does not exist" error (3D000)
					if (err.code === '3D000') {
						if (createIfMissing) {
							logger.info(`🔨 Attempting to create missing PostgreSQL database: ${dbConfig.name}`);
							// Connect to 'postgres' system database to create the new one
							const adminConnectionString = `postgres://${encodeURIComponent(dbConfig.user)}:${encodeURIComponent(dbConfig.password)}@${dbConfig.host}:${dbConfig.port}/postgres`;
							const adminSql = postgres(adminConnectionString, { connect_timeout: 5000, max: 1 });
							try {
								// Note: CREATE DATABASE cannot be run with parameters in most drivers, using unsafe
								await adminSql.unsafe(`CREATE DATABASE "${dbConfig.name}"`);
								await adminSql.end();
								logger.info('✅ Database created successfully!');
								return {
									success: true,
									message: `Database "${dbConfig.name}" created and connected successfully! ✨`,
									latencyMs: Math.round(performance.now() - start)
								};
							} catch (createErr: any) {
								await adminSql.end();
								logger.error('❌ Failed to create database:', createErr);
								return { success: false, error: `Failed to create database: ${createErr.message}` };
							}
						}
						return {
							success: false,
							dbDoesNotExist: true,
							error: `Database "${dbConfig.name}" does not exist. Create it now?`
						};
					}
					throw err;
				}
			} else if (dbConfig.type === 'sqlite') {
				// SQLite path is built from host and name
				const { buildDatabaseConnectionString } = await import('./utils');
				const dbPath = buildDatabaseConnectionString(dbConfig);
				const start = performance.now();

				try {
					const path = await import('path');
					const fs = await import('fs');
					const dbPathResolved = path.resolve(process.cwd(), dbPath);
					const dbDir = path.dirname(dbPathResolved);

					if (!fs.existsSync(dbDir)) {
						if (createIfMissing) {
							fs.mkdirSync(dbDir, { recursive: true });
						} else {
							return { success: false, dbDoesNotExist: true, error: `Directory ${dbDir} does not exist.` };
						}
					}

					let db: any;
					// Environment detection to avoid protocol errors in Node.js
					// @ts-ignore
					const isBun = typeof Bun !== 'undefined';

					try {
						if (isBun) {
							// Use string concatenation to avoid Node's static ESM loader errors for 'bun:' protocol
							const { Database } = await import('bun' + ':sqlite');
							db = new Database(dbPathResolved);
							db.query('SELECT 1').get();
						} else {
							// For Node.js 22.5+ (Vite dev server usually runs in Node)
							// @ts-ignore
							const { DatabaseSync } = await import('node:sqlite');
							db = new DatabaseSync(dbPathResolved);
							db.prepare('SELECT 1').get();
						}
					} catch (importErr: any) {
						logger.error('SQLite driver import/init failed:', importErr);
						// Try better-sqlite3 as last resort if node:sqlite is not found
						if (!isBun && (importErr.code === 'ERR_UNKNOWN_BUILTIN_MODULE' || importErr.message.includes('node:sqlite'))) {
							try {
								const Database = (await import('better-sqlite3')).default;
								db = new Database(dbPathResolved);
								db.prepare('SELECT 1').run();
							} catch (betterErr: any) {
								const latencyMs = Math.round(performance.now() - start);
								return {
									success: false,
									error: `SQLite not available: ${importErr.message} (Is Node 22.5+ or better-sqlite3 available?)`,
									latencyMs
								};
							}
						} else {
							const latencyMs = Math.round(performance.now() - start);
							return {
								success: false,
								error: `SQLite driver error: ${importErr.message}`,
								latencyMs
							};
						}
					}

					if (db) db.close();

					const latencyMs = Math.round(performance.now() - start);
					return { success: true, message: 'SQLite database connected successfully! ✨', latencyMs };
				} catch (err: any) {
					logger.error('SQLite test failed:', err);
					const latencyMs = Math.round(performance.now() - start);
					return { success: false, error: `SQLite test failed: ${err.message}`, latencyMs };
				}
			}
		} catch (err: any) {
			logger.error('Database test failed:', err);
			return { success: false, error: err.message || String(err) };
		}
	},

	/**
	 * Seeds the database
	 */
	seedDatabase: async ({ request }) => {
		logger.info('🚀 Action: seedDatabase called');
		const formData = await request.formData();
		const dbConfig = JSON.parse(formData.get('config') as string);

		try {
			// 1. Write private config
			const { writePrivateConfig } = await import('./writePrivateConfig');
			await writePrivateConfig(dbConfig);

			const { invalidateSetupCache } = await import('@utils/setupCheck');
			invalidateSetupCache(true);

			// 2. Start background seeding (Split Strategy)
			// Critical phases (roles/settings) are tracked by startSeeding (blocking completeSetup)
			// Content phases are tracked by startBackgroundWork (non-blocking)
			const { setupManager } = await import('./setupManager');
			const { initSystemFast } = await import('./seed');
			const { getSetupDatabaseAdapter } = await import('./utils');

			const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

			// Get split promises
			const { criticalPromise, backgroundTask } = await initSystemFast(dbAdapter);

			// Track critical seeding (blocking)
			setupManager.startSeeding(async () => {
				await criticalPromise;

				// Queue background content seeding (non-blocking)
				// This allows completeSetup to return immediately after critical data is ready
				setupManager.startBackgroundWork(backgroundTask);
			});

			return {
				success: true,
				message: 'Database configuration saved. Seeding started! 🚀'
			};
		} catch (err) {
			logger.error('Database config save failed:', err);
			return { success: false, error: err instanceof Error ? err.message : String(err) };
		}
	},

	/**
	 * Completes the setup
	 */
	completeSetup: async ({ request, cookies }) => {
		const setupStartTime = performance.now();
		logger.info('🚀 Action: completeSetup called');

		// Await CRITICAL seeding only (roles/settings/themes)
		// Background content seeding continues independently
		try {
			const { setupManager } = await import('./setupManager');
			const seedingPromise = setupManager.waitTillDone();
			if (seedingPromise) {
				logger.info('⏳ completeSetup: Waiting for critical seeding (roles/settings)...');
				await seedingPromise;
				logger.info('✅ completeSetup: Critical seeding finished');
			}
		} catch (seedError) {
			logger.error('❌ completeSetup: Seeding failed:', seedError);
			// Continue, as retry logic or partial state might allow completion
		}

		const formData = await request.formData();
		const { database, admin, system = {} } = JSON.parse(formData.get('data') as string);

		try {
			const adminValidation = safeParse(setupAdminSchema, admin);
			if (!adminValidation.success) {
				return { success: false, error: 'Invalid admin user data' };
			}

			const { getSetupDatabaseAdapter } = await import('./utils');
			const { dbAdapter } = await getSetupDatabaseAdapter(database);

			const { Auth } = await import('@src/databases/auth');
			const { getDefaultSessionStore } = await import('@src/databases/auth/sessionManager');
			const setupAuth = new Auth(dbAdapter, getDefaultSessionStore());

			// Check if user already exists (e.g. from previous failed setup or existing DB)
			const existingUser = await setupAuth.getUserByEmail({ email: admin.email, tenantId: undefined });
			let session;

			if (existingUser) {
				logger.info('Admin user already exists, updating credentials...');

				// Update password
				await setupAuth.updateUserPassword(admin.email, admin.password);

				// Update other attributes
				await setupAuth.updateUser(existingUser._id, {
					username: admin.username,
					role: 'admin',
					isRegistered: true
				});

				// Create new session
				session = await setupAuth.createSession({
					user_id: existingUser._id,
					expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
					tenantId: undefined
				});
			} else {
				// Create new user
				const authResult = await setupAuth.createUserAndSession(
					{
						username: admin.username,
						email: admin.email,
						password: admin.password,
						role: 'admin',
						isRegistered: true
					},
					{ expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString }
				);

				if (!authResult.success || !authResult.data) {
					return { success: false, error: 'Failed to create user' };
				}
				session = authResult.data.session;
			}

			if (!session) {
				return { success: false, error: 'Failed to create session' };
			}

			logger.info('DEBUG: Session created:', { sessionId: session._id, userId: session.user_id });
			logger.info('DEBUG: Setting cookie:', {
				name: SESSION_COOKIE_NAME,
				value: session._id,
				secure: process.env.NODE_ENV === 'production'
			});

			// Set session cookie
			cookies.set(SESSION_COOKIE_NAME, session._id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 // 1 day
			});
			logger.info(`Set ${SESSION_COOKIE_NAME} cookie for new admin user`);

			// 3. Update private config with modes and REDIS
			const { updatePrivateConfigMode } = await import('./writePrivateConfig');
			await updatePrivateConfigMode({
				multiTenant: system.multiTenant,
				demoMode: system.demoMode,
				redis: {
					useRedis: system.useRedis,
					redisHost: system.redisHost,
					redisPort: system.redisPort,
					redisPassword: system.redisPassword
				}
			});

			// 3.1 Persist system settings to database for UI consistency
			try {
				await dbAdapter.systemPreferences.setMany([
					{ key: 'USE_REDIS', value: system.useRedis, category: 'private', scope: 'system' },
					{ key: 'REDIS_HOST', value: system.redisHost, category: 'private', scope: 'system' },
					{ key: 'REDIS_PORT', value: Number(system.redisPort), category: 'private', scope: 'system' },
					{ key: 'REDIS_PASSWORD', value: system.redisPassword, category: 'private', scope: 'system' },
					{ key: 'MULTI_TENANT', value: system.multiTenant, category: 'private', scope: 'system' },
					{ key: 'DEMO', value: system.demoMode, category: 'private', scope: 'system' }
				]);
				logger.info('System settings persisted to database successfully');
			} catch (dbError) {
				logger.warn('Failed to persist some system settings to DB (non-critical):', dbError);
			}

			// 3.2 Invalidate setup cache so the next system checks see the finished setup
			const { invalidateSetupCache } = await import('@src/utils/setupCheck');
			invalidateSetupCache(true);

			// Initialize global system
			const { initializeWithConfig } = await import('@src/databases/db');

			await initializeWithConfig({
				DB_TYPE: database.type,
				DB_HOST: database.host,
				DB_PORT: Number(database.port),
				DB_NAME: database.name,
				DB_USER: database.user || '',
				DB_PASSWORD: database.password || '',
				JWT_SECRET_KEY: 'temp_secret',
				ENCRYPTION_KEY: 'temp_key',
				USE_REDIS: system.useRedis,
				REDIS_HOST: system.redisHost,
				REDIS_PORT: Number(system.redisPort),
				REDIS_PASSWORD: system.redisPassword
			} as any);

			// OPTIMIZATION: Initialize ContentManager IMMEDIATELY with skipReconciliation: true
			// This prevents the 4s blocking delay on the subsequent redirect request.
			// We trust the database state because we just seeded it.
			try {
				logger.info('🚀 [completeSetup] Pre-initializing ContentManager (fast mode)...');
				const { contentManager } = await import('@src/content/ContentManager');
				// skipReconciliation = true
				await contentManager.initialize(undefined, true);
				logger.info('✅ [completeSetup] ContentManager pre-initialized successfully.');
			} catch (cmError) {
				logger.warn('⚠️ [completeSetup] ContentManager pre-init failed (non-critical):', cmError);
			}

			// PRE-WARM CACHE REMOVED (Caused Race Conditions)
			// We effectively rely on lazy loading upon the first request to /Collections
			// The background content seeding (setupManager) handles the data.

			const setupDuration = performance.now() - setupStartTime;
			try {
				const { performanceService } = await import('@src/services/PerformanceService');
				await performanceService.recordBenchmark('setup_completion', setupDuration);
			} catch (e) {
				logger.warn('Failed to record completion benchmark:', e);
			}

			return {
				success: true,
				message: 'Setup complete! 🎉',
				redirectPath: '/en/Collections',
				sessionId: session._id,
				publicSettings: {
					SITE_NAME: system.siteName || 'SveltyCMS',
					DEFAULT_LANGUAGE: 'en',
					MULTI_TENANT: system.multiTenant,
					DEMO: system.demoMode,
					USE_REDIS: system.useRedis,
					PKG_VERSION: pkgVersion
				}
			};
		} catch (err) {
			console.error('Setup completion failed detailed:', err); // Use console.error for immediate feedback in dev
			logger.error('Setup completion failed:', err);
			return { success: false, error: err instanceof Error ? err.message : String(err) };
		}
	},

	/**
	 * Tests Email Configuration
	 */
	testEmail: async ({ request }) => {
		logger.info('🚀 Action: testEmail called');
		const formData = await request.formData();
		const rawData = Object.fromEntries(formData.entries());

		// Map formData to schema expected types (booleans/numbers)
		const config = {
			host: rawData.host as string,
			port: Number(rawData.port),
			user: rawData.user as string,
			password: rawData.password as string,
			from: (rawData.from as string) || (rawData.user as string),
			secure: rawData.secure === 'true',
			testEmail: rawData.testEmail as string,
			saveToDatabase: rawData.saveToDatabase === 'true'
		};

		const { host, port, user, password, from, secure, testEmail, saveToDatabase } = config;

		try {
			// Validation
			const validationResult = safeParse(smtpConfigSchema, {
				host,
				port,
				user,
				password,
				from,
				secure
			});

			if (!validationResult.success) {
				const errors = validationResult.issues.map((issue) => `${issue.path?.[0]?.key}: ${issue.message}`).join(', ');
				return { success: false, error: `Invalid SMTP configuration: ${errors}` };
			}

			// Create transporter
			const transporter = nodemailer.createTransport({
				host,
				port,
				secure: port === 465 ? true : secure,
				auth: { user, pass: password },
				connectionTimeout: 10000,
				greetingTimeout: 10000,
				socketTimeout: 10000
			});

			// Verify connection
			await transporter.verify();
			logger.info('✅ SMTP connection successful');

			// Send test email
			await transporter.sendMail({
				from,
				to: testEmail,
				subject: 'SveltyCMS SMTP Test Email',
				text: `This is a test email from SveltyCMS.\n\nYour SMTP configuration is working correctly!\n\nHost: ${host}\nTimestamp: ${new Date().toISOString()}`,
				html: `
					<div style="font-family: Arial, sans-serif; padding: 20px;">
						<h2 style="color: #2563eb;">SveltyCMS SMTP Test</h2>
						<p><strong>Your SMTP configuration is working correctly! ✅</strong></p>
						<p>Host: ${host}</p>
					</div>
				`
			});

			// Save to database only if explicitly requested
			let saved = false;
			if (saveToDatabase) {
				try {
					const { dbAdapter } = await import('@src/databases/db');
					if (dbAdapter) {
						await dbAdapter.systemPreferences.set('SMTP_HOST', host, 'system');
						await dbAdapter.systemPreferences.set('SMTP_PORT', port.toString(), 'system');
						await dbAdapter.systemPreferences.set('SMTP_USER', user, 'system');
						await dbAdapter.systemPreferences.set('SMTP_PASS', password, 'system');
						await dbAdapter.systemPreferences.set('SMTP_FROM', from, 'system');
						await dbAdapter.systemPreferences.set('SMTP_SECURE', secure ? 'true' : 'false', 'system');
						saved = true;
					}
				} catch (e) {
					logger.warn('Could not save SMTP settings (DB might not be ready):', e);
				}
			}

			return {
				success: true,
				message: `SMTP test successful! Email sent to ${testEmail}.${saved ? ' Settings saved.' : ''}`,
				testEmailSent: true
			};
		} catch (error: any) {
			logger.error('SMTP test failed:', error);
			// User friendly error mapping
			let msg = error.message;
			if (error.code === 'EAUTH') msg = 'Authentication failed. Check credentials.';
			if (error.code === 'ECONNREFUSED') msg = 'Connection refused. Check host/port.';
			return { success: false, error: msg };
		}
	},

	/**
	 * Installs database drivers (optional)
	 */
	installDriver: async ({ request }) => {
		logger.info('🚀 Action: installDriver called');
		const formData = await request.formData();
		const dbType = formData.get('dbType') as DatabaseType;

		if (!dbType || !DRIVER_PACKAGES[dbType] || dbType === 'sqlite') {
			return { success: true, message: 'No driver installation needed (or invalid type).' };
		}

		const packageName = DRIVER_PACKAGES[dbType];

		try {
			// Check if already installed
			try {
				await import(/* @vite-ignore */ packageName);
				return { success: true, message: `Driver ${packageName} is already installed.`, alreadyInstalled: true, package: packageName };
			} catch {
				// Install needed
			}

			// Detect package manager
			const cwd = process.cwd();
			let pm = 'npm';
			if (existsSync(join(cwd, 'bun.lock'))) pm = 'bun';
			else if (existsSync(join(cwd, 'yarn.lock'))) pm = 'yarn';
			else if (existsSync(join(cwd, 'pnpm-lock.yaml'))) pm = 'pnpm';

			const cmd = pm === 'bun' || pm === 'yarn' || pm === 'pnpm' ? `${pm} add ${packageName}` : `npm install ${packageName}`;

			logger.info(`Installing ${packageName} using ${pm}...`);
			const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 120000 });
			logger.info('Installation output:', stdout + stderr);

			return { success: true, message: `Successfully installed ${packageName}.`, package: packageName };
		} catch (error: any) {
			logger.error('Driver installation failed:', error);
			return { success: false, error: `Installation failed: ${error.message}` };
		}
	}
};
