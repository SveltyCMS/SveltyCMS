import { fail, type Actions } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { get } from 'svelte/store';

import { randomBytes } from 'crypto';

// lucia
import { LuciaError } from 'lucia-auth';
import { auth, luciaVerifyAndReturnUser, luciaSetCookie } from '$lib/server/lucia';
import { User } from '$lib/models/user-model';
import { SignUpToken } from '$lib/models/sign-up-token-model';

// typesafe-i18n
import LL from '$i18n/i18n-svelte';

import z from 'zod';

import { dev } from '$app/environment';
import { HOST_DEV, HOST_PROD } from '$env/static/private';

const checkUserExistsInDb = async () => {
	try {
		return Boolean(await User.count({}));
	} catch (err) {
		console.error(err);
		return false;
	}
};

export const load: PageServerLoad = async (event) => {
	const user = await luciaVerifyAndReturnUser(event);
	if (user) throw redirect(302, '/login');
	event.locals.user = user;
	// check if firstUserExsits or not
	// model should be checked here else it won't works second time
	return { firstUserExists: await checkUserExistsInDb() };
};

const zod_obj: {
	username: z.ZodString;
	email: z.ZodString;
	password: z.ZodString;
	confirm_password: z.ZodString;
	token?: z.ZodString;
} = {
	username: z
		.string({ required_error: get(LL).LOGIN_ZOD_Username_string() })
		.regex(/^[a-zA-Z0-9@$!%*#]+$/, { message: get(LL).LOGIN_ZOD_Username_regex() })
		.min(2, { message: get(LL).LOGIN_ZOD_Username_min() })
		.max(24, { message: get(LL).LOGIN_ZOD_Username_max() })
		.trim(),
	email: z
		.string({ required_error: get(LL).LOGIN_ZOD_Email_string() })
		.email({ message: get(LL).LOGIN_ZOD_Email_email() }),
	password: z
		.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
		.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
			message: get(LL).LOGIN_ZOD_Password_regex()
		}),
	confirm_password: z
		.string({ required_error: get(LL).LOGIN_ZOD_Confirm_password_string() })
		.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
			message: get(LL).LOGIN_ZOD_Confirm_password_regex()
		}),
	token: z.string({ required_error: get(LL).LOGIN_ZOD_Token_string() }).min(1)
	// terms: z.boolean({ required_error: 'Confirm Terms' })
};

// zod validations on signIn
const signInSchema = z.object({
	email: z
		.string({ required_error: get(LL).LOGIN_ZOD_Email_string() })
		.email({ message: get(LL).LOGIN_ZOD_Email_email() })
		.transform((value) => value.toLowerCase()),
	password: z
		.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
		.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
			message: get(LL).LOGIN_ZOD_Password_regex()
		})
});

// zod validations on reset password
const resetPasswordSchema = z
	.object({
		password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Password_regex()
			}),
		confirm_password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Confirm_password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Confirm_password_regex()
			}),
		token: z.string({ required_error: get(LL).LOGIN_ZOD_Token_string() }).min(1)
	})
	.superRefine(({ confirm_password, password }, ctx) => {
		if (confirm_password !== password) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: get(LL).LOGIN_ZOD_Password_match(),
				path: ['confirm_password']
			});
		}
	});

