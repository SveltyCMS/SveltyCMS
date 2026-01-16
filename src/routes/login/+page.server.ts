/**
 * @file src/routes/login/+page.server.ts
 * @description Server-side logic for the login page.
 *
 * @example
 * <PermissionSettings />
 *
 * ### Props
 * - `user`: The authenticated user data.
 *
 * ### Features
 * - User authentication and authorization
 * - Proper typing for user data
 */

import { dev } from '$app/environment';
import { fail, redirect, type Actions, type Cookies } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Cache invalidation
import { invalidateUserCountCache } from '@src/hooks/handleAuthorization';

// valibot schemas
import { forgotFormSchema, loginFormSchema, resetFormSchema, signUpFormSchema } from '@utils/formSchemas';
import { flatten, safeParse } from 'valibot';

// Auth
import { generateGoogleAuthUrl, googleAuth } from '@src/databases/auth/googleAuth';
import type { User } from '@src/databases/auth/types';
import { auth, dbInitPromise } from '@src/databases/db';
import { google } from 'googleapis';

// Utils
import type { ISODateString } from '@src/content/types';

// Stores
import type { Locale } from '@src/paraglide/runtime';
import { getPrivateSettingSync, getPublicSettingSync } from '@src/services/settingsService';
// publicEnv from store is client-side only and empty on server during init
// import { publicEnv } from '@src/stores/globalSettings.svelte';
import { systemLanguage } from '@stores/store.svelte';
import { get } from 'svelte/store';

// System Logger
import { logger } from '@utils/logger.server';

// Content Manager for redirects
import { contentManager } from '@root/src/content/ContentManager';

const limiter = new RateLimiter({
	IP: [200, 'h'], // 200 requests per hour per IP
	IPUA: [100, 'm'], // 100 requests per minute per IP+User-Agent
	cookie: {
		name: 'ratelimit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY'),
		rate: [50, 'm'], // 50 requests per minute per cookie
		preflight: true
	}
});

// Password strength configuration
const MIN_PPASSWORD_LENGTH = getPublicSettingSync('PASSWORD_LENGTH') || 8;
const YELLOW_LENGTH = MIN_PPASSWORD_LENGTH + 3;
const GREEN_LENGTH = YELLOW_LENGTH + 4;

// Function to calculate password strength (matches the logic in PasswordStrength.svelte)
function calculatePasswordStrength(password: string): number {
	if (password.length >= GREEN_LENGTH) return 3;
	if (password.length >= YELLOW_LENGTH) return 2;
	if (password.length >= MIN_PPASSWORD_LENGTH) return 1;
	return 0;
}

