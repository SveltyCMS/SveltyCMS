import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { auth, googleAuth } from '@api/databases/db';
import { google } from 'googleapis';
import type { User } from '@src/auth/types';

// Store
import { systemLanguage } from '@stores/store';
import { get } from 'svelte/store';

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	const code = url.searchParams.get('code');
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
		console.error('Authorization code is missing');
		throw redirect(302, '/login');
	}

	if (!auth || !googleAuth) {
		console.error('Authentication system is not initialized');
		throw new Error('Internal Server Error');
	}

	try {
		const { tokens } = await googleAuth.getToken(code);
		googleAuth.setCredentials(tokens);
		const oauth2 = google.oauth2({ auth: googleAuth, version: 'v2' });

		const { data: googleUser } = await oauth2.userinfo.get();
		console.log('Google user information:', googleUser);

		const getUser = async (): Promise<[User | null, boolean]> => {
			const existingUser = await auth.checkUser({ email: googleUser.email });
			if (existingUser) return [existingUser, false];

			// Ensure Google user email exists
			if (!googleUser.email) {
				throw new Error('Google did not return an email address.');
			}
			const username = googleUser.name ?? '';

			const isFirst = (await auth.getUserCount()) === 0;

			if (isFirst) {
				const user = await auth.createUser({
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
						lang: get(systemLanguage),
						props: {
							username: googleUser.name,
							email: googleUser.email
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
				console.error('User not found after getting user information.');
				throw new Error('User not found.');
			}
			if ((user as any).blocked) {
				console.warn('User is blocked.');
				return { status: false, message: 'User is blocked' };
			}

			// Create User Session
			const session = await auth.createSession({ userId: user.id.toString(), expires: 3600000 });
			const sessionCookie = auth.createSessionCookie(session);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			await auth.updateUserAttributes(user.id.toString(), { lastAuthMethod: 'google' });
		}
		result.data = { needSignIn };
	} catch (e) {
		console.error('Error during login process:', e);
		throw redirect(302, '/login');
	}

	if (!result.data.needSignIn) throw redirect(303, '/');
	return result;
};

export const actions: Actions = {
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
			console.error('Token not found or invalid');
			result.errors.push('Token not found');
			result.success = false;
			return result;
		}

		const code = url.searchParams.get('code');
		console.log('Authorization code:', code);

		if (!code) {
			console.error('Authorization code is missing');
			throw redirect(302, '/login');
		}

		if (!auth || !googleAuth) {
			console.error('Authentication system is not initialized');
			return { success: false, message: 'Internal Server Error' };
		}

		try {
			const { tokens } = await googleAuth.getToken(code);
			googleAuth.setCredentials(tokens);
			const oauth2 = google.oauth2({ auth: googleAuth, version: 'v2' });

			const { data: googleUser } = await oauth2.userinfo.get();
			console.log('Google user information:', googleUser);

			// Get existing user if available
			const existingUser = await auth.checkUser({ email: googleUser.email });

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
						console.error('Error sending welcome email:', error);
						throw new Error('Failed to send welcome email');
					}
				};

				// Check if it's the first user
				const isFirst = (await auth.getUserCount()) === 0;

				// Create User
				const user = await auth.createUser({
					email: googleUser.email,
					username: googleUser.name ?? '',
					role: isFirst ? 'admin' : 'user',
					lastAuthMethod: 'google',
					isRegistered: true,
					blocked: false
				});

				// Send welcome email
				await sendWelcomeEmail(googleUser.email, googleUser.name);

				// Create User Session
				const session = await auth.createSession({ userId: user.id.toString(), expires: 3600000 });
				const sessionCookie = auth.createSessionCookie(session);
				cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
				await auth.updateUserAttributes(user.id.toString(), { lastAuthMethod: 'google' });

				result.data = { user };
			} else {
				// User already exists, consume token
				const validate = await auth.consumeToken(token, existingUser.id.toString()); // Consume the token

				if (validate.status) {
					// Create User Session
					const session = await auth.createSession({ userId: existingUser.id.toString(), expires: 3600000 });
					const sessionCookie = auth.createSessionCookie(session);
					cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
					await auth.updateUserAttributes(existingUser.id.toString(), { lastAuthMethod: 'google' });

					result.data = { user: existingUser };
				} else {
					console.error('Invalid token');
					result.errors.push('Invalid token');
					result.success = false;
				}
			}
		} catch (e) {
			console.error('Error during login process:', e);
			throw redirect(302, '/login');
		}

		if (result.success) throw redirect(303, '/');
		else return result;
	}
};
