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
import { googleAuth, setCredentials } from '@src/auth/googleAuth';

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
async function generateGoogleAuthUrl(token?: string | null): Promise<string> {
	const googleAuthClient = await googleAuth();
	if (!googleAuthClient) {
		throw new Error('Google OAuth is not initialized');
	}

	const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];
	const baseUrl = `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`;

	logger.debug(`Generating OAuth URL with base URL: ${baseUrl}`);

	const authUrl = googleAuthClient.generateAuthUrl({
		access_type: 'offline',
		scope: scopes.join(' '),
		redirect_uri: baseUrl,
		state: token ? encodeURIComponent(token) : undefined,
		prompt: 'consent',
		include_granted_scopes: true
	});

	logger.debug(`Generated OAuth URL: ${authUrl}`);
	return authUrl;
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
		const savedUrl = await saveAvatarImage(avatarFile);

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
async function fetchAndRedirectToFirstCollection() {
	try {
		// Wait for collections to be loaded
		await collectionManager.initialize();
		const { collections } = collectionManager.getCollectionData();
		logger.debug('Available collections:', collections);

		if (collections && collections.length > 0) {
			const firstCollection = collections[0];
			if (firstCollection && firstCollection.name) {
				logger.info(`Redirecting to first collection: ${firstCollection.name}`);
				return `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection.name}`;
			} else {
				logger.warn('First collection found but name is missing', firstCollection);
			}
		} else {
			logger.warn('No collections found');
		}
		return '/'; // Redirect to home if no collections are found
	} catch (err) {
		logger.error('Error fetching collections:', err);
		return '/'; // Redirect to home in case of error
	}
}

// Handle Google OAuth user data
async function handleGoogleUser(
	googleUser: GoogleUserInfo,
	isFirst: boolean,
	token: string | null,
	cookies: Cookies,
	fetchFn: typeof fetch
): Promise<void> {
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
		// Only require token for new users (not first user)
		if (!isFirst) {
			if (!token) {
				throw new Error('Registration token is required for new users');
			}
			const tokenValidation = await auth?.validateToken(token);
			if (!tokenValidation?.isValid) {
				throw new Error('Invalid or expired registration token');
			}
		}

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
		// Existing user - no token required for sign-in
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
	try {
		await initializationPromise; // Ensure initialization is complete

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Authentication system is not initialized');
		}

		// Extensive logging for OAuth redirect
		logger.debug('OAuth Callback Details:');
		logger.debug(`Full URL: ${url.toString()}`);
		logger.debug(`Host: ${url.host}`);
		logger.debug(`Pathname: ${url.pathname}`);
		logger.debug(`Search Params: ${url.searchParams.toString()}`);

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
		const state = url.searchParams.get('state');
		const token = state ? decodeURIComponent(state) : null;

		logger.debug(`Authorization code from URL: ${code}`);
		logger.debug(`Registration token from state: ${token}`);
		logger.debug(`Is First User: ${!firstUserExists}`);

		// If no code is present, handle initial OAuth flow
		if (!code) {
			// For first user or sign-in, redirect to Google OAuth
			try {
				const authUrl = await generateGoogleAuthUrl(token);
				throw redirect(303, authUrl);
			} catch (err) {
				logger.error('Error generating OAuth URL:', err);
				throw error(500, 'Failed to initialize OAuth');
			}
		}

		// Process OAuth callback
		try {
			const googleAuthClient = await googleAuth();
			if (!googleAuthClient) {
				logger.error('Google OAuth client initialization failed');
				throw error(500, 'OAuth service is not available');
			}

			const redirectUri = `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`;
			logger.debug(`Using redirect URI for token exchange: ${redirectUri}`);

			const { tokens } = await googleAuthClient.getToken({
				code,
				redirect_uri: redirectUri
			});

			if (!tokens) {
				logger.error('Failed to obtain tokens from Google');
				throw error(500, 'Failed to authenticate with Google');
			}

			setCredentials(tokens);

			// Fetch Google user profile
			const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
			const { data: googleUser } = await oauth2.userinfo.get();

			if (!googleUser) {
				logger.error('Failed to fetch Google user profile');
				throw error(500, 'Could not retrieve user information');
			}

			// Handle user creation/update and session creation
			await handleGoogleUser(googleUser as GoogleUserInfo, !firstUserExists, token, cookies, fetch);
			logger.info('Successfully processed OAuth callback and created session');

			// Initialize collection manager and get redirect path
			await collectionManager.initialize();
			const redirectPath = await fetchAndRedirectToFirstCollection();
			logger.debug(`Redirecting to: ${redirectPath}`);
			
			// Use 303 See Other for the redirect after successful POST
			throw redirect(303, redirectPath);

		} catch (err) {
			if (err instanceof Error && 'status' in err && err.status === 302 || err.status === 303) {
				throw err;
			}

			const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth callback';
			logger.error('OAuth callback processing error:', {
				error: err,
				stack: err instanceof Error ? err.stack : undefined,
				code,
				token
			});

			// Provide more detailed error information
			const errorDetails = err instanceof Error ? err.stack : 'No stack trace available';
			throw error(500, {
				message: 'OAuth Processing Failed',
				details: errorMessage,
				stack: errorDetails,
				code: code ? 'Present' : 'Missing',
				token: token ? 'Present' : 'Missing'
			});
		}
	} catch (err) {
		// Only throw error if it's not already a redirect
		if (err instanceof Error && 'status' in err && (err.status === 302 || err.status === 303)) {
			throw err;
		}

		const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth process';
		logger.error('Comprehensive OAuth Error:', {
			message: errorMessage,
			stack: err instanceof Error ? err.stack : 'No stack trace',
			fullError: err
		});

		// Provide more detailed error information for the user
		throw error(500, {
			message: 'OAuth Authentication Failed',
			details: errorMessage,
			type: err instanceof Error ? err.constructor.name : 'Unknown Error Type'
		});
	}
};

export const actions: Actions = {
	OAuth: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token');

		try {
			// Generate OAuth URL with token in state parameter
			const authUrl = await generateGoogleAuthUrl(token?.toString() || null);
			return {
				status: 302,
				headers: {
					Location: authUrl
				}
			};
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to initialize OAuth';
			logger.error('Error during OAuth initialization:', errorMessage);
			return { success: false, message: errorMessage };
		}
	}
};
