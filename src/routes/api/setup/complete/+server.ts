/**
 * @file src/routes/api/setup/complete/+server.ts
 * @description Finalizes the initial CMS setup by creating the admin user,
 *              persisting database credentials, and logging the user in.
 * @summary
 *  - Connects to the database using credentials from the request.
 *  - Creates or updates the admin user.
 *  - Updates `config/private.ts` with the database credentials.
 *  - Invalidates the global settings cache to force a reload on the next request.
 *  - Creates an authenticated session for the admin user.
 *
 * This endpoint assumes that the database has already been seeded via the
 * `/api/setup/seed-settings` endpoint, which is triggered on a successful
 * database connection test in the UI.
 */

import { dev } from '$app/environment';

// Auth

import type { DatabaseConfig } from '@root/config/types';
import { Auth } from '@src/auth';
import { getDefaultSessionStore } from '@src/auth/sessionManager';
import type { User } from '@src/auth/types';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';
import { getSetupDatabaseAdapter } from '../utils';
import type { RequestHandler } from './$types';

// Content Manager for redirects
import { contentManager } from '@root/src/content/ContentManager';
import type { Locale } from '@src/paraglide/runtime';
import { systemLanguage } from '@stores/store.svelte';
import { get } from 'svelte/store';
import { publicEnv } from '@src/stores/globalSettings';
import { auth } from '@src/databases/db';

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

/**
 * Constructs a redirect URL to the first available collection, prefixed with the given language.
 * @param language The validated user language (e.g., 'en', 'de').
 */
