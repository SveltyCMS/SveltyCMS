import { redirect } from '@sveltejs/kit';
import { auth, googleAuth } from '../api/db';
import type { Actions, PageServerLoad } from './$types';
import mongoose from 'mongoose';
import type { User } from 'lucia-auth';
import { consumeToken } from '@src/utils/tokens';

let OAuth: any = null;
export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const { stateCookie, lang } = JSON.parse(cookies.get('google_oauth_state') ?? '{}');

	const result: Result = {
		errors: [],
		success: true,
		message: '',
		data: {
			needSignIn: false
		}
	};

	if (!code || !state || !stateCookie || state != stateCookie) throw redirect(302, '/login');

	try {
		OAuth = await googleAuth.validateCallback(code);
		const { getExistingUser, googleUser, createUser } = OAuth;

		const getUser = async (): Promise<[User, boolean]> => {
			const existingUser = await getExistingUser();

			if (existingUser) return [existingUser, false];

			/// Probably will never happen but just to be sure.
			if (!googleUser.email) {
				throw new Error('Google did not return an email address.');
			}
			const username = googleUser.name ?? '';

			const isFirst = (await mongoose.models['auth_key'].countDocuments()) == 0;
			if (isFirst) {
				const user = await createUser({
					attributes: {
						email: googleUser.email,
						username,
						role: 'admin',
						blocked: false
					}
				});

				await fetch('/api/sendMail', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						email: googleUser.email,
						subject: `New ${googleUser.name} registration`,
						message: `New ${googleUser.name} registration`,
						templateName: 'welcomeUser',
						lang: lang,
						props: {
							username: googleUser.name,
							email: googleUser.email
						}
					})
				});

				return [user, false];
			} else return [null, true];
		};

		const [user, needSignIn] = await getUser();
		if (!needSignIn) {
			if (!user) throw new Error('User not found.');
			if ((user as any).blocked) return { status: false, message: 'User is blocked' };

			const session = await auth.createSession({
				userId: user.userId,
				attributes: {}
			});

			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
		}
		result.data = { needSignIn };
	} catch (e) {
		console.log(e);

		throw redirect(302, '/login');
	}
	if (!result.data.needSignIn) throw redirect(303, '/');

	return result;
};

export const actions: Actions = {
	// default action
	default: async ({ request, url, fetch, cookies }) => {
		const data = await request.formData();
		const token = data.get('token');

		const result: Result = {
			errors: [],
			success: true,
			message: '',
			data: {}
		};
		if (!token || typeof token != 'string') {
			result.errors.push('Token not found');
			result.success = false;
			return result;
		}

		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const { stateCookie, lang } = JSON.parse(cookies.get('google_oauth_state') ?? '{}');

		if (!code || !state || !stateCookie || state != stateCookie) throw redirect(302, '/login');

		try {
			const { getExistingUser, googleUser, createUser } = OAuth;

			const getUser = async (): Promise<[User, boolean]> => {
				const existingUser = await getExistingUser();
				if (existingUser) return [existingUser, false];

				/// Probably will never happen but just to be sure.
				if (!googleUser.email) {
					throw new Error('Google did not return an email address.');
				}

				const userkey = await auth.useKey('email', googleUser.email, null).catch(() => null);
				if (!userkey) throw new Error('User not found.');
				// TODO: change it to consumeToken
				const validate = await consumeToken(token, userkey.userId, 'register');
				if (!validate.status) {
					result.errors.push(validate.message);
					result.success = false;
					return [null, false];
				}
				const prevUser = await auth.getUser(userkey.userId).catch(() => null);
				if (!prevUser) throw new Error('User not found.');

				// remove key & user
				await auth.deleteKey(userkey.providerId, userkey.providerUserId);
				await auth.deleteUser(prevUser.userId);

				const user = await createUser({
					attributes: {
						email: googleUser.email,
						username: googleUser.name ?? '',
						role: (prevUser as any).role,
						blocked: false
					}
				});

				return [user, true];
			};

			const [user, needSignIn] = await getUser();

			if (!user) throw new Error('User not found.');
			if (needSignIn) {
				await fetch('/api/sendMail', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						email: googleUser.email,
						subject: `New ${googleUser.name} registration`,
						message: `New ${googleUser.name} registration`,
						templateName: 'welcomeUser',
						lang: lang,
						props: {
							username: googleUser.name,
							email: googleUser.email
						}
					})
				});
			}

			const session = await auth.createSession({
				userId: user.userId,
				attributes: {}
			});
			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

			result.data = { user };
		} catch (e) {
			console.error('error:', e);
			throw redirect(302, '/login');
		}

		if (result.success) throw redirect(303, '/');
		else return result;
	}
};
