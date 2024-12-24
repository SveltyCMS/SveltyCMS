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
import { auth, dbInitPromise } from '@src/databases/db';


// Utils
import { saveAvatarImage } from '@utils/media/mediaStorage';

// Stores
import { systemLanguage } from '@stores/store';

// System Logger
import { logger } from '@utils/logger.svelte';
import { googleAuth, setCredentials, generateGoogleAuthUrl } from '@src/auth/googleAuth';

// Types
interface GoogleUserInfo {
	email?: string | null;
	name?: string | null;
	given_name?: string | null;
	family_name?: string | null;
	picture?: string | null;
	locale?: string | null;
}

// Send welcome email
async function sendWelcomeEmail(fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, email: string, username: string, request: Request) {
	try {
		await fetchFn('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: `Welcome to ${publicEnv.SITE_NAME}, ${username}!`,
				message: `Welcome ${username} to ${publicEnv.SITE_NAME}`,
				templateName: 'welcomeUser',
				props: {
					username,
					email,
					hostLink: publicEnv.HOST_LINK || `https://${request.headers.get('host')}`
				}
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
		// Get content structure from database
		const contentNodes = await dbAdapter.getContentStructure();

		// Find first collection node
		const firstCollection = contentNodes.find(node =>
			node.isCollection && node.path.startsWith('/collections/')
		);

		if (firstCollection) {
			logger.info(`Redirecting to first collection: ${firstCollection.name}`);
			return `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection.name}`;
		}

		logger.warn('No collections found in content structure');
		return '/';
	} catch (err) {
		logger.error('Error fetching first collection:', err);
		return '/';
	}
}

// Handle Google OAuth user data
async function handleGoogleUser(
	googleUser: GoogleUserInfo,
	isFirst: boolean,
	token: string | null,
	cookies: Cookies,
	fetchFn: typeof fetch,
	request: Request
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
		await sendWelcomeEmail(fetchFn, email, googleUser.name || '', request);
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

export const load: PageServerLoad = async ({ url, cookies, fetch, request }) => {
	try {
		await dbInitPromise; // Ensure initialization is complete

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

		logger.debug(`Authorization code from URL: \x1b[34m${code}\x1b[0m`);
		logger.debug(`Registration token from state: \x1b[34m${token}\x1b[0m`);
		logger.debug(`Is First User: \x1b[34m${!firstUserExists}\x1b[0m`);

		// If no code is present, handle initial OAuth flow
		if (!code && !firstUserExists) {
			logger.debug('No first user and no code - redirecting to OAuth');
			try {
				const authUrl = await generateGoogleAuthUrl();
				redirect(302, authUrl);
			} catch (err) {
				logger.error('Error generating OAuth URL:', err);
				throw error(500, 'Failed to initialize OAuth');
			}
		}

		// For non-first users without a token, show token input form
		if (firstUserExists && !token && !code) {
			logger.debug('First user exists, no token, no code - showing token input form');
			return {
				isFirstUser: !firstUserExists,
				requiresToken: true
			};
		}

		if (!code) {
			logger.debug('No authorization code found, showing token input form');
			return {
				isFirstUser: !firstUserExists,
				requiresToken: firstUserExists
			};
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

			await setCredentials(tokens);

			// Fetch Google user profile
			const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
			const { data: googleUser } = await oauth2.userinfo.get();

			if (!googleUser) {
				logger.error('Failed to fetch Google user profile');
				throw error(500, 'Could not retrieve user information');
			}

			// Handle user creation/update and session creation
			await handleGoogleUser(googleUser as GoogleUserInfo, !firstUserExists, token, cookies, fetch, request);
			logger.info('Successfully processed OAuth callback and created session');

			// Redirect to first collection
		} catch (err) {
			if ((err instanceof Error && 'status' in err && err.status === 302) || err.status === 303) {
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

	const redirectUrl = await fetchAndRedirectToFirstCollection();
	logger.debug(`Redirecting to: ${redirectUrl}`);
	throw redirect(302, redirectUrl);
};

export const actions: Actions = {
	OAuth: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token');

		try {
			// Generate OAuth URL with token in state parameter
			const authUrl = await generateGoogleAuthUrl(token?.toString() || null);
			throw redirect(302, authUrl);
		} catch (err) {
			if (err instanceof Error) {
				const errorMessage = err.message || 'Failed to initialize OAuth';
				logger.error('Error during OAuth initialization:', errorMessage);
				throw error(500, { message: errorMessage });
			}
			throw err;
		}
	}
};