async function fetchAndRedirectToFirstCollection(language: Locale): Promise<string> {
	try {
		logger.debug(`Fetching first collection path for language: ${language}`);

		const firstCollection = contentManager.getFirstCollection();
		if (firstCollection?.path) {
			// Ensure the collection path has a leading slash
			const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
			const redirectUrl = `/${language}${collectionPath}`;
			logger.info(`Redirecting to first collection: \x1b[34m${firstCollection.name}\x1b[0m at path: \x1b[34m${redirectUrl}\x1b[0m`);
			return redirectUrl;
		}

		logger.warn('No collections found via getFirstCollection(), returning null.');
		return null; // Return null if no collections are configured
	} catch (err) {
		logger.error('Error in fetchAndRedirectToFirstCollection:', err);
		return null; // Return null on error
	}
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const correlationId = randomBytes(6).toString('hex');
	try {
		const setupData = await request.json();
		const { database, admin } = setupData as {
			database: DatabaseConfig;
			admin: AdminConfig;
		};

		logger.info('Starting setup finalization', { correlationId, db: database.name, admin: admin.email });

		// 1. Validate admin user data
		const adminValidation = safeParse(setupAdminSchema, admin);
		if (!adminValidation.success) {
			const issues = adminValidation.issues.map((i) => i.message).join(', ');
			return json({ success: false, error: `Invalid admin user data: ${issues}` }, { status: 400 });
		}

		// 1.1 Validate DB credentials presence only for Atlas/remote MongoDB requiring auth
		// Local MongoDB might not require authentication, so we allow empty credentials
		// This matches the behavior of the test-database endpoint
		if (database.type === 'mongodb+srv' && (!database.user || !database.password)) {
			return json(
				{
					success: false,
					error: 'Credentials required for MongoDB Atlas connections',
					userFriendly: 'MongoDB Atlas requires a username and password. Please provide valid credentials.'
				},
				{ status: 400 }
			);
		}

		// 2. Create temporary database adapter and establish connection (agnostic)
		const { authAdapter } = await getSetupDatabaseAdapter(database);
		logger.info('Database connection established for setup finalization', { correlationId });

		// 3. Set up auth models (already done in getSetupDatabaseAdapter)
		// Models are already initialized by getSetupDatabaseAdapter

		// 4. Create a temporary full Auth instance using the composed adapter
		const tempAuth = new Auth(authAdapter, getDefaultSessionStore());
		logger.info('Temporary Auth service created for setup finalization', { correlationId });

		// 5. Create or update the admin user
		const adminUser = await createAdminUser(admin, tempAuth, correlationId);
		logger.info('Admin user created/updated', { correlationId, userId: adminUser._id, userIdType: typeof adminUser._id });

		// 6. Update the private config file with database credentials
		await updatePrivateConfig(database, correlationId);

		// 7. Invalidate settings cache to force reload with new database connection
		invalidateSettingsCache();
		logger.info('Global settings cache invalidated', { correlationId });

		// 8. Invalidate setup status cache to allow normal routing
		const { invalidateSetupCache } = await import('@utils/setupCheck');
		invalidateSetupCache();
		logger.info('Setup status cache invalidated', { correlationId });

		// 8.1 Clear private config module cache so new DB credentials are loaded
		try {
			const { clearPrivateConfigCache } = await import('@src/databases/db');
			clearPrivateConfigCache();
			logger.info('Private config cache cleared after setup completion', { correlationId });
		} catch (cacheErr) {
			logger.warn('Failed to clear private config cache after setup completion', {
				correlationId,
				error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
			});
		}

		// 8.2 Reinitialize the system with new database configuration
		try {
			const { reinitializeSystem } = await import('@src/databases/db');
			const reinitResult = await reinitializeSystem(true);
			if (reinitResult.status === 'initialized') {
				logger.info('System reinitialized successfully after setup completion', { correlationId });
			} else {
				logger.warn('System reinitialization failed or was already in progress', {
					correlationId,
					status: reinitResult.status,
					error: reinitResult.error
				});
			}
		} catch (reinitErr) {
			logger.error('Failed to reinitialize system after setup completion', {
				correlationId,
				error: reinitErr instanceof Error ? reinitErr.message : String(reinitErr)
			});
			// Don't fail the setup if reinitialization fails - the system might still work
		}

		// 9. Create a session for the new admin user
		const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
		logger.info('Creating session for admin user', { correlationId, userId: adminUser._id, userIdType: typeof adminUser._id });

		// Use main auth service if available, otherwise fall back to tempAuth
		let session;
		let sessionCookie;
		if (auth && typeof auth.createSession === 'function') {
			session = await auth.createSession({ user_id: adminUser._id, expires });
			sessionCookie = auth.createSessionCookie(session._id);
			logger.info('Session created with main auth service', { correlationId });
		} else {
			session = await tempAuth.createSession({ user_id: adminUser._id, expires });
			sessionCookie = tempAuth.createSessionCookie(session._id);
			logger.info('Session created with temp auth service', { correlationId });
		}

		logger.info('Admin user created and session established, redirecting to dashboard', { correlationId });

		// 9. Determine redirect path based on available collections (same logic as login)
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';
		logger.info('Setup redirect logic', { correlationId, langFromStore, supportedLocales, userLanguage });
		let redirectPath = await fetchAndRedirectToFirstCollection(userLanguage);

		// If no collections found, fall back to collection builder
		if (!redirectPath) {
			redirectPath = '/config/collectionbuilder';
			logger.info('No collections available, redirecting to collection builder', { correlationId, redirectPath });
		} else {
			logger.info('Setup completion redirect path determined', { correlationId, redirectPath });
		}
		const response = json({
			success: true,
			message: 'Setup finalized successfully!',
			redirectPath,
			loggedIn: true
		});

		// 10. Set the session cookie using SvelteKit cookies API
		// Extract maxAge safely with a typed fallback
		const cookieAttrs = sessionCookie.attributes as { maxAge?: number } | undefined;
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:' || !dev,
			maxAge: cookieAttrs?.maxAge ?? 60 * 60 * 24,
			sameSite: 'lax'
		});

		return response;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
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

