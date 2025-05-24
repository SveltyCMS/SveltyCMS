/**
 * @file src/routes/login/+page.server.ts
 * @description Server-side logic for the login page.
 */

import { privateEnv } from '@root/config/private';
import { publicEnv } from '@root/config/public';

import { dev } from '$app/environment';
import { error, redirect, fail, type Actions } from '@sveltejs/kit';
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
import { contentManager } from '@root/src/content/ContentManager';
import { generateGoogleAuthUrl, googleAuth } from '@root/src/auth/googleAuth';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Stores
import { get } from 'svelte/store';
import { systemLanguage } from '@stores/store.svelte';

// Import roles
import { roles } from '@root/config/roles';

// System Logs
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
const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;
const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
const GREEN_LENGTH = YELLOW_LENGTH + 4;

// Function to calculate password strength (matches the logic in PasswordStrength.svelte)
function calculatePasswordStrength(password: string): number {
	if (password.length >= GREEN_LENGTH) return 3;
	if (password.length >= YELLOW_LENGTH) return 2;
	if (password.length >= MIN_PASSWORD_LENGTH) return 1;
	return 0;
}

// Helper function to wait for auth service to be ready
async function waitForAuthService(maxWaitMs: number = 10000): Promise<boolean> {
	const startTime = Date.now();
	while (Date.now() - startTime < maxWaitMs) {
		if (auth && typeof auth.validateSession === 'function') {
			return true;
		}
		await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before checking again
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
			if (!contentManager) {
				throw new Error('Content manager not initialized');
			}

			await contentManager.initialize();
			contentNodes = contentManager.getContentStructure();

			if (!Array.isArray(contentNodes)) {
				logger.warn('Content structure is not an array', {
					type: typeof contentNodes,
					value: contentNodes
				});
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

		// Check if locals is defined
		if (!locals) {
			logger.warn('Locals object is not defined');
			locals = {}; // Initialize locals if it's undefined
		}

		// Check if user is already authenticated
		if (locals.user) {
			logger.debug('User is already authenticated, attempting to redirect to collection');
			const redirectPath = await fetchAndRedirectToFirstCollection();
			throw redirect(302, redirectPath);
		}

		// Rate limiter preflight check
		if (limiter.cookieLimiter?.preflight) {
			await limiter.cookieLimiter.preflight({ request, cookies });
		}

		// Use the firstUserExists value from locals (set by hooks)
		// This avoids race conditions during initialization
		const firstUserExists = !locals.isFirstUser;
		logger.debug(`Using firstUserExists from locals: ${firstUserExists} (isFirstUser: ${locals.isFirstUser})`);

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code: \x1b[34m${code}\x1b[0m`);

		// Handle Google OAuth flow if code is present
		if (privateEnv.USE_GOOGLE_OAUTH && code) {
			logger.debug('Entering OAuth flow in load function');
			try {
				if (!googleAuth) {
					throw Error('Google OAuth is not initialized');
				}

				logger.debug('Fetching tokens using authorization code...');
				const { tokens } = await (await googleAuth()).getToken(code);
				logger.debug(`Received tokens: ${JSON.stringify(tokens)}`);
				googleAuth.setCredentials(tokens);
				const oauth2 = google.oauth2({ auth: googleAuth, version: 'v2' });
				const { data: googleUser } = await oauth2.userinfo.get();
				logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

				const getUser = async (): Promise<[User | null, boolean]> => {
					const email = googleUser.email;
					if (!email) {
						throw Error('Google did not return an email address.');
					}

					const existingUser = await auth.checkUser({ email });
					if (existingUser) return [existingUser, false];

					const username = googleUser.name ?? '';
					const isFirst = locals.isFirstUser || false;

					if (isFirst) {
						const adminRole = roles.find((role) => role._id === 'admin');
						if (!adminRole) {
							throw Error('Admin role not found in roles configuration');
						}

						const user = await auth.createUser({
							email,
							username,
							role: adminRole._id,
							permissions: adminRole.permissions,
							blocked: false
						});

						// Send Welcome email
						await fetch('/api/sendMail', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								email,
								subject: `New registration ${googleUser.name}`,
								message: `New registration ${googleUser.name}`,
								templateName: 'welcomeUser',
								lang: get(systemLanguage),
								props: {
									username: googleUser.name || '',
									email,
									hostLink: publicEnv.HOST_LINK || `https://${request.headers.get('host')}`
								}
							})
						});

						return [user, false];
					} else {
						return [null, true];
					}
				};

				const [user, needSignIn] = await getUser();

				if (!needSignIn && user && user._id) {
					// Create session and set cookie
					const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
					const session = await auth.createSession({ user_id: user._id, expires: expiresAt });

					const sessionCookie = auth.createSessionCookie(session);
					cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

					await auth.updateUserAttributes(user._id, { lastAuthMethod: 'google' });

					const redirectPath = await fetchAndRedirectToFirstCollection();
					throw redirect(303, redirectPath);
				}

				return { needSignIn };
			} catch (error) {
				const err = error as Error;
				logger.error(`Error during login process: ${err.message}`);
				throw Error(`Error during login process: ${err.message}`);
			}
		}

		// SignIn
		const loginForm = await superValidate(wrappedLoginSchema);
		const forgotForm = await superValidate(wrappedForgotSchema);
		const resetForm = await superValidate(wrappedResetSchema);
		const signUpForm = await superValidate(wrappedSignUpSchema);

		// Return Data & Forms in load
		return {
			firstUserExists,
			loginForm,
			forgotForm,
			resetForm,
			signUpForm
		};
	} catch (error) {
		const err = error as Error;
		logger.error(`Error in load function: ${err.message}`);

		// Return a minimal set of data to allow the page to render
		// Default to showing login form (firstUserExists = true) to be safe
		return {
			firstUserExists: true,
			loginForm: await superValidate(wrappedLoginSchema),
			forgotForm: await superValidate(wrappedForgotSchema),
			resetForm: await superValidate(wrappedResetSchema),
			signUpForm: await superValidate(wrappedSignUpSchema),
			error: 'Authentication system is not available. Please try again later.'
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
			return fail(503, { message: 'Authentication system is not ready. Please try again in a moment.' });
		}

		logger.debug('action signUp');
		// Use locals.isFirstUser if available, otherwise fallback to getUserCount
		let isFirst = event.locals.isFirstUser || false;
		if (!event.locals.isFirstUser && typeof auth.getUserCount === 'function') {
			try {
				isFirst = (await auth.getUserCount()) === 0;
			} catch (err) {
				logger.error('Error fetching user count:', err);
				return fail(500, { message: 'An error occurred while processing your request.' });
			}
		}

		const signUpForm = await superValidate(event, wrappedSignUpSchema);

		// Validate
		const username = signUpForm.data.username;
		const email = signUpForm.data.email.toLowerCase().trim();
		const password = signUpForm.data.password;
		const token = signUpForm.data.token;

		const user = await auth.checkUser({ email });

		let resp: { status: boolean; message?: string; user?: User } = { status: false };

		if (user && user.isRegistered) {
			// Finished account exists
			return { form: signUpFormSchema, message: 'This email is already registered' };
		} else if (isFirst) {
			// No account exists signUp for admin
			resp = await FirstUsersignUp(username, email, password, event.cookies);
		} else if (user && user.isRegistered == false) {
			// Unfinished account exists
			resp = await finishRegistration(username, email, password, token, event.cookies);
		} else if (!user && !isFirst) {
			resp = { status: false, message: 'This user was not defined by admin' };
		}

		if (resp.status && resp.user) {
			logger.debug(`resp: ${JSON.stringify(resp)}`);

			// Send welcome email
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email,
					subject: `New registration for ${username}`,
					message: `Welcome ${username} to ${publicEnv.SITE_NAME}`,
					templateName: 'welcomeUser',
					props: {
						username,
						email,
						hostLink: publicEnv.HOST_LINK || `https://${event.request.headers.get('host')}`
					}
				})
			});

			// Create session and set cookie
			await createSessionAndSetCookie(resp.user._id, event.cookies);

			// Return message if form is submitted successfully
			message(signUpForm, 'SignUp User form submitted');

			// Fetch collections and redirect to the first one if available
			const redirectPath = await fetchAndRedirectToFirstCollection();
			throw redirect(303, redirectPath);
		} else {
			logger.warn(`Sign-up failed: ${resp.message}`);
			return { form: signUpForm, message: resp.message || 'Unknown error' };
		}
	},

	// OAuth Sign-Up
	OAuth: async (event) => {
		const form = await superValidate(event.request, wrappedSignUpOAuthSchema);

		if (!form.valid) {
			logger.debug(`Sign-up OAuth failed: ${form.message}`);
			return { form };
		}

		// Check if Google OAuth is enabled
		if (!privateEnv.USE_GOOGLE_OAUTH) {
			redirect(303, '/login');
		}

		// Rate limiting check
		const rateLimitResult = await limiter.isLimited(event);
		if (rateLimitResult) {
			logger.info(`Rate limiting failed: ${rateLimitResult}`);
			return {
				form,
				error: rateLimitResult
			};
		}
		const authUrl = await generateGoogleAuthUrl(null, 'none');
		redirect(303, authUrl);
	},

	// Function for handling the SignIn form submission and user authentication
	signIn: async (event) => {
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Ensure database initialization is complete
		await dbInitPromise;

		// Wait for auth service to be ready
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for signIn action');
			return fail(503, { message: 'Authentication system is not ready. Please try again in a moment.' });
		}

		const signInForm = await superValidate(event, wrappedLoginSchema);

		// Validate
		if (!signInForm.valid) return fail(400, { signInForm });

		const email = signInForm.data.email.toLowerCase();
		const password = signInForm.data.password;
		const isToken = signInForm.data.isToken;

		const resp = await signIn(email, password, isToken, event.cookies);

		if (resp && resp.status) {
			// Return message if form is submitted successfully
			message(signInForm, 'SignIn form submitted');

			// Fetch collections and redirect to the first one if available
			const redirectPath = await fetchAndRedirectToFirstCollection();
			throw redirect(303, redirectPath);
		} else {
			// Handle the case when resp is undefined or when status is false
			const errorMessage = resp?.message || 'An error occurred during sign-in.';
			logger.warn(`Sign-in failed: ${errorMessage}`);
			return { form: signInForm, message: errorMessage };
		}
	},

	// Function for handling the Forgotten Password
	forgotPW: async (event) => {
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Ensure database initialization is complete
		await dbInitPromise;

		// Wait for auth service to be ready
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for forgotPW action');
			return fail(503, { message: 'Authentication system is not ready. Please try again in a moment.' });
		}

		const pwforgottenForm = await superValidate(event, wrappedForgotSchema);
		logger.debug(`pwforgottenForm: ${JSON.stringify(pwforgottenForm)}`);

		// Validate
		let resp: { status: boolean; message?: string } = { status: false };
		const email = pwforgottenForm.data.email.toLowerCase().trim();
		const checkMail = await forgotPWCheck(email);

		if (email && checkMail.success) {
			// Email format is valid and email exists in DB
			resp = { status: true, message: checkMail.message };
		} else if (email && !checkMail.success) {
			// Email format is valid but email doesn't exist in DB
			resp = { status: false, message: checkMail.message };
		} else if (!email && !checkMail) {
			// Email format invalid and email doesn't exist in DB
			resp = { status: false, message: 'Invalid Email' };
		}

		if (resp.status) {
			// Get the token from the checkMail result
			const token = checkMail.token;
			const expiresIn = checkMail.expiresIn;
			// Define token resetLink
			const baseUrl = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;
			const resetLink = `${baseUrl}/login?token=${token}&email=${email}`;
			logger.debug(`resetLink: ${resetLink}`);

			// Send welcome email
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email,
					subject: 'Forgotten Password',
					message: 'Forgotten Password',
					templateName: 'forgottenPassword',
					props: {
						email,
						token,
						expiresIn,
						resetLink
					}
				})
			});

			// Return message if form is submitted successfully
			message(pwforgottenForm, 'SignIn Forgotten form submitted');
			return { form: pwforgottenForm, token, email };
		} else {
			logger.warn(`Forgotten password failed: ${resp.message}`);
			return {
				form: pwforgottenForm,
				status: checkMail.success,
				message: resp.message || 'Unknown error'
			};
		}
	},

	// Function for handling the RESET
	resetPW: async (event) => {
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		// Ensure database initialization is complete
		await dbInitPromise;

		// Wait for auth service to be ready
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger.error('Authentication system is not ready for resetPW action');
			return fail(503, { message: 'Authentication system is not ready. Please try again in a moment.' });
		}

		const pwresetForm = await superValidate(event, wrappedResetSchema);

		// Validate form
		if (!pwresetForm.valid) {
			return fail(400, { form: pwresetForm });
		}

		// Normalize and decode data - ensure email is lowercase and trimmed
		const password = pwresetForm.data.password;
		const token = pwresetForm.data.token;
		const email = pwresetForm.data.email.toLowerCase().trim();

		// Define expiresIn
		const expiresIn = 1 * 60 * 60; // expiration in 1 hour

		const resp = await resetPWCheck(password, token, email, expiresIn);
		logger.debug(`resetPW resp: ${JSON.stringify(resp)}`);

		if (resp.status) {
			// Return message if form is submitted successfully
			message(pwresetForm, 'SignIn Reset form submitted');
			throw redirect(303, '/login');
		} else {
			logger.warn(`Password reset failed: ${resp.message}`);
			return { form: pwresetForm, message: resp.message };
		}
	}
};

