import { fail, type Actions } from '@sveltejs/kit';
import { auth } from '$lib/server/lucia';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { LuciaError } from 'lucia-auth';
import { User } from '$lib/models/user-model';
import { SignUpToken } from '$lib/models/sign-up-token-model';


export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.validate();
	if (session) throw redirect(302, '/');
	return {};
};

export const actions: Actions = {
	authUser: async ({ request, locals }) => {
		const form = await request.formData();

		const email = form.get('floating_email');
		const password = form.get('floating_password');

		if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, {
				type: 'SIGN_IN_ERROR' as const,
				message: 'Invalid input'
			});
		}
		try {
			const key = await auth.validateKeyPassword('email', email, password);
			const session = await auth.createSession(key.userId);
			locals.setSession(session);
		} catch (error) {
			if (
				error instanceof LuciaError &&
				(error.message === 'AUTH_INVALID_KEY' || error.message === 'AUTH_INVALID_PASSWORD')
			) {
				return fail(400, {
					type: 'SIGN_IN_ERROR' as const,
					message: 'Incorrect email or password.'
				});
			}
			// database connection error
			return fail(500, {
				type: 'SIGN_IN_ERROR' as const,
				message: 'Unknown error occurred'
			});
		}
	},

	createUser: async ({ request, locals }) => {
		const form = await request.formData();

		const username = form.get('floating_username');
		const email = form.get('floating_email');
		const password = form.get('floating_password');
		const signUpToken = form.get('floating_token');

		if (
			!username ||
			!email ||
			!password ||
			typeof username !== 'string' ||
			typeof email !== 'string' ||
			typeof password !== 'string'
		) {
			return fail(400, {
				type: 'SIGN_UP_ERROR' as const,
				message: 'Invalid input'
			});
		}

		try {
			const count = await User.count();
			if (count === 0) {
				const res = await auth.createUser({
					key: {
						providerId: 'email',
						providerUserId: email,
						password
					},
					attributes: {
						username,
						firstname: undefined,
						lastname: undefined,
						avatar: undefined,
						email: email,
						role: 'ADMIN',
						resetRequestedAt: undefined,
						resetToken: undefined
					}
				});

				const session = await auth.createSession(res.userId);
				locals.setSession(session);

				return;
			}

			const existingUser = await User.findOne({ email: email });
			if (existingUser) {
				return fail(400, {
					type: 'SIGN_UP_ERROR' as const,
					message: 'Email already in use'
				});
			}

			const token = await SignUpToken.findOne({ email: email, resetToken: signUpToken });
			if (!token) {
				return fail(400, {
					type: 'SIGN_UP_ERROR' as const,
					message: 'Email or token is wrong!'
				});
			}

			const res = await auth.createUser({
				key: {
					providerId: 'email',
					providerUserId: email,
					password
				},
				attributes: {
					username,
					firstname: undefined,
					lastname: undefined,
					avatar: undefined,
					email: email,
					role: token.role,
					resetRequestedAt: undefined,
					resetToken: undefined
				}
			});

			const session = await auth.createSession(res.userId);
			locals.setSession(session);
		} catch (error) {
			if (
				((error as any)?.code === 'P2002' && (error as any)?.message?.includes('email')) ||
				(error instanceof LuciaError && error.message === 'AUTH_DUPLICATE_KEY')
			) {
				return fail(400, {
					type: 'SIGN_UP_ERROR' as const,
					message: 'Email already in use'
				});
			}
			return fail(500, {
				type: 'SIGN_UP_ERROR' as const,
				message: 'Unknown error occurred'
			});
		}
	},

	forgotPassword: async ({ request, locals }) => {
		const form = await request.formData();

		const email = form.get('floating_email');

		// const data = User.findOneAndUpdate(
		// 	{ provider_id: `email:${email}` },
		// 	{
		// 		resetRequestedAt: new Date(),
		// 		resetToken: ''
		// 	}
		// );
	}
};