// Helper function to check database health by querying system state
async function checkDatabaseHealth(): Promise<{ healthy: boolean; reason?: string }> {
	try {
		// First check system state - leverage existing state management
		const { getSystemState, isServiceHealthy } = await import('@src/stores/system');
		const systemState = getSystemState();

		// If database service is explicitly unhealthy in state management, return early
		if (!isServiceHealthy('database')) {
			const dbStatus = systemState.services.database;
			return {
				healthy: false,
				reason: dbStatus.message || dbStatus.error || 'Database service is unhealthy'
			};
		}

		// If system is in FAILED state, check if it's database-related
		if (systemState.overallState === 'FAILED') {
			const lastFailure = systemState.performanceMetrics.stateTransitions
				.slice()
				.reverse()
				.find((t) => t.to === 'FAILED');
			if (lastFailure?.reason) {
				return { healthy: false, reason: lastFailure.reason };
			}
		}

		// State looks good, verify database actually has data (setup completion check)
		await dbInitPromise;

		const { auth } = await import('@src/databases/db');
		if (!auth) {
			return { healthy: false, reason: 'Authentication service not initialized' };
		}

		// Lightweight check: verify database has roles (indicates setup was completed)
		try {
			const roles = await auth.getAllRoles();
			if (!roles || roles.length === 0) {
				return {
					healthy: false,
					reason: 'Database is empty - no roles found. Setup may not have completed successfully.'
				};
			}
		} catch (error) {
			return {
				healthy: false,
				reason: `Failed to query roles: ${error instanceof Error ? error.message : String(error)}`
			};
		}

		return { healthy: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return { healthy: false, reason: `Database connection error: ${errorMessage}` };
	}
}

// Helper function to wait for auth service to be ready
async function waitForAuthService(maxWaitMs: number = 10000): Promise<boolean> {
	const startTime = Date.now();
	logger.debug(`Waiting for auth service to be ready (timeout: ${maxWaitMs}ms)...`);

	while (Date.now() - startTime < maxWaitMs) {
		try {
			// Check if database initialization is complete
			if (dbInitPromise) {
				// Check if the promise is still pending
				const dbStatus = await Promise.race([dbInitPromise.then(() => 'ready'), new Promise((resolve) => setTimeout(() => resolve('timeout'), 100))]);

				if (dbStatus === 'timeout') {
					// Database initialization is still in progress
					logger.debug('Database initialization still in progress...');
				}
			}

			// Check if auth service is ready
			if (auth && typeof auth.validateSession === 'function') {
				logger.debug(`Auth service ready after ${Date.now() - startTime}ms`);
				return true;
			}

			// Log progress every 5 seconds
			const elapsed = Date.now() - startTime;
			if (elapsed % 5000 < 100) {
				logger.debug(
					`Auth service not ready yet, elapsed: ${elapsed}ms, auth: ${!!auth}, validateSession: ${auth && typeof auth.validateSession === 'function'}`
				);
			}

			await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms before checking again
		} catch (error) {
			logger.error(`Error while waiting for auth service: ${error instanceof Error ? error.message : String(error)}`);
			// Continue waiting even if there's an error
		}
	}

	logger.error(`Auth service not ready after ${maxWaitMs}ms timeout`);
	return false;
}

import { getCachedFirstCollectionPath } from '@utils/server/collection-utils.server';

// Helper function to check if OAuth should be available
async function shouldShowOAuth(hasInviteToken: boolean): Promise<boolean> {
	// If Google OAuth is not enabled, never show it
	if (!getPublicSettingSync('USE_GOOGLE_OAUTH')) {
		return false;
	}

	// If there's an invite token, show OAuth (invited user can choose OAuth)
	if (hasInviteToken) {
		return true;
	}

	// Optimization: If OAuth is enabled, we generally want to show it.
	// The previous check for existing users was redundant because it returned true regardless.
	// We just verify auth service is available.
	try {
		await dbInitPromise;
		if (!auth) {
			logger.warn('Auth service not available for OAuth user check');
			return false;
		}

		return true;
	} catch (error) {
		logger.error('Error checking for OAuth availability:', error);
		return true; // Fail open to allow login attempts
	}
}

// Define wrapped schemas for caching
// Schemas are imported directly

export const load: PageServerLoad = async ({ url, cookies, fetch, request, locals }) => {
	const demoMode = getPrivateSettingSync('DEMO');
	// --- START: Language Validation Logic ---
	const langFromStore = get(systemLanguage) as Locale | null;
	const locales = (await getPublicSettingSync('LOCALES')) || [(await getPublicSettingSync('BASE_LOCALE')) || 'en'];
	const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
	// Use PUBLIC_ENV.LOCALES for validation, fallback to BASE_LOCALE
	const supportedLocales = locales as Locale[];
	const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale);
	// --- END: Language Validation Logic ---

	try {
		// Check system state first - leverage existing state management for performance
		const { getSystemState } = await import('@src/stores/system');
		const systemState = getSystemState();

		// If system is FAILED, provide detailed error immediately without waiting
		if (systemState.overallState === 'FAILED') {
			logger.error('System is in FAILED state, cannot proceed with login');
			const lastFailure = systemState.performanceMetrics.stateTransitions
				.slice()
				.reverse()
				.find((t) => t.to === 'FAILED');

			return {
				firstUserExists: true,
				showOAuth: false,
				hasExistingOAuthUsers: false,
				loginForm: {},
				forgotForm: {},
				resetForm: {},
				signUpForm: {},
				showDatabaseError: true,
				errorReason: lastFailure?.reason || 'System initialization failed. Please check the database connection and configuration.',
				canReset: true,
				authNotReady: true,
				authNotReadyMessage: lastFailure?.reason || 'System initialization failed. Please check the database connection and configuration.',
				demoMode
			};
		}

		// Ensure initialization is complete
		await dbInitPromise;

		// Fast health check using state management + database verification
		const dbHealth = await checkDatabaseHealth();
		if (!dbHealth.healthy) {
			logger.error(`Database health check failed: ${dbHealth.reason}`);
			return {
				firstUserExists: true,
				showOAuth: false,
				hasExistingOAuthUsers: false,
				loginForm: {},
				forgotForm: {},
				resetForm: {},
				signUpForm: {},
				showDatabaseError: true,
				errorReason: dbHealth.reason,
				canReset: true,
				authNotReady: true,
				authNotReadyMessage: dbHealth.reason
			};
		}

		// Database is healthy, now check auth service (reduced timeout from 30s to 10s)
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.warn('Authentication system is not ready yet, checking if database is empty');

			// Check if this is a "database empty" scenario
			const { isSetupCompleteAsync } = await import('@utils/setupCheck');
			const setupComplete = await isSetupCompleteAsync();

			if (!setupComplete) {
				logger.error('Database is empty but config exists. This typically means the database was manually dropped.');
				return {
					firstUserExists: true,
					showOAuth: false,
					hasExistingOAuthUsers: false,
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					authNotReady: true,
					authNotReadyMessage: 'Database is empty. Please restore your database from backup or delete config/private.ts to run setup again.',
					demoMode
				};
			}

			// Return fallback data instead of throwing error
			return {
				firstUserExists: true,
				showOAuth: false, // Don't show OAuth if auth system isn't ready
				hasExistingOAuthUsers: false,
				loginForm: {},
				forgotForm: {},
				resetForm: {},
				signUpForm: {},
				authNotReady: true,
				authNotReadyMessage: 'System is still initializing. Please wait a moment and try again.',
				demoMode
			};
		}

		if (!locals) locals = {} as App.Locals;

		// Check if user is already authenticated
		if (locals.user) {
			logger.debug('User is already authenticated in load, attempting to redirect to collection');

			// Check if collections exist in the database
			const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);

			let redirectPath: string;
			if (finalCollectionPath) {
				// Collections exist - redirect to first collection
				redirectPath = finalCollectionPath;
				logger.debug(`Authenticated user redirect to collection: ${redirectPath}`);
			} else {
				// No collections available - redirect based on permissions
				logger.debug('No collections available for authenticated user, redirecting based on permissions');
				const { hasPermissionWithRoles } = await import('@src/databases/auth/permissions');
				const isAdmin = hasPermissionWithRoles(locals.user, 'config:collectionbuilder', []);
				redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
			}

			throw redirect(302, redirectPath);
		}

		// Rate limiter preflight check
		if (limiter.cookieLimiter?.preflight) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await limiter.cookieLimiter.preflight({ request, cookies } as any);
		}

		// THE NEW "INTELLIGENT LOADER" LOGIC
		const inviteToken = url.searchParams.get('invite_token');

		if (inviteToken) {
			// This is an invite flow!
			const tokenData = await auth.validateRegistrationToken(inviteToken);

			if (tokenData.isValid && tokenData.details) {
				// Token is valid! Prepare the page for invite-based signup.
				logger.info('Valid invite token detected. Preparing invite signup form.');

				// Check firstUserExists for consistency
				const firstUserExists = locals.isFirstUser === false;

				// Check if OAuth should be shown (with invite token)
				const showOAuth = await shouldShowOAuth(true);

				return {
					firstUserExists,
					isInviteFlow: true,
					showOAuth,
					hasExistingOAuthUsers: false, // Not relevant for invite flow
					token: inviteToken,
					invitedEmail: tokenData.details.email,
					roleId: tokenData.details.role, // Pass the roleId from the token
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					demoMode
				};
			} else {
				// Token is invalid, expired, or already used.
				// Instead of completely blocking, let the user access the form
				// and pre-fill the token so they can see what's wrong or enter a different one
				logger.warn('Invalid invite token detected, but allowing form access with pre-filled token.');

				// Check firstUserExists for consistency
				const firstUserExists = locals.isFirstUser === false;

				// Check if OAuth should be shown (invalid invite, but has token)
				const showOAuth = await shouldShowOAuth(true);

				// Pre-fill the form with the invalid token and show a warning
				const signUpForm = { token: inviteToken }; // Pre-fill with the invalid token

				return {
					firstUserExists,
					isInviteFlow: false, // Not a proper invite flow since token is invalid
					showOAuth,
					hasExistingOAuthUsers: false,
					inviteError:
						'This invitation token appears to be invalid, expired, or already used. Please check with your administrator or enter a different token.',
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm,
					demoMode
				};
			}
		}

		// Use the firstUserExists value from locals (set by hooks)
		const firstUserExists = locals.isFirstUser === false;
		logger.debug(`In load: firstUserExists determined as: ${firstUserExists} (based on locals.isFirstUser: ${locals.isFirstUser})`);

		// Note: If no users exist, handleSetup hook will redirect to /setup before this code runs

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code from URL: ${code ?? 'none'}`);

		// Handle Google OAuth flow if code is present
		if (getPublicSettingSync('USE_GOOGLE_OAUTH') && code) {
			logger.debug('Entering Google OAuth flow in load function');
			try {
				const googleAuthInstance = await googleAuth();
				if (!googleAuthInstance) throw Error('Google OAuth client is not initialized');

				logger.debug('Fetching tokens using authorization code...');
				const { tokens } = await googleAuthInstance.getToken(code);
				if (!tokens) throw new Error('Failed to retrieve Google OAuth tokens.');

				googleAuthInstance.setCredentials(tokens);
				const oauth2 = google.oauth2('v2');
				// Assign auth client to oauth2 context options with proper type
				(oauth2.context._options as { auth?: typeof googleAuthInstance }).auth = googleAuthInstance;
				const { data: googleUser } = await oauth2.userinfo.get();
				logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

				// Invite token comes back via OAuth state param
				const stateParam = url.searchParams.get('state');
				const inviteToken = stateParam ? decodeURIComponent(stateParam) : null;
				if (!auth) {
					throw new Error('Auth service is not initialized');
				}

				const getUser = async (): Promise<[User | null, boolean]> => {
					const email = googleUser.email;
					if (!email) throw Error('Google did not return an email address.');

					const existingUser = await auth!.checkUser({ email });
					if (existingUser) return [existingUser, false];

					// For non-first users (or any users), allow only invite-based registration
					if (!inviteToken) {
						logger.warn('OAuth registration attempt without invite token in state');
						return [null, false];
					}

					const tokenData = await auth!.validateRegistrationToken(inviteToken);
					if (!tokenData.isValid || !tokenData.details) {
						logger.warn('Invalid/expired invite token used in OAuth registration');
						return [null, false];
					}

					// Ensure email matches invitation
					if (tokenData.details.email.toLowerCase() !== email.toLowerCase()) {
						logger.warn('Invite token email mismatch in OAuth registration', {
							tokenEmail: tokenData.details.email,
							googleEmail: email
						});
						return [null, false];
					}

					const roleId = tokenData.details.role || 'user';

					const newUser = await auth!.createUser({
						email,
						username: googleUser.name || email.split('@')[0],
						role: roleId,
						permissions: [],
						isRegistered: true,
						lastAuthMethod: 'google'
					});

					// Consume the invitation token after successful registration
					await auth!.consumeRegistrationToken(inviteToken);

					logger.info(`OAuth: Invited user created: ${newUser?.username}`);
					const emailProps = {
						username: googleUser.name || newUser?.username || '',
						email: email,
						hostLink: getPublicSettingSync('HOST_PROD') || `https://${request.headers.get('host')}`,
						sitename: getPublicSettingSync('SITE_NAME') || 'SveltyCMS'
					};
					try {
						const mailResponse = await fetch('/api/sendMail', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								recipientEmail: email,
								subject: `Welcome to ${emailProps.sitename}`,
								templateName: 'welcomeUser',
								props: emailProps,
								languageTag: userLanguage
							})
						});
						if (!mailResponse.ok) {
							logger.error(`OAuth: Failed to send welcome email to invited user via API. Status: ${mailResponse.status}`, {
								email,
								responseText: await mailResponse.text()
							});
						} else {
							logger.info(`OAuth: Welcome email request sent to invited user via API`, { email });
						}
					} catch (emailError) {
						logger.error(`OAuth: Error fetching /api/sendMail for invited user`, { email, error: emailError });
					}
					return [newUser, false];
				};

				const [user] = await getUser();

				if (user && user._id) {
					await createSessionAndSetCookie(user._id, cookies);
					await auth!.updateUserAttributes(user._id, { lastAuthMethod: 'google' });

					// Determine redirect path based on collections
					const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);

					let redirectPath: string;
					if (finalCollectionPath) {
						// Collections exist - redirect to first collection
						redirectPath = finalCollectionPath;
						logger.debug(`OAuth login redirect to collection: ${redirectPath}`);
					} else {
						// No collections available - redirect based on permissions
						logger.debug('No collections available for OAuth login, redirecting based on permissions');
						const { hasPermissionWithRoles } = await import('@src/databases/auth/permissions');
						const isAdmin = hasPermissionWithRoles(user, 'config:collectionbuilder', []);
						redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
					}

					throw redirect(303, redirectPath);
				}

				logger.warn(`OAuth: User processing ended without session creation for ${googleUser.email}.`);
				// Check if OAuth should be shown for error case
				const showOAuth = await shouldShowOAuth(false);
				return {
					isInviteFlow: false,
					firstUserExists,
					showOAuth,
					hasExistingOAuthUsers: false, // Not relevant for error case
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					oauthError: 'OAuth processing failed. Please try signing in with email or contact support.',
					demoMode
				};
			} catch (oauthError) {
				// Check if this is a SvelteKit redirect (which is expected)
				if (oauthError instanceof Response && oauthError.status >= 300 && oauthError.status < 400) {
					throw oauthError; // Re-throw redirects
				}

				const err = oauthError as Error;
				logger.error(`Error during Google OAuth login process: ${err.message}`, { stack: err.stack });
				// Check if OAuth should be shown for error case
				const showOAuth = await shouldShowOAuth(false);
				return {
					isInviteFlow: false,
					firstUserExists,
					showOAuth,
					hasExistingOAuthUsers: false, // Not relevant for error case
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					oauthError: `OAuth failed: ${err.message}. Please try again or use email login.`,
					demoMode
				};
			}
		}

		// This is a normal login flow (no invite token) - return standard forms
		const loginForm = {};
		const forgotForm = {};
		const resetForm = {};
		const signUpForm = {};

		// Check if OAuth should be shown
		const showOAuth = await shouldShowOAuth(false);

		// Check if there are existing OAuth users (for better UX messaging)
		let hasExistingOAuthUsers = false;
		try {
			if (auth) {
				// Optimization: Use count instead of fetching all users
				const count = await auth.getUserCount();
				hasExistingOAuthUsers = count > 0;
			}
		} catch (error) {
			logger.error('Error checking for existing OAuth users:', error);
		}

		// Calculate first collection path for client-side optimization (prefetching)
		const firstCollectionPath = await getCachedFirstCollectionPath(userLanguage);

		return {
			isInviteFlow: false,
			firstUserExists,
			showOAuth,
			hasExistingOAuthUsers,
			loginForm,
			forgotForm,
			resetForm,
			signUpForm,
			pkgVersion: getPublicSettingSync('PKG_VERSION') || '0.0.0',
			demoMode,
			firstCollectionPath
		};
	} catch (initialError) {
		const err = initialError as Error;
		if (err instanceof Response && err.status === 302) throw err;

		logger.error(`Critical error in load function: ${err.message}`, { stack: err.stack });
		return {
			isInviteFlow: false,
			firstUserExists: true,
			showOAuth: false, // Don't show OAuth in error case
			hasExistingOAuthUsers: false,
			firstCollection: null, // No collection info in error case
			loginForm: {},
			forgotForm: {},
			resetForm: {},
			signUpForm: {},
			error: 'The login system encountered an unexpected error. Please try again later.',
			pkgVersion: getPublicSettingSync('PKG_VERSION') || '0.0.0',
			demoMode
		};
	}
};

