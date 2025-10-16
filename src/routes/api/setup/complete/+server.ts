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
import type { User, Session } from '@src/databases/schemas';
import { Auth } from '@src/databases/auth';
import { invalidateSettingsCache } from '@src/services/settingsService';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';
import type { RequestHandler } from './$types';

// Content Manager for redirects
import { contentManager } from '@root/src/content/ContentManager';
import type { Locale } from '@src/paraglide/runtime';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { systemLanguage } from '@stores/store.svelte';
import { get } from 'svelte/store';

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

import { getCachedFirstCollectionPath } from '@src/stores/collectionStore.svelte';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const correlationId = randomBytes(6).toString('hex');
	try {
		const setupData = await request.json();
		const { admin, firstCollection, skipWelcomeEmail } = setupData as {
			admin: AdminConfig;
			firstCollection?: { name: string; path: string } | null;
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

		// 1. Validate admin user data
		const adminValidation = safeParse(setupAdminSchema, admin);
		if (!adminValidation.success) {
			const issues = adminValidation.issues.map((i) => i.message).join(', ');
			return json({ success: false, error: `Invalid admin user data: ${issues}` }, { status: 400 });
		}

		// 2. Initialize full system using DB config from filesystem (bypass Vite cache)
		logger.info('Initializing full system with existing configuration...', { correlationId });
		let setupAuth: Auth;
		let dbConfig: {
			type: 'mongodb' | 'mongodb+srv';
			host: string;
			port: number;
			name: string;
			user: string;
			password: string;
		};

		try {
			// Read private.ts from filesystem to bypass Vite's import cache
			const fs = await import('fs/promises');
			const path = await import('path');
			const privateFilePath = path.resolve(process.cwd(), 'config/private.ts');

			logger.debug('Reading private.ts from filesystem', { path: privateFilePath });
			const privateFileContent = await fs.readFile(privateFilePath, 'utf-8');
			logger.debug('File read successfully', { length: privateFileContent.length });

			// Debug: Show first 500 characters to understand the format
			logger.debug('File content preview:', { preview: privateFileContent.substring(0, 500) });

			// Extract database config from the file content
			// The format is: DB_TYPE: 'value', (inside createPrivateConfig call)
			const dbTypeMatch = privateFileContent.match(/DB_TYPE:\s*['"]([^'"]+)['"]/);
			const dbHostMatch = privateFileContent.match(/DB_HOST:\s*['"]([^'"]+)['"]/);
			const dbPortMatch = privateFileContent.match(/DB_PORT:\s*(\d+)/);
			const dbNameMatch = privateFileContent.match(/DB_NAME:\s*['"]([^'"]+)['"]/);
			const dbUserMatch = privateFileContent.match(/DB_USER:\s*['"]([^'"]*)['"]/);
			const dbPasswordMatch = privateFileContent.match(/DB_PASSWORD:\s*['"]([^'"]*)['"]/);
			const jwtSecretMatch = privateFileContent.match(/JWT_SECRET_KEY:\s*['"]([^'"]+)['"]/);
			const encryptionKeyMatch = privateFileContent.match(/ENCRYPTION_KEY:\s*['"]([^'"]+)['"]/);

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

			logger.info('Database config parsed from filesystem', {
				type: dbConfig.type,
				host: dbConfig.host,
				port: dbConfig.port,
				name: dbConfig.name,
				hasUser: !!dbConfig.user,
				hasJwtSecret: !!jwtSecretMatch[1],
				hasEncryptionKey: !!encryptionKeyMatch[1]
			});

			// Manually create database adapter (same as seed endpoint)
			const { getSetupDatabaseAdapter } = await import('@src/routes/api/setup/utils');
			const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

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
			return json(
				{
					success: false,
					error: `System initialization failed: ${errorMessage}`
				},
				{ status: 500 }
			);
		}

		// 3. Create admin user AND session using combined optimized method (single DB transaction)
		let adminUser: User | undefined;
		let session: Session | undefined;
		try {
			if (!setupAuth) {
				throw new Error('Auth service not initialized');
			}

			const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

			// Check if user already exists
			const existingUser = await setupAuth.getUserByEmail({ email: admin.email });

			if (existingUser && existingUser._id) {
				// Update existing user
				logger.info('Updating existing admin user', { correlationId, email: admin.email, userId: existingUser._id });

				await setupAuth.updateUserAttributes(existingUser._id, {
					username: admin.username,
					password: admin.password,
					role: 'admin',
					isRegistered: true
				});

				logger.debug('User attributes updated, fetching updated user...', { correlationId, userId: existingUser._id });

				const updatedUser = await setupAuth.getUserByEmail({ email: admin.email });
				if (!updatedUser) throw new Error('Failed to retrieve updated admin user');
				adminUser = updatedUser;

				logger.debug('Updated user retrieved, creating session...', { correlationId, userId: adminUser._id });

				// Create session for updated user
				const sessionResult = await setupAuth.createSession({ user_id: adminUser._id, expires });

				logger.debug('Session creation result:', {
					correlationId,
					success: sessionResult.success,
					hasData: !!sessionResult.data,
					message: sessionResult.message,
					dataType: typeof sessionResult.data
				});

				if (!sessionResult.success || !sessionResult.data) {
					throw new Error(sessionResult.message || 'Failed to create session');
				}
				session = sessionResult.data;

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

				logger.debug('createUserAndSession result:', {
					correlationId,
					success: result.success,
					hasData: !!result.data,
					message: result.message,
					dataType: typeof result.data,
					dataKeys: result.data ? Object.keys(result.data) : []
				});

				if (!result.success || !result.data) {
					throw new Error(result.message || 'Failed to create user and session');
				}

				adminUser = result.data.user;
				session = result.data.session;

				logger.debug('User and session assigned from result', {
					correlationId,
					hasUser: !!adminUser,
					hasSession: !!session,
					userId: adminUser?._id,
					sessionId: session?._id
				});

				logger.info('✅ Admin user and session created (single transaction)', {
					correlationId,
					userId: adminUser._id,
					sessionId: session._id
				});
			}

			// Verify we have both user and session before proceeding
			logger.debug('Verifying user and session data...', {
				correlationId,
				hasAdminUser: !!adminUser,
				hasSession: !!session,
				adminUserType: typeof adminUser,
				sessionType: typeof session
			});

			if (!adminUser || !session) {
				throw new Error(`Missing data after auth operations - adminUser: ${!!adminUser}, session: ${!!session}`);
			}

			logger.debug('Verification passed, exiting try block...', { correlationId });
		} catch (authError) {
			logger.error('Failed to create admin user and session:', authError);
			return json(
				{
					success: false,
					error: `Failed to create admin user: ${authError instanceof Error ? authError.message : String(authError)}`
				},
				{ status: 500 }
			);
		}

		// Verify session and user are properly set
		if (!session || !adminUser) {
			logger.error('Session or admin user not properly initialized', {
				hasSession: !!session,
				hasAdminUser: !!adminUser,
				sessionId: session?._id,
				userId: adminUser?._id
			});
			return json(
				{
					success: false,
					error: 'Failed to initialize admin user and session'
				},
				{ status: 500 }
			);
		}

		// 4. Initialize the global system (db.ts) - reload private.ts from filesystem
		try {
			logger.info('🚀 Initializing global system from db.ts...', { correlationId });
			const { initializeWithFreshConfig } = await import('@src/databases/db');

			// Simply reload private.ts from filesystem - no manual config needed!
			// The private.ts file was just created, so we force reload to bypass Vite cache
			const result = await initializeWithFreshConfig();

			if (result.status !== 'initialized') {
				// System initialization FAILED - cannot continue
				const errorMsg = `System initialization failed: ${result.error || 'Unknown error'}`;
				logger.error(errorMsg, { correlationId });
				return json(
					{
						success: false,
						error: errorMsg
					},
					{ status: 500 }
				);
			}

			logger.info('✅ Global system initialized successfully', { correlationId });
		} catch (initError) {
			// System initialization threw an exception - cannot continue
			const errorMsg = `System initialization exception: ${initError instanceof Error ? initError.message : String(initError)}`;
			logger.error(errorMsg, {
				error: initError instanceof Error ? initError.message : String(initError),
				stack: initError instanceof Error ? initError.stack : undefined,
				correlationId
			});
			return json(
				{
					success: false,
					error: errorMsg
				},
				{ status: 500 }
			);
		}

		// 5. Now safe to invalidate caches (after system is initialized)
		invalidateSettingsCache();
		const { invalidateSetupCache } = await import('@utils/setupCheck');
		invalidateSetupCache();
		logger.info('Caches invalidated', { correlationId });

		// 6. Send welcome email to the new admin user (optional - graceful failure)
		// Only send if SMTP was configured during setup
		if (!skipWelcomeEmail) {
			try {
				const hostLink = url.origin; // Get the full origin (protocol + host)
				const langFromStore = get(systemLanguage);
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
					logger.info('✅ Welcome email sent successfully', { correlationId, to: admin.email });
				} else {
					const emailError = await emailResponse.text();
					logger.warn('Failed to send welcome email (non-fatal)', { correlationId, to: admin.email, error: emailError });
				}
			} catch (emailError) {
				// Don't fail setup if email fails - just log the error
				logger.warn('Error sending welcome email (non-fatal)', {
					correlationId,
					error: emailError instanceof Error ? emailError.message : String(emailError)
				});
			}
		} else {
			logger.info('Skipping welcome email (SMTP not configured during setup)', { correlationId });
		}

		// 7. Determine redirect path
		let redirectPath: string;
		try {
			const langFromStore = get(systemLanguage);
			const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
			const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';

			// Use firstCollection if it was passed from the seed step (faster!)
			if (firstCollection && firstCollection.path) {
				const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
				redirectPath = `/${userLanguage}${collectionPath}`;
				logger.info(`✨ Fast redirect using pre-seeded collection: \x1b[34m${firstCollection.name}\x1b[0m at \x1b[34m${redirectPath}\x1b[0m`, {
					correlationId
				});
			} else {
				// Fallback: Query ContentManager (slower)
				logger.debug('No firstCollection passed, querying ContentManager...', { correlationId });

				// Force ContentManager to reload all collections
				await contentManager.initialize(undefined, true);

				redirectPath = await getCachedFirstCollectionPath(userLanguage);

				// If no collections found, fall back to collection builder
				if (!redirectPath) {
					redirectPath = '/config/collectionbuilder';
					logger.info('No collections available, redirecting to collection builder', { correlationId });
				} else {
					logger.info('Redirecting to first collection', { correlationId, redirectPath });
				}
			}
		} catch (redirectError) {
			logger.warn('Failed to determine redirect path, using default', {
				correlationId,
				error: redirectError instanceof Error ? redirectError.message : String(redirectError)
			});
			redirectPath = '/config/collectionbuilder';
		}

		// 8. Create session cookie (session already created in step 3)
		let sessionCookie;
		try {
			if (!setupAuth) {
				throw new Error('Auth service not available');
			}

			if (!session || !session._id) {
				throw new Error(`Invalid session object: ${JSON.stringify(session)}`);
			}

			sessionCookie = setupAuth.createSessionCookie(session._id);
			logger.info('✅ Session cookie created', { correlationId, sessionId: session._id });
		} catch (sessionError) {
			logger.error('Failed to create session:', sessionError);
			logger.error('Session error details:', {
				errorType: typeof sessionError,
				errorKeys: sessionError ? Object.keys(sessionError) : [],
				errorMessage: sessionError instanceof Error ? sessionError.message : 'Not an Error instance'
			});
			return json(
				{
					success: false,
					error: `Failed to create session: ${sessionError instanceof Error ? sessionError.message : JSON.stringify(sessionError)}`
				},
				{ status: 500 }
			);
		}

		// 9. Set session cookie
		const cookieAttrs = sessionCookie.attributes as { maxAge?: number } | undefined;
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:' || !dev,
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

		// 11. Return success - NO RESTART REQUIRED! ✨
		return json({
			success: true,
			message: 'Setup complete! Welcome to SveltyCMS! 🎉',
			redirectPath,
			loggedIn: true,
			requiresHardReload: false, // No hard reload needed
			requiresServerRestart: false // ✨ No server restart needed!
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		logger.error('Setup finalization failed', { correlationId, error: errorMessage });
		return json(
			{
				success: false,
				error: errorMessage
			},
			{ status: 500 }
		);
	}
};
