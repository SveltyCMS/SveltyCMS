/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side logic for the setup page including Server Functions (Remote Functions).
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import type { ISODateString } from '@src/databases/db-interface';
import { databaseConfigSchema } from '@src/databases/schemas';
import { setupAdminSchema, smtpConfigSchema } from '@utils/form-schemas';
import { logger } from '@utils/logger.server';
import nodemailer from 'nodemailer';
import { safeParse } from 'valibot';
import { version as pkgVersion } from '../../../package.json';
import type { Actions, PageServerLoad } from './$types';
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
export const actions: Actions = {
	/**
	 * Tests the database connection
	 */
	testDatabase: async ({ request }) => {
		logger.info('🚀 Action: VerifyDatabaseConfig starting...');
		try {
			const formData = await request.formData();
			const configRaw = formData.get('config') as string;
			const createIfMissing = formData.get('createIfMissing') === 'true';
			logger.info('📦 Received config raw:', configRaw ? `Yes (length: ${configRaw.length})` : 'No');
			logger.info('🛠 Create missing DB if needed:', createIfMissing);

			if (!configRaw) {
				logger.error('❌ Action: No config data provided in form');
				return { success: false, error: 'No configuration data provided' };
			}

			const configData = JSON.parse(configRaw);
			logger.info('🔍 Parsed config for type:', configData?.type);

			// Coerce port to number for validation (Frontend sends string "27017" or "")
			if (configData.port === '' || configData.port === null) {
				configData.port = undefined;
			} else if (configData.port !== undefined) {
				const portNum = Number(configData.port);
				if (!Number.isNaN(portNum)) {
					configData.port = portNum;
				}
			}

			const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
			if (!(success && dbConfig)) {
				logger.error('❌ Action: Validation failed', { issues });
				return {
					success: false,
					error: 'Invalid configuration',
					details: issues
				};
			}

			logger.info('✅ Action: Configuration validated successfully');

			const start = performance.now();
			const { getSetupDatabaseAdapter } = await import('./utils');

			try {
				const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

				logger.info('📡 Connection established, sending ping...');
				const health = await dbAdapter.getConnectionHealth();

				if (!health.success) {
					await dbAdapter.disconnect();
					return {
						success: false,
						error: health.message || 'Database ping failed'
					};
				}

				logger.info('✅ Ping successful!');
				await dbAdapter.disconnect();

				const latencyMs = Math.round(performance.now() - start);
				return {
					success: true,
					message: 'Database connected successfully! ✨',
					latencyMs
				};
			} catch (err: any) {
				// Handle SQLite/SQL "database does not exist" for auto-creation
				if (err.message?.includes('does not exist') || err.code === 'ER_BAD_DB_ERROR' || err.code === '3D000') {
					if (createIfMissing) {
						// ... existing create logic if needed, but getSetupDatabaseAdapter currently throws
						// We'll let the user see the error and manually create for now, or improve utils.ts later
					}
					return {
						success: false,
						dbDoesNotExist: err.message?.includes('does not exist'),
						error: err.message
					};
				}
				throw err;
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
		const configRaw = formData.get('config') as string;

		if (!configRaw) {
			return { success: false, error: 'No configuration data provided' };
		}

		const configData = JSON.parse(configRaw);

		// Coerce port to number for validation
		if (configData.port === '' || configData.port === null) {
			configData.port = undefined;
		} else if (configData.port !== undefined) {
			const portNum = Number(configData.port);
			if (!Number.isNaN(portNum)) {
				configData.port = portNum;
			}
		}

		const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
		if (!(success && dbConfig)) {
			logger.error('❌ Action: seedDatabase Validation failed', { issues });
			return {
				success: false,
				error: 'Invalid configuration',
				details: issues
			};
		}

		try {
			// 1. Write private config
			const { writePrivateConfig } = await import('./write-private-config');
			await writePrivateConfig(dbConfig);

			const { invalidateSetupCache } = await import('@utils/setup-check');
			invalidateSetupCache(true);

			// 2. Start background seeding (Split Strategy)
			// Critical phases (roles/settings) are tracked by startSeeding (blocking completeSetup)
			// Content phases are tracked by startBackgroundWork (non-blocking)
			const { setupManager } = await import('./setup-manager');
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
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	},

	/**
	 * Completes the setup
	 */
	completeSetup: async ({ request, cookies, url }) => {
		const setupStartTime = performance.now();
		logger.info('🚀 Action: completeSetup called');

		// Await CRITICAL seeding only (roles/settings/themes)
		// Background content seeding continues independently
		try {
			const { setupManager } = await import('./setup-manager');
			const seedingPromise = setupManager.waitTillDone();
			if (seedingPromise) {
				logger.info('⏳ completeSetup: Waiting for critical seeding...');
				await seedingPromise;
				logger.info('✅ completeSetup: Critical seeding finished');
			}
		} catch (seedError) {
			logger.error('❌ completeSetup: Seeding failed:', seedError);
			// Continue, as retry logic or partial state might allow completion
		}

		const formData = await request.formData();
		const { database, admin, system = {} } = JSON.parse(formData.get('data') as string);
		console.log('DEBUG: extracted system data (CONSOLE):', JSON.stringify(system, null, 2));
		logger.info('DEBUG: extracted system data:', JSON.stringify(system, null, 2));

		try {
			const adminValidation = safeParse(setupAdminSchema, admin);
			if (!adminValidation.success) {
				return { success: false, error: 'Invalid admin user data' };
			}

			const { getSetupDatabaseAdapter } = await import('./utils');
			const { dbAdapter } = await getSetupDatabaseAdapter(database);

			const { Auth } = await import('@src/databases/auth');
			const { getDefaultSessionStore } = await import('@src/databases/auth/session-manager');
			const setupAuth = new Auth(dbAdapter, getDefaultSessionStore());

			// Check if user already exists
			const existingUser = await setupAuth.getUserByEmail({
				email: admin.email,
				tenantId: undefined
			});
			let session: any;

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
					{
						expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString
					}
				);

				if (!(authResult.success && authResult.data)) {
					return { success: false, error: 'Failed to create user' };
				}
				session = authResult.data.session;
			}

			if (!session) {
				return { success: false, error: 'Failed to create session' };
			}

			logger.info('DEBUG: Session created:', {
				sessionId: session._id,
				userId: session.user_id
			});

			// Safer secure flag logic (matches handleAuthentication)
			const { dev } = await import('$app/environment');
			const isSecure = url.protocol === 'https:' || (url.hostname !== 'localhost' && !dev && process.env.TEST_MODE !== 'true');

			logger.info('DEBUG: Setting cookie:', {
				name: SESSION_COOKIE_NAME,
				value: session._id,
				secure: isSecure
			});

			// Set session cookie
			cookies.set(SESSION_COOKIE_NAME, session._id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: isSecure,
				maxAge: 60 * 60 * 24 // 1 day
			});
			logger.info(`Set ${SESSION_COOKIE_NAME} cookie for new admin user`);

			// 3. Parallel Execution: Update private config & Persist system settings
			const updatePrivateConfigPromise = (async () => {
				try {
					// Optimization: Check if values actually changed to avoid unnecessary restart
					const privateConfigModule = await import('@config/private');
					const privateEnv = privateConfigModule.privateEnv as any; // Cast to any to avoid type issues with dynamic import
					// Use loose equality to handle string/boolean differences if any
					if (privateEnv.MULTI_TENANT === system.multiTenant && privateEnv.DEMO === system.demoMode) {
						logger.info('DEBUG: Private config unchanged, skipping update to prevent restart.');
						return;
					}

					console.log('DEBUG: Updating private config with modes:', {
						multiTenant: system.multiTenant,
						demoMode: system.demoMode
					});
					const { updatePrivateConfigMode } = await import('./write-private-config');
					await updatePrivateConfigMode({
						multiTenant: system.multiTenant,
						demoMode: system.demoMode
					});
					console.log('DEBUG: Private config update completed');
				} catch (configError) {
					console.error('ERROR: Failed to update private config (NON-FATAL):', configError);
					logger.error('Failed to update private config modes:', configError);
					// Do not throw, allow setup to complete even if this file update fails
				}
			})();

			const persistSettingsPromise = (async () => {
				try {
					console.log('DEBUG: Persisting system settings to DB...');
					const settingsToPersist = [
						// Redis & Arch Mode (Private)
						{
							key: 'USE_REDIS',
							value: system.useRedis,
							category: 'private',
							scope: 'system'
						},
						{
							key: 'REDIS_HOST',
							value: system.redisHost,
							category: 'private',
							scope: 'system'
						},
						{
							key: 'REDIS_PORT',
							value: Number(system.redisPort),
							category: 'private',
							scope: 'system'
						},
						{
							key: 'REDIS_PASSWORD',
							value: system.redisPassword,
							category: 'private',
							scope: 'system'
						},
						{
							key: 'MULTI_TENANT',
							value: system.multiTenant,
							category: 'private',
							scope: 'system'
						},
						{
							key: 'DEMO',
							value: system.demoMode,
							category: 'private',
							scope: 'system'
						},

						// General Site Settings (Public)
						{
							key: 'SITE_NAME',
							value: system.siteName,
							category: 'public',
							scope: 'system'
						},
						{
							key: 'HOST_PROD',
							value: system.hostProd,
							category: 'public',
							scope: 'system'
						},
						{
							key: 'TIMEZONE',
							value: system.timezone,
							category: 'public',
							scope: 'system'
						},

						// Language Settings (Public)
						// Note: validation should ideally ensure defaults are in the arrays
						{
							key: 'DEFAULT_CONTENT_LANGUAGE',
							value: system.defaultContentLanguage,
							category: 'public',
							scope: 'system'
						},
						{
							key: 'AVAILABLE_CONTENT_LANGUAGES',
							value: system.contentLanguages,
							category: 'public',
							scope: 'system'
						},
						{
							key: 'BASE_LOCALE',
							value: system.defaultSystemLanguage,
							category: 'public',
							scope: 'system'
						},
						{
							key: 'LOCALES',
							value: system.systemLanguages,
							category: 'public',
							scope: 'system'
						},

						// Media Settings (Public)
						{
							key: 'MEDIA_STORAGE_TYPE',
							value: system.mediaStorageType,
							category: 'public',
							scope: 'system'
						},
						{
							key: 'MEDIA_FOLDER',
							value: system.mediaFolder,
							category: 'public',
							scope: 'system'
						}
					];

					// Cast to any to bypass strict type check for now, or define a proper interface for the array item
					await dbAdapter.systemPreferences.setMany(settingsToPersist as any);
					logger.info('System settings persisted to database successfully');
				} catch (dbError) {
					logger.warn('Failed to persist some system settings to DB:', dbError);
				}
			})();

			await Promise.all([updatePrivateConfigPromise, persistSettingsPromise]);

			// 3.2 Invalidate setup cache
			const { invalidateSetupCache } = await import('@src/utils/setup-check');
			invalidateSetupCache(true);

			// Initialize global system
			const { initializeWithConfig } = await import('@src/databases/db');
			await initializeWithConfig(
				{
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
				} as any,
				{
					multiTenant: system.multiTenant,
					demoMode: system.demoMode,
					awaitBackground: true
				}
			);

			// OPTIMIZATION: Initializecontent-managerIMMEDIATELY with skipReconciliation: true
			// This prevents the 4s blocking delay on the subsequent redirect request.
			// We trust the database state because we just seeded it.
			try {
				logger.info('🚀 [completeSetup] Initializingcontent-manager(with reconciliation)...');
				const { contentManager } = await import('@src/content/content-manager');
				await contentManager.initialize(undefined, false);
				logger.info('✅ [completeSetup]ContentManager initialized and reconciled successfully.');
			} catch (cmError) {
				logger.warn('⚠️ [completeSetup]ContentManager init/reconcile failed:', cmError);
			}

			// PRE-WARM CACHE REMOVED (Caused Race Conditions)
			// We effectively rely on lazy loading upon the first request to /Collections
			// The background content seeding (setupManager) handles the data.

			// --- PRESET INSTALLATION ---
			if (system.preset && system.preset !== 'blank') {
				logger.info(`📦 Installing preset: ${system.preset}`);
				try {
					const fs = await import('node:fs/promises');
					const path = await import('node:path');
					const { compile } = await import('@utils/compilation/compile');

					// Source: src/presets/[preset]
					const presetDir = path.join(process.cwd(), 'src', 'presets', system.preset);

					// Target: config/collections
					const targetDir = path.join(process.cwd(), 'config', 'collections');

					// Ensure target exists
					await fs.mkdir(targetDir, { recursive: true });

					// Rewriting the block:
					try {
						await fs.access(presetDir);

						const copyRecursive = async (src: string, dest: string) => {
							const stats = await fs.stat(src);
							if (stats.isDirectory()) {
								await fs.mkdir(dest, { recursive: true });
								const entries = await fs.readdir(src);
								for (const entry of entries) {
									await copyRecursive(path.join(src, entry), path.join(dest, entry));
								}
							} else if (src.endsWith('.ts')) {
								await fs.copyFile(src, dest);
								logger.info(`   - Copied ${path.basename(src)}`);
							}
						};

						await copyRecursive(presetDir, targetDir);

						// Trigger compilation to register new collections
						logger.info('🔄 Compiling new collections...');
						await compile();
						logger.info('✅ Preset installation complete.');
					} catch (presetError) {
						logger.warn(`⚠️ Preset directory not found or empty: ${presetDir}`, presetError);
					}
				} catch (err) {
					logger.error('❌ Failed to install preset:', err);
					// Non-fatal, continue setup
				}
			}

			// 4. Determine redirect path
			let redirectPath = '/en/collections';

			// Use provided firstCollection if valid
			if (system.firstCollection?.path) {
				redirectPath = `/${system.defaultContentLanguage || 'en'}${system.firstCollection.path}`;
			} else {
				// Fallback: Querycontent-managerfor smart first collection
				try {
					const { contentManager } = await import('@src/content/content-manager');
					// Clear cache to ensure we see the newly initialized collections
					contentManager.clearFirstCollectionCache();

					const smartRedirect = await contentManager.getFirstCollectionRedirectUrl(system.defaultContentLanguage || 'en');
					if (smartRedirect) {
						redirectPath = smartRedirect;
					}
				} catch (e) {
					logger.warn('Could not determine first collection for redirect:', e);
				}
			}

			const setupDuration = performance.now() - setupStartTime;
			logger.info(`🎊 [completeSetup] Setup logic finished in ${Math.round(setupDuration)}ms. Redirecting to: ${redirectPath}`);

			return {
				success: true,
				message: 'Setup complete! 🎉',
				redirectPath,
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
			console.error('Setup completion failed detailed:', err);
			logger.error('Setup completion failed:', err);
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	},

	// Tests Email Configuration
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
				return {
					success: false,
					error: `Invalid SMTP configuration: ${errors}`
				};
			}

			// Create transporter
			const transporter = nodemailer.createTransport({
				host,
				port,
				secure: port === 465 ? true : secure,
				auth: { user, pass: password },
				connectionTimeout: 10_000,
				greetingTimeout: 10_000,
				socketTimeout: 10_000
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
			if (error.code === 'EAUTH') {
				msg = 'Authentication failed. Check credentials.';
			}
			if (error.code === 'ECONNREFUSED') {
				msg = 'Connection refused. Check host/port.';
			}
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

		if (!(dbType && DRIVER_PACKAGES[dbType]) || dbType === 'sqlite') {
			return {
				success: true,
				message: 'No driver installation needed (or invalid type).'
			};
		}

		const packageName = DRIVER_PACKAGES[dbType];

		try {
			// Check if already installed
			try {
				await import(/* @vite-ignore */ packageName);
				return {
					success: true,
					message: `Driver ${packageName} is already installed.`,
					alreadyInstalled: true,
					package: packageName
				};
			} catch {
				// Install needed
			}

			// Detect package manager
			const cwd = process.cwd();
			let pm = 'npm';
			if (existsSync(join(cwd, 'bun.lock'))) {
				pm = 'bun';
			} else if (existsSync(join(cwd, 'yarn.lock'))) {
				pm = 'yarn';
			} else if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
				pm = 'pnpm';
			}

			const cmd = pm === 'bun' || pm === 'yarn' || pm === 'pnpm' ? `${pm} add ${packageName}` : `npm install ${packageName}`;

			logger.info(`Installing ${packageName} using ${pm}...`);
			const { stdout, stderr } = await execAsync(cmd, {
				cwd,
				timeout: 120_000
			});
			logger.info('Installation output:', stdout + stderr);

			return {
				success: true,
				message: `Successfully installed ${packageName}.`,
				package: packageName
			};
		} catch (error: any) {
			logger.error('Driver installation failed:', error);
			return { success: false, error: `Installation failed: ${error.message}` };
		}
	}
};