async function createAdminUser(admin: AdminConfig, auth: Auth, correlationId: string): Promise<User> {
	// Note: Don't hash the password here - let auth.createUser() and auth.updateUserAttributes() handle it

	try {
		const existingUser = await auth.getUserByEmail({ email: admin.email });
		logger.debug('User lookup result', {
			correlationId,
			email: admin.email,
			userExists: !!existingUser,
			userType: typeof existingUser,
			hasId: existingUser?._id ? true : false,
			userKeys: existingUser ? Object.keys(existingUser) : [],
			userId: existingUser?._id,
			userIdType: typeof existingUser?._id
		});

		// Check if user exists - be more lenient about the _id check
		if (existingUser && existingUser._id) {
			const userId = existingUser._id;
			logger.info('Updating existing admin user', { correlationId, email: admin.email, userId: userId });

			await auth.updateUserAttributes(userId, {
				username: admin.username,
				password: admin.password, // Pass raw password, updateUserAttributes will hash it
				role: 'admin',
				isRegistered: true
			});

			logger.info('Admin user updated successfully', { correlationId, email: admin.email });
			const updatedUser = await auth.getUserByEmail({ email: admin.email });
			if (!updatedUser) throw new Error('Failed to retrieve updated admin user');
			return updatedUser;
		} else if (existingUser) {
			// User object exists but has no valid ID - this is problematic
			logger.warn('User found but has no valid ID, treating as duplicate scenario', {
				correlationId,
				email: admin.email,
				userObject: existingUser,
				userKeys: Object.keys(existingUser)
			});

			// Force the duplicate key error handling by throwing an error
			throw new Error('E11000 duplicate key error - user exists but has invalid ID structure');
		} else {
			logger.info('Creating new admin user', { correlationId, email: admin.email });

			const newUser = await auth.createUser({
				username: admin.username,
				email: admin.email,
				password: admin.password, // Pass raw password, createUser will hash it
				role: 'admin',
				isRegistered: true
			});

			logger.info('Admin user created successfully', {
				correlationId,
				email: admin.email,
				userId: newUser._id,
				userIdType: typeof newUser._id,
				userKeys: Object.keys(newUser)
			});
			return newUser;
		}
	} catch (error) {
		// Check for duplicate key error in various nested error structures
		const errorString = JSON.stringify(error);
		const isDuplicateKeyError =
			(error instanceof Error && error.message.includes('E11000 duplicate key error')) ||
			errorString.includes('E11000 duplicate key error') ||
			errorString.includes('duplicate key') ||
			(error instanceof Error && error.message.includes('Failed to create user'));

		if (isDuplicateKeyError) {
			logger.warn('Duplicate user detected, user already exists - setup can continue', {
				correlationId,
				email: admin.email,
				errorType: 'duplicate_key'
			});

			// Attempt to retrieve the existing user to get a valid _id for session creation
			try {
				const existing = await auth.getUserByEmail({ email: admin.email });
				const existingId: string | undefined =
					existing?._id ?? (existing && 'id' in existing ? (existing as unknown as { id?: string }).id : undefined);
				if (existing && existingId) {
					logger.info('Existing user retrieved after duplicate detection', {
						correlationId,
						email: admin.email,
						userId: existingId
					});
					return existing;
				}
			} catch (lookupErr) {
				logger.warn('Failed to retrieve existing user after duplicate detection', {
					correlationId,
					email: admin.email,
					error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr)
				});
			}

			// Fallback: return a minimal user object if lookup failed (session creation may fail)
			logger.info('User already exists but could not retrieve details; continuing with minimal user object', { correlationId, email: admin.email });
			return {
				_id: 'existing-user',
				email: admin.email,
				username: admin.username,
				role: 'admin',
				isRegistered: true
			} as User;
		}

		logger.error('Error in createAdminUser', {
			correlationId,
			email: admin.email,
			error: error instanceof Error ? error.message : String(error),
			errorDetails: errorString
		});
		throw new Error(`Failed to create/update admin user: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function updatePrivateConfig(dbConfig: DatabaseConfig, correlationId: string) {
	const fs = await import('fs/promises');
	const path = await import('path');
	const privateConfigPath = path.resolve(process.cwd(), 'config', 'private.ts');

	// Generate a random JWT secret key
	const jwtSecret = generateRandomKey();

	// Generate a random encryption key if not present
	const encryptionKey = generateRandomKey();

	// Generate the updated private.ts content
	const privateConfigContent = `
**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file will be populated during the initial setup process.
 */
import { createPrivateConfig } from './types';

export const privateEnv = createPrivateConfig({
	// --- Core Database Connection ---
	DB_TYPE: '${dbConfig.type}',
	DB_HOST: '${dbConfig.host}',
	DB_PORT: ${dbConfig.port},
	DB_NAME: '${dbConfig.name}',
	DB_USER: '${dbConfig.user}',
	DB_PASSWORD: '${dbConfig.password}',

	// --- Connection Behavior ---
	DB_RETRY_ATTEMPTS: 5,
	DB_RETRY_DELAY: 3000, // 3 seconds

	// --- Core Security Keys ---
	JWT_SECRET_KEY: '${jwtSecret}',
	ENCRYPTION_KEY: '${encryptionKey}',

	// --- Fundamental Architectural Mode ---
	MULTI_TENANT: false,

	/* * NOTE: All other settings (SMTP, Google OAuth, feature flags, etc.)
	 * are loaded dynamically from the database after the application starts.
	 */
});
`;

	try {
		await fs.writeFile(privateConfigPath, privateConfigContent);
		logger.info('✅ Private config file updated successfully', { correlationId, path: privateConfigPath });
	} catch (error) {
		logger.error('Failed to update private config file', {
			correlationId,
			path: privateConfigPath,
			error: error instanceof Error ? error.message : String(error)
		});
		// Do not re-throw; failing to write the config is not a fatal error for the setup flow,
		// but it will require manual configuration.
	}
}

function generateRandomKey(): string {
	return randomBytes(32).toString('hex');
}
