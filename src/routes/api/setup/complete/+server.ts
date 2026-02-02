/**
 * @file src/routes/api/setup/complete/+server.ts
 * @description Finalizes the initial CMS setup by creating the admin user and session.
 * @summary
 *  - Reads private.ts directly from filesystem (bypasses Vite cache)
 *  - Manually creates database adapter and Auth instance for admin user creation
 *  - Creates the admin user using the setup Auth service
 *  - Initializes the global system (db.ts) to make adapter available to all services
 *  - Initializes ContentManager and registers all collection models in database
 *  - Creates an authenticated session for the new admin user
 *  - System is ready to use! NO RESTART REQUIRED! ✨
 */

import { dev } from '$app/environment';

// Auth
import type { User, Session } from '@src/databases/auth/types';
import type { ISODateString } from '@src/content/types';
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import { Auth } from '@src/databases/auth';
import { invalidateSettingsCache } from '@src/services/settingsService';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';

// Collection utilities
import type { Locale } from '@src/paraglide/runtime';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { app } from '@stores/store.svelte';

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

import { getCachedFirstCollectionPath } from '@utils/server/collection-utils.server';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// ... (existing imports)

export const POST = apiHandler(async ({ request, cookies, url }) => {
	const correlationId = randomBytes(6).toString('hex');
	try {
		const setupData = await request.json();
		const { admin, system, firstCollection, skipWelcomeEmail } = setupData as {
			admin: AdminConfig;
			system?: any;
			firstCollection?: { name: string; path: string; _id?: string } | null;
			skipWelcomeEmail?: boolean;
		};

		logger.info('Starting setup finalization', { correlationId, admin: admin.email });

		// Log if we received first collection info (for faster redirect)
		if (firstCollection) {
			logger.debug('Received first collection from seed step:', {
				name: firstCollection.name,
				path: firstCollection.path
			});
		}

		// 1.5 Update Private Config with Mode Selections (Demo / Multi-Tenant)
		// This must happen BEFORE system initialization so the correct settings are loaded
		if (system && (typeof system.demoMode === 'boolean' || typeof system.multiTenant === 'boolean')) {
			try {
				logger.info('⚙️ Updating system architectural modes...', {
					demo: system.demoMode,
					multiTenant: system.multiTenant
				});
				const { updatePrivateConfigMode } = await import('../writePrivateConfig');

				// In test mode, we might want to skip this or handle it differently
				// but since writePrivateConfig handles TEST_MODE, it should be fine.
				await updatePrivateConfigMode({
					demoMode: system.demoMode,
					multiTenant: system.multiTenant
				});

				// Clear cache to ensure new values are read
				const { invalidateSetupCache } = await import('@utils/setupCheck');
				invalidateSetupCache(true);
			} catch (modeError) {
				logger.error('Failed to update system modes:', modeError);
				throw new AppError('Failed to apply system mode settings.', 500, 'SYSTEM_MODE_UPDATE_FAILED');
			}
		}

		// 1. Validate admin user data
		const adminValidation = safeParse(setupAdminSchema, admin);
		if (!adminValidation.success) {
			const issues = adminValidation.issues.map((i) => i.message).join(', ');
			throw new AppError(`Invalid admin user data: ${issues}`, 400, 'INVALID_ADMIN_DATA');
		}

		// 2. Initialize full system using DB config from filesystem (bypass Vite cache)
		logger.info('Initializing full system with existing configuration...', { correlationId });
		let setupAuth: Auth;
		let dbAdapter: DatabaseAdapter;
		let dbConfig: {
			type: 'mongodb' | 'mongodb+srv';
			host: string;
			port: number;
			name: string;
			user: string;
			password: string;
		};
		let jwtSecretMatch: RegExpMatchArray | null;
		let encryptionKeyMatch: RegExpMatchArray | null;

		try {
			if (process.env.TEST_MODE) {
				logger.debug('Loading private.test.ts config via import (TEST_MODE active)');
				// In test mode, the file is available at build time and keys are dynamic, so we import it
				const pathUtil = await import('path');
				const privateTestPath = pathUtil.resolve(process.cwd(), 'config/private.test.ts');

				const module = await import(/* @vite-ignore */ privateTestPath);
				const env = module.privateEnv;

				dbConfig = {
					type: env.DB_TYPE as 'mongodb',
					host: env.DB_HOST || 'localhost',
					port: Number(env.DB_PORT) || 27017,
					name: env.DB_NAME || 'sveltycms_test',
					user: env.DB_USER || '',
					password: env.DB_PASSWORD || ''
				};

				// Simulate regex matches for downstream checks
				jwtSecretMatch = ['MATCH', env.JWT_SECRET_KEY || ''];
				encryptionKeyMatch = ['MATCH', env.ENCRYPTION_KEY || ''];
			} else {
				// Read private.ts from filesystem to bypass Vite's import cache
				const fs = await import('fs/promises');
				const path = await import('path');
				const privateFilePath = path.resolve(process.cwd(), 'config/private.ts');

				logger.debug('Reading private.ts from filesystem', { path: privateFilePath });
				const privateFileContent = await fs.readFile(privateFilePath, 'utf-8');
				logger.debug('File read successfully', { length: privateFileContent.length });

				// Extract database config from the file content
				// The format is: DB_TYPE: 'value', (inside createPrivateConfig call)
				const dbTypeMatch = privateFileContent.match(/DB_TYPE:\s*['"]([^'"]+)['"]/);
				const dbHostMatch = privateFileContent.match(/DB_HOST:\s*['"]([^'"]+)['"]/);
				const dbPortMatch = privateFileContent.match(/DB_PORT:\s*(\d+)/);
				const dbNameMatch = privateFileContent.match(/DB_NAME:\s*['"]([^'"]+)['"]/);
				const dbUserMatch = privateFileContent.match(/DB_USER:\s*['"]([^'"]*)['"]/);
				const dbPasswordMatch = privateFileContent.match(/DB_PASSWORD:\s*['"]([^'"]*)['"]/);
				jwtSecretMatch = privateFileContent.match(/JWT_SECRET_KEY:\s*['"]([^'"]+)['"]/);
				encryptionKeyMatch = privateFileContent.match(/ENCRYPTION_KEY:\s*['"]([^'"]+)['"]/);

				logger.debug('Regex matches', {
					hasDbType: !!dbTypeMatch,
					hasDbHost: !!dbHostMatch,
					hasDbName: !!dbNameMatch,
					hasJwtSecret: !!jwtSecretMatch,
					hasEncryptionKey: !!encryptionKeyMatch,
					dbTypeValue: dbTypeMatch?.[1],
					dbHostValue: dbHostMatch?.[1],
					dbNameValue: dbNameMatch?.[1]
				});

				if (!dbTypeMatch || !dbHostMatch || !dbNameMatch || !jwtSecretMatch || !encryptionKeyMatch) {
					throw new Error(
						`Could not parse required config from private.ts. Missing: ${[
							!dbTypeMatch && 'DB_TYPE',
							!dbHostMatch && 'DB_HOST',
							!dbNameMatch && 'DB_NAME',
							!jwtSecretMatch && 'JWT_SECRET',
							!encryptionKeyMatch && 'ENCRYPTION_KEY'
						]
							.filter(Boolean)
							.join(', ')}`
					);
				}

				dbConfig = {
					type: dbTypeMatch[1] as 'mongodb' | 'mongodb+srv',
					host: dbHostMatch[1],
					port: dbPortMatch ? parseInt(dbPortMatch[1]) : 27017,
					name: dbNameMatch[1],
					user: dbUserMatch?.[1] || '',
					password: dbPasswordMatch?.[1] || ''
				};
			}

			logger.info('Database config loaded', {
				type: dbConfig.type,
				host: dbConfig.host,
				port: dbConfig.port,
				name: dbConfig.name,
				hasUser: !!dbConfig.user,
				hasJwtSecret: !!jwtSecretMatch?.[1],
				hasEncryptionKey: !!encryptionKeyMatch?.[1]
			});

			// Manually create database adapter (same as seed endpoint)
			const { getSetupDatabaseAdapter } = await import('@src/routes/api/setup/utils');
			const result = await getSetupDatabaseAdapter(dbConfig);
			dbAdapter = result.dbAdapter;

			// Create Auth instance with the adapter and session store
			const { getDefaultSessionStore } = await import('@src/databases/auth/sessionManager');
			setupAuth = new Auth(dbAdapter, getDefaultSessionStore());

			logger.info('✅ Database adapter and Auth service initialized successfully', { correlationId });
		} catch (initError) {
			const errorMessage = initError instanceof Error ? initError.message : String(initError);
			const errorStack = initError instanceof Error ? initError.stack : undefined;
			logger.error('Failed to initialize system:', {
				error: errorMessage,
				stack: errorStack,
				correlationId
			});
			throw new AppError(`System initialization failed: ${errorMessage}`, 500, 'INIT_FAILED');
		}

		// 3. Create admin user AND session using combined optimized method (single DB transaction)
		let adminUser: User | undefined;
		let session: Session | undefined;
		try {
			if (!setupAuth) {
				throw new Error('Auth service not initialized');
			}

			const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString; // 24 hours

			// Check if user already exists
			const existingUser = await setupAuth.getUserByEmail({ email: admin.email });

			if (existingUser && existingUser._id) {
				// ... existing logic ...
				// (Assuming mostly unchanged logic, just cleaner)
				logger.info('Updating existing admin user', { correlationId, email: admin.email, userId: existingUser._id });

				await setupAuth.updateUserAttributes(existingUser._id, {
					username: admin.username,
					password: admin.password,
					role: 'admin',
					isRegistered: true
				});

				const updatedUser = await setupAuth.getUserByEmail({ email: admin.email });
				if (!updatedUser) throw new Error('Failed to retrieve updated admin user');
				adminUser = updatedUser;

				session = await setupAuth.createSession({ user_id: adminUser._id, expires });
				if (!session || !session._id) throw new Error('Failed to create session - session object invalid');

				logger.info('✅ Admin user updated and session created', { correlationId, userId: adminUser._id, sessionId: session._id });
			} else {
				// Create new user AND session in one optimized call
				logger.info('Creating new admin user and session (optimized)', { correlationId, email: admin.email });

				const result = await setupAuth.createUserAndSession(
					{
						username: admin.username,
						email: admin.email,
						password: admin.password,
						role: 'admin',
						isRegistered: true
					},
					{ expires }
				);

				if (!result.success) {
					const errorMsg = 'error' in result ? result.error?.message : 'Failed to create user and session';
					throw new Error(errorMsg);
				}
				if (!result.data) throw new Error('Failed to create user and session - no data returned');

				adminUser = result.data.user;
				session = result.data.session;

				logger.info('✅ Admin user and session created (single transaction)', {
					correlationId,
					userId: adminUser._id,
					sessionId: session._id
				});
			}

			if (!adminUser || !session) {
				throw new Error(`Missing data after auth operations - adminUser: ${!!adminUser}, session: ${!!session}`);
			}
		} catch (authError) {
			logger.error('Failed to create admin user and session:', authError);
			throw new AppError(
				`Failed to create admin user: ${authError instanceof Error ? authError.message : String(authError)}`,
				500,
				'ADMIN_CREATION_FAILED'
			);
		}

		// 3.5. Save System Settings if provided
		if (system) {
			try {
				logger.info('Saving system configuration settings...', { correlationId });

				const settingsToSave = [
					{ key: 'SITE_NAME', value: system.siteName },
					{ key: 'HOST_PROD', value: system.hostProd },
					{ key: 'BASE_LOCALE', value: system.defaultSystemLanguage },
					{ key: 'LOCALES', value: system.systemLanguages },
					{ key: 'DEFAULT_CONTENT_LANGUAGE', value: system.defaultContentLanguage },
					{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: system.contentLanguages },
					{ key: 'MEDIA_STORAGE_TYPE', value: system.mediaStorageType },
					{ key: 'MEDIA_FOLDER', value: system.mediaFolder },
					{ key: 'TIMEZONE', value: system.timezone }
				].filter((s) => s.value !== undefined);

				const result = await (dbAdapter as any).systemPreferences.setMany(
					settingsToSave.map((s) => ({
						key: s.key,
						value: s.value,
						category: 'public',
						scope: 'system'
					}))
				);

				if (result.success) {
					logger.info('✅ System configuration settings saved successfully', { correlationId });
				} else {
					logger.error('Failed to save system settings (non-fatal):', {
						correlationId,
						error: result.error?.message
					});
				}
			} catch (settingsError) {
				// We don't want to fail the entire setup if just settings fail to save,
				// but we should log it prominently.
				logger.error('Error saving system settings (non-fatal):', {
					correlationId,
					error: settingsError instanceof Error ? settingsError.message : String(settingsError)
				});
			}
		}

		// Verify session and user are properly set
		if (!session || !adminUser) {
			throw new AppError('Failed to initialize admin user and session', 500, 'SESSION_INIT_FAILED');
		}

		// 4. Initialize the global system (db.ts) - use in-memory config (MOST EFFICIENT!)
		try {
			logger.info('🚀 Initializing global system with in-memory config (zero-restart optimization)...', { correlationId });
			const { initializeWithConfig } = await import('@src/databases/db');

			// Build full config object from parsed private.ts data
			const fullConfig = {
				DB_TYPE: dbConfig.type,
				DB_HOST: dbConfig.host,
				DB_PORT: dbConfig.port,
				DB_NAME: dbConfig.name,
				DB_USER: dbConfig.user || '',
				DB_PASSWORD: dbConfig.password || '',
				JWT_SECRET_KEY: jwtSecretMatch[1],
				ENCRYPTION_KEY: encryptionKeyMatch[1]
			};

			// Pass config in-memory - bypasses both filesystem AND Vite cache!
			const result = await initializeWithConfig(fullConfig);

			if (result.status !== 'success') {
				const errorMsg = `System initialization failed: ${result.error || 'Unknown error'}`;
				throw new Error(errorMsg);
			}

			logger.info('✅ Global system initialized successfully (in-memory config)', { correlationId });
		} catch (initError) {
			const errorMsg = `System initialization exception: ${initError instanceof Error ? initError.message : String(initError)}`;
			logger.error(errorMsg, {
				error: initError instanceof Error ? initError.message : String(initError),
				stack: initError instanceof Error ? initError.stack : undefined,
				correlationId
			});
			throw new AppError(errorMsg, 500, 'GLOBAL_INIT_FAILED');
		}

		// 5. Now safe to invalidate caches (after system is initialized)
		invalidateSettingsCache();
		const { invalidateSetupCache } = await import('@utils/setupCheck');
		invalidateSetupCache();
		logger.info('Caches invalidated', { correlationId });

		// 5.1 Warm up session cache in the global auth instance
		try {
			const { auth: globalAuth } = await import('@src/databases/db');
			if (globalAuth && session && session._id) {
				const validatedUser = await globalAuth.validateSession(session._id);
				if (validatedUser) {
					logger.info('✅ Session cache warmed up in global auth instance', { correlationId, sessionId: session._id });
					// Also warm up the handleAuthentication cache
					const { clearSessionRefreshAttempt } = await import('@src/hooks/handleAuthentication');
					if (clearSessionRefreshAttempt) {
						clearSessionRefreshAttempt(session._id);
					}
				}
			}
		} catch (cacheWarmupError) {
			logger.warn('Failed to warm up session cache (non-fatal)', {
				correlationId,
				error: cacheWarmupError instanceof Error ? cacheWarmupError.message : String(cacheWarmupError)
			});
		}

		// 6. Send welcome email to the new admin user (optional - graceful failure)
		if (!skipWelcomeEmail) {
			try {
				const hostLink = url.origin;
				const langFromStore = app.systemLanguage;
				const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
				const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';

				const emailResponse = await fetch(`${url.origin}/api/sendMail`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-internal-call': 'true' // Mark as internal call to bypass auth
					},
					body: JSON.stringify({
						recipientEmail: admin.email,
						subject: `Welcome to ${publicEnv.SITE_NAME || 'SveltyCMS'}`,
						templateName: 'welcomeUser',
						props: {
							username: admin.username,
							sitename: publicEnv.SITE_NAME || 'SveltyCMS',
							hostLink: hostLink
						},
						languageTag: userLanguage
					})
				});

				if (emailResponse.ok) {
					logger.info('✅ Welcome email sent successfully', { correlationId });
				} else {
					const emailError = await emailResponse.text();
					logger.warn('Failed to send welcome email (non-fatal)', { correlationId, to: admin.email, error: emailError });
				}
			} catch (emailError) {
				logger.warn('Error sending welcome email (non-fatal)', {
					correlationId,
					error: emailError instanceof Error ? emailError.message : String(emailError)
				});
			}
		}

		// 6.5 CRITICAL: Warm cache BEFORE redirecting user
		try {
			const warmupUrl = `${url.protocol}//${url.host}/`;
			logger.info(`🔥 Warming cache by fetching ${warmupUrl}...`, { correlationId });
			await fetch(warmupUrl, {
				headers: {
					'User-Agent': 'SveltyCMS-Setup-Cache-Warmer/1.0',
					'X-Cache-Warmup': 'true'
				}
			});
		} catch (warmupError) {
			logger.warn('Cache warming failed (non-critical)', {
				correlationId,
				error: warmupError instanceof Error ? warmupError.message : String(warmupError)
			});
		}

		// 7. Determine redirect path
		let redirectPath: string;
		try {
			const langFromStore = app.systemLanguage;
			const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
			const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';

			if (firstCollection?.path) {
				const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
				redirectPath = `/${userLanguage}${collectionPath}`;
				logger.info(`Setup complete: Redirecting to collection path: ${firstCollection.name} at ${redirectPath}`, { correlationId });
			} else if (!firstCollection) {
				const collectionPath = await getCachedFirstCollectionPath(userLanguage);
				if (collectionPath) {
					redirectPath = collectionPath;
					logger.info(`Setup complete: Redirecting to collection from database: ${redirectPath}`, { correlationId });
				} else {
					redirectPath = '/config/collectionbuilder';
				}
			} else if (firstCollection?._id) {
				redirectPath = `/${userLanguage}/${firstCollection._id}`;
				logger.warn(`Setup complete: Using UUID redirect: ${redirectPath}`, { correlationId });
			} else {
				redirectPath = '/config/collectionbuilder';
			}
		} catch (redirectError) {
			logger.warn('Failed to determine redirect path, using default', {
				correlationId,
				error: redirectError instanceof Error ? redirectError.message : String(redirectError)
			});
			redirectPath = '/config/collectionbuilder';
		}

		// 8. Create session cookie
		let sessionCookie;
		try {
			if (!setupAuth) throw new Error('Auth service not available');
			if (!session || !session._id) throw new Error(`Invalid session object`);

			sessionCookie = setupAuth.createSessionCookie(session._id);
			logger.info('✅ Session cookie created', { correlationId, sessionId: session._id });
		} catch (sessionError) {
			logger.error('Failed to create session:', sessionError);
			throw new AppError(
				`Failed to create session: ${sessionError instanceof Error ? sessionError.message : JSON.stringify(sessionError)}`,
				500,
				'SESSION_CREATION_FAILED'
			);
		}

		// 9. Set session cookie
		const cookieAttrs = sessionCookie.attributes as { maxAge?: number } | undefined;
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:' || (!dev && process.env.TEST_MODE !== 'true'),
			maxAge: cookieAttrs?.maxAge ?? 60 * 60 * 24,
			sameSite: 'lax'
		});

		// 10. Set theme cookies
		const theme = cookies.get('theme');
		const darkMode = cookies.get('darkMode');
		if (theme) {
			cookies.set('theme', theme, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				sameSite: 'lax'
			});
		}
		if (darkMode) {
			cookies.set('darkMode', darkMode, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				sameSite: 'lax'
			});
		}

		// 10.5 Trigger telemetry now that setup is complete
		try {
			const { telemetryService } = await import('@src/services/TelemetryService');
			logger.info('📡 Triggering post-setup telemetry check...', { correlationId });
			// Fire and forget
			telemetryService.checkUpdateStatus().catch((err) => logger.warn('Telemetry error', err));
		} catch (telemetryError) {
			logger.warn('Failed to trigger post-setup telemetry (non-fatal)', {
				correlationId,
				error: telemetryError instanceof Error ? telemetryError.message : String(telemetryError)
			});
		}

		// 11. Return success
		return json({
			success: true,
			message: 'Setup complete! Welcome to SveltyCMS! 🎉',
			redirectPath,
			loggedIn: true,
			requiresHardReload: false,
			requiresServerRestart: false
		});
	} catch (error) {
		if (error instanceof AppError) throw error;
		console.error('Setup finalization failed', error);
		throw new AppError(error instanceof Error ? error.message : 'An unknown error occurred', 500, 'SETUP_FAILED');
	}
});
