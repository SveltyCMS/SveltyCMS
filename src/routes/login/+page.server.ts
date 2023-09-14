import { type Actions, type Cookies, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import mongoose from 'mongoose';

import { superValidate, message } from 'sveltekit-superforms/server';
import { loginFormSchema, forgotFormSchema, resetFormSchema, signUpFormSchema } from '@src/utils/formSchemas';
import { auth } from '@src/routes/api/db';
import { passwordToken } from '@lucia-auth/tokens';
import type { User } from '@src/collections/Auth';

// load and validate login and sign up forms
export const load: PageServerLoad = async (event) => {
	await event.parent();

	// Different schemas, so no id required.

	// SignIn
	const loginForm = await superValidate(event, loginFormSchema);
	//console.log('loginForm', loginForm); // log loginForm data
	const forgotForm = await superValidate(event, forgotFormSchema);
	//console.log('forgotForm', forgotForm); // log forgotForm data
	const resetForm = await superValidate(event, resetFormSchema);
	//console.log('resetForm', resetForm); // log resetForm data

	//let recoverForm = await superValidate(event, recoverSchema);

	// SignUp FirstUser
	const withoutToken = await superValidate(event, signUpFormSchema.innerType().omit({ token: true }));
	// SignUp Other Users
	const withToken = await superValidate(event, signUpFormSchema);

	// check if first user exist
	const signUpForm: typeof withToken = (await mongoose.models['auth_key'].countDocuments()) === 0 ? (withoutToken as any) : withToken;
	//console.log('signUpForm', signUpForm); // log signUpForm data

	// Always return all Forms in load and form actions.
	return {
		// SignIn
		loginForm,
		forgotForm,
		resetForm,
		// recoverForm

		// SignUP
		signUpForm
	};
};

// Actions for SignIn and SignUp a user with form data
export const actions: Actions = {
	//Function for handling the SignIn form submission and user authentication
	signIn: async (event) => {
		const signInForm = await superValidate(event, loginFormSchema);
		//console.log('signInForm', signInForm);

		// Validate with Lucia
		const email = signInForm.data.email.toLocaleLowerCase();
		const password = signInForm.data.password;
		const isToken = signInForm.data.isToken;

		const resp = await signIn(email, password, isToken, event.cookies);

		if (resp.status) {
			// Return message if form is submitted successfully
			message(signInForm, 'SignIn form submitted');
			throw redirect(303, '/');
		} else {
			return { form: signInForm, message: resp.message };
		}
	},

	// Function for handling the Forgotten Password
	forgotPW: async (event) => {
		const pwforgottenForm = await superValidate(event, forgotFormSchema);
		//console.log('pwforgottenForm', pwforgottenForm);

		// Validate with Lucia
		let resp: { status: boolean; message?: string } = { status: false };
		//console.log('forgotPW Validate', resp);

		const email = pwforgottenForm.data.email.toLocaleLowerCase();
		//console.log('forgotPW email', email);
		const checkMail = await forgotPWCheck(email);
		//console.log('forgotPW checkMail', checkMail);

		if (email && checkMail.success) {
			// Email format is valid and email exists in DB
			// console.log('Email is valid and found in DB');
			resp = { status: true, message: checkMail.message };
		} else if (email && !checkMail.success) {
			// Email format is valid but email doesn't exist in DB
			// console.log('Email is valid but not found in DB');
			resp = { status: false, message: checkMail.message };
		} else if (!email && !checkMail) {
			// Email format invalid and email doesn't exist in DB
			// console.log('Email is invalid and not found in DB');
			resp = { status: false, message: 'Invalid Email' };
		}

		if (resp.status) {
			// console.log('resp.status is true');

			// Get the token from the checkMail result
			const token = checkMail.token;
			//const expiresIn = checkMail.expiresIn;
			// console.log('forgotPW token', token);

			// send welcome email
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
						token: token
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
		const pwresetForm = await superValidate(event, resetFormSchema);
		//console.log('pwresetForm', pwresetForm);

		// Validate with Lucia
		const password = pwresetForm.data.password;
		const token = pwresetForm.data.token;
		const email = pwresetForm.data.email;

		//console.log(token);
		const resp = await resetPWCheck(password, token, email, event.cookies);
		console.log('response: ' + resp.status);

		if (resp) {
			// Return message if form is submitted successfully
			message(pwresetForm, 'SignIn Reset form submitted');
			throw redirect(303, '/login');
		} else {
			return { form: pwresetForm };
		}
	},

	//Function for handling the sign-up form submission and user creation
	signUp: async (event) => {
		const signUpForm = await superValidate(event, signUpFormSchema);
		//console.log('signUpForm', signUpForm);

		// Validate with Lucia
		const username = signUpForm.data.username;
		const email = signUpForm.data.email.toLocaleLowerCase();
		const password = signUpForm.data.password;
		const token = signUpForm.data.token;

		const key = await auth.getKey('email', email).catch(() => null);
		// console.log('signUp key', key);
		let resp: { status: boolean; message?: string } = { status: false };
		const isFirst = (await mongoose.models['auth_key'].countDocuments()) == 0;

		if (key && key.passwordDefined) {
			// finished account exists
			return { form: signUpFormSchema, message: 'This email is already registered' };
		} else if (isFirst) {
			// no account exists signUp for admin
			resp = await FirstUsersignUp(username, email, password, event.cookies);
		} else if (key && key.passwordDefined == false) {
			// unfinished account exists
			// TODO: Fix for my logic
			resp = await finishRegistration(username, email, password, token, event.cookies, event);
			// console.log('resp', resp);
		} else if (!key && !isFirst) {
			resp = { status: false, message: 'This user was not defined by admin' };
		}

		if (resp.status) {
			// send welcome email
			//TODO: port to utils not to expose ... remove fetch from backend
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: 'New Admin registration',
					message: 'New Admin registration',
					templateName: 'Welcome',
					props: {
						username: username,
						email: email
					}
				})
			});

			// Return message if form is submitted successfully
			message(signUpForm, 'SignUp User form submitted');
			throw redirect(303, '/');
		} else {
			return { form: signUpForm, message: resp.message || 'Unknown error' };
		}
	}
};