// Actions for SignIn and SignUp a user with form data
export const actions: Actions = {
	signUp: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
		const locales = (await getPublicSettingSync('LOCALES')) || [baseLocale];
		const supportedLocales = (locales || [baseLocale || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale) || 'en';
		logger.debug(`Validated user language for sign-up: ${userLanguage}`);
		// --- END: Language Validation Logic ---

		// Note: First-user registration is handled by /setup (enforced by handleSetup hook)
		// This action only handles invited user registration

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Ensure database initialization is complete
		try {
			await dbInitPromise;
			logger.debug('Database initialization completed for signUp');
		} catch (error) {
			logger.error('Database initialization failed for signUp:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}

		// Wait for auth service to be ready
		const authReady = await waitForAuthService(10000);
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for signUp action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for signUp action');

		const formData = await event.request.formData();
		const form = Object.fromEntries(formData);
		const result = safeParse(signUpFormSchema, form);

		if (!result.success) {
			logger.warn('SignUp form invalid:', { errors: result.issues });
			return fail(400, { form, errors: flatten(result.issues).nested });
		}

		const { email, username, password, token } = result.output;

		// Security: This action ONLY works for invited users with valid tokens.
		// First-user registration must go through /setup (enforced by hooks and load function).
		if (!token) {
			if (!token) {
				return fail(403, { message: 'A valid invitation is required to create an account.', form });
			}
		}

		const tokenData = await auth.validateRegistrationToken(token);
		if (!tokenData.isValid || !tokenData.details) {
			if (!tokenData.isValid || !tokenData.details) {
				return fail(403, { message: 'This invitation is invalid, expired, or has already been used.', form });
			}
		}

		// Debug: Log the token details to see what we're getting
		logger.debug('Token validation result:', {
			tokenData: tokenData.details,
			role: tokenData.details.role,
			email: tokenData.details.email
		});

		// Security: Check that the email in the form matches the one in the token record
		if (email.toLowerCase() !== tokenData.details.email.toLowerCase()) {
			if (email.toLowerCase() !== tokenData.details.email.toLowerCase()) {
				return fail(403, { message: 'The provided email does not match the invitation.', form });
			}
		}

		try {
			// Use optimized createUserAndSession for single database transaction
			const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
			const userAndSessionResult = await auth.createUserAndSession(
				{
					email,
					username,
					password,
					role: tokenData.details.role || 'user', // Use the role from the token with fallback to 'user'
					isRegistered: true,
					lastAuthMethod: 'password',
					lastActiveAt: new Date().toISOString() as ISODateString
				},
				{
					expires: sessionExpires.toISOString() as ISODateString
				}
			);

			if (!userAndSessionResult.success || !userAndSessionResult.data) {
				const errorMessage =
					!userAndSessionResult.success && 'error' in userAndSessionResult
						? userAndSessionResult.error?.message
						: 'Failed to create user and session';
				throw new Error(errorMessage);
			}
			const { user: newUser, session: newSession } = userAndSessionResult.data;

			logger.info('User and session created successfully via token registration', {
				userId: newUser._id,
				sessionId: newSession._id,
				email
			});

			// Invalidate user count cache so the system knows a new user now exists
			invalidateUserCountCache();

			// Consume the invitation token immediately after use
			await auth!.consumeRegistrationToken(token);

			// Send welcome email (best-effort; do not fail signup on email issues)
			try {
				const emailProps = {
					username: username || email,
					email,
					hostLink: getPublicSettingSync('HOST_PROD') || `https://${event.request.headers.get('host')}`,
					sitename: getPublicSettingSync('SITE_NAME') || 'SveltyCMS'
				};
				const mailResponse = await event.fetch('/api/sendMail', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						recipientEmail: email,
						subject: `Welcome to ${emailProps.sitename}`,
						templateName: 'welcomeUser',
						props: emailProps,
						languageTag: userLanguage
					})
				});
				if (!mailResponse.ok) {
					logger.error(`Failed to send welcome email via API. Status: ${mailResponse.status}`, {
						email,
						responseText: await mailResponse.text()
					});
				} else {
					logger.info(`Welcome email request sent via API`, { email });
				}
			} catch (emailError) {
				logger.error(`Error invoking /api/sendMail for invited user`, { email, error: emailError });
			}

			// Set session cookie using the already-created session
			const SESSION_COOKIE_NAME = 'sid';
			event.cookies.set(SESSION_COOKIE_NAME, newSession._id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: dev ? false : true,
				maxAge: 60 * 60 * 24 * 7 // 7 days to match session expiry
			}); // Redirect to first collection
			// Check if collections exist in the database
			const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);

			let redirectPath: string;
			if (finalCollectionPath) {
				// Collections exist - redirect to first collection
				redirectPath = finalCollectionPath;
				logger.debug(`SignUp redirect to collection: ${redirectPath}`);
			} else {
				// No collections available - redirect based on permissions
				logger.debug('No collections available for signUp, redirecting based on permissions');
				const { hasPermissionByAction } = await import('@src/databases/auth/permissions');
				const isAdmin = hasPermissionByAction(newUser, 'manage', 'system', 'config:collectionbuilder');
				redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
			}
			throw redirect(303, redirectPath);
		} catch (error) {
			const err = error as Error;
			logger.error('Error during invited user signup', { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'Failed to create account. Please try again later.', form });
		}
	},

	signInOAuth: async (event) => {
		// Rate-limit and kickoff OAuth with optional invite_token in state
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		const inviteToken = event.url.searchParams.get('invite_token');
		const authUrl = await generateGoogleAuthUrl(inviteToken, undefined);
		throw redirect(303, authUrl);
	},

	signIn: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
		const locales = (await getPublicSettingSync('LOCALES')) || [baseLocale];
		const supportedLocales = (locales || [baseLocale || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale) || 'en';
		logger.debug(`Validated user language for sign-in: ${userLanguage}`);
		// --- END: Language Validation Logic ---

		const startTime = performance.now();

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Wait for database initialization first
		try {
			await dbInitPromise;
			logger.debug('Database initialization completed for signIn');
		} catch (error) {
			logger.error('Database initialization failed for signIn:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}

		// Wait for auth service to be ready (with timeout)
		const authReady = await waitForAuthService(10000); // 10 second timeout for sign-in
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for signIn action after waiting');
			return fail(503, {
				message: 'Authentication system is not ready. Please wait a moment and try again.'
			});
		}

		logger.debug('Auth service is ready for signIn action');

		// Validate form
		const formData = await event.request.formData();
		const emailRaw = formData.get('email')?.toString() ?? '';
		const passwordRaw = formData.get('password')?.toString() ?? '';
		const isTokenRaw = formData.get('isToken');
		const isToken = isTokenRaw === 'true' || isTokenRaw === 'on';

		const form = { email: emailRaw, password: passwordRaw, isToken };
		const result = safeParse(loginFormSchema, form);

		if (!result.success) return fail(400, { form, errors: flatten(result.issues).nested });

		const { email, password } = result.output;
		// isToken is already boolean from our manual parsing, but let's use result.output if schema didn't transform it weirdly
		// actually result.output.isToken should be boolean because schema says boolean() and we passed a boolean

		let resp;
		let redirectPath;

		try {
			// Run authentication (collection path will be determined after auth success)
			const authResult = await signInUser(email, password, isToken, event.cookies);

			resp = authResult;

			if (resp && resp.requires2FA) {
				// User needs 2FA verification - return fail() instead of message()
				logger.debug('2FA verification required for user', { userId: resp.userId });
				return fail(401, {
					requires2FA: true,
					userId: resp.userId,
					message: 'Please enter your 2FA code to continue.'
				});
			} else if (resp && resp.status) {
				// message(signInForm, 'Sign-in successful!'); // No need to send message on success redirect

				// Check if collections exist in the database (runtime-created collections)
				const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);

				if (finalCollectionPath) {
					// Collections exist - redirect to first collection
					redirectPath = finalCollectionPath;
					logger.debug(`Login redirect to collection: ${redirectPath}`);
				} else {
					// No collections available - redirect based on permissions
					logger.debug('No collections available, redirecting based on permissions');
					const { hasPermissionByAction } = await import('@src/databases/auth/permissions');
					if (resp.user) {
						const isAdmin = hasPermissionByAction(resp.user, 'manage', 'system', 'config:collectionbuilder');
						redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
					} else {
						redirectPath = '/user';
					}
				}
				const endTime = performance.now();
				logger.debug(`SignIn completed in ${(endTime - startTime).toFixed(2)}ms`);
			} else {
				const errorMessage = resp?.message || 'Invalid credentials or an error occurred.';
				logger.warn(`Sign-in failed`, { email, errorMessage });
				const errorMsg = resp?.message || 'Invalid credentials or an error occurred.';
				logger.warn(`Sign-in failed`, { email, errorMsg });
				return fail(401, { message: errorMessage, form });
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Unexpected error in signIn action`, { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'An unexpected server error occurred.', form });
		}

		// Handle redirect outside try-catch
		if (redirectPath) {
			throw redirect(303, redirectPath);
		}
	},

	verify2FA: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
		const locales = (await getPublicSettingSync('LOCALES')) || [baseLocale];
		const supportedLocales = (locales || [baseLocale || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale) || 'en';
		// --- END: Language Validation Logic ---

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Ensure database initialization is complete
		try {
			await dbInitPromise;
			logger.debug('Database initialization completed for verify2FA');
		} catch (error) {
			logger.error('Database initialization failed for verify2FA:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}

		// Wait for auth service to be ready
		const authReady = await waitForAuthService(10000);
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for verify2FA action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for verify2FA action');

		try {
			const formData = await event.request.formData();
			const userId = formData.get('userId') as string;
			const code = formData.get('code') as string;

			if (!userId || !code) {
				return fail(400, { message: 'Missing required fields.' });
			}

			// Import 2FA service
			const { getDefaultTwoFactorAuthService } = await import('@src/databases/auth/twoFactorAuth');
			if (!auth) {
				return fail(500, { message: 'Auth service is not initialized' });
			}
			const twoFactorService = getDefaultTwoFactorAuthService(auth as any); // Verify 2FA code
			const result = await twoFactorService.verify2FA(userId, code);
			if (!result.success) {
				logger.warn('2FA verification failed during login', { userId, reason: result.message });
				return fail(400, { message: result.message });
			} // 2FA verification successful - get user and create session
			const user = await auth.getUserById(userId);
			if (!user) {
				logger.error('User not found after successful 2FA verification', { userId });
				return fail(500, { message: 'User not found.' });
			}

			// Create session
			await createSessionAndSetCookie(userId, event.cookies);

			// Update user attributes
			const updatePromise = auth.updateUserAttributes(userId, {
				lastAuthMethod: 'password+2fa',
				lastActiveAt: new Date().toISOString() as ISODateString
			});
			updatePromise.catch((err) => {
				logger.error(`Failed to update user attributes after 2FA login for ${userId}:`, err);
			});

			logger.info(`User logged in successfully with 2FA: ${user.username} (${userId})`);

			// Determine redirect path based on collections
			const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);

			let redirectPath: string;
			if (finalCollectionPath) {
				// Collections exist - redirect to first collection
				redirectPath = finalCollectionPath;
				logger.debug(`2FA login redirect to collection: ${redirectPath}`);
			} else {
				// No collections available - redirect based on permissions
				logger.debug('No collections available for 2FA login, redirecting based on permissions');
				const { hasPermissionByAction } = await import('@src/databases/auth/permissions');
				const isAdmin = hasPermissionByAction(user, 'manage', 'system', 'config:collectionbuilder');
				redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
			}
			throw redirect(303, redirectPath);
		} catch (e) {
			if (e instanceof Response) {
				throw e; // Re-throw redirect
			}
			const err = e as Error;
			logger.error(`Unexpected error in verify2FA action`, { message: err.message, stack: err.stack });
			return fail(500, { message: 'An unexpected server error occurred.' });
		}
	},

	forgotPW: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
		const locales = (await getPublicSettingSync('LOCALES')) || [baseLocale];
		const supportedLocales = (locales || [baseLocale || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale) || 'en';
		// --- END: Language Validation Logic ---

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		// Ensure database initialization is complete
		try {
			await dbInitPromise;
			logger.debug('Database initialization completed for forgotPW');
		} catch (error) {
			logger.error('Database initialization failed for forgotPW:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}

		// Wait for auth service to be ready
		const authReady = await waitForAuthService(10000);
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for forgotPW action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for forgotPW action');

		const formData = await event.request.formData();
		const form = Object.fromEntries(formData);
		const result = safeParse(forgotFormSchema, form);

		if (!result.success) return fail(400, { form, errors: flatten(result.issues).nested });

		const email = result.output.email.toLowerCase().trim();
		let checkMail: ForgotPWCheckResult;

		try {
			checkMail = await forgotPWCheck(email);

			if (checkMail.success && checkMail.token && checkMail.expiresIn) {
				const baseUrl = dev ? getPublicSettingSync('HOST_DEV') : getPublicSettingSync('HOST_PROD');
				const resetLink = `${baseUrl}/login?token=${checkMail.token}&email=${encodeURIComponent(email)}`;
				logger.debug(`Reset link generated: ${resetLink}`);

				const emailProps = {
					email: email,
					token: checkMail.token,
					expiresIn: checkMail.expiresIn,
					resetLink: resetLink,
					username: checkMail.username || email,
					sitename: getPublicSettingSync('SITE_NAME') || 'SveltyCMS'
				};

				// Use SvelteKit's fetch for server-side API calls
				const mailResponse = await event.fetch('/api/sendMail', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						recipientEmail: email,
						subject: `Password Reset Request for ${emailProps.sitename}`,
						templateName: 'forgottenPassword',
						props: emailProps,
						languageTag: userLanguage
					})
				});

				if (!mailResponse.ok) {
					logger.error(`Failed to send forgotten password email via API. Status: ${mailResponse.status}`, {
						email,
						responseText: await mailResponse.text()
					});
					// Still return success but with emailSent: false to handle on frontend
					return fail(400, { message: 'Password reset email sent successfully.', userExists: true, emailSent: false });
				} else {
					logger.info(`Forgotten password email request sent via API`, { email });
					return fail(400, { message: 'Password reset email sent successfully.', userExists: true, emailSent: true });
				}
			} else {
				logger.warn(`Forgotten password check failed`, { email, message: checkMail.message });
				// Return different response for user not found to allow frontend distinction
				return fail(400, { message: 'User does not exist.', userExists: false });
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Error in forgotPW action`, { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'An error occurred. Please try again.', form });
		}
	},

	resetPW: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
		const locales = (await getPublicSettingSync('LOCALES')) || [baseLocale];
		const supportedLocales = (locales || [baseLocale || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale) || 'en';
		// --- END: Language Validation Logic ---

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		// Ensure database initialization is complete
		try {
			await dbInitPromise;
			logger.debug('Database initialization completed for resetPW');
		} catch (error) {
			logger.error('Database initialization failed for resetPW:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}

		// Wait for auth service to be ready
		const authReady = await waitForAuthService(10000);
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for resetPW action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for resetPW action');

		const formData = await event.request.formData();
		const form = Object.fromEntries(formData);
		const result = safeParse(resetFormSchema, form);

		if (!result.success) return fail(400, { form, errors: flatten(result.issues).nested });

		const { password, token, email } = result.output;

		try {
			const resp = await resetPWCheck(password, token, email);
			logger.debug(`Password reset check response`, { email, response: JSON.stringify(resp) });

			if (resp.status) {
				const emailProps = {
					username: resp.username || email,
					email: email,
					hostLink: getPublicSettingSync('HOST_PROD') || `https://${event.request.headers.get('host')}`,
					sitename: getPublicSettingSync('SITE_NAME') || 'SveltyCMS'
				};
				try {
					// Use SvelteKit's fetch for server-side API calls
					const mailResponse = await event.fetch('/api/sendMail', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							recipientEmail: email,
							subject: `Your Password for ${emailProps.sitename} Has Been Updated`,
							templateName: 'updatedPassword', // Ensure this template exists
							props: emailProps,
							languageTag: userLanguage
						})
					});
					if (!mailResponse.ok) {
						logger.error(`Failed to send password updated email via API. Status: ${mailResponse.status}`, {
							email,
							responseText: await mailResponse.text()
						});
					} else {
						logger.info(`Password updated confirmation email request sent via API`, { email });
					}
				} catch (emailError) {
					logger.error(`Error fetching /api/sendMail for password updated confirmation`, { email, error: emailError });
				}

				// message(pwresetForm, 'Password reset successfully. You can now log in.');
				throw redirect(303, '/login?reset=success');
			} else {
				logger.warn(`Password reset failed`, { email, message: resp.message });
				return fail(400, { message: resp.message || 'Password reset failed. The link may be invalid or expired.', form });
			}
		} catch (e) {
			// Check if this is a redirect (which is expected and successful)
			if (e && typeof e === 'object' && 'status' in e && (e.status === 302 || e.status === 303)) {
				// Re-throw the redirect - this is the expected flow
				throw e;
			}

			const err = e as Error;
			logger.error(`Error in resetPW action`, { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'An unexpected error occurred during password reset.', form });
		}
	},

	prefetch: async () => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const baseLocale = (await getPublicSettingSync('BASE_LOCALE')) || 'en';
		const locales = (await getPublicSettingSync('LOCALES')) || [baseLocale];
		const supportedLocales = (locales || [baseLocale || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (baseLocale as Locale) || 'en';
		// --- END: Language Validation Logic ---

		// This action is called when user switches to SignIn/SignUp components
		// to get collection info for later data fetching after authentication
		try {
			logger.info(`Collection lookup triggered for language: ${userLanguage}}`);

			// Get first collection from ContentManager (cached lookup)
			const firstCollectionSchema = await contentManager.getFirstCollection();
			const collectionInfo = firstCollectionSchema
				? {
						collectionId: firstCollectionSchema._id,
						name: firstCollectionSchema.name,
						path: firstCollectionSchema.path
					}
				: null;

			if (collectionInfo) {
				logger.info(`Collection lookup completed successfully: ${collectionInfo.name}`);
				return { success: true, collection: collectionInfo };
			} else {
				logger.debug('No collection found');
				return { success: false, error: 'No collection available' };
			}
		} catch (err) {
			logger.debug('Collection lookup failed:', err);
			return { success: false, error: 'Collection lookup failed' };
		}
	}
};

