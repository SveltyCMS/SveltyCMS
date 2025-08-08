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

import { privateEnv } from '@root/config/private';
import { publicEnv } from '@root/config/public';

import { dev } from '$app/environment';
import { redirect, fail, type Actions, type Cookies } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Cache invalidation
import { invalidateUserCountCache } from '@src/hooks.server';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { valibot } from 'sveltekit-superforms/adapters';
import { message } from 'sveltekit-superforms/server';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema, signUpOAuthFormSchema } from '@utils/formSchemas';

// Auth
import { auth, dbInitPromise } from '@src/databases/db';
import { generateGoogleAuthUrl, googleAuth } from '@src/auth/googleAuth';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Stores
import { get } from 'svelte/store';
import { systemLanguage } from '@stores/store.svelte';
import type { Locale } from '@src/paraglide/runtime';

// Import roles
import { initializeRoles, roles } from '@root/config/roles';
await initializeRoles();

// System Logger
import { logger } from '@utils/logger.svelte';

// Content Manager for redirects
import { contentManager } from '@root/src/content/ContentManager';
import { getFirstCollectionInfo, fetchAndCacheCollectionData } from '@utils/collections-prefetch';

const limiter = new RateLimiter({
	IP: [200, 'h'], // 200 requests per hour per IP
	IPUA: [100, 'm'], // 100 requests per minute per IP+User-Agent
	cookie: {
		name: 'ratelimit',
		secret: privateEnv.JWT_SECRET_KEY,
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
async function waitForAuthService(maxWaitMs: number = 10000): Promise<boolean> {
	const startTime = Date.now();
	while (Date.now() - startTime < maxWaitMs) {
		if (auth && typeof auth.validateSession === 'function') {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms before checking again
	}
	return false;
}

// --- START: Updated Language-Aware Redirect Functions ---

// Cache redirect paths per language for performance optimization
const cachedFirstCollectionPaths = new Map<Locale, { path: string; expiry: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Constructs a redirect URL to the first available collection, prefixed with the given language.
 * @param language The validated user language (e.g., 'en', 'de').
 */
async function fetchAndRedirectToFirstCollection(language: Locale): Promise<string> {
	try {
		await dbInitPromise;
		logger.debug(`Fetching first collection path for language: ${language}`);

		const firstCollection = contentManager.getFirstCollection();
		if (firstCollection?.path) {
			const redirectUrl = `/${language}${firstCollection.path}`;
			logger.info(`Redirecting to first collection: \x1b[34m${firstCollection.name}\x1b[0m at path: \x1b[34m${redirectUrl}\x1b[0m`);
			return redirectUrl;
		}

		logger.warn('No collections found via getFirstCollection(), falling back to structure scan.');
		return '/'; // Fallback if no collections are configured
	} catch (err) {
		logger.error('Error in fetchAndRedirectToFirstCollection:', err);
		return '/'; // Fallback on error
	}
}

/**
 * A cached version of fetchAndRedirectToFirstCollection to avoid redundant lookups.
 * The cache is language-aware.
 * @param language The validated user language.
 */
async function fetchAndRedirectToFirstCollectionCached(language: Locale): Promise<string> {
	const now = Date.now();
	const cachedEntry = cachedFirstCollectionPaths.get(language);

	// Return cached result if still valid
	if (cachedEntry && now < cachedEntry.expiry) {
		logger.debug(`Returning cached path for language '${language}': ${cachedEntry.path}`);
		return cachedEntry.path;
	}

	// Fetch fresh data
	const result = await fetchAndRedirectToFirstCollection(language);

	// Cache the result if it's not the fallback path
	if (result !== '/') {
		cachedFirstCollectionPaths.set(language, { path: result, expiry: now + CACHE_DURATION });
		logger.debug(`Cached new path for language '${language}': ${result}`);
	}

	return result;
}
// --- END: Updated Language-Aware Redirect Functions ---

// Helper function to check if OAuth should be available
async function shouldShowOAuth(isFirstUser: boolean, hasInviteToken: boolean): Promise<boolean> {
	// If Google OAuth is not enabled, never show it
	if (!privateEnv.USE_GOOGLE_OAUTH) {
		return false;
	}

	// Always show OAuth for the first user (no invitation needed)
	if (isFirstUser) {
		return true;
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
const wrappedSignUpOAuthSchema = valibot(signUpOAuthFormSchema);

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
				authNotReady: true
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

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code from URL: \x1b[34m${code ?? 'none'}\x1b[0m`);

		// Handle Google OAuth flow if code is present
		if (privateEnv.USE_GOOGLE_OAUTH && code) {
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

				const getUser = async (): Promise<[User | null, boolean]> => {
					const email = googleUser.email;
					if (!email) throw Error('Google did not return an email address.');

					const existingUser = await auth.checkUser({ email });
					if (existingUser) return [existingUser, false];

					const isFirst = locals.isFirstUser === true;
					logger.info(`OAuth: isFirstUser check: ${isFirst}`);

					if (isFirst) {
						const adminRole = roles.find((role) => role.isAdmin === true);
						if (!adminRole) throw Error('Admin role not found in roles configuration');

						const user = await auth.createUser({
							email,
							username: googleUser.name || email.split('@')[0],
							role: adminRole._id,
							permissions: adminRole.permissions,
							blocked: false,
							isRegistered: true,
							lastAuthMethod: 'google'
						});
						logger.info(`OAuth: First user created: ${user?.username}`);

						// Send Welcome email using fetch to /api/sendMail
						const emailProps = {
							username: googleUser.name || user?.username || '',
							email: email,
							hostLink: publicEnv.HOST_PROD || `https://${request.headers.get('host')}`,
							sitename: publicEnv.SITE_NAME || 'SveltyCMS'
						};
						try {
							const mailResponse = await fetch('/api/sendMail', {
								// Use SvelteKit's fetch
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									recipientEmail: email,
									subject: `Welcome to ${emailProps.sitename}`,
									templateName: 'welcomeUser',
									props: emailProps,
									languageTag: userLanguage // Pass languageTag if your API uses it
								})
							});
							if (!mailResponse.ok) {
								logger.error(`OAuth: Failed to send welcome email via API. Status: \x1b[34m${mailResponse.status}\x1b[0m`, {
									email,
									responseText: await mailResponse.text()
								});
							} else {
								logger.info(`OAuth: Welcome email request sent via API`, { email });
							}
						} catch (emailError) {
							logger.error(`OAuth: Error fetching /api/sendMail`, { email, error: emailError });
						}
						return [user, false];
					} else {
						// For non-first users, check if we should allow registration
						const defaultRole = roles.find((role) => role.isDefault === true) || roles.find((role) => role._id === 'user');
						if (!defaultRole) throw new Error('Default user role not found.');

						const newUser = await auth.createUser({
							email,
							username: googleUser.name || email.split('@')[0],
							role: defaultRole._id,
							permissions: defaultRole.permissions,
							isRegistered: true,
							lastAuthMethod: 'google'
						});
						logger.info(`OAuth: New non-first user created: ${newUser?.username}`);
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
								logger.error(`OAuth: Failed to send welcome email to new user via API. Status: \x1b[34m${mailResponse.status}\x1b[0m`, {
									email,
									responseText: await mailResponse.text()
								});
							} else {
								logger.info(`OAuth: Welcome email request sent to new user via API`, { email });
							}
						} catch (emailError) {
							logger.error(`OAuth: Error fetching /api/sendMail for new user`, { email, error: emailError });
						}
						return [newUser, false];
					}
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

		// ENHANCEMENT: Pre-emptively get the info for the first collection.
		// This tells us where the user will likely go after logging in and can be shown in the UI.
		const firstCollection = await getFirstCollectionInfo(userLanguage);

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
			firstCollection, // Pass collection info to the client
			loginForm,
			forgotForm,
			resetForm,
			signUpForm
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
			error: 'The login system encountered an unexpected error. Please try again later.'
		};
	}
};