// LUCIA setup -------------------------------
// SignIn user with email and password, create session and set cookie
async function signIn(email: string, password: string, isToken: boolean, cookies: Cookies) {
	try {
		if (!isToken) {
			// If isToken is false, sign in using email and password
			const key = await auth.useKey('email', email, password).catch(() => null);
			if (!key || !key.passwordDefined) return { status: false, message: 'Invalid Credentials' };
			const session = await auth.createSession(key.userId);
			const sessionCookie = auth.createSessionCookie(session);
			//console.log('signIn sessionCookie', sessionCookie);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

			const authMethod = 'password';
			await auth.updateUserAttributes(key.userId, { authMethod });
			return { status: true };
		} else {
			// If isToken is true, sign in using token
			const token = password;
			const key = await auth.getKey('email', email).catch(() => null);
			if (!key) return { status: false, message: 'User does not exist' };
			const tokenHandler = passwordToken(auth as any, 'register', { expiresIn: 0 });

			await tokenHandler.validate(token, key.userId);
			const session = await auth.createSession(key.userId);
			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			const authMethod = 'token';
			await auth.updateUserAttributes(key.userId, { authMethod });
			return { status: true };
		}
	} catch (e) {
		console.error(e);
		return { status: false, message: 'An error occurred' };
	}
}

async function FirstUsersignUp(username: string, email: string, password: string, cookies: Cookies) {
	const user: User = await auth
		.createUser({
			primaryKey: {
				providerId: 'email',
				providerUserId: email,
				password: password
			},
			attributes: {
				email,
				username,
				role: 'admin'
			}
		})
		.catch((e) => null);

	// console.log(user);

	if (!user) return { status: false, message: 'user does not exist' };
	const session = await auth.createSession(user.id);
	const sessionCookie = auth.createSessionCookie(session);
	// Set the credentials cookie
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

	return { status: true };
}

interface ForgotPWCheckResult {
	status?: boolean;
	success?: boolean;
	message: string;
	token?: string;
}