export const actions: Actions = {
	authUser: async (event) => {
		const form = await event.request.formData();
		const validationResult = signInSchema.safeParse(Object.fromEntries(form));
		if (!validationResult.success) {
			// Loop through the errors array and create a custom errors array
			const errors = validationResult.error.errors.map((error) => {
				return {
					field: error.path[0],
					message: error.message
				};
			});
			return fail(400, { error: true, errors });
		}

		const email = (form.get('email') as string)?.toLowerCase();
		const password = form.get('password');

		if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'email',
						message: 'Invalid input'
					}
				]
			});
		}
		try {
			const key = await auth.useKey('email', email, password);
			const session = await auth.createSession(key.userId);
			await luciaSetCookie(event, session)
			await auth.updateUserAttributes(key.userId, { lastActiveAt: `${new Date()}` });
		} catch (error) {
			if (
				error instanceof LuciaError &&
				(error.message === 'AUTH_INVALID_KEY_ID' || error.message === 'AUTH_INVALID_PASSWORD')
			) {
				return fail(400, {
					error: true,
					errors: [
						{
							field: 'email',
							message: 'Incorrect email or password.'
						}
					]
				});
			}
			// database connection error
			return fail(500, {
				error: true,
				errors: [
					{
						field: 'email',
						message: 'Unknown error occurred'
					}
				]
			});
		}
	},

	createUser: async (event) => {
		const form = await event.request.formData();
		// remove token validation if user is not a first time user
		if (!(await checkUserExistsInDb())) {
			delete zod_obj.token;
		}
		// zod validations on signUp
		const signupSchema = z.object(zod_obj).superRefine(({ confirm_password, password }, ctx) => {
			if (confirm_password !== password) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: get(LL).LOGIN_ZOD_Password_match(),
					path: ['confirm_password']
				});
			}
		});
		const validationResult = signupSchema.safeParse(Object.fromEntries(form));

		if (!validationResult.success) {
			// Loop through the errors array and create a custom errors array
			const errors = validationResult.error.errors.map((error) => {
				return {
					field: error.path[0],
					message: error.message
				};
			});

			return fail(400, { error: true, errors });
		}
		const username = form.get('username');
		const email = (form.get('email') as string)?.toLowerCase();
		const password = form.get('password');
		const signUpToken = form.get('token');

		if (
			!username ||
			!email ||
			!password ||
			typeof username !== 'string' ||
			typeof email !== 'string' ||
			typeof password !== 'string'
		) {
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'general',
						message: get(LL).LOGIN_ZOD_General_Error()
					}
				]
			});
		}

		try {
			// setup Admin user as first user
			const count = await User.count();
			if (count === 0) {
				const res = await auth.createUser({
					primaryKey: {
						providerId: 'email',
						providerUserId: email.toLowerCase(),
						password
					},
					attributes: {
						username,
						firstname: undefined,
						lastname: undefined,
						avatar: undefined,
						email: email.toLowerCase(),
						role: 'Admin',
						resetRequestedAt: undefined,
						resetToken: undefined,
						lastActiveAt: `${new Date()}`
					}
				});

				const session = await auth.createSession(res.userId);
				await luciaSetCookie(event, session)
				return;
			}

			const existingUser = await User.findOne({ email: email });
			if (existingUser) {
				return fail(400, {
					error: true,
					errors: [
						{
							field: 'email',
							message: get(LL).LOGIN_ZOD_Email_Error_inUse()
						}
					]
				});
			}

			const token = await SignUpToken.findOne({ email: email, resetToken: signUpToken });
			if (!token) {
				return fail(400, {
					error: true,
					errors: [
						{
							field: 'token',
							message: get(LL).LOGIN_ZOD_Token_Error()
						}
					]
				});
			}

			if (token.expiresAt < new Date()) {
				// delete the token
				await SignUpToken.deleteOne({ _id: token._id });

				return fail(400, {
					error: true,
					errors: [
						{
							field: 'token',
							message: get(LL).LOGIN_ZOD_Token_Expired()
						}
					]
				});
			}

			const res = await auth.createUser({
				primaryKey: {
					providerId: 'email',
					providerUserId: email.toLowerCase(),
					password
				},
				attributes: {
					username,
					firstname: undefined,
					lastname: undefined,
					avatar: undefined,
					email: email.toLowerCase(),
					role: token.role,
					resetRequestedAt: undefined,
					resetToken: token.resetToken,
					lastActiveAt: `${new Date()}`
				}
			});

			// delete the token
			await SignUpToken.deleteOne({ _id: token._id });

			const session = await auth.createSession(res.userId);
			await luciaSetCookie(event, session)
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: 'New user registration',
					message: 'New user registration',
					templateName: 'Welcome',
					props: {
						username: username,
						email: email
						//token: registrationToken
						// role: role,
						// resetLink: link,
						//expires_at: epoch_expires_at
					}
				})
			});
			
		} catch (error) {
			console.log(error);
			if (
				((error as any)?.code === 'P2002' && (error as any)?.message?.includes('email')) ||
				(error instanceof LuciaError && error.message === 'AUTH_DUPLICATE_KEY_ID')
			) {
				return fail(400, {
					error: true,
					errors: [
						{
							field: 'email',
							message: get(LL).LOGIN_ZOD_Email_Error_inUse()
						}
					]
				});
			}
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'general',
						message: get(LL).LOGIN_ZOD_General_Unkown()
					}
				]
			});
		}
	},

	forgotPassword: async (event) => {
		const form = await event.request.formData();
		const email = (form.get('forgottonemail') as string)?.toLowerCase();

		if (!email || typeof email !== 'string') {
			return fail(400, {
				type: 'SIGN_UP_ERROR' as const,
				message: get(LL).LOGIN_ZOD_General_Error()
			});
		}

		const user = await User.findOne({ email: email });
		if (!user) {
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'forgottonemail',
						message: get(LL).LOGIN_ZOD_Forgotton_Error()
					}
				]
			});
		}

		const forgotPasswordToken = randomBytes(16).toString('base64');
		// 2 hrs expiry time
		const epoch_expires_at = new Date().getTime() + 2 * 60 * 60 * 1000;

		// take site host from .env and generate a password-reset link
		const link = `${dev ? HOST_DEV : HOST_PROD}/login?token=${encodeURIComponent(
			forgotPasswordToken
		)}`;

		const html = get(LL).LOGIN_ZOD_Forgotton_email({
			token: `${forgotPasswordToken}`,
			link: `${link}`
		});

		try {
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: 'Forgot password needs translation',
					message: 'Forgot password needs translation',
					templateName: 'ForgotPassword',
					props: {
						//username: username,
						email: email,
						token: forgotPasswordToken,
						// role: role,
						resetLink: link,
						expires_at: epoch_expires_at
					}
				})
			});
			await User.findOneAndUpdate(
				{ email: email },
				{
					resetRequestedAt: new Date(),
					resetToken: forgotPasswordToken,
					expiresAt: epoch_expires_at
				}
			);
		} catch (err) {
			console.error({ sendMailError: err });
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'email',
						message: get(LL).LOGIN_ZOD_Email_Error_send()
					}
				]
			});
		}
	},

	resetPassword: async (event) => {
		const form = await event.request.formData();
		const validationResult = resetPasswordSchema.safeParse(Object.fromEntries(form));
		if (!validationResult.success) {
			// Loop through the errors array and create a custom errors array
			const errors = validationResult.error.errors.map((error) => {
				return {
					field: error.path[0],
					message: error.message
				};
			});

			return fail(400, { error: true, errors });
		}

		const password = form.get('password');
		if (password === null) {
			// Handle the error here
			console.log('Password is null');
			return;
		}
		const token = form.get('token');

		const user = await User.findOne({ resetToken: token });

		if (user.expiresAt < new Date()) {
			// delete the token
			user.resetToken = '';
			await user.save();
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'token',
						message: get(LL).LOGIN_ZOD_Token_Expired()
					}
				]
			});
		}

		// reset password
		await auth.updateKeyPassword('email', user.email, password);
		await event.fetch('/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: user.email,
				subject: 'Password Changed',
				message: 'Password Changed',
				templateName: 'UpdatedPassword',
				props: {
					username: user.username,
					email: user.email
					//token: registrationToken
					// role: role,
					// resetLink: link,
					//expires_at: epoch_expires_at
				}
			})
		});

		// delete the token
		user.resetToken = '';
		await user.save();
	}
};