// Actions for SignIn and SignUp a user with form data
export const actions: Actions = {
	signUp: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
		logger.debug(`Validated user language for sign-up: ${userLanguage}`);
		// --- END: Language Validation Logic ---

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Ensure database initialization is complete
		await dbInitPromise;

		// Wait for auth service to be ready
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for signUp action');
			return fail(503, {
				form: await superValidate(event, wrappedSignUpSchema),
				message: 'Authentication system is not ready. Please try again in a moment.'
			});
		}

		const signUpForm = await superValidate(event, wrappedSignUpSchema);
		if (!signUpForm.valid) {
			logger.warn('SignUp form invalid:', { errors: signUpForm.errors });
			return fail(400, { form: signUpForm });
		}

		const { email, username, password, token } = signUpForm.data;

		// Check if this is the first user (admin setup)
		let isFirst = event.locals.isFirstUser === true;
		if (event.locals.isFirstUser === undefined) {
			try {
				isFirst = (await auth.getUserCount()) === 0;
			} catch (err) {
				logger.error('Error fetching user count in signUp:', err);
				return fail(500, { form: signUpForm, message: 'An error occurred.' });
			}
		}

		// Handle first user (admin) registration - no token required
		if (isFirst) {
			logger.info(`Attempting to register first user (admin): ${username}`);
			try {
				const resp = await FirstUsersignUp(username, email, password, event.cookies);

				if (resp.status && resp.user) {
					logger.debug(`Sign Up successful for ${resp.user.username}.`);

					// Invalidate user count cache so the system knows a user now exists
					invalidateUserCountCache();

					const emailProps = {
						username: resp.user.username,
						email: resp.user.email,
						hostLink: publicEnv.HOST_PROD || `https://${event.request.headers.get('host')}`,
						sitename: publicEnv.SITE_NAME || 'SveltyCMS'
					};

					try {
						const mailResponse = await event.fetch('/api/sendMail', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								recipientEmail: resp.user.email,
								subject: `Welcome to ${emailProps.sitename}`,
								templateName: 'welcomeUser',
								props: emailProps,
								languageTag: userLanguage
							})
						});
						if (!mailResponse.ok) {
							logger.error(
								`Failed to send welcome email via API to ${resp.user.email} after signup. Status: \x1b[34m${mailResponse.status}\x1b[0m`,
								await mailResponse.text()
							);
						} else {
							logger.info(`Welcome email request sent via API to ${resp.user.email} after signup.`);
						}
					} catch (emailError) {
						logger.error(`Error fetching /api/sendMail for ${resp.user.email} after signup:`, emailError);
					}

					message(signUpForm, resp.message || 'Admin user created successfully!');

					// ENHANCEMENT: Trigger the data prefetch immediately after successful signup.
					// This is a non-blocking call to warm up the cache for the next page load.
					fetchAndCacheCollectionData(userLanguage, event.fetch, event.request).catch((err) => {
						logger.debug('Data caching failed during first user signup:', err);
					});

					const redirectPath = await fetchAndRedirectToFirstCollection(userLanguage);
					throw redirect(303, redirectPath);
				} else {
					logger.warn(`Admin sign-up failed: ${resp.message || 'Unknown reason'}`);
					return message(signUpForm, resp.message || 'Admin sign-up failed. Please check your details.', { status: 400 });
				}
			} catch (e) {
				// Check if this is a redirect (which is expected and successful)
				if (e && typeof e === 'object' && 'status' in e && (e.status === 302 || e.status === 303)) {
					// Re-throw the redirect - this is the expected flow
					throw e;
				}

				const err = e as Error;
				logger.error('Unexpected error in admin signUp:', { message: err.message, stack: err.stack });
				return message(signUpForm, 'An unexpected server error occurred.', { status: 500 });
			}
		}

		// For non-first users: The sign-up action now ONLY works for invited users.
		// Security: This action MUST have a valid token to proceed.
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
			// All checks passed! Create the user.
			const newUser = await auth.createUser({
				email,
				username,
				password,
				role: tokenData.details.role || 'user', // Use the role from the token with fallback to 'user'
				isRegistered: true
			});

			// Invalidate user count cache so the system knows a new user now exists
			invalidateUserCountCache();

			// Invalidate the token immediately after use
			await auth.consumeRegistrationToken(token);

			// Log the new user in by creating a session
			const session = await auth.createSession({ user_id: newUser._id });
			const sessionCookie = auth.createSessionCookie(session._id);
			event.cookies.set(sessionCookie.name, sessionCookie.value, { ...sessionCookie.attributes, path: '/' });

			// Send welcome email
			const emailProps = {
				username: newUser.username,
				email: newUser.email,
				hostLink: publicEnv.HOST_PROD || `https://${event.request.headers.get('host')}`,
				sitename: publicEnv.SITE_NAME || 'SveltyCMS'
			};

			try {
				const mailResponse = await event.fetch('/api/sendMail', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						recipientEmail: newUser.email,
						subject: `Welcome to ${emailProps.sitename}`,
						templateName: 'welcomeUser',
						props: emailProps,
						languageTag: userLanguage
					})
				});
				if (!mailResponse.ok) {
					logger.error(
						`Failed to send welcome email via API to ${newUser.email} after invite signup. Status: \x1b[34m${mailResponse.status}\x1b[0m`,
						await mailResponse.text()
					);
				} else {
					logger.info(`Welcome email sent to ${newUser.email} after invite signup.`);
				}
			} catch (emailError) {
				logger.error(`Error sending welcome email for ${newUser.email}:`, emailError);
			}

			logger.info(`Invited user ${username} registered successfully and logged in.`);

			// Fetch and cache first collection data for instant loading (fire and forget)
			import('@utils/collections-prefetch')
				.then(({ fetchAndCacheCollectionData }) => {
					fetchAndCacheCollectionData(userLanguage, event.fetch, event.request).catch((err) => {
						logger.debug('Data caching failed during invited user signup:', err);
					});
				})
				.catch(() => {
					// Silently fail if module can't be loaded
				});

			const redirectPath = await fetchAndRedirectToFirstCollection(userLanguage);
			throw redirect(303, redirectPath);
		} catch (e) {
			// Check if this is a redirect (which is expected and successful)
			if (e && typeof e === 'object' && 'status' in e && (e.status === 302 || e.status === 303)) {
				// Re-throw the redirect - this is the expected flow
				throw e;
			}

			const err = e as Error;
			logger.error('Error during invite signup:', err);
			return message(signUpForm, err.message, { status: 500 });
		}
	},

	OAuth: async (event) => {
		const form = await superValidate(event.request, wrappedSignUpOAuthSchema);
		if (!form.valid) {
			logger.debug(`Sign-up OAuth form invalid: ${form.message}`);
			return fail(400, { form });
		}
		if (!privateEnv.USE_GOOGLE_OAUTH) throw redirect(303, '/login');
		if (await limiter.isLimited(event)) {
			return fail(429, { form, message: 'Too many requests.' });
		}
		const authUrl = await generateGoogleAuthUrl(null, 'consent');
		throw redirect(303, authUrl);
	},

	signInOAuth: async (event) => {
		if (!privateEnv.USE_GOOGLE_OAUTH) throw redirect(303, '/login');
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}

		// The OAuth sign-in action is now also "smart"
		const inviteToken = event.url.searchParams.get('invite_token');
		// If an invite token is present in the URL, pass it in the 'state' to the OAuth provider.
		// This securely links the OAuth attempt back to our specific invitation.
		const authUrl = await generateGoogleAuthUrl(inviteToken, undefined);
		throw redirect(303, authUrl);
	},

	signIn: async (event) => {
		// --- START: Language Validation Logic ---
		const langFromStore = get(systemLanguage) as Locale | null;
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
		logger.debug(`Validated user language for sign-in: ${userLanguage}`);
		// --- END: Language Validation Logic ---

		const startTime = performance.now();

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Run initialization and form validation in parallel
		const [, signInForm] = await Promise.all([dbInitPromise, superValidate(event, wrappedLoginSchema)]);

		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for signIn action');
			return fail(503, { form: signInForm, message: 'Authentication system is not ready.' });
		}

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
				fetchAndRedirectToFirstCollectionCached(userLanguage) // Use cached version
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
				redirectPath = collectionPath;

				// Trigger the data prefetch immediately after successful login.
				fetchAndCacheCollectionData(userLanguage, event.fetch, event.request).catch((err) => {
					logger.debug('Data caching failed during sign-in:', err);
				});

				const endTime = performance.now();
				logger.debug(`SignIn completed in ${(endTime - startTime).toFixed(2)}ms`);
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

		await dbInitPromise;

		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for verify2FA action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}

		try {
			const formData = await event.request.formData();
			const userId = formData.get('userId') as string;
			const code = formData.get('code') as string;

			if (!userId || !code) {
				return fail(400, { message: 'Missing required fields.' });
			}

			// Import 2FA service
			const { getDefaultTwoFactorAuthService } = await import('@auth/twoFactorAuth');
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
				logger.error(`Failed to update user attributes after 2FA login for ${userId}:`, err);
			});

			logger.info(`User logged in successfully with 2FA: ${user.username} (${userId})`);

			// Get redirect path
			const redirectPath = await fetchAndRedirectToFirstCollectionCached(userLanguage);

			// Trigger data prefetch
			fetchAndCacheCollectionData(userLanguage, event.fetch, event.request).catch((err) => {
				logger.debug('Data caching failed during 2FA sign-in:', err);
			});

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
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
		// --- END: Language Validation Logic ---

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		await dbInitPromise;
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for forgotPW action');
			return fail(503, { form: await superValidate(event, wrappedForgotSchema), message: 'Authentication system not ready.' });
		}

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
		const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE]) as Locale[];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : (publicEnv.BASE_LOCALE as Locale);
		// --- END: Language Validation Logic ---

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		await dbInitPromise;
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for resetPW action');
			return fail(503, { form: await superValidate(event, wrappedResetSchema), message: 'Authentication system not ready.' });
		}

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

			// Import and call lookup function (no data fetching, just collection info)
			const { getFirstCollectionInfo } = await import('@utils/collections-prefetch');
			const collectionInfo = await getFirstCollectionInfo(userLanguage);

			if (collectionInfo) {
				logger.info(`Collection lookup completed successfully: \x1b[34m${collectionInfo.name}}\x1b[0m`);
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

// Helper functions (createSessionAndSetCookie, signInUser, FirstUsersignUp, finishRegistration, forgotPWCheck, resetPWCheck)
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

async function FirstUsersignUp(
	username: string,
	email: string,
	password: string,
	cookies: Cookies
): Promise<{ status: boolean; message?: string; user?: User }> {
	logger.debug(`FirstUsersignUp called`, { email });
	if (!auth) {
		logger.error('Auth system not initialized for FirstUsersignUp');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		if (typeof auth.getUserCount === 'function') {
			const userCount = await auth.getUserCount();
			if (userCount > 0) {
				logger.warn('Attempted FirstUsersignUp when users already exist.');
				return { status: false, message: 'An admin user already exists.' };
			}
		}
		const adminRole = roles.find((role) => role.isAdmin === true);
		if (!adminRole) {
			logger.error('Admin role not found in roles configuration for FirstUsersignUp');
			return { status: false, message: 'Server configuration error: Admin role not found.' };
		}
		if (calculatePasswordStrength(password) < 1) {
			return { status: false, message: 'Password is too weak.' };
		}
		const user = await auth.createUser({
			email,
			username,
			password,
			role: adminRole._id,
			permissions: adminRole.permissions,
			lastAuthMethod: 'password',
			isRegistered: true,
			failedAttempts: 0
		});
		if (!user || !user._id) {
			logger.error('First user creation failed: No user object returned or missing _id.');
			return { status: false, message: 'Failed to create admin user.' };
		}
		await createSessionAndSetCookie(user._id, cookies);
		logger.info(`First admin user ${username} created and session started.`);
		return { status: true, message: 'Admin user created successfully.', user };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in FirstUsersignUp`, { email, message: err.message, stack: err.stack });
		return { status: false, message: 'An internal error occurred creating the admin user.' };
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
