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

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { valibot } from 'sveltekit-superforms/adapters';
import { message } from 'sveltekit-superforms/server';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema, signUpOAuthFormSchema } from '@utils/formSchemas';

// Auth
import { auth, dbInitPromise } from '@src/databases/db';
import { contentManager } from '@src/content/ContentManager';
import { generateGoogleAuthUrl, googleAuth } from '@src/auth/googleAuth';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Stores
import { get } from 'svelte/store';
import { systemLanguage, type AvailableLanguageTag } from '@stores/store.svelte';

// Import roles
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

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

// Helper function to fetch and redirect to the first collection
async function fetchAndRedirectToFirstCollection() {
	try {
		// Initialize content manager
		await contentManager.initialize();

		// Get content structure with UUIDs
		let contentNodes = [];
		try {
			if (!contentManager) throw new Error('Content manager not initialized');
			await contentManager.initialize();
			contentNodes = contentManager.getContentStructure();
			if (!Array.isArray(contentNodes)) {
				logger.warn('Content structure is not an array', { type: typeof contentNodes, value: contentNodes });
				contentNodes = [];
			}
		} catch (dbError) {
			logger.error('Failed to fetch content structure', dbError);
			return '/';
		}
		if (!contentNodes?.length) {
			logger.warn('No collections found in content structure');
			return '/';
		}

		// Find first collection using UUID
		const firstCollection = contentNodes.find((node) => node.isCollection && node._id);
		if (firstCollection) {
			logger.info(`Redirecting to first collection: ${firstCollection.name} (${firstCollection._id})`);
			return `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection._id}`;
		}
		logger.warn('No valid collections found');
		return '/';
	} catch (err) {
		logger.error('Error in fetchAndRedirectToFirstCollection:', err);
		return '/';
	}
}

// Define wrapped schemas for caching
const wrappedLoginSchema = valibot(loginFormSchema);
const wrappedForgotSchema = valibot(forgotFormSchema);
const wrappedResetSchema = valibot(resetFormSchema);
const wrappedSignUpSchema = valibot(signUpFormSchema);
const wrappedSignUpOAuthSchema = valibot(signUpOAuthFormSchema);

