import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { auth, googleAuth } from '@api/databases/db';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Stores
import { systemLanguage } from '@stores/store';
import { get } from 'svelte/store';

// Import logger
import logger from '@utils/logger';

if (!auth || !googleAuth) {
	throw new Error('Authentication system is not initialized');
}

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	const code = url.searchParams.get('code');
	logger.debug(`Authorization code: ${code}`);

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

	try {
		const { tokens } = await googleAuth!.getToken(code);
		googleAuth!.setCredentials(tokens);
		const oauth2 = google.oauth2({ auth: googleAuth!, version: 'v2' });

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
							username: googleUser.name || '',
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

			// Create User Session
			const session = await auth!.createSession({ user_id: user.user_id, expires: 3600000 });
			const sessionCookie = auth!.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth!.updateUserAttributes(user.user_id, { lastAuthMethod: 'google' });
		}
		result.data = { needSignIn };
	} catch (e) {
		logger.error('Error during login process:', e as Error);
		throw redirect(302, '/login');
	}

	if (!result.data.needSignIn) throw redirect(303, '/');
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
			logger.error('Token not found or invalid');
			result.errors.push('Token not found');
			result.success = false;
			return result;
		}

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code: ${code}`);

		if (!code) {
			logger.error('Authorization code is missing');
			throw redirect(302, '/login');
		}

		if (!auth || !googleAuth) {
			logger.error('Authentication system is not initialized');
			return { success: false, message: 'Internal Server Error' };
		}

		try {
			const { tokens } = await googleAuth!.getToken(code);
			googleAuth!.setCredentials(tokens);
			const oauth2 = google.oauth2({ auth: googleAuth!, version: 'v2' });

			const { data: googleUser } = await oauth2.userinfo.get();
			logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

			const email = googleUser.email;
			if (!email) {
				logger.error('Google did not return an email address.');
				result.errors.push('Google did not return an email address.');
				result.success = false;
				return result;
			}

			// Get existing user if available
			const existingUser = await auth!.checkUser({ email });

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
								lang: get(systemLanguage),
								props: {
									username,
									email
								}
							})
						});
					} catch (error) {
						logger.error('Error sending welcome email:', error as Error);
						throw new Error('Failed to send welcome email');
					}
				};

				// Check if it's the first user
				const isFirst = (await auth!.getUserCount()) === 0;

				// Create User
				const user = await auth!.createUser({
					email,
					username: googleUser.name ?? '',
					role: isFirst ? 'admin' : 'user',
					lastAuthMethod: 'google',
					isRegistered: true,
					blocked: false
				});

				// Send welcome email
				await sendWelcomeEmail(email, googleUser.name || '');

				// Create User Session
				const session = await auth!.createSession({ user_id: user.user_id, expires: 3600000 });
				const sessionCookie = auth!.createSessionCookie(session);
				cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
				await auth!.updateUserAttributes(user.user_id, { lastAuthMethod: 'google' });

				result.data = { user };
			} else {
				// User already exists, consume token
				const validate = await auth!.consumeToken(token, existingUser.user_id); // Consume the token

				if (validate.status) {
					// Create User Session
					const session = await auth!.createSession({ user_id: existingUser.user_id, expires: 3600000 });
					const sessionCookie = auth!.createSessionCookie(session);
					cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
					await auth!.updateUserAttributes(existingUser.user_id, { lastAuthMethod: 'google' });

					result.data = { user: existingUser };
				} else {
					logger.error('Invalid token');
					result.errors.push('Invalid token');
					result.success = false;
				}
			}
		} catch (e) {
			logger.error('Error during login process:', e as Error);
			throw redirect(302, '/login');
		}

		if (result.success) throw redirect(303, '/');
		else return result;
	}
};
