/**
 * @file src/routes/login/+page.server.ts
 * @description Server-side logic for the login page.
 */

import { privateEnv } from '@root/config/private';
import { publicEnv } from '@root/config/public';

import { dev } from '$app/environment';
import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Superforms
import { fail, message, superValidate } from 'sveltekit-superforms';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema, signUpOAuthFormSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';

// Auth
import { auth, initializationPromise } from '@src/databases/db';
import { googleAuth } from '@root/src/auth/googleAuth';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';
import type { Cookies } from '@sveltejs/kit';

// Stores
import { get } from 'svelte/store';
import { systemLanguage } from '@stores/store';

// Import roles
import { roles } from '@root/config/roles';

// System Logs
import { logger } from '@utils/logger';

const limiter = new RateLimiter({
	IP: [200, 'h'], // 200 requests per hour per IP
	IPUA: [100, 'm'], // 100 requests per minute per IP+User-Agent
	cookie: {
		name: 'sveltycms_ratelimit',
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

// Helper function to fetch and redirect to the first collection
async function fetchAndRedirectToFirstCollection() {
	try {
		const { collections } = collectionManager.getCollectionData();
		// logger.debug('Fetched collections:', collections);

		if (collections && collections.length > 0) {
			const firstCollection = collections[0];
			if (firstCollection && firstCollection.name) {
				logger.info(`Redirecting to first collection: ${firstCollection.name}`);
				return `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection.name}`;
			} else {
				logger.warn('First collection found but name is missing', firstCollection);
			}
		} else {
			logger.warn('No collections found');
		}
		return '/'; // Redirect to home if no collections are found
	} catch (err) {
		logger.error('Error fetching collections:', err);
		return '/'; // Redirect to home in case of error
	}
}

export const load: PageServerLoad = async ({ url, cookies, fetch, request, locals }) => {
	try {
		// Ensure initialization is complete
		await initializationPromise;

		// Check if the auth object is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw Error('Authentication system is not initialized');
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

		// Check if the getUserCount method is available and callable
		if (typeof auth.getUserCount !== 'function') {
			logger.warn('getUserCount method is not available on auth object');
			throw error(500, 'Authentication system is not available');
		}

		// Check if the first user exists in the database
		let firstUserExists = false;
		try {
			firstUserExists = (await auth.getUserCount()) !== 0;
			logger.debug(`First user exists: ${firstUserExists}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching user count: ${err.message}`);
			throw Error(`Error fetching user count: ${err.message}`);
		}

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code: ${code}`);

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
					const isFirst = (await auth.getUserCount()) === 0;

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
								props: { username: googleUser.name || '', email }
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
					logger.debug(`Session created: ${JSON.stringify(session)}`);

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
		const loginForm = await superValidate(valibot(loginFormSchema));
		const forgotForm = await superValidate(valibot(forgotFormSchema));
		const resetForm = await superValidate(valibot(resetFormSchema));
		const signUpForm = await superValidate(valibot(signUpFormSchema));

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
		return {
			firstUserExists: false,
			loginForm: await superValidate(valibot(loginFormSchema)),
			forgotForm: await superValidate(valibot(forgotFormSchema)),
			resetForm: await superValidate(valibot(resetFormSchema)),
			signUpForm: await superValidate(valibot(signUpFormSchema)),
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

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		logger.debug('action signUp');
		let isFirst = false;
		try {
			isFirst = (await auth.getUserCount()) === 0;
		} catch (err) {
			logger.error('Error fetching user count:', err);
			return fail(500, { message: 'An error occurred while processing your request.' });
		}

		const signUpForm = await superValidate(event, valibot(signUpFormSchema));

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
						email
					}
				})
			});

			//
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
		logger.debug('OAuth action called');
		let authUrl = '';

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		try {
			const signUpOAuthForm = await superValidate(event, valibot(signUpOAuthFormSchema));
			logger.debug(`signUpOAuthForm: ${JSON.stringify(signUpOAuthForm)}`);

			const lang = signUpOAuthForm.data.lang;
			logger.debug(`lang: ${lang}`);

			const googleAuthClient = await googleAuth();
			if (!googleAuthClient) {
				logger.error('Google OAuth client is not initialized');
				return fail(500, { message: 'Google OAuth client initialization failed' });
			}

			const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];

			authUrl = googleAuthClient.generateAuthUrl({
				access_type: 'offline',
				scope: scopes.join(' '),
				redirect_uri: `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
				// prompt: 'select_account'
			});

			logger.debug(`Generated redirect URL: ${authUrl}`);

			if (!authUrl) {
				logger.error('Error during OAuth callback: Redirect URL not generated');
				return fail(500, { message: 'Failed to generate redirect URL.' });
			}

			// Invalidate all user sessions before redirecting
			if (auth && event.locals.user) {
				await auth.invalidateAllUserSessions(event.locals.user._id);
			}

			// Redirect to the Google OAuth URL
		} catch (error) {
			const err = error as Error;
			logger.error(`Detailed error in OAuth action: ${err.message}`);
			logger.error(`Error stack: ${err.stack}`);
			return fail(500, { message: `OAuth error: ${err.message}` });
		}

		logger.debug('Redirecting to Google OAuth URL');
		redirect(302, authUrl);
	},

	// Function for handling the SignIn form submission and user authentication
	signIn: async (event) => {
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		const signInForm = await superValidate(event, valibot(loginFormSchema));

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

		const pwforgottenForm = await superValidate(event, valibot(forgotFormSchema));
		logger.debug(`pwforgottenForm: ${JSON.stringify(pwforgottenForm)}`);

		// Validate
		let resp: { status: boolean; message?: string } = { status: false };
		const email = pwforgottenForm.data.email.toLowerCase();
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
			return { form: pwforgottenForm, status: checkMail.success, message: resp.message || 'Unknown error' };
		}
	},

	// Function for handling the RESET
	resetPW: async (event) => {
		logger.debug('resetPW call');

		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}

		const pwresetForm = await superValidate(event, valibot(resetFormSchema));

		// Validate
		const password = pwresetForm.data.password;
		const token = pwresetForm.data.token;
		const email = pwresetForm.data.email;

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
	const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now

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
		// Check if a user already exists
		const userCount = await auth.getUserCount();
		if (userCount > 0) {
			logger.warn('Attempted to create first user when users already exist');
			return { status: false, message: 'An admin user already exists' };
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

		return { success: true, message: 'Password reset token sent by Email', token, expiresIn: expiresAt };
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
				return { status: false, message: 'Password is too weak. Please choose a stronger password.' };
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
