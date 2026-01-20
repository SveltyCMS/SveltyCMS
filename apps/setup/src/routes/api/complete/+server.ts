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
import type { User, Session } from '@shared/database/auth/types';
import type { DatabaseConfig } from '@shared/database/schemas';
import type { ISODateString } from '@shared/database/dbInterface';
// Auth will be imported dynamically

import { invalidateSettingsCache } from '@shared/services/settingsService';
import { setupAdminSchema } from '@shared/utils/formSchemas';
import { json } from '@sveltejs/kit';
import { logger } from '@shared/utils/logger.server';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';
import type { RequestHandler } from './$types';

// Collection utilities
import type { Locale } from '$paraglide/runtime.js';
import { publicEnv } from '@shared/stores/globalSettings.svelte';
import { app } from '@shared/stores/store.svelte';

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

// Collection utilities removed to break circular dependency
// import { getCachedFirstCollectionPath } from '@shared/utils/server/collection-utils.server.ts';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const correlationId = randomBytes(6).toString('hex');
	try {
		const setupData = await request.json();
		const { admin, firstCollection, skipWelcomeEmail } = setupData as {
			admin: AdminConfig;
			firstCollection?: { name: string; path: string; _id?: string } | null;
			skipWelcomeEmail?: boolean;
			dbConfig: DatabaseConfig; // Now receiving this from client!
		};

		logger.info('Starting setup finalization', { correlationId, admin: '[REDACTED]' });

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

		// 1.5 Write private.ts (Deferred to the very end to prevent premature server restart)
		// We will perform this as the last action before returning.
		const dbConfigFromPayload = setupData.dbConfig as DatabaseConfig;

		// 2. Initialize full system using the payload config (since we just wrote it, we trust it)
		// 2. Initialize full system using the payload config
		logger.info('Initializing full system with in-memory configuration...', { correlationId });
		let setupAuth: Auth;

		// Generate security keys in-memory (to be used for BOTH init and final write)
		// This avoids the 'Chicken and Egg' problem of needing keys from a file that isn't written yet.
		const jwtSecret = randomBytes(32).toString('base64');
		const encryptionKey = randomBytes(32).toString('base64');

		const dbConfig = {
			type: dbConfigFromPayload.type,
			host: dbConfigFromPayload.host,
			port: Number(dbConfigFromPayload.port) || 27017,
			name: dbConfigFromPayload.name,
			user: dbConfigFromPayload.user || '',
			password: dbConfigFromPayload.password || ''
		};

		try {
			logger.info('Database config prepared with generated keys', {
				type: dbConfig.type,
				host: dbConfig.host,
				port: dbConfig.port,
				name: dbConfig.name,
				hasUser: !!dbConfig.user,
				hasJwtSecret: true,
				hasEncryptionKey: true
			});

			// Manually create database adapter (same as seed endpoint)
			const { getSetupDatabaseAdapter } = await import('../utils');
			const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

			// Create Auth instance with the adapter and session store
			const { getDefaultSessionStore } = await import('@shared/database/auth/sessionManager');
			const { Auth } = await import('@shared/database/auth');
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

			const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString; // 24 hours

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

				// Create session for updated user (returns Session directly, not DatabaseResult)
				try {
					session = await setupAuth.createSession({ user_id: adminUser._id, expires });

					logger.debug('Session creation result:', {
						correlationId,
						hasSession: !!session,
						sessionId: session?._id,
						sessionType: typeof session,
						sessionKeys: session ? Object.keys(session) : []
					});

					if (!session || !session._id) {
						throw new Error('Failed to create session - session object invalid');
					}
				} catch (sessionError) {
					logger.error('Session creation error:', {
						correlationId,
						error: sessionError instanceof Error ? sessionError.message : String(sessionError),
						stack: sessionError instanceof Error ? sessionError.stack : undefined
					});
					throw new Error(`Failed to create session: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`);
				}

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
					hasData: result.success ? !!result.data : false,
					dataType: result.success ? typeof result.data : 'none',
					dataKeys: result.success && result.data ? Object.keys(result.data) : []
				});

				if (!result.success) {
					const errorMsg = 'error' in result ? result.error?.message : 'Failed to create user and session';
					throw new Error(errorMsg);
				}

				if (!result.data) {
					throw new Error('Failed to create user and session - no data returned');
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

		// 4. Initialize the global system (db.ts) - use in-memory config (MOST EFFICIENT!)
		try {
			logger.info('🚀 Initializing global system with in-memory config (zero-restart optimization)...', { correlationId });
			const { initializeWithConfig } = await import('@shared/database/db');

			// Build full config object from parsed private.ts data
			const fullConfig = {
				DB_TYPE: dbConfig.type,
				DB_HOST: dbConfig.host,
				DB_PORT: dbConfig.port,
				DB_NAME: dbConfig.name,
				DB_USER: dbConfig.user || '',
				DB_PASSWORD: dbConfig.password || '',
				JWT_SECRET_KEY: jwtSecret,
				ENCRYPTION_KEY: encryptionKey
			};

			// Pass config in-memory - bypasses both filesystem AND Vite cache!
			const result = await initializeWithConfig(fullConfig);

			if (result.status !== 'success') {
				// System initialization FAILED - log warning but continue
				const errorMsg = `System initialization failed (In-Memory): ${result.error || 'Unknown error'}. Proceedings to write config to force restart.`;
				logger.warn(errorMsg, { correlationId });
			} else {
				logger.info('✅ Global system initialized successfully (in-memory config)', { correlationId });
			}
		} catch (initError) {
			// System initialization threw an exception - log warning but continue
			const errorMsg = `System initialization exception (In-Memory): ${initError instanceof Error ? initError.message : String(initError)}. Proceeding to write config to force restart.`;
			logger.warn(errorMsg, {
				error: initError instanceof Error ? initError.message : String(initError),
				stack: initError instanceof Error ? initError.stack : undefined,
				correlationId
			});
		}

		// 5. Now safe to invalidate caches (after system is initialized)
		invalidateSettingsCache();
		const { invalidateSetupCache } = await import('@shared/utils/setupCheck');
		invalidateSetupCache();
		logger.info('Caches invalidated', { correlationId });

		// 5.1 Warm up session cache in the global auth instance
		// This ensures the newly created session is recognized immediately after setup
		try {
			const { auth: globalAuth } = await import('@shared/database/db');
			if (globalAuth && session && session._id) {
				// Validate the session using the global auth instance to populate its cache
				const validatedUser = await globalAuth.validateSession(session._id);
				if (validatedUser) {
					logger.info('✅ Session cache warmed up in global auth instance', {
						correlationId,
						sessionId: session._id,
						userId: validatedUser._id
					});

					logger.info('✅ Session cache warmed up in global auth instance', {
						correlationId,
						sessionId: session._id,
						userId: validatedUser._id
					});
				} else {
					logger.warn('Session validation returned null - session may not be recognized', {
						correlationId,
						sessionId: session._id
					});
				}
			}
		} catch (cacheWarmupError) {
			// Non-fatal: Log but continue - user can still login manually if needed
			logger.warn('Failed to warm up session cache (non-fatal)', {
				correlationId,
				error: cacheWarmupError instanceof Error ? cacheWarmupError.message : String(cacheWarmupError)
			});
		}

		// 6. Send welcome email to the new admin user (optional - graceful failure)
		// Only send if SMTP was configured during setup
		if (!skipWelcomeEmail) {
			try {
				const hostLink = url.origin; // Get the full origin (protocol + host)
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

		// 6.5 CRITICAL: Warm cache BEFORE redirecting user (ensures instant first load)
		try {
			const warmupUrl = `${url.protocol}//${url.host}/`;
			logger.info(`🔥 Warming cache by fetching ${warmupUrl}...`, { correlationId });

			const warmupResponse = await fetch(warmupUrl, {
				headers: {
					'User-Agent': 'SveltyCMS-Setup-Cache-Warmer/1.0',
					'X-Cache-Warmup': 'true'
				}
			});

			if (warmupResponse.ok) {
				const contentLength = warmupResponse.headers.get('content-length');
				logger.info('✅ Cache successfully warmed - first load will be INSTANT', {
					correlationId,
					status: warmupResponse.status,
					contentLength: contentLength ? `${contentLength} bytes` : 'unknown',
					cached: 'homepage SSR pre-rendered'
				});
			} else {
				logger.warn(`Cache warming returned ${warmupResponse.status}, but continuing...`, {
					correlationId,
					status: warmupResponse.status,
					statusText: warmupResponse.statusText
				});
			}
		} catch (warmupError) {
			// Non-fatal: Log but continue - first load will just be slower
			logger.warn('Cache warming failed (non-critical - first load may be slower)', {
				correlationId,
				error: warmupError instanceof Error ? warmupError.message : String(warmupError)
			});
		}

		// 7. Determine redirect path - PREFER PATH over UUID for clean URLs
		let redirectPath: string;
		try {
			const langFromStore = app.systemLanguage;
			const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
			const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';

			// ✅ PRIORITY 1: Use path from firstCollection (clean URL)
			if (firstCollection?.path) {
				// Ensure path has leading slash
				const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
				redirectPath = `/${userLanguage}${collectionPath}`;
				logger.info(`Setup complete: Redirecting to collection path: ${firstCollection.name} at ${redirectPath}`, {
					correlationId
				});
			}
			// ✅ PRIORITY 2: Fallback to a default path if firstCollection is missing
			else if (!firstCollection) {
				// We don't have collection-utils anymore to avoid circular dependencies
				// Redirect to collection builder which is a safe landing spot
				redirectPath = '/config/collectionbuilder';
				logger.info(`Setup complete: No firstCollection in payload, redirecting to collection builder`, { correlationId });
			}
			// ⚠️ LEGACY FALLBACK: Use UUID only if path unavailable (will auto-redirect to path via client)
			else if (firstCollection?._id) {
				redirectPath = `/${userLanguage}/${firstCollection._id}`;
				logger.warn(`Setup complete: Using UUID redirect (path missing): ${redirectPath} - will redirect to path on client`, {
					correlationId
				});
			} else {
				// Should never happen - but handle gracefully
				logger.warn('Setup complete: No valid redirect target found, using collection builder', { correlationId });
				redirectPath = '/config/collectionbuilder';
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

		// 10.5 Trigger telemetry now that setup is complete
		try {
			const { telemetryService } = await import('@shared/services/TelemetryService');
			logger.info('📡 Triggering post-setup telemetry check...', { correlationId });

			// Fire and forget - don't block the response
			telemetryService.checkUpdateStatus().catch((telemetryError) => {
				logger.warn('Post-setup telemetry check failed (non-fatal)', {
					correlationId,
					error: telemetryError instanceof Error ? telemetryError.message : String(telemetryError)
				});
			});

			logger.info('✅ Post-setup telemetry check initiated', { correlationId });
		} catch (telemetryError) {
			// Non-fatal: Log but continue
			logger.warn('Failed to trigger post-setup telemetry (non-fatal)', {
				correlationId,
				error: telemetryError instanceof Error ? telemetryError.message : String(telemetryError)
			});
		}

		// 11. CRITICAL: Write marker FIRST, config SECOND to prevent race condition
		logger.info('📝 Writing completion marker and configuration...', { correlationId });

		try {
			const { writePrivateConfig } = await import('../writePrivateConfig');
			const { writeFile } = await import('fs/promises');

			if (!setupData.dbConfig) {
				throw new Error('Missing database configuration in completion payload');
			}

			const path = await import('path');
			let workspaceRoot = process.cwd();
			if (workspaceRoot.endsWith('apps/setup') || workspaceRoot.endsWith('apps/setup/')) {
				workspaceRoot = path.resolve(workspaceRoot, '../../');
			}
			const markerPath = path.resolve(workspaceRoot, 'config', '.setup-complete');

			// Step 1: Write completion marker (signals setup is done)
			await writeFile(markerPath, new Date().toISOString(), 'utf-8');
			logger.info('✅ Completion marker written', { correlationId });

			// Step 2: Write config file (triggers smart-dev restart)
			await writePrivateConfig(setupData.dbConfig, { jwtSecret, encryptionKey });
			logger.info('✅ Configuration written - smart-dev will restart server', { correlationId });
		} catch (writeError) {
			logger.error('Failed to write configuration:', {
				correlationId,
				error: writeError
			});
			return json(
				{
					success: false,
					error: `Failed to save configuration: ${writeError instanceof Error ? writeError.message : String(writeError)}`
				},
				{ status: 500 }
			);
		}

		// 12. Return success - server will restart to CMS automatically
		return json({
			success: true,
			message: 'Setup complete! Switching to CMS...',
			redirectPath,
			loggedIn: true,
			requiresHardReload: false,
			requiresServerRestart: true // Smart-dev will handle this
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
