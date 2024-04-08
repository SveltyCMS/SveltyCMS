import { publicEnv } from '@root/config/public.js';
import { type Cookies, redirect } from '@sveltejs/kit';

// Auth
import { auth, googleAuth } from '@api/db';

// Superforms
import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema } from '@utils/formSchemas';

// load and validate login and sign up forms
export const load = async (event) => {
	const firstUserExists = (await auth.getUserCount()) != 0;

	// Different schemas, so no id required.

	// SignIn
	const loginForm = await superValidate(event, zod(loginFormSchema));
	const forgotForm = await superValidate(event, zod(forgotFormSchema));
	const resetForm = await superValidate(event, zod(resetFormSchema));

	// SignUp FirstUser
	const withoutToken = await superValidate(zod(signUpFormSchema.innerType().omit({ token: true })));
	// SignUp Other Users
	const withToken = await superValidate(zod(signUpFormSchema));

	// Check if first user exist
	const signUpForm: typeof withToken = (await auth.getUserCount()) != 0 ? (withoutToken as any) : withToken;

	// Always return all Forms in load and form actions.
	return {
		firstUserExists,

		// SignIn
		loginForm,
		forgotForm,
		resetForm,

		// SignUp
		signUpForm
	};
};

// Actions for SignIn and SignUp a user with form data
export const actions = {
	// Handling the Sign-Up form submission and user creation
	signUp: async (event) => {
		console.log('action signUp');
		const isFirst = (await auth.getUserCount()) == 0;
		const signUpForm = await superValidate(event, zod(signUpFormSchema));

		// Validate
		const username = signUpForm.data.username;
		const email = signUpForm.data.email.toLowerCase();
		const password = signUpForm.data.password;
		const token = signUpForm.data.token;

		const user = await auth.checkUser({ email });

		let resp: { status: boolean; message?: string } = { status: false };

		if (user && user.is_registered) {
			// Finished account exists
			return { form: signUpFormSchema, message: 'This email is already registered' };
		} else if (isFirst) {
			// No account exists signUp for admin
			resp = await FirstUsersignUp(username, email, password, event.cookies);
		} else if (user && user.is_registered == false) {
			// Unfinished account exists
			resp = await finishRegistration(username, email, password, token, event.cookies);
		} else if (!user && !isFirst) {
			resp = { status: false, message: 'This user was not defined by admin' };
		}

		if (resp.status) {
			console.log('resp', resp);
			// Send welcome email
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: `New registration for ${username}`,
					message: `Welcome ${username} to ${publicEnv.SITE_NAME}`,
					templateName: 'welcomeUser',

					props: {
						username: username,
						email: email
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
		// const signUpOAuthForm = await superValidate(event, zod(signUpOAuthFormSchema));
		// const lang = signUpOAuthForm.data.lang;
		const [url, state] = await googleAuth.getAuthorizationUrl();

		event.cookies.set('google_oauth_state', JSON.stringify({ stateCookie: state }), {
			path: '/', // redirect
			httpOnly: true, // only readable in the server
			maxAge: 60 * 60 // a reasonable expiration date 1 hour
		});

		redirect(302, url);
	},

	//Function for handling the SignIn form submission and user authentication
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

		// Validate
		// if (!pwforgottenForm.valid) return fail(400, { pwforgottenForm });

		let resp: { status: boolean; message?: string } = { status: false };
		// const lang = pwforgottenForm.data.lang;
		const email = pwforgottenForm.data.email.toLocaleLowerCase();
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

			// Send welcome email
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: 'Forgotten Password',
					message: 'Forgotten Password',
					templateName: 'forgottenPassword',
					props: {
						email: email,
						token: token,
						expiresIn: expiresIn
						// lang: lang
					}
				})
			});
			// Return message if form is submitted successfully
			message(pwforgottenForm, 'SignIn Forgotten form submitted');
			return { form: pwforgottenForm, token: token, email: email };
		} else {
			// console.log('resp.status is false');
			return { form: pwforgottenForm, status: checkMail.success, message: resp.message || 'Unknown error' };
		}
	},

	// Function for handling the RESET
	resetPW: async (event) => {
		// console.log('resetPW');

		const pwresetForm = await superValidate(event, zod(resetFormSchema));

		// Validate
		if (!pwresetForm.valid) return fail(400, { pwresetForm });

		const password = pwresetForm.data.password;
		const token = pwresetForm.data.token;
		const email = pwresetForm.data.email;
		//const lang = pwresetForm.data.lang;

		// Define expiresIn
		const expiresIn = 2 * 60 * 60; // expiration in 2 hours

		const resp = await resetPWCheck(password, token, email, expiresIn);

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
	console.log('signIn called', email, password, isToken, cookies);

	if (!isToken) {
		const user = await auth.login(email, password);
		if (!user) {
			return { status: false, message: 'User does not exist' };
		}

		// Create User Session
		const session = await auth.createSession({ user_id: user._id });
		const sessionCookie = auth.createSessionCookie(session);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
		await auth.updateUserAttributes(user, { lastAuthMethod: 'password' });

		return { status: true };
	} else {
		// User is registered, and credentials are provided as a token
		const token = password;
		const user = await auth.checkUser({ email });

		if (!user) {
			return { status: false, message: 'User does not exist' };
		}

		const result = await auth.consumeToken(token, user._id);
		if (result.status) {
			// Create User Session
			const session = await auth.createSession({ user_id: user._id });
			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth.updateUserAttributes(user, { lastAuthMethod: 'token' });
			return { status: true };
		} else {
			return result;
		}
	}
}