async function forgotPWCheck(email: string): Promise<ForgotPWCheckResult> {
	try {
		const tokenHandler = passwordToken(auth as any, 'register', {
			expiresIn: 60 * 60, // expiration in 1 hour,
			length: 64, // default 43
			generate: (length) => {
				// implement custom token generation algorithm
				const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
				let result = ''; // set password to empty string
				if (length === undefined) {
					length = 43; // set a default value for length if it is undefined
				}
				for (let i = 0; i < length; i++) {
					result += characters.charAt(Math.floor(Math.random() * characters.length));
				}
				return result;
			}
		});

		const key = await auth.getKey('email', email).catch(() => null);
		// console.log('forgotPWCheck-key', key);

		// The email address does not exist
		if (!key) return { success: false, message: 'User does not exist' };

		// TODO:Send email with reset password link
		const token = (await tokenHandler.issue(key.userId)).toString();
		// console.log('forgotPWCheck Token', token); // send token to user via email

		return { success: true, message: 'Password reset token sent by Email', token: token };
	} catch (error) {
		console.error(error);
		return { success: false, message: 'An error occurred' };
	}
}

async function resetPWCheck(password: string, token: string, email: string, cookies: Cookies) {
	// console.log('Starting password reset process...');

	const tokenHandler = passwordToken(auth as any, 'register', { expiresIn: 0 });
	try {
		// Obtain the key using auth.getKey based on your authentication system
		const key = await auth.getKey('email', email).catch(() => null);
		// console.log(key);
		if (!key) {
			// console.log('Invalid token: Key not found.');
			return { status: false, message: 'invalid token' };
		}

		// Validate the token
		//console.log('Validating token...');
		const validate = await tokenHandler.validate(token, key.userId);

		if (validate) {
			auth.updateKeyPassword('email', key.providerUserId, password);
			return { status: true };
		} else {
			return { status: false, message: 'An error occurred during password update' };
		}

		// Update the password
		// const updateResult = await updatePassword(key.userId, password);

		// if (updateResult.status) {
		// 	// Create a new session and set the session cookie
		// 	console.log('Creating session and setting session cookie...');
		// 	const session = await auth.createSession(key.userId);
		// 	const sessionCookie = auth.createSessionCookie(session);
		// 	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

		// 	// Update user's authentication method
		// 	console.log('Updating user attributes...');
		// 	const authMethod = 'token';
		// 	await auth.updateUserAttributes(key.userId, { authMethod });

		// 	console.log('Password reset successful.');
		// 	return { status: true };
		// } else {
		// 	console.error(updateResult.message);
		// 	return { status: false, message: 'An error occurred during password update' };
		// }
	} catch (e) {
		console.error('Password reset failed:', e);
		return { status: false, message: 'invalid token' };
	}
}

async function updatePassword(userId: string, newPassword: string) {
	try {
		// Use your authentication service's method to update the password
		await auth.updateKeyPassword('email', userId, newPassword);

		// Optionally, you can update the user's authentication method if needed
		const authMethod = 'password';
		await auth.updateUserAttributes(userId, { authMethod });

		return { status: true, message: 'Password updated successfully' };
	} catch (error) {
		console.error('Error updating password:', error);
		return { status: false, message: 'An error occurred while updating the password' };
	}
}

// Function create a new FIRST USER account as ADMIN and creating a session.
async function signUp(username: string, email: string, password: string, cookies: Cookies, event) {
	// Convert email to lowercase
	email = email.toLowerCase();

	const user = await auth
		.createUser({
			primaryKey: {
				providerId: 'email',
				providerUserId: email,
				password: password
			},
			attributes: {
				username: username,
				role: 'admin' // First User
			}
		})
		.catch((e) => {
			console.log(e);
			return null;
		});

	if (!user) return { status: false, message: 'User does not exist' };

	const session = await auth.createSession(user.userId);

	// Set the credentials cookie
	cookies.set('credentials', JSON.stringify({ username: user.username, session: session.sessionId }), {
		path: '/'
	});
	return { status: true };
}

// Function create a new OTHER USER account and creating a session.
async function finishRegistration(username: string, email: string, password: string, token: string, cookies: Cookies, event: any) {
	// SignUp Token
	const key = await auth.getKey('email', email).catch(() => null);
	if (!key) return { status: false, message: 'User does not exist' };
	const tokenHandler = passwordToken(auth as any, 'register', { expiresIn: 0 });

	try {
		const authMethod = 'password';
		await tokenHandler.validate(token, key.userId);
		await auth.updateUserAttributes(key.userId, { email, username, authMethod });
		await auth.updateKeyPassword('email', email, password);

		const session = await auth.createSession(key.userId);
		const sessionCookie = auth.createSessionCookie(session);

		// Set the credentials cookie
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

		return { status: true };
	} catch (e) {
		return { status: false, message: 'Invalid token' };
	}
}
