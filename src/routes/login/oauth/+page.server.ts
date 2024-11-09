/**
 * @file src/routes/login/oauth/+page.server.ts
 * @description Server-side logic for the OAuth page.
 */

import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { error, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { google } from 'googleapis';

//Db
import { auth, initializationPromise } from '@src/databases/db';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';

// Utils
import { saveAvatarImage } from '@utils/media/mediaStorage';

// Stores
import { systemLanguage } from '@stores/store';

// System Logger
import { logger } from '@utils/logger';
import { googleAuth } from '@src/auth/googleAuth';

// Types
interface GoogleUserInfo {
	email?: string | null;
	name?: string | null;
	given_name?: string | null;
	family_name?: string | null;
	picture?: string | null;
	locale?: string | null;
}

// Generate Google OAuth URL
async function generateGoogleAuthUrl(): Promise<string> {
	const googleAuthClient = await googleAuth();
	if (!googleAuthClient) {
		throw new Error('Google OAuth is not initialized');
	}

	const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];

	return googleAuthClient.generateAuthUrl({
		access_type: 'offline',
		scope: scopes.join(' '),
		redirect_uri: `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
	});
}

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

// Helper function to fetch and save Google avatar
async function fetchAndSaveGoogleAvatar(avatarUrl: string): Promise<string | null> {
	try {
		const response = await fetch(avatarUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch avatar: ${response.statusText}`);
		}
		const blob = await response.blob();
		const avatarFile = new File([blob], 'google-avatar.jpg', { type: 'image/jpeg' });
		const savedUrl = await saveAvatarImage(avatarFile, 'avatars');

		if (!savedUrl) {
			throw new Error('Failed to save avatar image');
		}

		return savedUrl;
	} catch (err) {
		logger.error('Error fetching and saving Google avatar:', err as Error);
		return null;
	}
}

// Helper function to fetch and redirect to the first collection
async function fetchAndRedirectToFirstCollection(): Promise<string> {
	try {
		const { collections } = collectionManager.getCollectionData();

		if (collections && collections.length > 0) {
			const firstCollection = collections[0];
			if (firstCollection?.name) {
				const redirectUrl = `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection.name}`;
				logger.info(`Redirecting to first collection: ${firstCollection.name} with URL: ${redirectUrl}`);
				return redirectUrl;
			}
		}
		logger.warn('No collections found');
		return '/';
	} catch (err) {
		logger.error('Error fetching collections:', err);
		return '/';
	}
}

// Handle Google OAuth user data
async function handleGoogleUser(googleUser: GoogleUserInfo, isFirst: boolean, cookies: Cookies, fetchFn: typeof fetch): Promise<void> {
	const email = googleUser.email;
	if (!email) {
		throw new Error('Google did not return an email address');
	}

	if (googleUser.locale) {
		systemLanguage.set(googleUser.locale);
	}

	// Check if user exists
	let user = await auth?.checkUser({ email });

	if (!user) {
		// Handle new user creation
		let avatarUrl: string | null = null;
		if (googleUser.picture) {
			avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture);
		}

		// Create the new user
		user = await auth.createUser(
			{
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name,
				lastName: googleUser.family_name,
				avatar: avatarUrl,
				role: isFirst ? 'admin' : 'user',
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false
			},
			true
		);

		// Send welcome email for new users
		await sendWelcomeEmail(fetchFn, email, googleUser.name || '');
	} else {
		// Update existing user's avatar if they have a Google avatar
		let avatarUrl: string | null = null;
		if (googleUser.picture) {
			avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture);
		}

		// Update user attributes
		await auth.updateUserAttributes(user._id.toString(), {
			email,
			lastAuthMethod: 'google',
			firstName: googleUser.given_name ?? '',
			lastName: googleUser.family_name ?? '',
			...(avatarUrl && { avatar: avatarUrl })
		});
	}

	if (!user?._id) {
		throw new Error('User ID is missing after creation or retrieval');
	}

	// Create User Session and set cookie
	const session = await auth?.createSession({ user_id: user._id });
	const sessionCookie = auth?.createSessionCookie(session);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
}

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	await initializationPromise; // Ensure initialization is complete

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error: Authentication system is not initialized');
	}

	// Check if this is the first user
	let firstUserExists = false;
	try {
		firstUserExists = (await auth.getUserCount()) !== 0;
		logger.debug(`First user exists: ${firstUserExists}`);
	} catch (err) {
		logger.error('Error fetching user count:', err);
		throw error(500, 'Error checking first user status');
	}

	const code = url.searchParams.get('code');
	logger.debug(`Authorization code from URL: ${code}`);

	// For first user, directly redirect to Google OAuth
	if (!firstUserExists && !code) {
		try {
			const authUrl = await generateGoogleAuthUrl();
			throw redirect(302, authUrl);
		} catch (err) {
			logger.error('Error generating OAuth URL:', err);
			throw error(500, 'Failed to initialize OAuth');
		}
	}

	if (!code) {
		logger.debug('No authorization code found in URL, showing token input form');
		return {
			isFirstUser: !firstUserExists
		};
	}

	try {
		const googleAuthClient = await googleAuth();
		if (!googleAuthClient) {
			throw new Error('Google OAuth is not initialized');
		}

		logger.debug('Fetching tokens using authorization code...');
		const { tokens } = await googleAuthClient.getToken(code);
		googleAuthClient.setCredentials(tokens);

		// Fetch Google user profile
		const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
		const { data: googleUser } = await oauth2.userinfo.get();

		await handleGoogleUser(googleUser as GoogleUserInfo, !firstUserExists, cookies, fetch);
		logger.info('Successfully created session and set cookie');

		const redirectUrl = await fetchAndRedirectToFirstCollection();
		throw redirect(302, redirectUrl);
	} catch (err) {
		logger.error('Error during login process:', err instanceof Error ? err.message : String(err));
		throw error(500, 'Error during login process');
	}
};

export const actions: Actions = {
	OAuth: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token');

		if (!token || typeof token !== 'string') {
			return { success: false, message: 'Invalid token' };
		}

		try {
			const authUrl = await generateGoogleAuthUrl();
			throw redirect(302, authUrl);
		} catch (err) {
			logger.error('Error during OAuth initialization:', err instanceof Error ? err.message : String(err));
			return { success: false, message: 'Failed to initialize OAuth' };
		}
	}
};
