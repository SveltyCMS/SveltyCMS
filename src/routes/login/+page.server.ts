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

// Superforms
import { forgotFormSchema, loginFormSchema, resetFormSchema, signUpFormSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';

// Auth
import { generateGoogleAuthUrl, googleAuth } from '@src/databases/auth/googleAuth';
import type { User } from '@src/databases/auth/types';
import { auth, dbInitPromise } from '@src/databases/db';
import { google } from 'googleapis';

// Stores
import type { Locale } from '@src/paraglide/runtime';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { systemLanguage } from '@stores/store.svelte';
import { get } from 'svelte/store';

// Import roles
import { initializeRoles, roles } from '@root/config/roles';
await initializeRoles();

// System Logger
import { logger } from '@utils/logger.svelte';

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
const MIN_PPASSWORD_LENGTH = publicEnv.PASSWORD_LENGTH || 8;
const YELLOW_LENGTH = MIN_PPASSWORD_LENGTH + 3;
const GREEN_LENGTH = YELLOW_LENGTH + 4;

// Function to calculate password strength (matches the logic in PasswordStrength.svelte)
function calculatePasswordStrength(password: string): number {
	if (password.length >= GREEN_LENGTH) return 3;
	if (password.length >= YELLOW_LENGTH) return 2;
	if (password.length >= MIN_PPASSWORD_LENGTH) return 1;
	return 0;
}

// Helper function to wait for auth service to be ready
async function waitForAuthService(maxWaitMs: number = 30000): Promise<boolean> {
	const startTime = Date.now();
	logger.debug(`Waiting for auth service to be ready (timeout: \x1b[32m${maxWaitMs}ms\x1b[0m)...`);

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
				logger.debug(`Auth service ready after \x1b[32m${Date.now() - startTime}ms\x1b[0m`);
				return true;
			}

			// Log progress every 5 seconds
			const elapsed = Date.now() - startTime;
			if (elapsed % 5000 < 100) {
				logger.debug(
					`Auth service not ready yet, elapsed: \x1b[32m${elapsed}ms\x1b[0m, auth: \x1b[34m${!!auth}\x1b[0m, validateSession: ${auth && typeof auth.validateSession === 'function'}`
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

import { getCachedFirstCollectionPath } from '@stores/collectionStore.svelte';

// Helper function to check if OAuth should be available
async function shouldShowOAuth(isFirstUser: boolean, hasInviteToken: boolean): Promise<boolean> {
	// If Google OAuth is not enabled, never show it
	if (!publicEnv.USE_GOOGLE_OAUTH) {
		return false;
	}

	// If there's an invite token, show OAuth (invited user can choose OAuth)
	if (hasInviteToken) {
		return true;
	}

	// Check if there are existing OAuth users - if so, show OAuth for sign-in
	try {
		await dbInitPromise;
		if (!auth) {
			logger.warn('Auth service not available for OAuth user check');
			return false;
		}

		// Check for users who have signed in via OAuth (lastAuthMethod: 'google')
		const users = await auth.getAllUsers({
			filter: { lastAuthMethod: 'google' },
			limit: 1
		});
		const hasOAuthUsers = users && users.length > 0;

		logger.debug(`OAuth users check: found \x1b[34m${users?.length || 0}\x1b[0m users with lastAuthMethod \x1b[34m'google'\x1b[0m`);

		if (hasOAuthUsers) {
			return true; // Show OAuth for existing OAuth users to sign in
		}

		// If no existing OAuth users, still show OAuth but it will require a token
		// This allows users with invite tokens to enter them and use OAuth
		return true;
	} catch (error) {
		logger.error('Error checking for OAuth users:', error);
		// In case of error, be conservative but still allow OAuth with token requirement
		return true;
	}
}

// Define wrapped schemas for caching
const wrappedLoginSchema = valibot(loginFormSchema);
const wrappedForgotSchema = valibot(forgotFormSchema);
const wrappedResetSchema = valibot(resetFormSchema);
const wrappedSignUpSchema = valibot(signUpFormSchema);

export const load: PageServerLoad = async ({ url, cookies, fetch, request, locals }) => {
	// --- START: Language Validation Logic ---
	const langFromStore = get(systemLanguage) as Locale | null;
	// Use PUBLIC_ENV.LOCALES for validation, fallback to BASE_LOCALE
	const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
	const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
	// --- END: Language Validation Logic ---

	try {
		// Ensure initialization is complete
		await dbInitPromise;

		// Wait for auth service to be ready instead of throwing error immediately
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.warn('Authentication system is not ready yet, returning fallback data');
			// Return fallback data instead of throwing error
			return {
				firstUserExists: true,
				showOAuth: false, // Don't show OAuth if auth system isn't ready
				hasExistingOAuthUsers: false,
				loginForm: await superValidate(wrappedLoginSchema),
				forgotForm: await superValidate(wrappedForgotSchema),
				resetForm: await superValidate(wrappedResetSchema),
				signUpForm: await superValidate(wrappedSignUpSchema),
				authNotReady: true,
				authNotReadyMessage: 'System is still initializing. Please wait a moment and try again.'
			};
		}

		if (!locals) locals = {} as App.Locals;

		// Check if user is already authenticated
		if (locals.user) {
			logger.debug('User is already authenticated in load, attempting to redirect to collection');
			const redirectPath = await fetchAndRedirectToFirstCollection(userLanguage);
			throw redirect(302, redirectPath);
		}

		// Rate limiter preflight check
		if (limiter.cookieLimiter?.preflight) {
			await limiter.cookieLimiter.preflight({ request, cookies });
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
				const showOAuth = await shouldShowOAuth(!firstUserExists, true);

				return {
					firstUserExists,
					isInviteFlow: true,
					showOAuth,
					hasExistingOAuthUsers: false, // Not relevant for invite flow
					token: inviteToken,
					invitedEmail: tokenData.details.email,
					roleId: tokenData.details.role, // Pass the roleId from the token
					loginForm: await superValidate(wrappedLoginSchema),
					forgotForm: await superValidate(wrappedForgotSchema),
					resetForm: await superValidate(wrappedResetSchema),
					signUpForm: await superValidate(wrappedSignUpSchema)
				};
			} else {
				// Token is invalid, expired, or already used.
				// Instead of completely blocking, let the user access the form
				// and pre-fill the token so they can see what's wrong or enter a different one
				logger.warn('Invalid invite token detected, but allowing form access with pre-filled token.');

				// Check firstUserExists for consistency
				const firstUserExists = locals.isFirstUser === false;

				// Check if OAuth should be shown (invalid invite, but has token)
				const showOAuth = await shouldShowOAuth(!firstUserExists, true);

				// Pre-fill the form with the invalid token and show a warning
				const signUpForm = await superValidate(wrappedSignUpSchema);
				signUpForm.data.token = inviteToken; // Pre-fill with the invalid token

				return {
					firstUserExists,
					isInviteFlow: false, // Not a proper invite flow since token is invalid
					showOAuth,
					hasExistingOAuthUsers: false,
					inviteError:
						'This invitation token appears to be invalid, expired, or already used. Please check with your administrator or enter a different token.',
					loginForm: await superValidate(wrappedLoginSchema),
					forgotForm: await superValidate(wrappedForgotSchema),
					resetForm: await superValidate(wrappedResetSchema),
					signUpForm
				};
			}
		}

		// Use the firstUserExists value from locals (set by hooks)
		const firstUserExists = locals.isFirstUser === false;
		logger.debug(
			`In load: firstUserExists determined as: \x1b[34m${firstUserExists}\x1b[0m (based on locals.isFirstUser: \x1b[34m${locals.isFirstUser}\x1b[0m)`
		);

		// Note: If no users exist, handleSetup hook will redirect to /setup before this code runs

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code from URL: \x1b[34m${code ?? 'none'}\x1b[0m`);

		// Handle Google OAuth flow if code is present
		if (publicEnv.USE_GOOGLE_OAUTH && code) {
			logger.debug('Entering Google OAuth flow in load function');
			try {
				const googleAuthInstance = await googleAuth();
				if (!googleAuthInstance) throw Error('Google OAuth client is not initialized');

				logger.debug('Fetching tokens using authorization code...');
				const { tokens } = await googleAuthInstance.getToken(code);
				if (!tokens) throw new Error('Failed to retrieve Google OAuth tokens.');

				googleAuthInstance.setCredentials(tokens);
				const oauth2 = google.oauth2({ auth: googleAuthInstance, version: 'v2' });
				const { data: googleUser } = await oauth2.userinfo.get();
				logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

				// Invite token comes back via OAuth state param
				const stateParam = url.searchParams.get('state');
				const inviteToken = stateParam ? decodeURIComponent(stateParam) : null;

				const getUser = async (): Promise<[User | null, boolean]> => {
					const email = googleUser.email;
					if (!email) throw Error('Google did not return an email address.');

					const existingUser = await auth.checkUser({ email });
					if (existingUser) return [existingUser, false];

					// For non-first users (or any users), allow only invite-based registration
					if (!inviteToken) {
						logger.warn('OAuth registration attempt without invite token in state');
						return [null, false];
					}

					const tokenData = await auth.validateRegistrationToken(inviteToken);
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

					const roleId = tokenData.details.role || (roles.find((r) => r.isDefault)?._id ?? 'user');

					const newUser = await auth.createUser({
						email,
						username: googleUser.name || email.split('@')[0],
						role: roleId,
						permissions: roles.find((r) => r._id === roleId)?.permissions,
						isRegistered: true,
						lastAuthMethod: 'google'
					});

					// Consume the invitation token after successful registration
					await auth.consumeRegistrationToken(inviteToken);

					logger.info(`OAuth: Invited user created: ${newUser?.username}`);
					const emailProps = {
						username: googleUser.name || newUser?.username || '',
						email: email,
						hostLink: publicEnv.HOST_PROD || `https://${request.headers.get('host')}`,
						sitename: publicEnv.SITE_NAME || 'SveltyCMS'
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
							logger.error(`OAuth: Failed to send welcome email to invited user via API. Status: \x1b[34m${mailResponse.status}\x1b[0m`, {
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
					await auth.updateUserAttributes(user._id, { lastAuthMethod: 'google', lastLogin: new Date() });
					const redirectPath = await fetchAndRedirectToFirstCollection(userLanguage);
					throw redirect(303, redirectPath);
				}

				logger.warn(`OAuth: User processing ended without session creation for ${googleUser.email}.`);
				// Check if OAuth should be shown for error case
				const showOAuth = await shouldShowOAuth(!firstUserExists, false);
				return {
					isInviteFlow: false,
					firstUserExists,
					showOAuth,
					hasExistingOAuthUsers: false, // Not relevant for error case
					loginForm: await superValidate(wrappedLoginSchema),
					forgotForm: await superValidate(wrappedForgotSchema),
					resetForm: await superValidate(wrappedResetSchema),
					signUpForm: await superValidate(wrappedSignUpSchema),
					oauthError: 'OAuth processing failed. Please try signing in with email or contact support.'
				};
			} catch (oauthError) {
				// Check if this is a SvelteKit redirect (which is expected)
				if (oauthError instanceof Response && oauthError.status >= 300 && oauthError.status < 400) {
					throw oauthError; // Re-throw redirects
				}

				const err = oauthError as Error;
				logger.error(`Error during Google OAuth login process: ${err.message}`, { stack: err.stack });
				// Check if OAuth should be shown for error case
				const showOAuth = await shouldShowOAuth(!firstUserExists, false);
				return {
					isInviteFlow: false,
					firstUserExists,
					showOAuth,
					hasExistingOAuthUsers: false, // Not relevant for error case
					loginForm: await superValidate(wrappedLoginSchema),
					forgotForm: await superValidate(wrappedForgotSchema),
					resetForm: await superValidate(wrappedResetSchema),
					signUpForm: await superValidate(wrappedSignUpSchema),
					oauthError: `OAuth failed: ${err.message}. Please try again or use email login.`
				};
			}
		}

		// This is a normal login flow (no invite token) - return standard forms
		const loginForm = await superValidate(wrappedLoginSchema);
		const forgotForm = await superValidate(wrappedForgotSchema);
		const resetForm = await superValidate(wrappedResetSchema);
		const signUpForm = await superValidate(wrappedSignUpSchema);

		// Check if OAuth should be shown
		const showOAuth = await shouldShowOAuth(!firstUserExists, false);

		// Check if there are existing OAuth users (for better UX messaging)
		let hasExistingOAuthUsers = false;
		try {
			if (auth) {
				const oauthUsers = await auth.getAllUsers({
					filter: { lastAuthMethod: 'google' },
					limit: 1
				});
				hasExistingOAuthUsers = oauthUsers && oauthUsers.length > 0;
			}
		} catch (error) {
			logger.error('Error checking for existing OAuth users:', error);
		}

		return {
			isInviteFlow: false,
			firstUserExists,
			showOAuth,
			hasExistingOAuthUsers,
			loginForm,
			forgotForm,
			resetForm,
			signUpForm,
			pkgVersion: publicEnv.PKG_VERSION || '0.0.0'
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
			loginForm: await superValidate(wrappedLoginSchema),
			forgotForm: await superValidate(wrappedForgotSchema),
			resetForm: await superValidate(wrappedResetSchema),
			signUpForm: await superValidate(wrappedSignUpSchema),
			error: 'The login system encountered an unexpected error. Please try again later.',
			pkgVersion: publicEnv.PKG_VERSION || '0.0.0'
		};
	}
};

// Actions for SignIn and SignUp a user with form data
export const actions: Actions = {
	signUp: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';
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

		// Check if auth service is ready
		if (!auth) {
			logger.error('Authentication system is not ready for signUp action - auth is null/undefined');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		// Check if auth service has essential methods
		const requiredMethods = ['validateSession', 'createUser', 'getUserByEmail', 'createSession'];
		const missingMethods = requiredMethods.filter((method) => typeof auth[method] !== 'function');

		if (missingMethods.length > 0) {
			logger.error(`Authentication system is not ready for signUp action - missing methods: ${missingMethods.join(', ')}`);
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for signUp action');

		const signUpForm = await superValidate(event, wrappedSignUpSchema);
		if (!signUpForm.valid) {
			logger.warn('SignUp form invalid:', { errors: signUpForm.errors });
			return fail(400, { form: signUpForm });
		}

		const { email, username, password, token } = signUpForm.data;

		// Security: This action ONLY works for invited users with valid tokens.
		// First-user registration must go through /setup (enforced by hooks and load function).
		if (!token) {
			return message(signUpForm, 'A valid invitation is required to create an account.', { status: 403 });
		}

		const tokenData = await auth.validateRegistrationToken(token);
		if (!tokenData.isValid || !tokenData.details) {
			return message(signUpForm, 'This invitation is invalid, expired, or has already been used.', { status: 403 });
		}

		// Debug: Log the token details to see what we're getting
		logger.debug('Token validation result:', {
			tokenData: tokenData.details,
			role: tokenData.details.role,
			email: tokenData.details.email
		});

		// Security: Check that the email in the form matches the one in the token record
		if (email.toLowerCase() !== tokenData.details.email.toLowerCase()) {
			return message(signUpForm, 'The provided email does not match the invitation.', { status: 403 });
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
					lastLogin: new Date()
				},
				{
					expires: sessionExpires,
					...(getPrivateSettingSync('MULTI_TENANT') && tokenData.details.tenantId && { tenantId: tokenData.details.tenantId })
				}
			);

			if (!userAndSessionResult.success || !userAndSessionResult.data) {
				throw new Error(userAndSessionResult.message || 'Failed to create user and session');
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
			await auth.consumeRegistrationToken(token);

			// Send welcome email (best-effort; do not fail signup on email issues)
			try {
				const emailProps = {
					username: username || email,
					email,
					hostLink: publicEnv.HOST_PROD || `https://${event.request.headers.get('host')}`,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
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
			event.cookies.set(auth.sessionCookieName, newSession._id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: publicEnv.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 * 7 // 7 days to match session expiry
			});

			// Redirect to first collection
			const redirectPath = await fetchAndRedirectToFirstCollectionCached(userLanguage);
			throw redirect(303, redirectPath);
		} catch (error) {
			const err = error as Error;
			logger.error('Error during invited user signup', { email, message: err.message, stack: err.stack });
			return message(signUpForm, 'Failed to create account. Please try again later.', { status: 500 });
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
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';
		logger.debug(`Validated user language for sign-in: \x1b[34m${userLanguage}\x1b[0m`);
		// --- END: Language Validation Logic ---

		const startTime = performance.now();

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Wait for database initialization first
		try {
			await dbInitPromise;
			logger.debug('Database initialization completed');
		} catch (error) {
			logger.error('Database initialization failed:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}

		// Check if auth service is ready
		if (!auth) {
			logger.error('Authentication system is not ready for signIn action - auth is null/undefined');
			logger.debug('System state:', {
				dbInitPromise: !!dbInitPromise,
				dbInitPromiseState: dbInitPromise ? 'pending' : 'resolved',
				auth: null,
				authType: typeof auth
			});
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		// Check if auth service has essential methods
		const requiredMethods = ['validateSession', 'createUser', 'getUserByEmail', 'createSession'];
		const missingMethods = requiredMethods.filter((method) => typeof auth[method] !== 'function');

		if (missingMethods.length > 0) {
			logger.error(`Authentication system is not ready for signIn action - missing methods: ${missingMethods.join(', ')}`);
			logger.debug('Auth service state:', {
				authType: typeof auth,
				authKeys: Object.keys(auth),
				hasValidateSession: typeof auth.validateSession === 'function',
				hasCreateUser: typeof auth.createUser === 'function',
				hasGetUserByEmail: typeof auth.getUserByEmail === 'function',
				hasCreateSession: typeof auth.createSession === 'function',
				availableMethods: Object.keys(auth).filter((key) => typeof auth[key] === 'function')
			});
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for signIn action');

		// Validate form
		const signInForm = await superValidate(event, wrappedLoginSchema);
		if (!signInForm.valid) return fail(400, { form: signInForm });

		const email = signInForm.data.email.toLowerCase();
		const password = signInForm.data.password;
		const isToken = signInForm.data.isToken;

		let resp;
		let redirectPath;

		try {
			// Run authentication and collection path retrieval in parallel for faster response
			const [authResult, collectionPath] = await Promise.all([
				signInUser(email, password, isToken, event.cookies),
				getCachedFirstCollectionPath(userLanguage) // Use cached version from store
			]);

			resp = authResult;

			if (resp && resp.requires2FA) {
				// User needs 2FA verification
				logger.debug('2FA verification required for user', { userId: resp.userId });
				return message(signInForm, 'Please enter your 2FA code to continue.', {
					status: 200,
					data: {
						requires2FA: true,
						userId: resp.userId
					}
				});
			} else if (resp && resp.status) {
				message(signInForm, 'Sign-in successful!');
				// If no collection, redirect based on permission
				if (!collectionPath) {
					// Import hasPermissionWithRoles dynamically to avoid circular deps
					const { hasPermissionWithRoles } = await import('@src/databases/auth/permissions');
					const isAdmin = hasPermissionWithRoles(resp.user, 'config:collectionbuilder', roles);
					redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
				} else {
					redirectPath = collectionPath;
				}

				const endTime = performance.now();
				logger.debug(`SignIn completed in \x1b[32m${(endTime - startTime).toFixed(2)}ms\x1b[0m`);
			} else {
				const errorMessage = resp?.message || 'Invalid credentials or an error occurred.';
				logger.warn(`Sign-in failed`, { email, errorMessage });
				return message(signInForm, errorMessage, { status: 401 });
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Unexpected error in signIn action`, { email, message: err.message, stack: err.stack });
			return message(signInForm, 'An unexpected server error occurred.', { status: 500 });
		}

		// Handle redirect outside try-catch
		if (redirectPath) {
			throw redirect(303, redirectPath);
		}
	},

	verify2FA: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
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

		// Check if auth service is ready
		if (!auth) {
			logger.error('Authentication system is not ready for verify2FA action - auth is null/undefined');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		// Check if auth service has essential methods
		const requiredMethods = ['validateSession', 'createUser', 'getUserByEmail', 'createSession'];
		const missingMethods = requiredMethods.filter((method) => typeof auth[method] !== 'function');

		if (missingMethods.length > 0) {
			logger.error(`Authentication system is not ready for verify2FA action - missing methods: ${missingMethods.join(', ')}`);
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
			const twoFactorService = getDefaultTwoFactorAuthService(auth);

			// Verify 2FA code
			const result = await twoFactorService.verify2FA(userId, code);

			if (!result.success) {
				logger.warn('2FA verification failed during login', { userId, reason: result.message });
				return fail(400, { message: result.message });
			}

			// 2FA verification successful - get user and create session
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
				lastLogin: new Date()
			});

			updatePromise.catch((err) => {
				logger.error(`Failed to update user attributes after 2FA login for \x1b[32m${userId}\x1b[0m:`, err);
			});

			logger.info(`User logged in successfully with 2FA: \x1b[34m${user.username}\x1b[0m (\x1b[32m${userId}\x1b[0m)`);

			// Get redirect path
			const loggedInUser = await auth.getUserById(userId);
			let redirectPath = await fetchAndRedirectToFirstCollectionCached(userLanguage);
			if (!redirectPath) {
				const { hasPermissionWithRoles } = await import('@src/databases/auth/permissions');
				const isAdmin = hasPermissionWithRoles(loggedInUser, 'config:collectionbuilder', roles);
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
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';
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

		// Check if auth service is ready
		if (!auth) {
			logger.error('Authentication system is not ready for forgotPW action - auth is null/undefined');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		// Check if auth service has essential methods
		const requiredMethods = ['validateSession', 'createUser', 'getUserByEmail', 'createSession'];
		const missingMethods = requiredMethods.filter((method) => typeof auth[method] !== 'function');

		if (missingMethods.length > 0) {
			logger.error(`Authentication system is not ready for forgotPW action - missing methods: ${missingMethods.join(', ')}`);
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for forgotPW action');

		const pwforgottenForm = await superValidate(event, wrappedForgotSchema);
		if (!pwforgottenForm.valid) return fail(400, { form: pwforgottenForm });

		const email = pwforgottenForm.data.email.toLowerCase().trim();
		let checkMail: ForgotPWCheckResult;

		try {
			checkMail = await forgotPWCheck(email);

			if (checkMail.success && checkMail.token && checkMail.expiresIn) {
				const baseUrl = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;
				const resetLink = `${baseUrl}/login?token=${checkMail.token}&email=${encodeURIComponent(email)}`;
				logger.debug(`Reset link generated: ${resetLink}`);

				const emailProps = {
					email: email,
					token: checkMail.token,
					expiresIn: checkMail.expiresIn,
					resetLink: resetLink,
					username: checkMail.username || email,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
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
					return message(pwforgottenForm, 'Password reset email sent successfully.', { status: 200, userExists: true, emailSent: false });
				} else {
					logger.info(`Forgotten password email request sent via API`, { email });
					return message(pwforgottenForm, 'Password reset email sent successfully.', { status: 200, userExists: true, emailSent: true });
				}
			} else {
				logger.warn(`Forgotten password check failed`, { email, message: checkMail.message });
				// Return different response for user not found to allow frontend distinction
				return message(pwforgottenForm, 'User does not exist.', { status: 400, userExists: false });
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Error in forgotPW action`, { email, message: err.message, stack: err.stack });
			return message(pwforgottenForm, 'An error occurred. Please try again.', { status: 500 });
		}
	},

	resetPW: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en']) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale) || 'en';
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

		// Check if auth service is ready
		if (!auth) {
			logger.error('Authentication system is not ready for resetPW action - auth is null/undefined');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		// Check if auth service has essential methods
		const requiredMethods = ['validateSession', 'createUser', 'getUserByEmail', 'createSession'];
		const missingMethods = requiredMethods.filter((method) => typeof auth[method] !== 'function');

		if (missingMethods.length > 0) {
			logger.error(`Authentication system is not ready for resetPW action - missing methods: ${missingMethods.join(', ')}`);
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		logger.debug('Auth service is ready for resetPW action');

		const pwresetForm = await superValidate(event, wrappedResetSchema);
		if (!pwresetForm.valid) return fail(400, { form: pwresetForm });

		const password = pwresetForm.data.password;
		const token = pwresetForm.data.token;
		const email = pwresetForm.data.email.toLowerCase().trim();

		try {
			const resp = await resetPWCheck(password, token, email);
			logger.debug(`Password reset check response`, { email, response: JSON.stringify(resp) });

			if (resp.status) {
				const emailProps = {
					username: resp.username || email,
					email: email,
					hostLink: publicEnv.HOST_PROD || `https://${event.request.headers.get('host')}`,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
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

				message(pwresetForm, 'Password reset successfully. You can now log in.');
				throw redirect(303, '/login?reset=success');
			} else {
				logger.warn(`Password reset failed`, { email, message: resp.message });
				return message(pwresetForm, resp.message || 'Password reset failed. The link may be invalid or expired.', { status: 400 });
			}
		} catch (e) {
			// Check if this is a redirect (which is expected and successful)
			if (e && typeof e === 'object' && 'status' in e && (e.status === 302 || e.status === 303)) {
				// Re-throw the redirect - this is the expected flow
				throw e;
			}

			const err = e as Error;
			logger.error(`Error in resetPW action`, { email, message: err.message, stack: err.stack });
			return message(pwresetForm, 'An unexpected error occurred during password reset.', { status: 500 });
		}
	},

	prefetch: async () => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
		// --- END: Language Validation Logic ---

		// This action is called when user switches to SignIn/SignUp components
		// to get collection info for later data fetching after authentication
		try {
			logger.info(`Collection lookup triggered for language: \x1b[34m${userLanguage}}\x1b[0m`);

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
				logger.info(`Collection lookup completed successfully: \x1b[34m${collectionInfo.name}\x1b[0m`);
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
	const session = await auth.createSession({ user_id, expires: expiresAt });
	logger.debug(`Session created: ${session._id} for user ${user_id}`);
	const sessionCookie = auth.createSessionCookie(session._id);
	cookies.set(sessionCookie.name, sessionCookie.value, { ...sessionCookie.attributes, path: '/' });
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
				cookies.set(sessionCookie.name, sessionCookie.value, { ...sessionCookie.attributes, path: '/' });
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
			lastLogin: new Date()
		});

		// Don't wait for attribute update to complete - fire and forget for better UX
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
		const token = await auth.createToken(user._id, expiresAt, 'password_reset');
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
