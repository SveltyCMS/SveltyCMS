/**
 * @file src/routes/login/oauth/+page.server.ts
 * @description Server-side logic for the OAuth page.
 */

import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { google } from 'googleapis';

import { getCollections } from '@src/collections';
import { saveAvatarImage } from '@utils/media/mediaStorage';

// Stores
import { systemLanguage } from '@stores/store';

// System Logger
import { logger } from '@utils/logger';

// Send welcome email
async function sendWelcomeEmail(fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, email: string, username: string) {
	try {
		await fetchFn('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: `Welcome to ${publicEnv.SITE_NAME}, ${username}!`,
				message: `Welcome ${username} to ${publicEnv.SITE_NAME}`,
				templateName: 'welcomeUser',
				props: { username, email }
			})
		});
		logger.debug(`Welcome email sent to ${email}`);
	} catch (err) {
		logger.error('Error sending welcome email:', err as Error);
	}
}

export const load: PageServerLoad = async ({ url, cookies, fetch, locals }) => {
	await initializationPromise; // Ensure initialization is complete
	logger.debug('OAuth load function called');
	logger.debug(`Full URL: ${url.toString()}`);

	const code = url.searchParams.get('code');
	logger.debug(`Authorization code from URL: ${code}`);

	if (!code) {
		logger.warn('No authorization code found in URL');
		// If there's no code, we just return and let the page render
		return {};
	}

	try {
		const googleAuthClient = await googleAuth();
		if (!googleAuthClient) {
			throw new Error('Google OAuth is not initialized');
		}

		logger.debug('Fetching tokens using authorization code...');
		const { tokens } = await googleAuthClient.getToken(code);
		logger.debug(`Received tokens: ${JSON.stringify(tokens)}`);
		googleAuthClient.setCredentials(tokens);

		// Fetch Google user profile
		const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
		const { data: googleUser } = await oauth2.userinfo.get();
		logger.debug(`Google user information: ${JSON.stringify(googleUser)}`);

		const email = googleUser.email;
		if (!email) {
			logger.error('Google did not return an email address.');
			throw new Error('Google did not return an email address.');
		}

		if (googleUser.locale) {
			systemLanguage.set(googleUser.locale);
		}

		// Check if user exists
		let user = await auth.checkUser({ email });
		const isFirst = locals.isFirstUser;

		if (!user) {
			// Handle new user creation
			let avatarUrl: string | null = null;
			// Fetch  & Save the Google user's avatar
			if (googleUser.picture) {
				const response = await fetch(googleUser.picture);
				const avatarFile = new File([await response.blob()], 'avatar.jpg', { type: 'image/jpeg' });
				avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
			}

			// Create the new user
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

			await sendWelcomeEmail(fetch, email, googleUser.name || '');
		}

		if (!user?._id) {
			throw new Error('User ID is missing after creation or retrieval');
		}

		// Create User Session
		const { user: authenticatedUser, sessionId } = await handleLogin(email, '', true); // Using empty password for OAuth

		if (!authenticatedUser) {
			throw new Error('Failed to authenticate user');
		}

		cookies.set(SESSION_COOKIE_NAME, sessionId, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: 30 * 24 * 60 * 60 // 30 days
		});

		// Update user attributes
		await auth.updateUserAttributes(user._id.toString(), {
			lastAuthMethod: 'google',
			firstName: googleUser.given_name,
			lastName: googleUser.family_name,
			avatar: avatarUrl ?? googleUser.picture
		});
		logger.info('Successfully created session and set cookie');
		// Redirect to the first collection
		const collections = await getCollections();
		if (collections && Object.keys(collections).length > 0) {
			const firstCollectionKey = Object.keys(collections)[0];
			const firstCollection = collections[firstCollectionKey];
			const redirectUrl = `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection.name}`;
			logger.info(`Redirecting to first collection: ${firstCollection.name} with URL: ${redirectUrl}`);
			throw redirect(302, redirectUrl);
		} else {
			logger.error('No collections found to redirect');
			throw redirect(302, '/');
		}
	} catch (e) {
		logger.error('Error during login process:', e as Error);
		throw redirect(302, '/login');
	}
};

export const actions: Actions = {
	// default action
	default: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token');

		if (!token || typeof token !== 'string') {
			logger.error('Token not found or invalid');
			return { errors: ['Token not found'], success: false, message: 'Invalid token' };
		}

		try {
			// Verify the token
			const googleAuthClient = await googleAuth();
			if (!googleAuthClient) {
				throw new Error('Google OAuth is not initialized');
			}

			// Verify the token
			const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];

			// Generate the authorization URL
			const authUrl = googleAuthClient.generateAuthUrl({
				access_type: 'offline',
				scope: scopes.join(' '),
				redirect_uri: `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
			});

			logger.debug(`Generated redirect URL: ${authUrl}`);
			throw redirect(302, authUrl);
		} catch (err) {
			const error = err as Error;
			logger.error(`Error during OAuth initialization: ${error.message}`);
			return { success: false, message: 'Failed to initialize OAuth' };
		}
	}
};