export const load: PageServerLoad = async ({ url, cookies, fetch, request, locals }) => {
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
			const redirectPath = await fetchAndRedirectToFirstCollection();
			throw redirect(302, redirectPath);
		}

		// Rate limiter preflight check
		if (limiter.cookieLimiter?.preflight) {
			await limiter.cookieLimiter.preflight({ request, cookies });
		}

		// Use the firstUserExists value from locals (set by hooks)
		// This avoids race conditions during initialization
		const firstUserExists = locals.isFirstUser === false;
		logger.debug(`In load: firstUserExists determined as: ${firstUserExists} (based on locals.isFirstUser: ${locals.isFirstUser})`);

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code from URL: ${code}`);

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
						const userLang = (get(systemLanguage) as AvailableLanguageTag) || 'en';
						const emailProps = {
							username: googleUser.name || user?.username || '',
							email: email,
							hostLink: publicEnv.HOST_LINK || `https://${request.headers.get('host')}`,
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
									languageTag: userLang // Pass languageTag if your API uses it
								})
							});
							if (!mailResponse.ok) {
								logger.error(`OAuth: Failed to send welcome email via API to ${email}. Status: ${mailResponse.status}`, await mailResponse.text());
							} else {
								logger.info(`OAuth: Welcome email request sent via API to ${email}`);
							}
						} catch (emailError) {
							logger.error(`OAuth: Error fetching /api/sendMail for ${email}:`, emailError);
						}
						return [user, false];
					} else {
						if (!privateEnv.ALLOW_REGISTRATION) {
							logger.warn(`OAuth: Registration for new user ${email} denied (ALLOW_REGISTRATION is false).`);
							throw new Error('New user registration via OAuth is currently disabled.');
						}
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
						const userLang = (get(systemLanguage) as AvailableLanguageTag) || 'en';
						const emailProps = {
							username: googleUser.name || newUser?.username || '',
							email: email,
							hostLink: publicEnv.HOST_LINK || `https://${request.headers.get('host')}`,
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
									languageTag: userLang
								})
							});
							if (!mailResponse.ok) {
								logger.error(
									`OAuth: Failed to send welcome email to new user ${email} via API. Status: ${mailResponse.status}`,
									await mailResponse.text()
								);
							} else {
								logger.info(`OAuth: Welcome email request sent to new user ${email} via API.`);
							}
						} catch (emailError) {
							logger.error(`OAuth: Error fetching /api/sendMail for new user ${email}:`, emailError);
						}
						return [newUser, false];
					}
				};

				const [user] = await getUser();

				if (user && user._id) {
					await createSessionAndSetCookie(user._id, cookies);
					await auth.updateUserAttributes(user._id, { lastAuthMethod: 'google', lastLogin: new Date() });
					const redirectPath = await fetchAndRedirectToFirstCollection();
					throw redirect(303, redirectPath);
				}
				logger.warn(`OAuth: User processing ended without session creation for ${googleUser.email}.`);
				return {
					firstUserExists,
					loginForm: await superValidate(wrappedLoginSchema),
					forgotForm: await superValidate(wrappedForgotSchema),
					resetForm: await superValidate(wrappedResetSchema),
					signUpForm: await superValidate(wrappedSignUpSchema),
					oauthError: 'OAuth processing failed. Please try signing in with email or contact support.'
				};
			} catch (oauthError) {
				const err = oauthError as Error;
				logger.error(`Error during Google OAuth login process: ${err.message}`, { stack: err.stack });
				return {
					firstUserExists,
					loginForm: await superValidate(wrappedLoginSchema),
					forgotForm: await superValidate(wrappedForgotSchema),
					resetForm: await superValidate(wrappedResetSchema),
					signUpForm: await superValidate(wrappedSignUpSchema),
					oauthError: `OAuth failed: ${err.message}. Please try again or use email login.`
				};
			}
		}

		const loginForm = await superValidate(wrappedLoginSchema);
		const forgotForm = await superValidate(wrappedForgotSchema);
		const resetForm = await superValidate(wrappedResetSchema);
		const signUpForm = await superValidate(wrappedSignUpSchema);

		return { firstUserExists, loginForm, forgotForm, resetForm, signUpForm };
	} catch (initialError) {
		const err = initialError as Error;
		if (err instanceof Response && err.status === 302) throw err;

		logger.error(`Critical error in load function: ${err.message}`, { stack: err.stack });
		return {
			firstUserExists: true,
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

		logger.debug('Action: signUp');
		let isFirst = event.locals.isFirstUser === true;
		if (event.locals.isFirstUser === undefined) {
			try {
				isFirst = (await auth.getUserCount()) === 0;
			} catch (err) {
				logger.error('Error fetching user count in signUp:', err);
				return fail(500, { form: await superValidate(event, wrappedSignUpSchema), message: 'An error occurred.' });
			}
		}
		logger.info(`SignUp action: isFirstUser check: ${isFirst}`);

		const signUpForm = await superValidate(event, wrappedSignUpSchema);
		if (!signUpForm.valid) {
			logger.warn('SignUp form invalid:', { errors: signUpForm.errors });
			return fail(400, { form: signUpForm });
		}

		// Validate
		const username = signUpForm.data.username;
		const email = signUpForm.data.email.toLowerCase().trim();
		const password = signUpForm.data.password;
		const token = signUpForm.data.token;

		let resp: { status: boolean; message?: string; user?: User } = { status: false };

		try {
			const existingUser = await auth.checkUser({ email });

			if (existingUser && existingUser.isRegistered) {
				return message(signUpForm, 'This email is already registered.', { status: 409 });
			} else if (isFirst) {
				logger.info(`Attempting to register first user (admin): ${username}`);
				resp = await FirstUsersignUp(username, email, password, event.cookies);
			} else if (existingUser && !existingUser.isRegistered) {
				logger.info(`Attempting to finish registration for pre-registered user: ${username}`);
				resp = await finishRegistration(username, email, password, token, event.cookies);
			} else if (!existingUser && !isFirst) {
				if (!privateEnv.ALLOW_REGISTRATION) {
					logger.warn(`Registration attempt by ${email} denied (ALLOW_REGISTRATION is false).`);
					return message(signUpForm, 'New user registration is currently disabled.', { status: 403 });
				}
				logger.info(`Attempting to register new non-first user: ${username}`);
				const defaultRole = roles.find((r) => r.isDefault) || roles.find((r) => r._id === 'user');
				if (!defaultRole) throw new Error('Default role not found for new user registration.');

				// Here, 'token' might be an invite token or unused if open registration.
				// Add validation for 'token' if it's a required invite token.
				// For this example, we assume if ALLOW_REGISTRATION is true, they can proceed.
				// If your system requires a general invite token, validate it here.

				const newUser = await auth.createUser({
					username,
					email,
					password,
					role: defaultRole._id,
					permissions: defaultRole.permissions,
					isRegistered: true,
					lastAuthMethod: 'password'
				});
				resp = { status: true, user: newUser, message: 'User registered successfully.' };
				logger.info(`New non-first user ${username} registered directly.`);
			} else {
				resp = { status: false, message: 'User registration conditions not met.' };
			}

			if (resp.status && resp.user) {
				logger.debug(`Sign Up successful for ${resp.user.username}.`);
				const userLanguage = (get(systemLanguage) as AvailableLanguageTag) || 'en';
				const emailProps = {
					username: resp.user.username,
					email: resp.user.email,
					hostLink: publicEnv.HOST_LINK || `https://${event.request.headers.get('host')}`,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
				};

				try {
					const mailResponse = await event.fetch('/api/sendMail', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							recipientEmail: resp.user.email,
							subject: `Welcome to ${emailProps.sitename}`,
							templateName: 'welcomeUser', // Make sure this template name is correct
							props: emailProps,
							languageTag: userLanguage
						})
					});
					if (!mailResponse.ok) {
						logger.error(
							`Failed to send welcome email via API to ${resp.user.email} after signup. Status: ${mailResponse.status}`,
							await mailResponse.text()
						);
					} else {
						logger.info(`Welcome email request sent via API to ${resp.user.email} after signup.`);
					}
				} catch (emailError) {
					logger.error(`Error fetching /api/sendMail for ${resp.user.email} after signup:`, emailError);
				}

				await createSessionAndSetCookie(resp.user._id, event.cookies);
				message(signUpForm, resp.message || 'User signed up successfully!');
				const redirectPath = await fetchAndRedirectToFirstCollection();
				throw redirect(303, redirectPath);
			} else {
				logger.warn(`Sign-up failed: ${resp.message || 'Unknown reason'}. Form data:`, signUpForm.data);
				return message(signUpForm, resp.message || 'Sign-up failed. Please check your details.', { status: 400 });
			}
		} catch (e) {
			const err = e as Error;
			logger.error('Unexpected error in signUp action:', { message: err.message, stack: err.stack });
			return message(signUpForm, 'An unexpected server error occurred.', { status: 500 });
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
		const authUrl = await generateGoogleAuthUrl(null, 'none');
		throw redirect(303, authUrl);
	},

	signIn: async (event) => {
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}
		await dbInitPromise;
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for signIn action');
			return fail(503, { form: await superValidate(event, wrappedLoginSchema), message: 'Authentication system is not ready.' });
		}

		const signInForm = await superValidate(event, wrappedLoginSchema);
		if (!signInForm.valid) return fail(400, { form: signInForm });

		const email = signInForm.data.email.toLowerCase();
		const password = signInForm.data.password;
		const isToken = signInForm.data.isToken;

		try {
			const resp = await signInUser(email, password, isToken, event.cookies);
			if (resp && resp.status) {
				message(signInForm, 'Sign-in successful!');
				const redirectPath = await fetchAndRedirectToFirstCollection();
				throw redirect(303, redirectPath);
			} else {
				const errorMessage = resp?.message || 'Invalid credentials or an error occurred.';
				logger.warn(`Sign-in failed for ${email}: ${errorMessage}`);
				return message(signInForm, errorMessage, { status: 401 });
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Unexpected error in signIn action for ${email}:`, { message: err.message, stack: err.stack });
			return message(signInForm, 'An unexpected server error occurred.', { status: 500 });
		}
	},

	forgotPW: async (event) => {
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

				const userLanguage = (get(systemLanguage) as AvailableLanguageTag) || 'en';
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
					logger.error(`Failed to send forgotten password email via API to ${email}. Status: ${mailResponse.status}`, await mailResponse.text());
					// Still return a generic success to user to avoid enumeration
				} else {
					logger.info(`Forgotten password email request sent via API to ${email}.`);
				}
				return message(pwforgottenForm, 'If your email is registered, a password reset link has been sent.');
			} else {
				logger.warn(`Forgotten password check failed for ${email}: ${checkMail.message}`);
				return message(pwforgottenForm, 'If your email is registered, a password reset link has been sent.');
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Error in forgotPW action for ${email}:`, { message: err.message, stack: err.stack });
			return message(pwforgottenForm, 'An error occurred. Please try again.', { status: 500 });
		}
	},

	resetPW: async (event) => {
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
			logger.debug(`Password reset check response for ${email}: ${JSON.stringify(resp)}`);

			if (resp.status) {
				const userLanguage = (get(systemLanguage) as AvailableLanguageTag) || 'en';
				const emailProps = {
					username: resp.username || email,
					email: email,
					hostLink: publicEnv.HOST_LINK || `https://${event.request.headers.get('host')}`,
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
						logger.error(`Failed to send password updated email via API to ${email}. Status: ${mailResponse.status}`, await mailResponse.text());
					} else {
						logger.info(`Password updated confirmation email request sent via API to ${email}.`);
					}
				} catch (emailError) {
					logger.error(`Error fetching /api/sendMail for password updated confirmation to ${email}:`, emailError);
				}

				message(pwresetForm, 'Password reset successfully. You can now log in.');
				throw redirect(303, '/login?reset=success');
			} else {
				logger.warn(`Password reset failed for ${email}: ${resp.message}`);
				return message(pwresetForm, resp.message || 'Password reset failed. The link may be invalid or expired.', { status: 400 });
			}
		} catch (e) {
			const err = e as Error;
			logger.error(`Error in resetPW action for ${email}:`, { message: err.message, stack: err.stack });
			return message(pwresetForm, 'An unexpected error occurred during password reset.', { status: 500 });
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
): Promise<{ status: boolean; message?: string; user?: User }> {
	logger.debug(`signInUser called with email: ${email}, isToken: ${isToken}`);
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
				authSuccess = true;
			} else {
				logger.warn(`Password authentication failed for ${email}.`);
			}
		} else {
			const tokenValue = password;
			const tempUser = await auth.checkUser({ email });
			if (!tempUser) {
				logger.warn(`Token login attempt for non-existent user: ${email}`);
				return { status: false, message: 'User does not exist.' };
			}
			const result = await auth.consumeToken(tokenValue, tempUser._id);
			if (result.status) {
				user = tempUser;
				authSuccess = true;
			} else {
				logger.warn(`Token consumption failed for ${email}: ${result.message}`);
				return { status: false, message: result.message || 'Invalid or expired token.' };
			}
		}
		if (!authSuccess || !user || !user._id) {
			return { status: false, message: 'Invalid credentials or authentication failed.' };
		}
		await createSessionAndSetCookie(user._id, cookies);
		await auth.updateUserAttributes(user._id, { lastAuthMethod: isToken ? 'token' : 'password', lastLogin: new Date() });
		logger.info(`User logged in successfully: ${user.username} (${user._id})`);
		return { status: true, message: 'Login successful', user };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in signInUser for ${email}: ${err.message}`, { stack: err.stack });
		return { status: false, message: 'An internal error occurred during sign-in.' };
	}
}

async function FirstUsersignUp(
	username: string,
	email: string,
	password: string,
	cookies: Cookies
): Promise<{ status: boolean; message?: string; user?: User }> {
	logger.debug(`FirstUsersignUp called for email: ${email}`);
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
		logger.error(`Error in FirstUsersignUp for ${email}: ${err.message}`, { stack: err.stack });
		return { status: false, message: 'An internal error occurred creating the admin user.' };
	}
}

async function finishRegistration(
	username: string,
	email: string,
	password: string,
	token: string,
	cookies: Cookies
): Promise<{ status: boolean; message?: string; user?: User }> {
	logger.debug(`finishRegistration called for email: ${email}`);
	if (!auth) {
		logger.error('Auth system not initialized for finishRegistration');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger.warn(`finishRegistration: User ${email} not found for token consumption.`);
			return { status: false, message: 'User not found or invalid registration attempt.' };
		}
		if (user.isRegistered) {
			logger.warn(`finishRegistration: User ${email} is already registered.`);
			return { status: false, message: 'This account is already fully registered.' };
		}
		const result = await auth.consumeToken(token, user._id);
		if (!result.status) {
			logger.warn(`finishRegistration: Token consumption failed for ${email}: ${result.message}`);
			return { status: false, message: result.message || 'Invalid or expired registration token.' };
		}
		if (calculatePasswordStrength(password) < 1) {
			return { status: false, message: 'Password is too weak.' };
		}
		await auth.updateUserAttributes(user._id, {
			username,
			password,
			lastAuthMethod: 'password',
			isRegistered: true
		});
		const updatedUser = await auth.checkUser({ email });
		if (!updatedUser) throw new Error('Failed to retrieve user after update in finishRegistration.');
		await createSessionAndSetCookie(user._id, cookies);
		logger.info(`User ${username} finished registration and session started.`);
		return { status: true, message: 'Registration completed successfully.', user: updatedUser };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in finishRegistration for ${email}: ${err.message}`, { stack: err.stack });
		return { status: false, message: 'An internal error occurred during registration finalization.' };
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
	logger.debug(`forgotPWCheck called for email: ${email}`);
	if (!auth) {
		logger.error('Auth system not initialized for forgotPWCheck');
		return { success: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger.warn(`forgotPWCheck: User ${email} not found.`);
			return { success: false, message: 'User does not exist.' };
		}
		const expiresInMs = 1 * 60 * 60 * 1000;
		const expiresAt = new Date(Date.now() + expiresInMs);
		const token = await auth.createToken(user._id, expiresAt, 'password_reset');
		logger.info(`Password reset token created for ${email}.`);
		return { success: true, message: 'Password reset token generated.', token, expiresIn: expiresAt, username: user.username };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in forgotPWCheck for ${email}: ${err.message}`, { stack: err.stack });
		return { success: false, message: 'An internal error occurred generating password reset token.' };
	}
}

interface ResetPWResult {
	status: boolean;
	message?: string;
	username?: string;
}

async function resetPWCheck(password: string, token: string, email: string): Promise<ResetPWResult> {
	logger.debug(`resetPWCheck called for email: ${email}`);
	if (!auth) {
		logger.error('Auth system not initialized for resetPWCheck');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger.warn(`resetPWCheck: User ${email} not found for token validation.`);
			return { status: false, message: 'Invalid or expired reset link (user not found).' };
		}
		const validate = await auth.consumeToken(token, user._id, 'password_reset');
		if (!validate.status) {
			logger.warn(`resetPWCheck: Token consumption failed for ${email}: ${validate.message}`);
			return { status: false, message: validate.message || 'Invalid or expired reset link.' };
		}
		if (calculatePasswordStrength(password) < 1) {
			return { status: false, message: 'Password is too weak.' };
		}
		await auth.invalidateAllUserSessions(user._id);
		const updateResult = await auth.updateUserPassword(email, password);
		if (!updateResult.status) {
			logger.warn(`resetPWCheck: Password update failed for ${email}: ${updateResult.message}`);
			return { status: false, message: updateResult.message || 'Failed to update password.' };
		}
		logger.info(`Password reset successfully for ${email}.`);
		return { status: true, username: user.username };
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in resetPWCheck for ${email}: ${err.message}`, { stack: err.stack });
		return { status: false, message: 'An internal error occurred during password reset.' };
	}
}
