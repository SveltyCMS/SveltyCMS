import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { auth, googleAuth } from '@api/db';
import type { User } from '@src/auth/types';
import mongoose from 'mongoose';

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

	if (!code || !state || !stateCookie || state != stateCookie) redirect(302, '/login');

	try {
		OAuth = await googleAuth.validateCallback(code);
		const { getExistingUser, googleUser, createUser } = OAuth;

		const getUser = async (): Promise<[User | null, boolean]> => {
			const existingUser = await getExistingUser();

			if (existingUser) return [existingUser, false];

			/// Probably will never happen but just to be sure.
			if (!googleUser.email) {
				throw new Error('Google did not return an email address.');
			}
			const username = googleUser.name ?? '';

			const isFirst = (await auth.getUserCount()) != 0;

			if (isFirst) {
				const user = await createUser({
					email: googleUser.email,
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
						email: googleUser.email,
						subject: `New registration ${googleUser.name}`,
						message: `New registration ${googleUser.name}`,
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

			// Create User Session
			const session = await auth.createSession({ user_id: new mongoose.Types.ObjectId(user.id) });
			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth.updateUserAttributes(user, { lastAuthMethod: 'password' });
		}
		result.data = { needSignIn };
	} catch (e) {
		console.log(e);

		redirect(302, '/login');
	}
	if (!result.data.needSignIn) redirect(303, '/');

	return result;
};

export const actions: Actions = {
	// default action
	default: async ({ request, url, cookies }) => {
		const data = await request.formData();
		const token = data.get('token');

		const result: Result = {
			errors: [],
			success: true,
			message: '',
			data: {}
		};

		if (!token || typeof token !== 'string') {
			result.errors.push('Token not found');
			result.success = false;
			return result;
		}

		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const { stateCookie, lang } = JSON.parse(cookies.get('google_oauth_state') ?? '{}');

		if (!code || !state || !stateCookie || state !== stateCookie) {
			redirect(302, '/login');
		}
		try {
			const { getExistingUser, googleUser, createUser } = OAuth;

			// Get existing user if available
			const existingUser = await getExistingUser();

			// If the user doesn't exist, create a new one
			if (!existingUser) {
				const sendWelcomeEmail = async (email: string, username: string) => {
					try {
						await fetch('/api/sendMail', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify({
								email,
								subject: `New registration ${username}`,
								message: `New registration ${username}`,
								templateName: 'welcomeUser',
								lang,
								props: {
									username,
									email
								}
							})
						});
					} catch (error) {
						console.error('Error sending welcome email:', error);
						throw new Error('Failed to send welcome email');
					}
				};

				// Check if it's the first user
				const isFirst = (await auth.getUserCount()) === 0;

				// Create User
				const user = await createUser({
					email: googleUser.email,
					username: googleUser.name ?? '',
					role: isFirst ? 'admin' : 'user',
					lastAuthMethod: 'password',
					is_registered: true,
					blocked: false
				});

				// Send welcome email
				await sendWelcomeEmail(googleUser.email, googleUser.name);

				// Create User Session
				const session = await auth.createSession({ user_id: new mongoose.Types.ObjectId(user.id) });
				const sessionCookie = auth.createSessionCookie(session);
				cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
				await auth.updateUserAttributes(user, { lastAuthMethod: 'password' });

				result.data = { user };
			} else {
				// User already exists, consume token
				const validate = await auth.consumeToken(token, existingUser._id); // Consume the token

				if (validate) {
					// Create User Session
					const session = await auth.createSession({ user_id: new mongoose.Types.ObjectId(existingUser.id) });
					const sessionCookie = auth.createSessionCookie(session);
					cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
					await auth.updateUserAttributes(existingUser, { lastAuthMethod: 'password' });

					result.data = { user: existingUser };
				} else {
					result.errors.push('Invalid token');
					result.success = false;
				}
			}
		} catch (e) {
			console.error('error:', e);
			redirect(302, '/login');
		}

		if (result.success) redirect(303, '/');
		else return result;
	}
};
