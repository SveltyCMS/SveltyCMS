import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

import { dev } from '$app/environment';
import { error, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Superforms
import { fail, message, superValidate } from 'sveltekit-superforms';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema, signUpOAuthFormSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Auth
import { auth, googleAuth, initializationPromise } from '@api/databases/db';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Store
import { systemLanguage } from '@stores/store';
import { get } from 'svelte/store';

// Import logger
import { logger } from '@src/utils/logger';

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	await initializationPromise; // Ensure initialization is complete
	const code = url.searchParams.get('code');
	logger.debug(`Authorization code: ${code}`);

	if (privateEnv.USE_GOOGLE_OAUTH && code) {
		// Google OAuth flow
		logger.debug('Entering OAuth flow in load function');
		try {
			if (!auth || !googleAuth) {
				throw new Error('Authentication system is not initialized');
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
					throw new Error('Google did not return an email address.');
				}

				const existingUser = await auth!.checkUser({ email });
				if (existingUser) return [existingUser, false];

				const username = googleUser.name ?? '';
				const isFirst = (await auth!.getUserCount()) === 0;

				if (isFirst) {
					const user = await auth!.createUser({
						email,
						username,
						role: 'admin',
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
				const session = await auth!.createSession({ user_id: user._id!, expires: 3600000 });
				const sessionCookie = auth!.createSessionCookie(session);
				cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
				await auth!.updateUserAttributes(user._id!, { lastAuthMethod: 'google' });

				throw redirect(303, '/');
			}

			return { needSignIn };
		} catch (err) {
			logger.error('Error during login process:', err);
			return { error: 'An error occurred during the login process. Please try again.' };
		}
	}

	// Default email/password authentication flow
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw new Error('Internal Server Error');
	}

	// Check if first user exists
	const firstUserExists = (await auth.getUserCount()) !== 0;

	// SignIn
	const loginForm = await superValidate(zod(loginFormSchema));
	const forgotForm = await superValidate(zod(forgotFormSchema));
	const resetForm = await superValidate(zod(resetFormSchema));
	const signUpForm = firstUserExists
		? await superValidate(zod(signUpFormSchema.innerType().omit({ token: true })))
		: await superValidate(zod(signUpFormSchema));

	// Always return Data & all Forms in load and form actions.
	return {
		firstUserExists,
		loginForm,
		forgotForm,
		resetForm,
		signUpForm
	};
};

// Actions for SignIn and SignUp a user with form data
export const actions: Actions = {
	// Handling the Sign-Up form submission and user creation
	signUp: async (event) => {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		logger.debug('action signUp');
		const isFirst = (await auth.getUserCount()) == 0;
		const signUpForm = await superValidate(event, zod(signUpFormSchema));

		// Validate
		const username = signUpForm.data.username;
		const email = signUpForm.data.email.toLowerCase();
		const password = signUpForm.data.password;
		const token = signUpForm.data.token;

		const user = await auth.checkUser({ email });

		let resp: { status: boolean; message?: string } = { status: false };

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

		if (resp.status) {
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

			// Return message if form is submitted successfully
			message(signUpForm, 'SignUp User form submitted');
			throw redirect(303, '/');
		} else {
			logger.warn(`Sign-up failed: ${resp.message}`);
			return { form: signUpForm, message: resp.message || 'Unknown error' };
		}
	},

	// OAuth Sign-Up
	OAuth: async (event) => {
		logger.debug('OAuth action called');

		const signUpOAuthForm = await superValidate(event, zod(signUpOAuthFormSchema));
		logger.debug(`signUpOAuthForm: ${JSON.stringify(signUpOAuthForm)}`);

		const lang = signUpOAuthForm.data.lang;
		logger.debug(`lang: ${lang}`);

		const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];

		try {
			const redirectUrl = googleAuth!.generateAuthUrl({
				access_type: 'offline',
				scope: scopes,
				redirect_uri: 'http://localhost:5173/login/oauth' // Make sure this matches your Google OAuth settings
			});
			logger.debug(`Generated redirect URL: ${redirectUrl}`);

			if (!redirectUrl) {
				logger.error('Error during OAuth callback: Redirect URL not generated');
				throw error(500, 'Failed to generate redirect URL.');
			} else {
				logger.debug(`Redirecting to: ${redirectUrl}`);
				throw redirect(307, redirectUrl);
			}
		} catch (err) {
			logger.error(`Error in OAuth action: ${err}`);
			throw error(500, 'An error occurred during OAuth initialization');
		}
	},

	// Function for handling the SignIn form submission and user authentication
	signIn: async (event) => {
		const signInForm = await superValidate(event, zod(loginFormSchema));

		// Validate
		if (!signInForm.valid) return fail(400, { signInForm });

		const email = signInForm.data.email.toLowerCase();
		const password = signInForm.data.password;
		const isToken = signInForm.data.isToken;

		const resp = await signIn(email, password, isToken, event.cookies);

		if (resp && resp.status) {
			// Return message if form is submitted successfully
			message(signInForm, 'SignIn form submitted');
			throw redirect(303, '/');
		} else {
			// Handle the case when resp is undefined or when status is false
			const errorMessage = resp?.message || 'An error occurred during sign-in.';
			logger.warn(`Sign-in failed: ${errorMessage}`);
			return { form: signInForm, message: errorMessage };
		}
	},

	// Function for handling the Forgotten Password
	forgotPW: async (event) => {
		const pwforgottenForm = await superValidate(event, zod(forgotFormSchema));
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
		logger.debug('resetPW');
		const pwresetForm = await superValidate(event, zod(resetFormSchema));

		// Validate
		const password = pwresetForm.data.password;
		const token = pwresetForm.data.token;
		const email = pwresetForm.data.email;

		// Define expiresIn
		const expiresIn = 1 * 60 * 60; // expiration in 1 hours

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

// SignIn user with email and password, create session and set cookie
async function signIn(
	email: string,
	password: string,
	isToken: boolean,
	cookies: Cookies
): Promise<{ status: true } | { status: false; message: string }> {
	logger.debug(`signIn called with email: ${email}, password: ${password}, isToken: ${isToken}`);

	if (!isToken) {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.login(email, password);
		logger.debug(`User returned from login: ${JSON.stringify(user)}`);

		if (!user || !user._id) {
			logger.warn(`User does not exist or login failed. User object: ${JSON.stringify(user)}`);
			return { status: false, message: 'Invalid credentials' };
		}

		// Create User Session
		try {
			logger.debug(`Attempting to create session for user_id: ${user._id}`);
			const session = await auth.createSession({ user_id: user._id });
			logger.debug(`Session created: ${JSON.stringify(session)}`);
			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth.updateUserAttributes(user._id, { lastAuthMethod: 'password' });

			return { status: true };
		} catch (error) {
			logger.error(`Failed to create session: ${error}`);
			return { status: false, message: 'Failed to create session' };
		}
	} else {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// User is registered, and credentials are provided as a token
		const token = password;
		const user = await auth.checkUser({ email });

		if (!user) {
			logger.warn('User does not exist');
			return { status: false, message: 'User does not exist' };
		}

		const result = await auth.consumeToken(token, user._id);

		if (result.status) {
			// Create User Session
			const session = await auth.createSession({ user_id: user._id });

			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth.updateUserAttributes(user._id, { lastAuthMethod: 'token' });
			return { status: true };
		} else {
			logger.warn(`Token consumption failed: ${result.message}`);
			return result;
		}
	}
}

// Function create a new OTHER USER account and creating a session.
async function FirstUsersignUp(username: string, email: string, password: string, cookies: Cookies) {
	logger.debug(`FirstUsersignUp called with username: ${username}, email: ${email}, password: ${password}, cookies: ${JSON.stringify(cookies)}`);
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}
	const user = await auth.createUser({
		password,
		email,
		username,
		role: 'admin',
		lastAuthMethod: 'password',
		isRegistered: true
	});

	if (!user) {
		logger.error('User creation failed');
		return { status: false, message: 'User does not exist' };
	}

	// Create User Session
	const session = await auth.createSession({ user_id: user._id, expires: 3600000 }); // Ensure expires is provided
	if (!session || !session.session_id) {
		logger.error('Session creation failed');
		return { status: false, message: 'Failed to create session' };
	}
	logger.info(`Session created with ID: ${session.session_id} for user ID: ${user._id}`);

	// Create session cookie and set it
	const sessionCookie = auth.createSessionCookie(session);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

	return { status: true };
}

// Function create a new OTHER USER account and creating a session.
async function finishRegistration(username: string, email: string, password: string, token: string, cookies: Cookies) {
	logger.debug(`finishRegistration called with username: ${username}, email: ${email}, password: ${password}`);
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
		const session = await auth.createSession({ user_id: user._id.toString() });
		const sessionCookie = auth.createSessionCookie(session);
		// Set the credentials cookie
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

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
	expiresIn?: number;
}

// Function for handling the Forgotten Password
async function forgotPWCheck(email: string): Promise<ForgotPWCheckResult> {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const expiresIn = 1 * 60 * 60 * 1000; // expiration in 1 hours
		const user = await auth.checkUser({ email });

		// The email address does not exist
		if (!user) return { success: false, message: 'User does not exist' };

		// Create a new token
		const token = await auth.createToken(user._id.toString(), expiresIn);

		return { success: true, message: 'Password reset token sent by Email', token, expiresIn };
	} catch (err: any) {
		logger.error('An error occurred:', err);
		return { success: false, message: 'An error occurred' };
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
			const currentTime = Date.now();
			const tokenExpiryTime = currentTime + expiresIn * 1000; // Convert expiresIn to milliseconds
			if (currentTime >= tokenExpiryTime) {
				logger.warn('Token has expired');
				return { status: false, message: 'Token has expired' };
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
	} catch (err: any) {
		logger.error('Password reset failed:', err);
		return { status: false, message: 'An error occurred' };
	}
}