// Helper functions (createSessionAndSetCookie, signInUser, finishRegistration, forgotPWCheck, resetPWCheck)
// remain largely the same as your provided code, with minor logging/error handling adjustments.
// Ensure they are robust and correctly interact with your `auth` service.

async function createSessionAndSetCookie(user_id: string, cookies: Cookies): Promise<void> {
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
	if (!auth) throw Error('Auth service is not initialized when creating session.');
	const session = await auth.createSession({ user_id, expires: expiresAt.toISOString() as ISODateString });
	logger.debug(`Session created: ${session._id} for user ${user_id}`);
	const sessionCookie = auth.createSessionCookie(session._id);
	const attributes = sessionCookie.attributes as Record<string, unknown>;
	cookies.set(sessionCookie.name, sessionCookie.value, { ...attributes, path: '/' });
}

async function signInUser(
	email: string,
	password: string,
	isToken: boolean,
	cookies: Cookies
): Promise<{ status: boolean; message?: string; user?: User; requires2FA?: boolean; userId?: string }> {
	logger.debug(`signInUser called`, { email, isToken });
	if (!auth) {
		logger.error('Auth system not initialized for signInUser');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		let user: User | null = null;
		let authSuccess = false;

		if (!isToken) {
			const authResult = await auth.authenticate(email, password);
			if (authResult && authResult.user) {
				user = authResult.user;

				// Check if user has 2FA enabled
				if (user.is2FAEnabled) {
					logger.debug(`User has 2FA enabled, requiring 2FA verification`, { userId: user._id });
					// Don't create session yet - wait for 2FA verification
					return {
						status: false,
						message: '2FA verification required',
						requires2FA: true,
						userId: user._id
					};
				}

				authSuccess = true;
				// Use the session that authenticate() already created
				const sessionCookie = auth.createSessionCookie(authResult.sessionId);
				cookies.set(sessionCookie.name, sessionCookie.value, { ...(sessionCookie.attributes as Record<string, unknown>), path: '/' });
			} else {
				logger.warn(`Password authentication failed`, { email });
			}
		} else {
			const tokenValue = password;
			const tempUser = await auth.checkUser({ email });
			if (!tempUser) {
				logger.warn(`Token login attempt for non-existent user`, { email });
				return { status: false, message: 'User does not exist.' };
			}
			const result = await auth.consumeToken(tokenValue, tempUser._id);
			if (result.status) {
				user = tempUser;
				authSuccess = true;
			} else {
				logger.warn(`Token consumption failed`, { email, message: result.message });
				return { status: false, message: result.message || 'Invalid or expired token.' };
			}
		}

		if (!authSuccess || !user || !user._id) {
			return { status: false, message: 'Invalid credentials or authentication failed.' };
		}

		// For token-based authentication, we need to create a session manually
		// For password authentication, the session was already created by authenticate()
		if (isToken) {
			await createSessionAndSetCookie(user._id, cookies);
		}

		// Parallelize user attribute update for better performance
		const updatePromise = auth.updateUserAttributes(user._id, {
			lastAuthMethod: isToken ? 'token' : 'password',
			lastActiveAt: new Date().toISOString() as ISODateString
		}); // Don't wait for attribute update to complete - fire and forget for better UX
		updatePromise.catch((err) => {
			logger.error(`Failed to update user attributes for ${user._id}:`, err);
		});

		logger.info(`User logged in successfully: ${user.username} (${user._id})`);
		return { status: true, message: 'Login successful', user };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in signInUser`, { email, message: err.message, stack: err.stack });
		return { status: false, message: 'An internal error occurred during sign-in.' };
	}
}

interface ForgotPWCheckResult {
	success: boolean;
	message: string;
	token?: string;
	expiresIn?: Date;
	username?: string;
}

async function forgotPWCheck(email: string): Promise<ForgotPWCheckResult> {
	logger.debug(`forgotPWCheck called`, { email });
	if (!auth) {
		logger.error('Auth system not initialized for forgotPWCheck');
		return { success: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger.warn(`forgotPWCheck: User not found`, { email });
			return { success: false, message: 'User does not exist.' };
		}
		const expiresInMs = 1 * 60 * 60 * 1000;
		const expiresAt = new Date(Date.now() + expiresInMs);
		const token = await auth.createToken({
			user_id: user._id,
			expires: expiresAt.toISOString() as ISODateString,
			type: 'password_reset'
		});
		logger.info(`Password reset token created`, { email });
		return { success: true, message: 'Password reset token generated.', token, expiresIn: expiresAt, username: user.username };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in forgotPWCheck`, { email, message: err.message, stack: err.stack });
		return { success: false, message: 'An internal error occurred generating password reset token.' };
	}
}