// Helper function to Create session and set cookie
async function createSessionAndSetCookie(user_id: string, cookies: Cookies): Promise<void> {
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

	if (!auth) throw Error('Auth is not initialized');

	const session = await auth.createSession({
		user_id,
		expires: expiresAt
	});

	logger.debug(`Session created: ${JSON.stringify(session)}`);
	const sessionCookie = auth.createSessionCookie(session);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
}

// SignIn user with email and password, create session and set cookie
async function signIn(
	email: string,
	password: string,
	isToken: boolean,
	cookies: Cookies
): Promise<{ status: boolean; message?: string; user?: User }> {
	logger.debug(`signIn called with email: ${email}, isToken: ${isToken}`);

	if (!auth) {
		logger.error('Auth system not initialized');
		return { status: false, message: 'Authentication system unavailable' };
	}

	try {
		let user: User | null;
		if (!isToken) {
			user = await auth.login(email, password);
		} else {
			const token = password;
			user = await auth.checkUser({ email });
			if (!user) {
				logger.warn('User does not exist');
				return { status: false, message: 'User does not exist' };
			}
			const result = await auth.consumeToken(token, user._id);
			if (!result.status) {
				logger.warn(`Token consumption failed: ${result.message}`);
				return { status: false, message: result.message };
			}
		}

		if (!user || !user._id) {
			logger.warn(`User does not exist or login failed. User object: ${JSON.stringify(user)}`);
			return { status: false, message: 'Invalid credentials' };
		}

		// Create User Session
		const session = await auth.createSession({ user_id: user._id });
		const sessionCookie = auth.createSessionCookie(session);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

		await auth.updateUserAttributes(user._id, { lastAuthMethod: isToken ? 'token' : 'password' });

		logger.info(`User logged in: ${user._id}`);
		return { status: true, message: 'Login successful', user };
	} catch (error) {
		const err = error as Error;
		logger.error(`Login error: ${err.message}`);
		throw Error(`Login error: ${err.message}`);
	}
}

