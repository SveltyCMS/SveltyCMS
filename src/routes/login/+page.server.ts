import { dev } from '$app/environment';
import { error, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Superforms
import { fail, message, superValidate } from 'sveltekit-superforms';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema, signUpOAuthFormSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Auth
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import { auth, googleAuth } from '@api/databases/db';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Store
import { systemLanguage } from '@stores/store';
import { get } from 'svelte/store';

// Import logger
import logger from '@utils/logger';

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	const code = url.searchParams.get('code');
	// logger.debug('Authorization code:', code);
	console.log('Authorization code:', code);

	const result: Result = {
		errors: [],
		success: true,
		message: '',
		data: {
			needSignIn: false
		}
	};

	if (!code) {
		logger.error('Authorization code is missing');
		throw redirect(302, '/login');
	}

	if (!auth || !googleAuth) {
		logger.error('Authentication system is not initialized');
		throw new Error('Internal Server Error');
	}

	try {
		if (code && privateEnv.USE_GOOGLE_OAUTH) {
			const { tokens } = await googleAuth.getToken(code);
			googleAuth.setCredentials(tokens);
			const oauth2 = google.oauth2({ auth: googleAuth, version: 'v2' });

			const { data: googleUser } = await oauth2.userinfo.get();
			console.log('Google user information:', googleUser);
			// logger.debug('Google user information:', googleUser);

			const getUser = async (): Promise<[User | null, boolean]> => {
				if (!auth) {
					logger.error('Authentication system is not initialized');
					throw error(500, 'Authentication system not initialized.');
				}

				const email = googleUser.email;
				if (!email) {
					throw new Error('Google did not return an email address.');
				}

				const existingUser = await auth.checkUser({ email });
				if (existingUser) return [existingUser, false];

				const username = googleUser.name ?? '';

				const isFirst = (await auth.getUserCount()) === 0;

				if (isFirst) {
					const user = await auth.createUser({
						email,
						username,
						role: 'admin',
						blocked: false
					});

					await fetch('/api/sendMail', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							email,
							subject: `New registration ${googleUser.name}`,
							message: `New registration ${googleUser.name}`,
							templateName: 'welcomeUser',
							lang: get(systemLanguage),
							props: {
								username: googleUser.name ?? '',
								email
							}
						})
					});

					return [user, false];
				} else {
					return [null, true];
				}
			};

			const [user, needSignIn] = await getUser();

			if (!needSignIn) {
				if (!user) {
					logger.error('User not found after getting user information.');
					throw new Error('User not found.');
				}
				if (user.blocked) {
					logger.warn('User is blocked.');
					return { status: false, message: 'User is blocked' };
				}

				if (!auth) {
					logger.error('Authentication system is not initialized');
					throw error(500, 'Internal Server Error');
				}

				// Create User Session
				const session = await auth.createSession({ user_id: user.user_id, expires: 3600000 });
				const sessionCookie = auth.createSessionCookie(session);
				cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
				await auth.updateUserAttributes(user.user_id, { lastAuthMethod: 'google' });
			}
			result.data = { needSignIn };
		} else {
			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			// Check if first user exist
			const firstUserExists = (await auth.getUserCount()) != 0;

			// Different schemas, so no id required.

			// SignIn
			const loginForm = await superValidate(zod(loginFormSchema));
			const forgotForm = await superValidate(zod(forgotFormSchema));
			const resetForm = await superValidate(zod(resetFormSchema));

			// SignUp FirstUser
			const withoutToken = await superValidate(zod(signUpFormSchema.innerType().omit({ token: true })));
			// SignUp Other Users
			const withToken = await superValidate(zod(signUpFormSchema));

			// Check if first user exist
			const signUpForm: typeof withToken = (await auth.getUserCount()) != 0 ? (withoutToken as any) : withToken;

			// Always return Data & all Forms in load and form actions.
			return {
				//resetData, // Check if the URL has the token and email parameters

				firstUserExists, // Check if first user exist

				// SignIn Page
				loginForm,
				forgotForm,
				resetForm,

				// SignUp Page
				signUpForm
			};
		}
	} catch (error) {
		logger.error('Error during login process:', error as Error);
		throw redirect(302, '/login');
	}

	if (!result.data.needSignIn) throw redirect(303, '/');
	return result;
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
			console.log('resp', resp);
			// logger.debug('resp', resp);
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
			redirect(303, '/');
		} else {
			return { form: signUpForm, message: resp.message || 'Unknown error' };
		}
	},

	// OAuth Sign-Up
	OAuth: async (event) => {
		logger.debug('OAuth call');
		const signUpOAuthForm = await superValidate(event, zod(signUpOAuthFormSchema));
		console.log('signUpOAuthForm', signUpOAuthForm);
		// logger.debug('signUpOAuthForm', signUpOAuthForm);
		const lang = signUpOAuthForm.data.lang;
		console.log('lang', lang);
		//logger.debug('lang', lang);

		const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];

		const redirectUrl = googleAuth.generateAuthUrl({ access_type: 'offline', scope: scopes });
		if (!redirectUrl) {
			logger.error('Error during OAuth callback: Redirect url not generated');
		} else {
			redirect(307, redirectUrl);
		}
	},

	// Function for handling the SignIn form submission and user authentication
	signIn: async (event) => {
		const signInForm = await superValidate(event, zod(loginFormSchema));

		// Validate
		if (!signInForm.valid) return fail(400, { signInForm });

		const email = signInForm.data.email.toLocaleLowerCase();
		const password = signInForm.data.password;
		const isToken = signInForm.data.isToken;

		const resp = await signIn(email, password, isToken, event.cookies);

		if (resp && resp.status) {
			// Return message if form is submitted successfully
			message(signInForm, 'SignIn form submitted');
			redirect(303, '/');
		} else {
			// Handle the case when resp is undefined or when status is false
			const errorMessage = resp?.message || 'An error occurred during sign-in.';
			return { form: signInForm, message: errorMessage };
		}
	},

	// Function for handling the Forgotten Password
	forgotPW: async (event) => {
		const pwforgottenForm = await superValidate(event, zod(forgotFormSchema));
		console.log('pwforgottenForm', pwforgottenForm);
		//logger.debug('pwforgottenForm', pwforgottenForm);

		// Validate
		let resp: { status: boolean; message?: string } = { status: false };
		const email = pwforgottenForm.data.email.toLocaleLowerCase();
		const checkMail = await forgotPWCheck(email);
		// const lang = pwforgottenForm.data.lang;

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
			console.log('resetLink', resetLink);
			// logger.debug('resetLink', resetLink);
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
						// lang: lang
					}
				})
			});

			// Return message if form is submitted successfully
			message(pwforgottenForm, 'SignIn Forgotten form submitted');
			return { form: pwforgottenForm, token, email };
		} else {
			logger.debug('resp.status is false');
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
		// const lang = pwresetForm.data.lang;

		// Define expiresIn
		const expiresIn = 1 * 60 * 60; // expiration in 1 hours

		const resp = await resetPWCheck(password, token, email, expiresIn);
		console.log('resetPW resp', resp);
		//logger.debug('resetPW resp', resp);
		if (resp) {
			// Return message if form is submitted successfully
			message(pwresetForm, 'SignIn Reset form submitted');
			redirect(303, '/login');
		} else {
			return { form: pwresetForm };
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
	// logger.debug('signIn called', email, password, isToken, cookies);

	if (!isToken) {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.login(email, password);

		if (!user) {
			return { status: false, message: 'User does not exist' };
		}

		// Create User Session
		const session = await auth.createSession({ user_id: user.user_id });
		const sessionCookie = auth.createSessionCookie(session);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
		await auth.updateUserAttributes(user.user_id, { lastAuthMethod: 'password' });

		return { status: true };
	} else {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// User is registered, and credentials are provided as a token
		const token = password;
		const user = await auth.checkUser({ email });

		if (!user) {
			return { status: false, message: 'User does not exist' };
		}

		const result = await auth.consumeToken(token, user.user_id);

		if (result.status) {
			// Create User Session
			const session = await auth.createSession({ user_id: user.user_id });

			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth.updateUserAttributes(user.user_id, { lastAuthMethod: 'token' });
			return { status: true };
		} else {
			return result;
		}
	}
}

async function FirstUsersignUp(username: string, email: string, password: string, cookies: Cookies) {
	// logger.debug('FirstUsersignUp called', username, email, password, cookies);
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
	const session = await auth.createSession({ user_id: user.user_id.toString() });
	// Create session cookie and set it
	const sessionCookie = auth.createSessionCookie(session);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

	return { status: true };
}

// Function create a new OTHER USER account and creating a session.
async function finishRegistration(username: string, email: string, password: string, token: string, cookies: Cookies) {
	// logger.debug('finishRegistration called', username, email, token);
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}
	const user = await auth.checkUser({ email });

	if (!user) return { status: false, message: 'User does not exist' };

	const result = await auth.consumeToken(token, user.user_id);

	if (result.status) {
		await auth.updateUserAttributes(user.user_id, {
			username,
			password,
			lastAuthMethod: 'password',
			isRegistered: true
		});

		// Create User Session
		const session = await auth.createSession({ user_id: user.user_id.toString() });
		const sessionCookie = auth.createSessionCookie(session);
		// Set the credentials cookie
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

		return { status: true };
	} else {
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
		const token = await auth.createToken(user.user_id.toString(), expiresIn);

		return { success: true, message: 'Password reset token sent by Email', token: token, expiresIn: expiresIn };
	} catch (error) {
		logger.error('An error occurred:', error as Error);
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
			return { status: false, message: 'Invalid token' };
		}

		// Consume the token
		const validate = await auth.consumeToken(token, user.user_id.toString());

		if (validate.status) {
			// Check token expiration
			const currentTime = Date.now();
			const tokenExpiryTime = currentTime + expiresIn * 1000; // Convert expiresIn to milliseconds
			if (currentTime >= tokenExpiryTime) {
				return { status: false, message: 'Token has expired' };
			}

			// Token is valid and not expired, proceed with password update
			auth.invalidateAllUserSessions(user.user_id.toString()); // Invalidate all user sessions
			const updateResult = await auth.updateUserPassword(email, password); // Pass the email and password

			if (updateResult.status) {
				return { status: true };
			} else {
				return { status: false, message: updateResult.message };
			}
		} else {
			return { status: false, message: validate.message };
		}
	} catch (error) {
		logger.error('Password reset failed:', error as Error);
		return { status: false, message: 'An error occurred' };
	}
}
