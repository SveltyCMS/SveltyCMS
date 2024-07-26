import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { auth, googleAuth, initializationPromise } from '@api/databases/db';
import type { User } from '@src/auth/types';
import { google } from 'googleapis';

// Stores
import { systemLanguage } from '@stores/store';

// Import logger
import { logger } from '@src/utils/logger';

// Import saveAvatarImage from utils/media
import { saveAvatarImage } from '@src/utils/media';

async function sendWelcomeEmail(fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, email: string, username: string) {
	try {
		await fetchFn('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: `Welcome to our platform, ${username}!`,
				message: `Welcome ${username} to our platform`,
				templateName: 'welcomeUser',
				props: { username, email }
			})
		});
		logger.debug(`Welcome email sent to ${email}`);
	} catch (err) {
		logger.error('Error sending welcome email:', err as Error);
	}
}

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	await initializationPromise; // Ensure initialization is complete

	if (!auth || !googleAuth) {
		logger.error('Authentication system is not initialized');
		throw new Error('Authentication system is not initialized');
	}

	// Log the entire URL for debugging
	logger.debug(`Full URL: ${url.toString()}`);

	const code = url.searchParams.get('code');
	logger.debug(`Authorization code from URL: ${code}`);

	if (!code) {
		logger.error('Authorization code is missing');
		throw redirect(302, '/login');
	}

	try {
		const { tokens } = await (await googleAuth).getToken(code);
		googleAuth.setCredentials(tokens);
		logger.debug(`Tokens received: ${JSON.stringify(tokens)}`);
		const oauth2 = google.oauth2({ auth: googleAuth, version: 'v2' });
		const { data: googleUser } = await oauth2.userinfo.get();
		logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

		const email = googleUser.email;
		if (!email) {
			logger.error('Google did not return an email address.');
			throw new Error('Google did not return an email address.');
		}

		const locale = googleUser.locale;
		if (locale) {
			systemLanguage.set(locale);
		}

		const existingUser = await auth.checkUser({ email });
		const isFirst = (await auth.getUserCount()) === 0;

		let user: User | null = null;
		let avatarUrl: string | null = null;

		if (existingUser) {
			user = existingUser;
		} else {
			// Fetch the remote picture and save it as the avatar
			if (googleUser.picture) {
				const response = await fetch(googleUser.picture);
				const avatarFile = new File([await response.blob()], 'avatar.jpg', { type: 'image/jpeg' });
				avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
			}

			user = await auth.createUser({
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name,
				lastName: googleUser.family_name,
				avatar: avatarUrl ?? googleUser.picture,
				role: isFirst ? 'admin' : 'user',
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false
			});

			// Verify the new user creation
			user = await auth.checkUser({ email });
			if (!user) {
				logger.error('User creation failed, user not found after creation.');
				throw new Error('User creation failed');
			}

			await sendWelcomeEmail(fetch, email, googleUser.name || '');
		}

		if (!user._id) {
			logger.error('User ID is missing after creation or retrieval');
			throw new Error('User ID is missing');
		}

		logger.debug(`User found or created with ID: ${user._id}`);

		// Create User Session
		const session = await auth.createSession({ user_id: user._id.toString(), expires: 3600000 });
		const sessionCookie = auth.createSessionCookie(session);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
		await auth.updateUserAttributes(user._id.toString(), {
			lastAuthMethod: 'google',
			firstName: googleUser.given_name,
			lastName: googleUser.family_name,
			avatar: avatarUrl ?? googleUser.picture
		});

		logger.info('Successfully created session and set cookie');
		throw redirect(302, '/');
	} catch (e) {
		logger.error('Error during login process:', e as Error);
		throw redirect(302, '/login');
	}
};

export const actions: Actions = {
	// default action
	default: async ({ request, url, cookies, fetch }) => {
		const data = await request.formData();
		const token = data.get('token');

		if (!token || typeof token !== 'string') {
			logger.error('Token not found or invalid');
			return { errors: ['Token not found'], success: false, message: '' };
		}

		const code = url.searchParams.get('code');
		logger.debug(`Authorization code: ${code}`);

		if (!code) {
			logger.error('Authorization code is missing');
			throw redirect(302, '/login');
		}

		await initializationPromise; // Ensure initialization is complete

		if (!auth || !googleAuth) {
			logger.error('Authentication system is not initialized');
			return { success: false, message: 'Internal Server Error' };
		}

		try {
			const { tokens } = await (await googleAuth()).getToken(code);
			googleAuth.setCredentials(tokens);
			const oauth2 = google.oauth2({ auth: googleAuth, version: 'v2' });

			const { data: googleUser } = await oauth2.userinfo.get();
			logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

			const email = googleUser.email;
			if (!email) {
				logger.error('Google did not return an email address.');
				return { errors: ['Google did not return an email address.'], success: false, message: '' };
			}

			const locale = googleUser.locale;
			if (locale) {
				systemLanguage.set(locale);
			}

			// Get existing user if available
			const existingUser = await auth.checkUser({ email });

			// If the user doesn't exist, create a new one
			let user: User | null = null;
			let avatarUrl: string | null = null;

			if (!existingUser) {
				// Check if it's the first user
				const isFirst = (await auth.getUserCount()) === 0;

				// Fetch the remote picture and save it as the avatar
				if (googleUser.picture) {
					const response = await fetch(googleUser.picture);
					const avatarFile = new File([await response.blob()], 'avatar.jpg', { type: 'image/jpeg' });
					avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
				}

				// Create User
				user = await auth.createUser({
					email,
					username: googleUser.name ?? '',
					firstName: googleUser.given_name,
					lastName: googleUser.family_name,
					avatar: avatarUrl ?? googleUser.picture,
					role: isFirst ? 'admin' : 'user',
					lastAuthMethod: 'google',
					isRegistered: true,
					blocked: false
				});

				// Verify the new user creation
				user = await auth.checkUser({ email });
				if (!user) {
					logger.error('User creation failed, user not found after creation.');
					throw new Error('User creation failed');
				}

				// Send welcome email
				await sendWelcomeEmail(fetch, email, googleUser.name || '');

				// Create User Session
				const session = await auth.createSession({ user_id: user._id.toString(), expires: 3600000 });
				const sessionCookie = auth.createSessionCookie(session);
				cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
				await auth.updateUserAttributes(user._id.toString(), {
					lastAuthMethod: 'google',
					firstName: googleUser.given_name,
					lastName: googleUser.family_name,
					avatar: avatarUrl ?? googleUser.picture
				});

				return { success: true, data: { user } };
			} else {
				user = existingUser;

				// User already exists, consume token
				const validate = await auth.consumeToken(token, user._id.toString());

				if (validate.status) {
					// Create User Session
					const session = await auth.createSession({ user_id: user._id.toString(), expires: 3600000 });
					const sessionCookie = auth.createSessionCookie(session);
					cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
					await auth.updateUserAttributes(user._id.toString(), { lastAuthMethod: 'google' });

					return { success: true, data: { user } };
				} else {
					logger.error('Invalid token');
					return { errors: ['Invalid token'], success: false, message: '' };
				}
			}
		} catch (err) {
			logger.error('Error during login process:', err as Error);
			throw redirect(302, '/login');
		}
	}
};