// Function create First admin USER account and creating a session.
async function FirstUsersignUp(username: string, email: string, password: string, cookies: Cookies) {
	logger.debug(`FirstUsersignUp called with username: ${username}, email: ${email}`);

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	try {
		// Check if a user already exists (fallback check)
		if (typeof auth.getUserCount === 'function') {
			const userCount = await auth.getUserCount();
			if (userCount > 0) {
				logger.warn('Attempted to create first user when users already exist');
				return { status: false, message: 'An admin user already exists' };
			}
		}

		const adminRole = roles.find((role) => role.isAdmin === true);
		if (!adminRole) {
			logger.error('Admin role not found in roles configuration');
			throw Error('Admin role not found in roles configuration');
		}

		// Check password strength
		const passwordStrength = calculatePasswordStrength(password);
		if (passwordStrength < 1) {
			return { status: false, message: 'Password is too weak. Please choose a stronger password.' };
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
			logger.error('User creation failed: No user returned or missing _id');
			return { status: false, message: 'Failed to create user' };
		}

		// Create User Session
		await createSessionAndSetCookie(user._id, cookies);

		return { status: true, message: 'User created successfully', user: user };
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to create first user: ${err.message}`);
		throw Error(`Failed to create first user: ${err.message}`);
	}
}

// Function create a new OTHER USER account and creating a session.
async function finishRegistration(username: string, email: string, password: string, token: string, cookies: Cookies) {
	logger.debug(`finishRegistration called with username: ${username}, email: ${email}`);
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}
	const user = await auth.checkUser({ email });

	if (!user) return { status: false, message: 'User does not exist' };

	const result = await auth.consumeToken(token, user._id);

	if (result.status) {
		await auth.updateUserAttributes(user._id, {
			username,
			password,
			lastAuthMethod: 'password',
			isRegistered: true
		});

		// Create User Session
		await createSessionAndSetCookie(user._id.toString(), cookies);

		return { status: true };
	} else {
		logger.warn(`Token consumption failed: ${result.message}`);
		return result;
	}
}

interface ForgotPWCheckResult {
	status?: boolean;
	success?: boolean;
	message: string;
	token?: string;
	expiresIn?: Date;
}

// Function for handling the Forgotten Password
async function forgotPWCheck(email: string): Promise<ForgotPWCheckResult> {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const expiresIn = 1 * 60 * 60; // expiration in 1 hour
		const user = await auth.checkUser({ email });

		// The email address does not exist
		if (!user) return { success: false, message: 'User does not exist' };

		// Create a new token
		const expiresAt = new Date(Date.now() + expiresIn * 1000);
		const token = await auth.createToken(user._id.toString(), expiresAt);

		return {
			success: true,
			message: 'Password reset token sent by Email',
			token,
			expiresIn: expiresAt
		};
	} catch (error) {
		const err = error as Error;
		logger.error(`Check Forgotten Password failed: ${err.message}`);
		throw Error(`Check Forgotten Password failed: ${err.message}`);
	}
}

// Function for handling the RESET Password
async function resetPWCheck(password: string, token: string, email: string, expiresIn: number) {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Obtain the user using auth.checkUser based on the email
		const user = await auth.checkUser({ email });
		if (!user) {
			logger.warn('Invalid token: User does not exist');
			return { status: false, message: 'Invalid token' };
		}

		// Consume the token
		const validate = await auth.consumeToken(token, user._id.toString());

		if (validate.status) {
			// Check token expiration
			const currentTime = new Date();
			const expirationTime = new Date(currentTime.getTime() + expiresIn * 1000);
			if (currentTime >= expirationTime) {
				logger.warn('Token has expired');
				return { status: false, message: 'Token has expired' };
			}

			// Check password strength
			const passwordStrength = calculatePasswordStrength(password);
			if (passwordStrength < 1) {
				return {
					status: false,
					message: 'Password is too weak. Please choose a stronger password.'
				};
			}

			// Token is valid and not expired, proceed with password update
			auth.invalidateAllUserSessions(user._id.toString()); // Invalidate all user sessions
			const updateResult = await auth.updateUserPassword(email, password); // Pass the email and password

			if (updateResult.status) {
				return { status: true };
			} else {
				logger.warn(`Password update failed: ${updateResult.message}`);
				return { status: false, message: updateResult.message };
			}
		} else {
			logger.warn(`Token consumption failed: ${validate.message}`);
			return { status: false, message: validate.message };
		}
	} catch (error) {
		const err = error as Error;
		logger.error(`Password reset failed: ${err.message}`);
		throw Error(`Password reset failed: ${err.message}`);
	}
}