interface ResetPWResult {
	status: boolean;
	message?: string;
	username?: string;
}

async function resetPWCheck(password: string, token: string, email: string): Promise<ResetPWResult> {
	logger.debug(`resetPWCheck called`, { email });
	if (!auth) {
		logger.error('Auth system not initialized for resetPWCheck');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger.warn(`resetPWCheck: User not found for token validation`, { email });
			return { status: false, message: 'Invalid or expired reset link (user not found).' };
		}
		const validate = await auth.consumeToken(token, user._id, 'password_reset');
		if (!validate.status) {
			logger.warn(`resetPWCheck: Token consumption failed`, { email, message: validate.message });
			return { status: false, message: validate.message || 'Invalid or expired reset link.' };
		}
		if (calculatePasswordStrength(password) < 1) {
			return { status: false, message: 'Password is too weak.' };
		}
		await auth.invalidateAllUserSessions(user._id);
		const updateResult = await auth.updateUserPassword(email, password);
		if (!updateResult.status) {
			logger.warn(`resetPWCheck: Password update failed`, { email, message: updateResult.message });
			return { status: false, message: updateResult.message || 'Failed to update password.' };
		}
		logger.info(`Password reset successfully`, { email });
		return { status: true, username: user.username };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in resetPWCheck`, { email, message: err.message, stack: err.stack });
		return { status: false, message: 'An internal error occurred during password reset.' };
	}
}