async function FirstUsersignUp(username: string, email: string, password: string, cookies: Cookies) {
	// console.log('FirstUsersignUp called', username, email, password, cookies);

	const user = await auth.createUser({
		_id: '',
		password,
		email,
		username,
		role: 'admin',
		lastAuthMethod: 'password',
		is_registered: true,
		blocked: false,
		expiresAt: new Date(),
		resetToken: '',
		avatar: ''
	});

	if (!user) {
		console.error('User creation failed');
		return { status: false, message: 'User does not exist' };
	}

	// Create User Session
	const session = await auth.createSession({ user_id: user._id });

	// Create session cookie and set it
	const sessionCookie = auth.createSessionCookie(session);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

	return { status: true };
}

// Function create a new OTHER USER account and creating a session.
async function finishRegistration(username: string, email: string, password: string, token: string, cookies: Cookies) {
	// console.log('finishRegistration called', username, email, token);

	const user = await auth.checkUser({ email });

	if (!user) return { status: false, message: 'User does not exist' };

	const result = await auth.consumeToken(token, user._id);

	if (result.status) {
		await auth.updateUserAttributes(user, { username, password, lastAuthMethod: 'password', is_registered: true });

		// Create User Session
		const session = await auth.createSession({ user_id: user._id });
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

async function forgotPWCheck(email: string): Promise<ForgotPWCheckResult> {
	try {
		const expiresIn = 2 * 60 * 60 * 1000; // expiration in 2 hours
		const user = await auth.checkUser({ email });

		// The email address does not exist
		if (!user) return { success: false, message: 'User does not exist' };

		// Create a new token
		const token = await auth.createToken(user._id, expiresIn);

		return { success: true, message: 'Password reset token sent by Email', token: token, expiresIn: expiresIn };
	} catch (error) {
		console.error(error);
		return { success: false, message: 'An error occurred' };
	}
}

async function resetPWCheck(password: string, token: string, email: string, expiresIn: number) {
	try {
		// Obtain the key using auth.getKey based on your authentication system
		const user = await auth.checkUser({ email });
		if (!user) {
			return { status: false, message: 'Invalid token' };
		}

		// Consume the token
		const validate = await auth.consumeToken(token, user._id);

		if (validate.status) {
			// Check token expiration
			const currentTime = Date.now();
			const tokenExpiryTime = currentTime + expiresIn * 1000; // Convert expiresIn to milliseconds

			if (currentTime >= tokenExpiryTime) {
				return { status: false, message: 'Token has expired' };
			}

			// Token is valid and not expired, proceed with password update
			// auth.invalidateAllUserSessions(user._id);
			auth.updateKeyPassword('email', email, password);
			return { status: true };
		} else {
			return { status: false, message: 'An error occurred during password update' };
		}
	} catch (e) {
		console.error('Password reset failed:', e);
		return { status: false, message: 'invalid token' };
	}
}
