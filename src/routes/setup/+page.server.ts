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
	mariadb: 'mysql2'
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
			logger.info('📦 Received config raw:', configRaw ? 'Yes (length: ' + configRaw.length + ')' : 'No');

			if (!configRaw) {
				logger.error('❌ Action: No config data provided in form');
				return { success: false, error: 'No configuration data provided' };
			}

			const configData = JSON.parse(configRaw);
			logger.info('🔍 Parsed config for type:', configData?.type);

			// Coerce port to number for validation (Frontend sends string "27017")
			if (configData.port !== undefined && configData.port !== null && configData.port !== '') {
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

				return { success: true, message: 'Database connected successfully! ✨' };
			} else if (dbConfig.type === 'mariadb' || (dbConfig.type as string) === 'mysql') {
				const mysql = (await import('mysql2/promise')).default;
				const conn = await mysql.createConnection({
					uri: connectionString,
					connectTimeout: 5000
				});
				await conn.query('SELECT 1');
				await conn.end();

				return { success: true, message: 'Database connected successfully! ✨' };
			}

			return { success: false, error: `Unsupported database type: ${dbConfig.type}` };
		} catch (err) {
			logger.error('Database test failed:', err);
			return { success: false, error: err instanceof Error ? err.message : String(err) };
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

			// 2. Start parallel seeding
			const { initSystemFromSetup } = await import('./seed');
			const { getSetupDatabaseAdapter } = await import('./utils');

			const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);
			const seedResults = await initSystemFromSetup(dbAdapter);

			return {
				success: true,
				message: 'Database initialized successfully! ✨',
				...seedResults
			};
		} catch (err) {
			logger.error('Seeding failed:', err);
			return { success: false, error: err instanceof Error ? err.message : String(err) };
		}
	},

	/**
	 * Completes the setup
	 */
	completeSetup: async ({ request, cookies }) => {
		logger.info('🚀 Action: completeSetup called');
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

			// PRE-WARM CACHE (Fire-and-forget optimization)
			// Trigger background fetch of first collection so it's ready when user redirects
			(async () => {
				try {
					const { contentManager } = await import('@src/content/ContentManager');
					const { collectionService } = await import('@src/services/CollectionService');

					// Determine user object for cache key context
					let userForCache = existingUser;
					if (!userForCache && 'authResult' in (global as any)) {
						// Hack: we don't have easy access to authResult due to scoping,
						// but effectively we can assume the user is the admin we just created.
						// A better way is to fetch it again or move variable scope.
						// Given the complexity of moving scope in this large function,
						// let's just fetch the user by ID from session if possible?
						// Or just use the known data since we have admin.email and 'admin' role.
					}

					// Easiest robust way: construct a minimal user object sufficient for modifyRequest
					const adminUser = {
						_id: session.user_id, // We have session._id which is usually NOT user_id, check session structure.
						// setupAuth.createSession returns session with user_id.
						username: admin.username,
						email: admin.email,
						role: 'admin',
						locale: 'en', // Default
						avatar: ''
					};

					// Initialize ContentManager (lazy)
					await contentManager.initialize(undefined);
					const collections = await contentManager.getCollections();

					if (collections.length > 0) {
						const firstCollection = collections[0];
						logger.info(`🔥 Pre-warming cache for collection: ${firstCollection.name}`);

						await collectionService.getCollectionData({
							collection: firstCollection,
							language: 'en', // Default setup language
							user: adminUser as any,
							tenantId: undefined
						});
					}
				} catch (warmError) {
					logger.warn('Cache pre-warm failed (non-critical):', warmError);
				}
			})();

			return {
				success: true,
				message: 'Setup complete! 🎉',
				redirectPath: '/en/Collections',
				sessionId: session._id
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

		if (!dbType || !DRIVER_PACKAGES[dbType]) {
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
